-- =============================================================================
-- 060_a_traded_nozzle_keeps_its_tank.sql
--
-- `set_nozzle_wiring()` will no longer re-point a nozzle at a different tank
-- once that nozzle has a reading against it.
--
-- WHAT WENT WRONG, ON 2 SEPTEMBER 2026. The forecourt was rearranged on 1 Sep:
-- the damaged diesel pump at position 1 was scrapped, the petrol pump at
-- position 2 was moved into position 1 and re-piped to DIESEL, and a new pump
-- was set down at position 2 on PETROL. The first two halves of that were
-- recorded correctly - a rename (058) for the move, a replacement (056) for the
-- scrapped pump. The third was recorded by opening Edit nozzle wiring and
-- changing the moved pump's tank from Petrol to Diesel.
--
-- That one dropdown rewrote August. `nozzles.tank_id` is a single undated fact,
-- and every figure that asks "which tank did this litre come out of" - stock,
-- gain/loss, litres by fuel, the profit split - answers it by joining
-- `nozzle_readings` to `nozzles` and reading `tank_id` AS IT STANDS NOW. So
-- 19,293.26 litres of petrol sold through that pump between 1 and 31 August
-- became diesel the moment the dropdown was saved:
--
--                        as the books read   as it actually happened
--     August diesel          32,213.62 L            12,920.36 L
--     August petrol          30,605.16 L            49,898.42 L
--
-- Nothing about the MONEY moved - `rate_per_litre` and `sale_amount` are stored
-- on each reading, so cash, credit, customer balances and revenue are all still
-- right. It is the litres, and everything derived from litres, that went.
--
-- 056 FROZE `tank_id` ON A RETIRED NOZZLE FOR PRECISELY THIS REASON, and said
-- so: "its tank_id decides which tank every one of its past sales was drawn out
-- of". The argument is about the READINGS, not about the retirement - it holds
-- with exactly the same force for a live nozzle that has been trading for a
-- month. Retirement was simply the only case anyone had hit yet. So the rule
-- becomes the one 012 already applies to `starting_reading`: this field is
-- yours to set until the nozzle has its first saved reading, and after that it
-- is history.
--
-- WHAT THE OWNER SHOULD REACH FOR INSTEAD, and what this error says. For the
-- books, a pump that changes fuel is the same event as a pump that is replaced:
-- a date divides before from after, and the litres either side came out of
-- different tanks. `replace_unit()` (056) already does exactly that, and
-- already takes both a tank and a per-nozzle starting meter - so "same pump,
-- new fuel, from 1 Sep, meter carrying on from 48,760.78" is expressible today,
-- in the dialog that exists, with no new machinery. The only thing missing was
-- something to stop the easier, wrong door.
--
-- WHY NOT JUST DATE `tank_id`. Because the app already has a dated nozzle - one
-- with `commissioned_on` and `retired_on` - and a second, parallel notion of
-- "this row's tank, but only for these days" would mean every one of the dozen
-- places that join a reading to a tank has to learn about it, and each of them
-- is a money figure. A new nozzle row costs one insert and every existing query
-- is already correct against it.
--
-- Rebuilt from 058 with one block added; everything else is character for
-- character what 058 left.
-- =============================================================================

create or replace function public.set_nozzle_wiring(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count  integer;
  v_dead   text;
  v_traded text;
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

  -- ---------------------------------------------------------------------
  -- 060: A NOZZLE THAT HAS TRADED KEEPS THE TANK IT TRADED OUT OF.
  --
  -- Checked before the retired-nozzle guard below so that the pump the owner
  -- is most likely to be re-piping - a live one, moved to a different fuel -
  -- gets the message that names the dialog he actually wants.
  -- ---------------------------------------------------------------------
  select string_agg('Unit ' || n.unit_number || ' · Nozzle ' || n.nozzle_label, ', '
                    order by n.unit_number, n.nozzle_label)
    into v_traded
    from jsonb_array_elements(p_rows) as row_data
    join public.nozzles n on n.id = (row_data ->> 'nozzle_id')::uuid
   where row_data ? 'tank_id'
     and nullif(row_data ->> 'tank_id', '') is not null
     and (row_data ->> 'tank_id')::uuid is distinct from n.tank_id
     and exists (select 1 from public.nozzle_readings nr where nr.nozzle_id = n.id);

  if v_traded is not null then
    raise exception
      'This would move every litre % has ever sold into a different tank (%). The tank a nozzle '
      'draws from can only be set before its first day is entered. If the pump has genuinely been '
      're-piped onto another fuel, use "Replace this unit": give the old fuel its last day, the '
      'new fuel its first, pick the new tank, and carry the meter across at the figure it stands '
      'at. The days either side then come out of the right tank.',
      case when v_traded like '%,%' then 'these nozzles' else 'this nozzle' end, v_traded
      using errcode = '23514';
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
         -- Frozen on a retired nozzle by the guard above, and on any nozzle
         -- that has traded by the 060 guard; coalesce keeps a row that
         -- deliberately omits them (as those rows do) unchanged.
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

comment on function public.set_nozzle_wiring(jsonb) is
  'Saves the forecourt wiring. A nozzle''s tank is settable until its first reading; after that it is history, and a fuel change is a replacement.';

revoke execute on function public.set_nozzle_wiring(jsonb) from public, anon;
grant  execute on function public.set_nozzle_wiring(jsonb) to authenticated;
