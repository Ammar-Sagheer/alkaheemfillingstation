-- =============================================================================
-- 806: what the staff still owe the owner for a day.
--
-- Asked for by Al Hakeem as the most important thing on his Dashboard. The men
-- at the pumps take the money; at the end of the day he wants one comparison:
-- how much should be in his hands, and how much has actually reached him.
--
--   Fuel sold at the nozzles, as cash      (readings: cash_amount; the part
--                                           that went on credit slips is not
--                                           cash, so it is already out)
--   less the day's expenses                (money the pump paid out that day,
--                                           net of recoveries; salaries and
--                                           advances given that day included)
--   = TO COLLECT
--   less what has been handed in           (Treasury cash-in dated the same
--                                           day: "Cash of shift closing" and
--                                           "Entry")
--   = STILL TO COLLECT
--
-- Worked out here, in exact numeric, and read back by the Dashboard: this is a
-- money figure, and the page does no arithmetic of its own on it.
--
-- WHAT IS NOT IN IT YET, on purpose, until the owner says: cash from oil sales,
-- and cash paid straight into a bank account without going through the safe.
-- Oil cash is returned beside the figures (oil_cash_sales) so adding it is a
-- decision and not a rebuild.
--
-- READ-ONLY. Nothing is written, no row changes.
-- =============================================================================

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales   numeric;
  v_credit  numeric;
  v_cash    numeric;
  v_exp     numeric;
  v_handed  numeric;
  v_oil     numeric;
  v_n       integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(ls.cash_amount), 0) into v_oil
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'expenses', v_exp,
    'to_collect', v_cash - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_cash - v_exp - v_handed,
    'oil_cash_sales', v_oil
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;
