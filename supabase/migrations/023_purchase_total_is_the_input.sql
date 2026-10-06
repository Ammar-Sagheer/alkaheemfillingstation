-- =============================================================================
-- 023_purchase_total_is_the_input.sql
--
-- Swaps which of a delivery's two money figures is the recorded fact.
--
-- Before: rate was typed in and total_cost was generated as litres x rate.
-- After:  total_cost is typed in and rate is generated as total_cost / litres.
--
-- WHY. The delivery note from the OMC states litres and an amount payable. That
-- amount is what leaves the bank, and it is what monthly profit is computed
-- from - so it is the fact, and the rate is a convenience derived from it.
--
-- Asking for the rate instead forced the owner to divide by hand, and could not
-- represent his invoice exactly: rate is numeric(10,2), so on a 20,000 litre
-- load every stored total was pinned to a multiple of 20,000 x 0.01 = Rs 200.
-- An invoice of Rs 4,800,010 could only be stored as Rs 4,800,000. Small, but
-- it is the books disagreeing with the paperwork, silently, on every load that
-- did not divide cleanly.
--
-- The derived rate keeps 4 decimals rather than 2. It is display-only now, and
-- rounding it to paisa would make a 20,000 litre load's implied total drift
-- from the total actually stored - the very thing this migration removes.
--
-- Nothing is lost converting: total_cost already held round(litres x rate, 2)
-- for every existing row, so copying it into a real column preserves each one
-- exactly, and the rate those rows show afterwards is the same figure they were
-- entered with (to within the extra decimals it can now carry).
-- =============================================================================

-- 1. total_cost becomes a real, stored column, carrying its existing values.
alter table public.fuel_purchases add column total_cost_input numeric(14, 2);

update public.fuel_purchases set total_cost_input = total_cost;

alter table public.fuel_purchases drop column total_cost;
alter table public.fuel_purchases rename column total_cost_input to total_cost;

alter table public.fuel_purchases
  alter column total_cost set not null;

alter table public.fuel_purchases
  add constraint fuel_purchases_total_cost_positive check (total_cost > 0);

-- 2. rate becomes generated from it. Dropping the old column takes its
--    check constraint with it; a generated rate cannot be non-positive anyway,
--    since both columns it divides are constrained positive.
alter table public.fuel_purchases drop column rate;

alter table public.fuel_purchases
  add column rate numeric(12, 4)
  generated always as (round(total_cost / quantity_litres, 4)) stored;

comment on column public.fuel_purchases.total_cost is
  'The amount on the delivery note - the recorded fact, typed in as it appears.';
comment on column public.fuel_purchases.rate is
  'Derived: total_cost / quantity_litres. For display only; never entered.';
