-- =============================================================================
-- 810: the day's collection no longer counts entries that were cancelled.
--
-- AL HAKEEM ONLY for now. A fix to 808 and 809, found on his live books on
-- 11 Oct 2026: 809 counted EVERY hand-made debit of the day, including
--   * the orphans of credit slips whose day was cleared (clearing a day deletes
--     the slips, the ledger debit stays with credit_sale_id set to null, and a
--     reversal credit is posted beside it), and
--   * debits that were later cancelled with "correct this entry",
-- so the panel took far too much off the cash to collect (358,133 of "credit"
-- on 10 Oct when 186,227 was real). 808's received had the same hole for a
-- payment that was cancelled. Now a debit counts only if it is a hand entry that
-- still stands, and a payment only if it was not cancelled.
--
-- READ-ONLY. No row changes. create or replace: nothing to undo.
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
     and le.is_payment is true
     and not exists (select 1 from public.ledger_entries x where x.corrects_entry_id = le.id);

  -- A debit counts only if it is a hand entry that still stands: not posted by a
  -- slip or oil sale, not a reversal, not cancelled by a correction, and not the
  -- orphan of a slip whose day was cleared (that debit keeps the system's own
  -- "Fuel taken on credit" note and its reversal is a credit beside it).
  select coalesce(sum(le.amount), 0) into v_entered
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'debit'
     and le.credit_sale_id is null
     and le.lubricant_sale_id is null
     and le.corrects_entry_id is null
     and coalesce(le.note, '') not ilike 'Fuel taken on credit%'
     and coalesce(le.note, '') not ilike 'Lubricant%'
     and not exists (select 1 from public.ledger_entries x where x.corrects_entry_id = le.id);

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
