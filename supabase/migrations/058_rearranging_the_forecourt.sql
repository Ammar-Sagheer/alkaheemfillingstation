-- =============================================================================
-- 058_rearranging_the_forecourt.sql
--
-- The unit number and the nozzle label become editable, in Edit nozzle wiring.
--
-- WHY. 056 handles a pump being REPLACED - different hardware, meters starting
-- again, a date dividing before from after. It does not handle the other half
-- of what actually happened on 1 Sep 2026: the pumps were also RE-ARRANGED. The
-- petrol unit that stood at position 2 now stands at position 1, and the new
-- diesel unit stands at position 2. Nothing about that is a hardware event -
-- the petrol dispenser is the same object with the same meters, still counting
-- up from 48,760.78 - it is only called something else now.
--
-- That is a LABEL, and until now the labels were the one part of the forecourt
-- the owner could not change without a migration. `unit_number` and
-- `nozzle_label` are how he refers to a pump when he is standing in front of
-- it; if the app disagrees with the sticker on the machine, the app is wrong.
--
-- WHAT A RENAME MEANS, SAID PLAINLY. It applies to the WHOLE history. A reading
-- from 15 August will show under the pump's new number, because there is one
-- number per nozzle and this changes it. That is the right behaviour for a
-- rearrangement, where the owner's own mental map has moved with the hardware
-- and he will never again think of that pump as Unit 2. It is the WRONG tool
-- for a pump that was actually swapped out - use "Replace this unit" for that,
-- which keeps the old readings under the old pump and starts the new one
-- separately. The dialog says so.
--
-- ---------------------------------------------------------------------------
-- TWO THINGS THIS NEEDS FROM THE DATABASE, AND BOTH ARE THE INTERESTING PART.
--
-- 1. A STRAIGHT SWAP HAS TO BE LEGAL. Renumbering 2 -> 1 and 1 -> 2 is the
--    normal case, not an exotic one, and it passes through a moment where two
--    nozzles both claim position 1. A plain unique index checks per row as the
--    UPDATE walks the table, so it refuses the swap halfway through and there
--    is no ordering of the rows that avoids it. The constraint therefore has to
--    be DEFERRABLE - checked once, at the end, when the forecourt is whole
--    again. This is the same reason 044's treasury guard is a deferred
--    constraint trigger rather than a row check.
--
-- 2. A POSITION IS ONLY OCCUPIED FOR THE DAYS IT IS OCCUPIED. 056's index
--    (`nozzles_live_unit_label_idx`) said "one LIVE nozzle per unit and label",
--    which was enough while the only event was a replacement. It is not enough
--    now: the retired diesel pump still holds position 1 for every day up to 31
--    August, and the petrol pump moving into position 1 must not be allowed to
--    claim those same days as well - two pumps at one position on one date is
--    exactly the state that makes a day's sheet unreadable.
--
--    So the rule becomes an EXCLUSION CONSTRAINT over the service window 056
--    already gave every nozzle: no two nozzles may share a unit number and a
--    label over overlapping days. It is strictly stronger than the index it
--    replaces (which said nothing at all about the past), and it is what makes
--    the rearrangement safe to type in any order - retiring the diesel pump on
--    31 Aug and giving the petrol pump position 1 from 1 Sep do not overlap, so
--    neither has to happen first.
-- =============================================================================

-- `=` on smallint and text inside a GiST index, which a plain GiST cannot do.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- One pump per position per day.
--
-- daterange(commissioned_on, retired_on, '[]') is the days this nozzle was on
-- the forecourt. A NULL bound in a range constructor means UNBOUNDED, which is
-- exactly what a null commissioning date already means in 056 - "here from
-- before the app was" - so the two definitions agree without a coalesce.
-- ---------------------------------------------------------------------------
drop index if exists public.nozzles_live_unit_label_idx;

alter table public.nozzles drop constraint if exists nozzles_one_pump_per_position;
alter table public.nozzles
  add constraint nozzles_one_pump_per_position
  exclude using gist (
    unit_number  with =,
    nozzle_label with =,
    daterange(commissioned_on, retired_on, '[]') with &&
  )
  deferrable initially deferred;

comment on constraint nozzles_one_pump_per_position on public.nozzles is
  'No two nozzles share a unit number and label over overlapping days. Deferred, so a straight swap is one statement.';

-- A label is what someone reads off the machine; blank is not a label.
alter table public.nozzles drop constraint if exists nozzles_label_not_blank;
alter table public.nozzles
  add constraint nozzles_label_not_blank
  check (length(btrim(nozzle_label)) > 0);

-- ---------------------------------------------------------------------------
-- Saving the wiring, now including where each pump stands.
--
-- Rebuilt from 056, which was itself 022 plus the retired-nozzle guard. Two
-- changes:
--
--   * `unit_number` and `nozzle_label` are written from the form. They are the
--     only two fields a RETIRED nozzle will accept - see below.
--   * the deferred constraint is forced to check itself before this function
--     returns, so a clash comes back as a sentence about two pumps at one
--     position rather than as a raw 23P01 at COMMIT, from underneath the
--     Server Action, with the row numbers of a GiST index in it.
--
-- WHY A RETIRED NOZZLE MAY BE RENAMED BUT STILL NOT REWIRED. Its `tank_id`
-- decides which tank every one of its past sales was drawn out of, and its
-- `starting_reading` is a meter figure - both are load-bearing arithmetic, and
-- 056 froze them for that reason. Its unit number and label are neither: they
-- are the caption on rows that are already correct. Freezing those too would
-- leave the owner unable to renumber the pump that was replaced, and therefore
-- unable to move anything into the position it used to hold - which is the
-- whole job this migration exists for.
-- ---------------------------------------------------------------------------
create or replace function public.set_nozzle_wiring(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_dead  text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change the nozzle wiring' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to save.' using errcode = '23514';
  end if;

  -- A field that is PRESENT but empty is a mistake, not an instruction. The
  -- update below coalesces a missing key to "leave this alone", which is what
  -- lets a retired nozzle's row carry only its caption - but that same
  -- coalesce would quietly swallow a label someone had cleared and meant to
  -- clear. Silently keeping the old value is the worst of the three possible
  -- behaviours, so a blank that was sent on purpose is refused by name.
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
     where r ? 'nozzle_label' and btrim(coalesce(r ->> 'nozzle_label', '')) = ''
  ) then
    raise exception 'Every nozzle needs a label - it is what is written on the machine.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
     where r ? 'unit_number'
       and coalesce(nullif(r ->> 'unit_number', '')::int, 1) < 1
  ) then
    raise exception 'A unit number has to be a whole number above zero.' using errcode = '23514';
  end if;

  -- A replaced nozzle keeps the tank it drew from and the meter it started on.
  select string_agg('Unit ' || n.unit_number || ' · Nozzle ' || n.nozzle_label, ', '
                    order by n.unit_number, n.nozzle_label)
    into v_dead
    from jsonb_array_elements(p_rows) as row_data
    join public.nozzles n on n.id = (row_data ->> 'nozzle_id')::uuid
   where n.retired_on is not null
     and (
       (row_data ? 'tank_id'
         and nullif(row_data ->> 'tank_id', '') is not null
         and (row_data ->> 'tank_id')::uuid is distinct from n.tank_id)
       or
       (row_data ? 'starting_reading'
         and nullif(row_data ->> 'starting_reading', '') is not null
         and (row_data ->> 'starting_reading')::numeric is distinct from n.starting_reading)
     );

  if v_dead is not null then
    raise exception
      'A replaced nozzle''s wiring cannot be changed (%). Its readings are already in the books '
      'and the tank they came out of has to stay as it was. Its unit number and label can still '
      'be changed.', v_dead
      using errcode = '23514';
  end if;

  update public.nozzles n
     set unit_number      = coalesce((row_data ->> 'unit_number')::smallint, n.unit_number),
         nozzle_label     = coalesce(nullif(btrim(row_data ->> 'nozzle_label'), ''), n.nozzle_label),
         -- Frozen on a retired nozzle by the guard above; coalesce keeps a row
         -- that deliberately omits them (as the retired ones do) unchanged.
         tank_id          = coalesce(nullif(row_data ->> 'tank_id', '')::uuid, n.tank_id),
         starting_reading = coalesce(nullif(row_data ->> 'starting_reading', '')::numeric,
                                     n.starting_reading)
    from jsonb_array_elements(p_rows) as row_data
   where n.id = (row_data ->> 'nozzle_id')::uuid;

  get diagnostics v_count = row_count;

  -- Force the deferred constraint NOW, so its refusal can be turned into a
  -- sentence. Without this it fires at COMMIT, long after this function has
  -- returned and there is anything left that knows what the owner was doing.
  begin
    set constraints public.nozzles_one_pump_per_position immediate;
  exception when exclusion_violation then
    raise exception
      'Two pumps would be standing at the same position on the same day. Every unit number and '
      'nozzle label has to be unique among the pumps that were on the forecourt at the same time '
      '- including the ones that have been replaced, which still hold their old position for the '
      'days they worked. Check the whole list, not just the row you changed.'
      using errcode = '23P01';
  end;

  return v_count;
end;
$$;

revoke execute on function public.set_nozzle_wiring(jsonb) from public, anon;
grant  execute on function public.set_nozzle_wiring(jsonb) to authenticated;
