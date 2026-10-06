-- =============================================================================
-- 800_owner_sets_up_the_forecourt.sql       AL HAKEEM ONLY - not in the master
--
-- This pump's owner sets up his own forecourt: as many tanks as he has, of
-- either fuel, and as many nozzles as he has, each drawing from the tank he
-- chooses. The master app seeds two tanks and six nozzles in its migrations
-- and offers no way to add more; here the database starts with none
-- (supabase/setup/start-empty.sql) and these four functions do the rest:
--
--   add_tank(name, fuel, capacity, opening stock, opening date)
--   add_nozzle(unit, name, tank, starting meter, first day)
--   remove_tank(tank)      only a tank nothing has ever used
--   remove_nozzle(nozzle)  only a nozzle no reading has ever used
--
-- Removing is there for mistakes made while setting up. Anything that has
-- traded stays in the books for good, as everywhere else in the app: a tank
-- that has had a delivery, a dip or a nozzle, and a nozzle that has a reading,
-- are refused - the foreign keys already say so; these say it in words.
--
-- A NOZZLE'S FIRST DAY. Added before any reading exists anywhere, a nozzle is
-- part of the pump as it went onto the system (commissioned_on null, the same
-- as the master's seeded nozzles). Added after trading has started, it carries
-- the day it was fitted, and readings are only taken from that day on
-- (056's service window), so no earlier day changes. Two nozzles cannot hold
-- the same unit and name over the same days: nozzles_one_pump_per_position
-- (058) refuses it, and add_nozzle names the clash.
--
-- Owner only, in every function. Changing a tank's size or opening stock, and
-- re-pointing an untraded nozzle, stay where they were (TankForm, the nozzle
-- wiring dialog); a nozzle that has traded is changed by replacing its unit.
-- =============================================================================

create or replace function public.add_tank(
  p_name          text,
  p_fuel          public.fuel_type,
  p_capacity      numeric,
  p_opening_stock numeric default 0,
  p_opening_date  date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may add a tank' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Give the tank a name, such as "Diesel Tank 2".' using errcode = '23514';
  end if;
  if p_fuel is null then
    raise exception 'Choose whether the tank holds petrol or diesel.' using errcode = '23514';
  end if;
  if p_capacity is null or p_capacity <= 0 then
    raise exception 'Enter how many litres the tank holds.' using errcode = '23514';
  end if;
  if coalesce(p_opening_stock, 0) < 0 or coalesce(p_opening_stock, 0) > p_capacity then
    raise exception 'The fuel in the tank must be between 0 and its size (% litres).',
      to_char(p_capacity, 'FM999,999,990') using errcode = '23514';
  end if;
  if exists (select 1 from public.tanks where lower(btrim(name)) = lower(v_name)) then
    raise exception 'There is already a tank called "%". Give this one another name.', v_name
      using errcode = '23505';
  end if;

  insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
  values (v_name, p_fuel, p_capacity, coalesce(p_opening_stock, 0),
          coalesce(p_opening_date, public.pump_today()))
  returning id into v_id;

  -- The book stock is recalculated on an update of the opening stock, not on
  -- an insert; set it now so the new tank shows what it holds straight away.
  perform public.recalc_tank_stock(v_id);

  return v_id;
end;
$$;

create or replace function public.add_nozzle(
  p_unit      integer,
  p_label     text,
  p_tank_id   uuid,
  p_starting  numeric default 0,
  p_first_day date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label   text := btrim(coalesce(p_label, ''));
  v_trading boolean := exists (select 1 from public.nozzle_readings);
  v_from    date;
  v_id      uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may add a nozzle' using errcode = '42501';
  end if;
  if p_unit is null or p_unit < 1 or p_unit > 999 then
    raise exception 'Enter the unit (dispenser) number, 1 or more.' using errcode = '23514';
  end if;
  if v_label = '' then
    raise exception 'Give the nozzle a name or number, such as "1" or "A".' using errcode = '23514';
  end if;
  if not exists (select 1 from public.tanks where id = p_tank_id) then
    raise exception 'Choose the tank this nozzle draws from.' using errcode = '23514';
  end if;
  if coalesce(p_starting, 0) < 0 then
    raise exception 'The meter reading cannot be below zero.' using errcode = '23514';
  end if;

  -- Before any trading the nozzle is part of the pump from the start; after,
  -- it begins on the day it was fitted.
  if v_trading then
    v_from := coalesce(p_first_day, public.pump_today());
  end if;

  -- Checked here, in words, because nozzles_one_pump_per_position is deferred
  -- to the end of the transaction: it still has the last say, but by then no
  -- handler is left to explain it.
  if exists (
    select 1 from public.nozzles n
     where n.unit_number = p_unit
       and lower(btrim(n.nozzle_label)) = lower(v_label)
       and daterange(n.commissioned_on, n.retired_on, '[]') && daterange(v_from, null, '[]')
  ) then
    raise exception 'Unit % already has a nozzle called "%". Use another name, or another unit.',
      p_unit, v_label using errcode = '23505';
  end if;

  insert into public.nozzles (tank_id, unit_number, nozzle_label, starting_reading, commissioned_on)
  values (p_tank_id, p_unit, v_label, coalesce(p_starting, 0), v_from)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.remove_tank(p_tank_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a tank' using errcode = '42501';
  end if;
  select name into v_name from public.tanks where id = p_tank_id;
  if v_name is null then
    raise exception 'That tank no longer exists. Reload the page.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.nozzles where tank_id = p_tank_id) then
    raise exception '% still has nozzles drawing from it. Remove them or point them at another tank first.', v_name
      using errcode = '23503';
  end if;
  if exists (select 1 from public.fuel_purchases where tank_id = p_tank_id)
     or exists (select 1 from public.stock_checks where tank_id = p_tank_id) then
    raise exception '% has deliveries or dips in the books, so it stays.', v_name
      using errcode = '23503';
  end if;

  delete from public.tanks where id = p_tank_id;
end;
$$;

create or replace function public.remove_nozzle(p_nozzle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit  smallint;
  v_label text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a nozzle' using errcode = '42501';
  end if;
  select unit_number, nozzle_label into v_unit, v_label from public.nozzles where id = p_nozzle_id;
  if v_label is null then
    raise exception 'That nozzle no longer exists. Reload the page.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.nozzle_readings where nozzle_id = p_nozzle_id) then
    raise exception 'Unit % nozzle % has readings in the books, so it stays. A nozzle that is no longer used is replaced with its unit.',
      v_unit, v_label using errcode = '23503';
  end if;

  delete from public.nozzles where id = p_nozzle_id;
end;
$$;

revoke all on function public.add_tank(text, public.fuel_type, numeric, numeric, date) from public, anon;
revoke all on function public.add_nozzle(integer, text, uuid, numeric, date)          from public, anon;
revoke all on function public.remove_tank(uuid)                                       from public, anon;
revoke all on function public.remove_nozzle(uuid)                                     from public, anon;
grant execute on function public.add_tank(text, public.fuel_type, numeric, numeric, date) to authenticated;
grant execute on function public.add_nozzle(integer, text, uuid, numeric, date)          to authenticated;
grant execute on function public.remove_tank(uuid)                                       to authenticated;
grant execute on function public.remove_nozzle(uuid)                                     to authenticated;
