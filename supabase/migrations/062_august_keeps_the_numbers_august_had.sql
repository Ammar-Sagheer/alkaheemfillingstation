-- =============================================================================
-- 062_august_keeps_the_numbers_august_had.sql
--
-- August's unit numbers go back to the forecourt August actually had.
--
-- WHY THIS WAS NOT POSSIBLE BEFORE 061, AND IS NOW. `unit_number` is one field
-- per nozzle row, so a rename applies to every day that row has ever traded -
-- which 058 chose deliberately, and which was the only behaviour available
-- while a pump that moved was a single row spanning both months. The petrol
-- pump renumbered 2 -> 1 on 1 Sep therefore took its whole August with it, and
-- the scrapped diesel pump renumbered 1 -> 2 took its whole August the other
-- way. August ended up captioned as the mirror image of the forecourt that
-- actually stood there:
--
--                     the books said        the forecourt in August
--     Unit 1            petrol                 diesel  (the scrapped pump)
--     Unit 2            diesel                 petrol  (the pump that moved)
--
-- 061 split the pump that moved into two rows - petrol to 31 Aug, diesel from
-- 1 Sep - because its FUEL changed on a date. Its POSITION changed on the same
-- date, and now that there are two rows there is somewhere to put the two
-- answers. So the fix is only a relabelling of rows that already have the right
-- dates on them:
--
--   * the scrapped diesel pump's rows go back to Unit 1, which is where it
--     stood every day it ever dispensed;
--   * the moved pump's AUGUST rows go back to Unit 2, which is where it stood
--     every day those readings were taken.
--
-- September's rows are not touched. Unit 1 is diesel and Unit 2 is petrol from
-- 1 September, which is the forecourt today.
--
-- ONE STATEMENT, BECAUSE IT IS A SWAP. Two rows pass through claiming Unit 1
-- on days that overlap nothing, but `nozzles_one_pump_per_position` is checked
-- per statement unless it is deferred - which it is (058), and the whole
-- relabel therefore lives inside one DO block so the check happens once, when
-- the forecourt is whole again.
--
-- THE SCRAPPED PUMP'S SUCCESSOR ALSO HAS TO MOVE. It currently points at the
-- new PETROL pump, which was true only in the sense that both wore the number
-- 2 for a day: the owner ran "Replace this unit" on Unit 2 at a moment when the
-- renumbering had already happened. Nothing about the machines matched. What
-- actually took over the scrapped pump's position AND its fuel is the pump
-- standing at Unit 1 on diesel today, so that is where the link goes.
--
-- That leaves the September diesel row with two predecessors, and both are
-- true: it is the same machine as the August Unit 2 petrol row (it moved), and
-- it is the successor at position 1 to the August Unit 1 diesel row (it took
-- over). `replaced_by` is a record, read by nothing in the app - a fan-in costs
-- nothing and saying only one of the two would be the lie.
--
-- NO READING, NO RUPEE AND NO LITRE MOVES. `unit_number` is a caption. Which
-- tank a sale came out of is `tank_id`, which 061 already put right, and the
-- money lives on the readings themselves.
--
-- Safe to run twice: if the scrapped pump is already back at Unit 1 it does
-- nothing.
-- =============================================================================

do $$
declare
  v_diesel  uuid;
  v_scrap_a uuid := '2f317993-6ec5-4271-8ae8-c83cbbaed8eb';  -- scrapped diesel pump, A
  v_scrap_b uuid := '5d1d838a-c597-4e83-aee9-f30b029b25ed';  -- scrapped diesel pump, B
  v_moved_a uuid := '7c4bd261-a5a8-4f0b-b5eb-dcf24a86d6ae';  -- the pump that moved, August
  v_moved_b uuid := '078e541c-6f53-430a-9047-72ad12a5e24f';
begin
  select id into v_diesel from public.tanks where fuel_type = 'diesel';

  if not exists (select 1 from public.nozzles where id in (v_scrap_a, v_scrap_b)) then
    raise notice '062: those nozzles are not in this database - nothing to do.';
    return;
  end if;

  if (select unit_number from public.nozzles where id = v_scrap_a) = 1 then
    raise notice '062: August already carries August''s numbers - nothing to do.';
    return;
  end if;

  -- 061 is what makes this a relabel rather than a rewrite of history. Without
  -- it the moved pump is still one row and there is no August to number
  -- separately.
  if exists (select 1 from public.nozzles
              where id in (v_moved_a, v_moved_b) and retired_on is null) then
    raise exception
      '062: the pump that moved has not been split at 31 Aug yet. Apply 061 first.';
  end if;

  update public.nozzles set unit_number = 1 where id in (v_scrap_a, v_scrap_b);
  update public.nozzles set unit_number = 2 where id in (v_moved_a, v_moved_b);

  update public.nozzles old
     set replaced_by = successor.id
    from public.nozzles successor
   where old.id in (v_scrap_a, v_scrap_b)
     and successor.unit_number     = 1
     and successor.commissioned_on = '2026-09-01'
     and successor.tank_id         = v_diesel
     and successor.nozzle_label    = old.nozzle_label;

  raise notice '062: August reads Unit 1 diesel, Unit 2 petrol again.';
end;
$$;
