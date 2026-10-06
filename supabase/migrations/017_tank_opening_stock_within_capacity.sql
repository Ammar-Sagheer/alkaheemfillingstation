-- =============================================================================
-- 017_tank_opening_stock_within_capacity.sql
--
-- A tank cannot hold more than it holds.
--
-- Both tanks were saved above their own capacity - 50,000 L in a 25,000 L
-- petrol tank, 60,000 L in a 50,000 L diesel one - because nothing checked the
-- two figures against each other. updateTank now refuses it, and the settings
-- form shows the overflow as it is typed. This is the last line: the same rule
-- stated in the schema, so it holds for anything that writes to the table,
-- including SQL run by hand.
--
-- APPLY THIS ONLY ONCE BOTH TANKS ARE VALID. Correct them under Settings first
-- - either lower the opening stock or raise the capacity, whichever is the
-- wrong number. The guard below refuses to run while any row still violates the
-- rule, and names the offenders rather than failing with a bare constraint
-- error.
--
-- The order matters and is not fussiness. A CHECK constraint is re-evaluated
-- against the whole row on every UPDATE, not just the columns being written -
-- so adding it while a row is invalid would make the daily readings fail the
-- moment one of them updated that tank's current_stock_litres. Clean data
-- first, constraint second, and that cannot happen.
--
-- Only opening stock is constrained. current_stock_litres is deliberately left
-- alone: it is written by the stock triggers as readings and deliveries land,
-- and a constraint there would turn a mistyped delivery into a failed day's
-- entry rather than a number somebody can see and correct.
-- =============================================================================

do $$
declare
  v_offenders text;
begin
  select string_agg(
           format('%s (%s L opening in a %s L tank)',
                  name, opening_stock_litres, capacity_litres),
           ', ' order by name)
    into v_offenders
    from public.tanks
   where opening_stock_litres > capacity_litres;

  if v_offenders is not null then
    raise exception 'Cannot add the capacity rule yet - these tanks break it: %', v_offenders
      using hint = 'Fix them under Settings -> Tanks first. Lower the opening stock, '
                   'or raise the capacity if the tank really is bigger.';
  end if;
end $$;

alter table public.tanks
  drop constraint if exists tanks_opening_stock_within_capacity;

alter table public.tanks
  add constraint tanks_opening_stock_within_capacity
  check (opening_stock_litres <= capacity_litres);

comment on constraint tanks_opening_stock_within_capacity on public.tanks is
  'Opening stock is the baseline every later litre is measured against. Above '
  'capacity it overstates the fuel on hand from that day onward, and the '
  'dashboard reports stock that was never in the ground.';
