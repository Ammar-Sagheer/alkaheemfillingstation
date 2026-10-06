-- =============================================================================
-- 019_month_export_with_banking.sql
--
-- Adds the bank movements to the monthly export.
--
-- This is not only a convenience. The Banking page keeps the last 60
-- transactions per account and drops older ones automatically, so the month's
-- workbook is what makes the detail durable - it is written from the rows while
-- they still exist. Take the report each month and nothing is ever actually
-- lost; skip it and the itemised history really is gone once 60 is passed.
--
-- Three additions, everything else is migration 010 unchanged:
--   bank_rows      - every deposit and payment dated in the month
--   bank_accounts  - where each account stands as the report is taken
--   bank_month     - the month's totals in and out
-- =============================================================================

create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14,2);
  v_cost     numeric(14,2);
  v_expenses numeric(14,2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;
  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;
  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'profit', round(v_sales - v_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',           day,
               'litres_sold',   litres_sold,
               'petrol_litres', petrol_litres,
               'diesel_litres', diesel_litres,
               'sale_amount',   sale_amount,
               'cash_amount',   cash_amount,
               'credit_amount', credit_amount
             ) order by day)
      from (
        select d::date                                                              as day,
               coalesce(sum(nr.litres_sold), 0)                                     as litres_sold,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres,
               coalesce(sum(nr.sale_amount), 0)                                     as sale_amount,
               coalesce(sum(nr.cash_amount), 0)                                     as cash_amount,
               coalesce(sum(nr.credit_amount), 0)                                   as credit_amount
          from generate_series(v_from, v_to, interval '1 day') d
          left join public.nozzle_readings nr on nr.reading_date = d::date
          left join public.nozzles n on n.id = nr.nozzle_id
          left join public.tanks   t on t.id = n.tank_id
         group by d
      ) per_day
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', fp.purchase_date, 'tank', t.name, 'fuel_type', t.fuel_type,
               'supplier', fp.supplier_name, 'invoice', fp.invoice_number,
               'litres', fp.quantity_litres, 'rate', fp.rate, 'cost', fp.total_cost,
               'payment_status', fp.payment_status
             ) order by fp.purchase_date, fp.created_at)
      from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
      where fp.purchase_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb),

    -- Every bank movement in the month, itemised. Written before the 60-entry
    -- cap can reach these rows, so the workbook is the durable record once they
    -- age off the Banking page.
    'bank_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', bt.txn_date, 'account', ba.account_label, 'bank', ba.bank_name,
               'direction', bt.txn_type, 'category', bt.category,
               'note', bt.note, 'amount', bt.amount
             ) order by bt.txn_date, bt.created_at)
      from public.bank_transactions bt
      join public.bank_accounts ba on ba.id = bt.account_id
      where bt.txn_date between v_from and v_to
    ), '[]'::jsonb),

    -- Where each account stood when the report was taken.
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', b.account_label, 'bank', b.bank_name,
               'balance', b.balance, 'total_deposited', b.total_deposited,
               'total_paid', b.total_paid
             ) order by b.created_at)
      from public.bank_account_balances b
    ), '[]'::jsonb),

    'bank_month', (
      select jsonb_build_object(
               'deposits', coalesce(sum(bt.amount) filter (where bt.txn_type = 'deposit'), 0),
               'payments', coalesce(sum(bt.amount) filter (where bt.txn_type = 'payment'), 0)
             )
        from public.bank_transactions bt where bt.txn_date between v_from and v_to
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_month_export(int, int) from public, anon;
grant  execute on function public.get_month_export(int, int) to authenticated;
