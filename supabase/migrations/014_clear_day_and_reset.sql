-- =============================================================================
-- 014_clear_day_and_reset.sql
--
-- Two ways to undo entry mistakes:
--
--   clear_day(date)   - wipes one day's nozzle entries so it can be redone.
--                       Permanent feature; the mistake it fixes does not stop
--                       happening when testing ends.
--   reset_all_data()  - empties the books completely. Scaffolding for the
--                       testing phase; the app only shows the button for it
--                       when ALLOW_FULL_RESET is set, so removing that one
--                       environment variable retires it.
--
-- Both are SECURITY DEFINER with their own is_super_admin() check, like the
-- reporting functions. Staff must not be able to reach either.
--
-- THE CREDIT SLIP PROBLEM. Deleting a reading cascades to its credit slips,
-- and ledger_entries pointed at those slips with ON DELETE RESTRICT - so any
-- day where somebody took fuel on credit could not be cleared at all. That is
-- exactly the day most likely to be wrong.
--
-- The fix is not to erase the ledger. The FK becomes ON DELETE SET NULL, the
-- append-only trigger gains a second narrow exception for that column, and
-- clear_day posts an offsetting credit for every slip it removes. The original
-- debit stays on the customer's account, the reversal sits beside it, and the
-- balance comes back to correct - which is what the app already tells you to do
-- when you try to edit a ledger entry by hand.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Let a deleted credit slip release its ledger entry
-- ---------------------------------------------------------------------------
alter table public.ledger_entries
  drop constraint if exists ledger_entries_credit_sale_id_fkey;

alter table public.ledger_entries
  add constraint ledger_entries_credit_sale_id_fkey
  foreign key (credit_sale_id) references public.credit_sales (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Widen the append-only exception to cover it
--
-- Migration 011 allowed created_by to be nulled when a profile is deleted.
-- credit_sale_id needs the same treatment for the same reason: a foreign key
-- releasing its reference is not an edit to the entry. Both columns may go to
-- null; every other column must be byte-for-byte identical, so this still
-- cannot be used as a way in to change an amount, a date or a customer.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'created_by' - 'credit_sale_id'
       = to_jsonb(old) - 'created_by' - 'credit_sale_id'
     and (new.created_by     is not distinct from old.created_by     or new.created_by     is null)
     and (new.credit_sale_id is not distinct from old.credit_sale_id or new.credit_sale_id is null)
  then
    return new;
  end if;

  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_ledger_append_only() is
  'Blocks UPDATE and DELETE on ledger_entries. The only exceptions are '
  'created_by and credit_sale_id being nulled when the row they point at is '
  'deleted; no other column may change.';

-- ---------------------------------------------------------------------------
-- 3. Clear one day
-- ---------------------------------------------------------------------------
create or replace function public.clear_day(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_readings int;
  v_slips    int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may clear a day' using errcode = '42501';
  end if;

  -- Reverse first, delete second. If the delete fails the whole thing rolls
  -- back together, so a reversal can never be left behind without its cause.
  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by)
  select cs.customer_id, 'credit', cs.amount, p_date,
         'Reversal - the nozzle entries for ' || to_char(p_date, 'DD Mon YYYY')
           || ' were cleared and will be re-entered',
         auth.uid()
    from public.credit_sales cs
    join public.nozzle_readings nr on nr.id = cs.reading_id
   where nr.reading_date = p_date;

  get diagnostics v_slips = row_count;

  delete from public.nozzle_readings where reading_date = p_date;
  get diagnostics v_readings = row_count;

  return jsonb_build_object('readings', v_readings, 'slips_reversed', v_slips);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Empty the books
--
-- Kept: the logins, the tanks and their capacities, the nozzles and their
-- starting meter readings. Those describe the pump itself, not its trading -
-- re-typing them after every test round would be busywork.
--
-- The trigger comes off only inside this function, which runs as the table
-- owner, and goes back on before it returns. The app's own role cannot do this
-- on its own, which is the point.
-- ---------------------------------------------------------------------------
create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may reset the data' using errcode = '42501';
  end if;

  v_counts := jsonb_build_object(
    'readings',  (select count(*) from public.nozzle_readings),
    'customers', (select count(*) from public.customers),
    'purchases', (select count(*) from public.fuel_purchases),
    'expenses',  (select count(*) from public.expenses)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales;
  delete from public.nozzle_readings;
  delete from public.stock_checks;
  delete from public.fuel_purchases;
  delete from public.expenses;
  delete from public.customers;
  delete from public.fuel_prices;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today();

  return v_counts;
end;
$$;

revoke execute on function public.clear_day(date)   from public, anon;
revoke execute on function public.reset_all_data()  from public, anon;
grant  execute on function public.clear_day(date)   to authenticated;
grant  execute on function public.reset_all_data()  to authenticated;
