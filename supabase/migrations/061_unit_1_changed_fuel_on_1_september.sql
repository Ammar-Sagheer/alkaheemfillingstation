-- =============================================================================
-- 061_unit_1_changed_fuel_on_1_september.sql
--
-- Puts August back the way it happened, after the wiring change 060 now
-- forbids.
--
-- WHAT IS BEING UNDONE. On 2 Sep 2026 the two nozzles that had been trading all
-- August as Unit 2 · Petrol - and were renumbered to Unit 1 on 1 Sep when the
-- forecourt was rearranged - had their tank changed from Petrol to Diesel in
-- Edit nozzle wiring. Forwards that is what the owner wanted: the pump really
-- is on diesel from 1 September. Backwards it is false, and because `tank_id`
-- is undated it applied backwards too, moving 19,293.26 litres of August petrol
-- into the diesel tank. 060 explains the mechanism and the numbers.
--
-- HOW IT IS PUT RIGHT. Not by another dropdown, because there is no dropdown
-- that means "from this date". The pump is recorded the way the books already
-- know how to record a pump whose fuel changed on a day: the petrol nozzle
-- STOPS on 31 August and a diesel nozzle BEGINS on 1 September, on the same
-- unit, carrying the same physical meter across at the figure it stood at.
-- That is `replace_unit()` (056) in every respect except that the hardware did
-- not change - which the books do not care about, because what a nozzle row
-- actually is, is "a meter, drawing from a tank, over a span of days".
--
--   1. Unit 1 · A and Unit 1 · B go back to the PETROL tank. Every August
--      reading on them is a petrol reading again, at the petrol rates already
--      stored on the rows, and August's litres by fuel, stock, gain/loss and
--      profit split all come back to what they were.
--
--   2. Those two are retired on 31 Aug 2026 - their last petrol day, and the
--      last day either of them has a reading at all.
--
--   3. Two new Unit 1 nozzles are fitted from 1 Sep 2026, drawing DIESEL, with
--      `starting_reading` set to each meter's 31 August closing (A 48,760.78,
--      B 24,835.72) rather than 0. The meter did not go back to zero; only the
--      fuel behind it changed, and a starting reading of 0 would count the
--      pump's whole life as the first day's sales the moment a September
--      reading was entered (012).
--
--   4. `replaced_by` links each old row to its new one, so Settings reads as
--      one pump with a history rather than four unrelated rows.
--
-- WHAT THIS DOES NOT TOUCH. No reading, no rupee, no ledger entry, no dip. The
-- money was never wrong - `rate_per_litre` and `sale_amount` live on each
-- reading - and the September dips taken on 1 Sep are the baseline every
-- current stock figure is measured from, so today's tank figures do not move
-- either. What moves is which tank August's litres are counted against, back to
-- what it was before 2 September.
--
-- SAFE TO RUN TWICE. If Unit 1's petrol nozzles are already retired the whole
-- thing is a no-op, and it refuses outright rather than guessing if the pump is
-- not in the state described above.
-- =============================================================================

do $$
declare
  v_petrol   uuid;
  v_diesel   uuid;
  v_old_a    uuid := '7c4bd261-a5a8-4f0b-b5eb-dcf24a86d6ae';  -- traded all Aug as Unit 2 · A
  v_old_b    uuid := '078e541c-6f53-430a-9047-72ad12a5e24f';  -- traded all Aug as Unit 2 · B
  v_last_day date := '2026-08-31';
  v_first_day date := '2026-09-01';
  v_unit     smallint;
  v_stragglers text;
begin
  select id into v_petrol from public.tanks where fuel_type = 'petrol';
  select id into v_diesel from public.tanks where fuel_type = 'diesel';

  if v_petrol is null or v_diesel is null then
    raise exception '061: expected one petrol tank and one diesel tank.';
  end if;

  -- Already done, on a project this has been applied to before.
  if exists (select 1 from public.nozzles
              where id in (v_old_a, v_old_b) and retired_on is not null) then
    raise notice '061: Unit 1''s petrol nozzles are already retired - nothing to do.';
    return;
  end if;

  -- Nothing to do on a project that never had these rows (a fresh restore, or
  -- the offline build's own database).
  if not exists (select 1 from public.nozzles where id in (v_old_a, v_old_b)) then
    raise notice '061: those nozzles are not in this database - nothing to do.';
    return;
  end if;

  select unit_number into v_unit from public.nozzles where id = v_old_a;

  -- The same check `replace_unit()` makes, and for the same reason: retiring a
  -- nozzle on a day it has readings past would strand them outside their own
  -- service window - still in the books and in the tank's stock, but on days
  -- the sheet would refuse to open.
  select string_agg(distinct to_char(nr.reading_date, 'FMDD Mon YYYY'), ', ')
    into v_stragglers
    from public.nozzle_readings nr
   where nr.nozzle_id in (v_old_a, v_old_b)
     and nr.reading_date > v_last_day;

  if v_stragglers is not null then
    raise exception
      '061: Unit % already has readings after % (%). Clear those days before running this, or '
      'the repair would strand them outside the pump''s service window.',
      v_unit, to_char(v_last_day, 'FMDD Mon YYYY'), v_stragglers;
  end if;

  -- 1 + 2. Back onto petrol, and stopped on their last petrol day. One
  -- statement: `nozzles_retired_is_not_active` will not have retired_on and
  -- is_active disagree even for an instant.
  update public.nozzles
     set tank_id    = v_petrol,
         retired_on = v_last_day,
         is_active  = false
   where id in (v_old_a, v_old_b);

  -- 3. The same pump again, on diesel, from the day it changed over - with the
  -- meter where it actually stood, read off its own last petrol day.
  insert into public.nozzles
    (tank_id, unit_number, nozzle_label, starting_reading, commissioned_on, is_active)
  select v_diesel, old.unit_number, old.nozzle_label, last_reading.closing_reading,
         v_first_day, true
    from public.nozzles old
    join lateral (
      select nr.closing_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = old.id
       order by nr.reading_date desc
       limit 1
    ) last_reading on true
   where old.id in (v_old_a, v_old_b);

  -- 4. Lineage, the same way replace_unit() draws it.
  update public.nozzles old
     set replaced_by = new_n.id
    from public.nozzles new_n
   where old.id in (v_old_a, v_old_b)
     and new_n.unit_number     = old.unit_number
     and new_n.commissioned_on = v_first_day
     and new_n.nozzle_label    = old.nozzle_label;

  raise notice '061: Unit % is petrol to %, diesel from %.',
    v_unit, to_char(v_last_day, 'FMDD Mon YYYY'), to_char(v_first_day, 'FMDD Mon YYYY');
end;
$$;

-- The tanks' cached book stock is recomputed from the readings by trigger, and
-- no reading was touched here - but the nozzles those readings hang off did
-- move between tanks, so both cached figures are refreshed by hand.
select public.recalc_tank_stock(id) from public.tanks;
