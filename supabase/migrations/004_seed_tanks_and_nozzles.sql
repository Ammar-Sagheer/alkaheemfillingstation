-- =============================================================================
-- 004_seed_tanks_and_nozzles.sql
--
-- The physical hardware at the pump: 2 underground tanks and 6 nozzles across
-- 3 double dispensing units.
--
-- ASSUMPTION worth checking: each unit is set up with one petrol nozzle (A) and
-- one diesel nozzle (B). If a unit actually runs both nozzles on the same fuel,
-- change that nozzle's tank_id from the Settings screen - no migration needed.
--
-- Opening stock is seeded at 0. Record the first physical dip on the Stock
-- Checks screen and that measured number becomes the baseline for everything
-- afterwards.
-- =============================================================================

insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
values
  ('Petrol Tank', 'petrol', 25000, 0, current_date),
  ('Diesel Tank', 'diesel', 50000, 0, current_date);

insert into public.nozzles (tank_id, unit_number, nozzle_label)
select t.id, u.unit_number, u.nozzle_label
  from (values
          (1::smallint, 'A', 'petrol'),
          (1::smallint, 'B', 'diesel'),
          (2::smallint, 'A', 'petrol'),
          (2::smallint, 'B', 'diesel'),
          (3::smallint, 'A', 'petrol'),
          (3::smallint, 'B', 'diesel')
       ) as u (unit_number, nozzle_label, fuel)
  join public.tanks t on t.fuel_type = u.fuel::public.fuel_type;
