-- =============================================================================
-- 056_replacing_a_damaged_unit.sql
--
-- A dispensing unit was damaged and swapped for a new one, whose two nozzles
-- start from zero.
--
-- WHY THE OBVIOUS FIX IS WRONG. The tempting move is to set the two nozzles'
-- meters back to 0 - either by editing `starting_reading` in Settings, or by
-- entering the next day opening at 0. Both destroy the books:
--
--   * `starting_reading` is only ever consulted until a nozzle has its FIRST
--     saved reading (migration 012). On a nozzle that has been trading for
--     months it is dead data; changing it moves nothing.
--   * A day that opens at 0 when the previous day closed at 1,987,279.95 is
--     refused outright - `nozzle_readings_closing_gte_opening` and the chain
--     in 026/027 both exist precisely to stop a meter running backwards. And
--     if it were allowed, `litres_sold` on the day the meter was reset would
--     read as roughly minus two million litres of diesel.
--
-- A NEW UNIT IS NEW NOZZLES. The physical thing on the forecourt is not the
-- same object any more, and neither are its meters, so the honest record is
-- two new `nozzles` rows with `starting_reading = 0` - and the old rows kept
-- exactly as they are, because every reading, every rupee of cash and credit,
-- and every litre drawn out of the diesel tank for the whole life of the old
-- unit hangs off them by foreign key. Nothing about the past changes.
--
-- WHAT THAT NEEDS, AND IS WHAT THIS MIGRATION ADDS.
--
--   1. A SERVICE WINDOW on each nozzle - `commissioned_on` and `retired_on`.
--      `is_active` alone cannot do this job: it is a fact about TODAY, and the
--      reading sheet is a question about a DATE. Deactivating the old nozzles
--      would hide them from 3 August as well as from today, so last month's
--      readings could no longer be opened or corrected. The window says which
--      days each nozzle was on the forecourt for, and the sheet asks that.
--
--   2. THE UNIT NUMBER FREED UP. Unit 1 is still Unit 1 - the new dispenser
--      stands where the old one stood, and the owner will not start calling it
--      Unit 4 because a database said so. `unique (unit_number, nozzle_label)`
--      forbade that, so it becomes a unique index over LIVE nozzles only.
--
--   3. A RULE, NOT A COURTESY. Nothing may record a sale on a nozzle for a day
--      it was not there - a reading dated after the old unit was carted away,
--      or before the new one was plumbed in. That is a trigger, so it holds
--      against the app, a second tab and the SQL console alike.
--
--   4. ONE ACTION THAT DOES THE WHOLE SWAP. `replace_unit()` retires the old
--      nozzles and creates the new ones in a single statement, for the reason
--      set out in 022: half a swap is worse than none, because nothing on
--      screen would say which half took.
--
-- THE CHANGEOVER DAY MAY BELONG TO BOTH. A unit is not always swapped
-- overnight. If the old one dispensed on the morning of the 14th and the new
-- one from the afternoon, both have a real reading dated the 14th - so
-- `retired_on` and `commissioned_on` are both INCLUSIVE, and may be the same
-- day. The reading sheet shows both units that day and neither afterwards.
-- Where the pump stood idle between the two - damaged on the 10th, replaced on
-- the 14th - the days in between simply have no row for that unit, which is
-- true.
--
-- STOCK IS UNAFFECTED, and it is worth saying why out loud. Tank stock is
-- driven by `litres_sold` per reading, which is a difference between two
-- figures on the SAME reading - never a difference between two nozzles or two
-- meters. A meter starting again from zero on a new nozzle therefore draws the
-- diesel tank down exactly as the old one did. There is no correcting entry to
-- make and no gain/loss to explain.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The service window.
--
-- Both null on every existing nozzle, which reads as "has been here from the
-- beginning and still is" - so no reading already in the books can fall
-- outside a window, and the trigger added below is a no-op on today's data.
-- ---------------------------------------------------------------------------
alter table public.nozzles
  add column if not exists commissioned_on date,
  add column if not exists retired_on      date,
  add column if not exists replaced_by     uuid references public.nozzles (id) on delete set null;

comment on column public.nozzles.commissioned_on is
  'First day this nozzle could dispense. Null = it was here before the app was. Inclusive.';
comment on column public.nozzles.retired_on is
  'Last day this nozzle dispensed, if it has been replaced or removed. Null = still in service. Inclusive.';
comment on column public.nozzles.replaced_by is
  'The nozzle that took this one''s place on the forecourt, for reading the history back.';

alter table public.nozzles drop constraint if exists nozzles_service_window_in_order;
alter table public.nozzles
  add constraint nozzles_service_window_in_order
  check (commissioned_on is null or retired_on is null or retired_on >= commissioned_on);

-- A retired nozzle is not in service, and `is_active` must not say otherwise.
-- Two columns that can contradict each other are how the app and the database
-- end up disagreeing about which nozzles exist; this makes that unrepresentable.
alter table public.nozzles drop constraint if exists nozzles_retired_is_not_active;
alter table public.nozzles
  add constraint nozzles_retired_is_not_active
  check (retired_on is null or is_active = false);

alter table public.nozzles drop constraint if exists nozzles_not_replaced_by_itself;
alter table public.nozzles
  add constraint nozzles_not_replaced_by_itself
  check (replaced_by is null or replaced_by <> id);

-- ---------------------------------------------------------------------------
-- 2. The unit number and label are unique among LIVE nozzles only.
--
-- Migration 001 made (unit_number, nozzle_label) unique across the whole
-- table, which was right while a nozzle was forever. It is wrong the moment a
-- unit is replaced in place: the new Unit 1 · Nozzle A would collide with the
-- old one, and the only way out would be renaming the physical pump.
-- ---------------------------------------------------------------------------
alter table public.nozzles drop constraint if exists nozzles_unit_number_nozzle_label_key;

create unique index if not exists nozzles_live_unit_label_idx
  on public.nozzles (unit_number, nozzle_label)
  where retired_on is null;

comment on index public.nozzles_live_unit_label_idx is
  'One live nozzle per unit and label. Retired ones keep their old numbering.';

-- ---------------------------------------------------------------------------
-- 3. A reading must fall inside its nozzle's service window.
--
-- The UI will not offer a nozzle outside its window, but that is a courtesy.
-- This is the rule: a sale dated to a day the pump was not standing there is
-- litres the tank never gave out, and it would be invisible - the figure looks
-- like any other day's.
-- ---------------------------------------------------------------------------
create or replace function public.check_reading_within_service_window()
returns trigger
language plpgsql
as $$
declare
  v_unit      smallint;
  v_label     text;
  v_from      date;
  v_to        date;
begin
  select n.unit_number, n.nozzle_label, n.commissioned_on, n.retired_on
    into v_unit, v_label, v_from, v_to
    from public.nozzles n
   where n.id = new.nozzle_id;

  if v_from is not null and new.reading_date < v_from then
    raise exception
      'Unit % · Nozzle % was only fitted on %. A reading cannot be dated % - the pump was not there yet.',
      v_unit, v_label, to_char(v_from, 'FMDD Mon YYYY'), to_char(new.reading_date, 'FMDD Mon YYYY')
      using errcode = '23514';
  end if;

  if v_to is not null and new.reading_date > v_to then
    raise exception
      'Unit % · Nozzle % was replaced on %. A reading cannot be dated % - enter it against the unit that took its place.',
      v_unit, v_label, to_char(v_to, 'FMDD Mon YYYY'), to_char(new.reading_date, 'FMDD Mon YYYY')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.check_reading_within_service_window() is
  'Refuses a reading dated outside the days its nozzle was on the forecourt.';

drop trigger if exists reading_within_service_window on public.nozzle_readings;
create trigger reading_within_service_window
  before insert or update of nozzle_id, reading_date on public.nozzle_readings
  for each row execute function public.check_reading_within_service_window();

-- ---------------------------------------------------------------------------
-- 4. The reading sheet asks about a DATE, not about today.
--
-- Rebuilt from 012, with two changes and nothing else touched:
--
--   * `where n.is_active` becomes the service window. `is_active` still gates
--     a nozzle that has simply been switched off - but a RETIRED nozzle has
--     `is_active = false` by constraint, and it must still appear on the days
--     it was working, so the flag cannot be the filter for those.
--   * `commissioned_on` and `retired_on` come back with each row, so the page
--     can tell the outgoing unit from the incoming one on the single day they
--     share, and label the pair rather than showing four identical rows.
--
-- Dropped rather than replaced: adding output columns changes the return type,
-- which `create or replace function` will not do.
-- ---------------------------------------------------------------------------
drop function if exists public.get_reading_sheet(date);

create function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id uuid, unit_number smallint, nozzle_label text, tank_id uuid,
  fuel_type public.fuel_type, rate numeric, opening_reading numeric,
  reading_id uuid, closing_reading numeric, cash_amount numeric,
  credit_amount numeric, litres_sold numeric, sale_amount numeric,
  previous_date date, previous_closing numeric,
  later_date date, later_opening numeric,
  commissioned_on date, retired_on date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select n.id, n.unit_number, n.nozzle_label, t.id, t.fuel_type,
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         coalesce(existing.opening_reading, prev.closing_reading,
                  n.starting_reading)::numeric,
         existing.id, existing.closing_reading, existing.cash_amount,
         existing.credit_amount, existing.litres_sold, existing.sale_amount,
         prev.reading_date, prev.closing_reading,
         later.reading_date, later.opening_reading,
         n.commissioned_on, n.retired_on
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.* from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date = p_date limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading, nr.reading_date from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date < p_date
       order by nr.reading_date desc limit 1
    ) prev on true
    left join lateral (
      select nr.reading_date, nr.opening_reading from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date > p_date
       order by nr.reading_date asc limit 1
    ) later on true
   where (n.commissioned_on is null or p_date >= n.commissioned_on)
     and (n.retired_on      is null or p_date <= n.retired_on)
     -- A live nozzle still answers to is_active; a retired one is bounded by
     -- its window instead, and is_active = false on it says "not today", which
     -- is not the question being asked.
     and (n.retired_on is not null or n.is_active)
   -- The outgoing unit before the incoming one on the day they share: the
   -- older generation has the earlier (or null) commissioning date.
   order by n.unit_number, n.commissioned_on nulls first, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The swap itself.
--
-- Owner only, and one statement per side, so a failure anywhere leaves the
-- forecourt described exactly as it was. Same reasoning as set_nozzle_wiring()
-- in 022: a half-applied change to which nozzles exist is not visible on any
-- screen, and every reading entered afterwards inherits the mistake.
--
-- p_nozzles is [{ "nozzle_label": "A", "starting_reading": 0 }, ...]. Starting
-- readings are a parameter rather than assumed zero because a "new" unit is
-- sometimes a refurbished one that arrives with figures already on its meters,
-- and 012 is the record of what happens when a meter's history is assumed
-- away.
-- ---------------------------------------------------------------------------
create or replace function public.replace_unit(
  p_unit_number     smallint,
  p_old_last_day    date,
  p_new_first_day   date,
  p_tank_id         uuid,
  p_nozzles         jsonb,
  p_new_unit_number smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_unit  smallint := coalesce(p_new_unit_number, p_unit_number);
  v_old_ids   uuid[];
  v_labels    text[];
  v_stragglers text;
  v_retired   integer;
  v_added     integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may replace a unit' using errcode = '42501';
  end if;

  if p_old_last_day is null or p_new_first_day is null then
    raise exception 'Both dates are needed: the old unit''s last day and the new unit''s first.'
      using errcode = '23514';
  end if;

  if p_new_first_day < p_old_last_day then
    raise exception
      'The new unit cannot start on % when the old one was still dispensing on %.',
      to_char(p_new_first_day, 'FMDD Mon YYYY'), to_char(p_old_last_day, 'FMDD Mon YYYY')
      using errcode = '23514';
  end if;

  if not exists (select 1 from public.tanks where id = p_tank_id) then
    raise exception 'That tank does not exist.' using errcode = '23503';
  end if;

  -- The unit being replaced, as it stands right now.
  select array_agg(n.id order by n.nozzle_label)
    into v_old_ids
    from public.nozzles n
   where n.unit_number = p_unit_number
     and n.retired_on is null;

  if v_old_ids is null then
    raise exception 'There is no Unit % in service to replace.', p_unit_number
      using errcode = '23503';
  end if;

  -- THE ONE CHECK THAT MATTERS. Retiring a nozzle on a day it already has
  -- readings past would strand them outside their own service window: they
  -- would still be in the books and in the tank's stock, but the sheet would
  -- refuse to open the days they are on, so they could never be corrected.
  select string_agg(distinct to_char(nr.reading_date, 'FMDD Mon YYYY'), ', '
                    order by to_char(nr.reading_date, 'FMDD Mon YYYY'))
    into v_stragglers
    from public.nozzle_readings nr
   where nr.nozzle_id = any (v_old_ids)
     and nr.reading_date > p_old_last_day;

  if v_stragglers is not null then
    raise exception
      'Unit % already has readings entered after % (%). Give the old unit a later last day, '
      'or clear those days first.',
      p_unit_number, to_char(p_old_last_day, 'FMDD Mon YYYY'), v_stragglers
      using errcode = '23514';
  end if;

  -- The new unit's nozzles, validated before anything is written.
  if p_nozzles is null or jsonb_typeof(p_nozzles) <> 'array'
     or jsonb_array_length(p_nozzles) = 0 then
    raise exception 'The new unit needs at least one nozzle.' using errcode = '23514';
  end if;

  select array_agg(btrim(r ->> 'nozzle_label'))
    into v_labels
    from jsonb_array_elements(p_nozzles) r;

  if exists (select 1 from unnest(v_labels) l where l is null or l = '') then
    raise exception 'Every nozzle on the new unit needs a label.' using errcode = '23514';
  end if;

  if (select count(distinct l) from unnest(v_labels) l) <> array_length(v_labels, 1) then
    raise exception 'Two nozzles on the new unit have the same label.' using errcode = '23505';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_nozzles) r
     where coalesce((r ->> 'starting_reading')::numeric, 0) < 0
  ) then
    raise exception 'A meter reading cannot be negative.' using errcode = '23514';
  end if;

  -- Renumbering onto a unit that already exists would put two different
  -- dispensers under one heading on every screen.
  if v_new_unit <> p_unit_number
     and exists (select 1 from public.nozzles
                  where unit_number = v_new_unit and retired_on is null) then
    raise exception 'Unit % is already in service. Give the new unit a free number.', v_new_unit
      using errcode = '23505';
  end if;

  -- Out with the old. is_active goes with retired_on because the constraint
  -- above will not have them disagree.
  update public.nozzles
     set retired_on = p_old_last_day,
         is_active  = false
   where id = any (v_old_ids);
  get diagnostics v_retired = row_count;

  -- In with the new.
  insert into public.nozzles
    (tank_id, unit_number, nozzle_label, starting_reading, commissioned_on, is_active)
  select p_tank_id, v_new_unit, btrim(r ->> 'nozzle_label'),
         coalesce((r ->> 'starting_reading')::numeric, 0), p_new_first_day, true
    from jsonb_array_elements(p_nozzles) r;
  get diagnostics v_added = row_count;

  -- Lineage, where a label carries over - which it usually does, because the
  -- new dispenser has an A side and a B side just like the old one. Where it
  -- does not, the link is simply left off rather than guessed at.
  update public.nozzles old
     set replaced_by = new_n.id
    from public.nozzles new_n
   where old.id = any (v_old_ids)
     and new_n.unit_number    = v_new_unit
     and new_n.commissioned_on = p_new_first_day
     and new_n.nozzle_label   = old.nozzle_label;

  return jsonb_build_object(
    'unit_number',     p_unit_number,
    'new_unit_number', v_new_unit,
    'retired',         v_retired,
    'added',           v_added,
    'old_last_day',    p_old_last_day,
    'new_first_day',   p_new_first_day
  );
end;
$$;

comment on function public.replace_unit(smallint, date, date, uuid, jsonb, smallint) is
  'Retires a unit''s nozzles on their last day and fits new ones from their first, in one statement. Owner only.';

revoke execute on function public.replace_unit(smallint, date, date, uuid, jsonb, smallint) from public, anon;
grant  execute on function public.replace_unit(smallint, date, date, uuid, jsonb, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A replaced nozzle's wiring is history, and history does not get rewired.
--
-- set_nozzle_wiring() (022) updates tank_id, which decides WHICH TANK every
-- one of that nozzle's past sales was drawn out of. Pointing a retired diesel
-- nozzle at the petrol tank would silently move months of litres from one tank
-- to the other and make both tanks' gain/loss fiction. It was safe while every
-- nozzle was live; it is not now.
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

  select string_agg('Unit ' || n.unit_number || ' · Nozzle ' || n.nozzle_label, ', '
                    order by n.unit_number, n.nozzle_label)
    into v_dead
    from jsonb_array_elements(p_rows) as row_data
    join public.nozzles n on n.id = (row_data ->> 'nozzle_id')::uuid
   where n.retired_on is not null;

  if v_dead is not null then
    raise exception
      'A replaced nozzle''s wiring cannot be changed (%). Its readings are already in the books '
      'and the tank they came out of has to stay as it was.', v_dead
      using errcode = '23514';
  end if;

  update public.nozzles n
     set tank_id          = (row_data->>'tank_id')::uuid,
         starting_reading = (row_data->>'starting_reading')::numeric
    from jsonb_array_elements(p_rows) as row_data
   where n.id = (row_data->>'nozzle_id')::uuid;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_nozzle_wiring(jsonb) from public, anon;
grant  execute on function public.set_nozzle_wiring(jsonb) to authenticated;
