-- =============================================================================
-- 809: customer debits entered by hand count as credit in the day's collection.
--
-- AL HAKEEM ONLY for now (his number; not yet in the master).
--
-- He gives fuel on credit and writes it on the customer's own page ("adjust the
-- balance", a debit) rather than as a credit slip on the nozzle's reading, so the
-- Dashboard's "To collect from the staff", which counted only slips on readings
-- and oil sales, never saw it: 10 Oct 2026, Shah Ali pur Rs 14,320, PM Relief
-- Rs 138,500. The cash those men hold is smaller by exactly that, so
-- get_day_collection now counts such a debit, dated the day, as credit.
--
-- WHICH DEBITS: ledger debits dated the day that were NOT posted by a credit slip
-- or an oil sale (those are already in the readings' and oil figures) and are not
-- the reversal of another entry. Returned on its own as entered_credit and
-- included in total_credit.
--
-- CAVEAT, accepted by the owner: an opening balance carried over from an old
-- register and entered the same way would count on its date as well.
--
-- READ-ONLY. No row changes.
-- =============================================================================

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_received   numeric;
  v_entered    numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(le.amount), 0) into v_received
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'credit'
     and le.is_payment is true;

  select coalesce(sum(le.amount), 0) into v_entered
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'debit'
     and le.credit_sale_id is null
     and le.lubricant_sale_id is null
     and le.corrects_entry_id is null;

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit + v_entered;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'received', v_received,
    'entered_credit', v_entered,
    'expenses', v_exp,
    'to_collect', v_total + v_received - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total + v_received - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;
