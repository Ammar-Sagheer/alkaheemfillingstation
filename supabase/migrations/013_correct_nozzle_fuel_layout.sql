-- =============================================================================
-- 013_correct_nozzle_fuel_layout.sql
--
-- Corrects the guess made in migration 004.
--
-- That migration assumed each unit ran one petrol nozzle and one diesel nozzle,
-- and said so in its own header as an assumption worth checking. It was wrong.
-- The real layout at this pump is by UNIT, not by nozzle:
--
--   Unit 1 - both nozzles diesel
--   Unit 2 - both nozzles petrol
--   Unit 3 - both nozzles petrol
--
-- This matters beyond labelling: tank_id decides which tank a sale is drawn
-- out of, so a wrong mapping silently empties the wrong tank and makes the
-- stock gain/loss figure for both tanks fiction.
--
-- Written as a correction rather than an edit to 004 so the applied history
-- stays intact. It is idempotent and matches by unit number, so it is a no-op
-- on a database where the mapping has already been fixed by hand in Settings.
-- =============================================================================

update public.nozzles n
   set tank_id = t.id
  from public.tanks t
 where t.fuel_type = (case when n.unit_number = 1 then 'diesel' else 'petrol' end)::public.fuel_type
   and n.tank_id is distinct from t.id;
