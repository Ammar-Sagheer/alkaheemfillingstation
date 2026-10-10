-- =============================================================================
-- 807: the day's collection counts oil, and says the credit as its own figure.
--
-- Al Hakeem checked 806 against his handwritten sheet for 3 Oct 2026: his
-- "total sales" (823,890) includes the oil line, and he takes off three things
-- in turn, each as a minus: CREDIT, EXPENSES, and what went into the safe.
--
--   total sales (fuel + oil)
--   less credit (fuel slips + oil sold on credit)
--   less the day's expenses
--   = TO COLLECT
--   less Treasury cash-in of the day (shift closing, entry)
--   = STILL TO COLLECT
--
-- 806 left oil out and returned only fuel cash. This replaces the function (same
-- signature, so the grants stand) with the same figures PLUS total_sales,
-- total_credit, oil_sales and oil_credit. Every key 806 returned is still there;
-- fuel_cash and oil_cash_sales keep their meaning, to_collect and
-- still_to_collect now include oil. READ-ONLY, no row touched.
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

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit;

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
    'expenses', v_exp,
    'to_collect', v_total - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;
