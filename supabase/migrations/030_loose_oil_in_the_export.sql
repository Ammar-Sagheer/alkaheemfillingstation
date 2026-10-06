-- =============================================================================
-- 030_loose_oil_in_the_export.sql
--
-- The workbook learns about the drum.
--
-- Three additions to get_month_export, and nothing else - the export RPC is a
-- copy of the monthly report shaped for the spreadsheet, and migration 028
-- already taught the report itself. Restated in full because plpgsql has no way
-- to replace part of a function body.
--
--   lubricant_sales      gains the loose count, litres and money, so the
--                        Summary sheet can carry an "of which loose oil" line.
--                        The drum is most of the sale COUNT and a small share
--                        of the takings, so a single combined figure flatters
--                        neither half.
--   lubricant_purchases  gains the loose litres and cost, so a drum delivery is
--                        separable from a pallet of cartons.
--   lubricant_rows       gains sold_loose, which becomes a "Kind" column on the
--                        Lubricants sheet. The product name usually says so
--                        too, but a word in its own column is what makes the
--                        sheet filterable - asking for "just the drum" should
--                        not depend on how the owner spelled it.
-- =============================================================================

create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from      date;
  v_to        date;
  v_sales     numeric(14,2);
  v_cost      numeric(14,2);
  v_expenses  numeric(14,2);
  v_lub_sales numeric(14,2);
  v_lub_cost  numeric(14,2);
  v_result    jsonb;
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
  select coalesce(sum(ls.amount), 0) into v_lub_sales
    from public.lubricant_sales ls where ls.sale_date between v_from and v_to;
  select coalesce(sum(lp.total_cost), 0) into v_lub_cost
    from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to;

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
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0),
        'loose_count',   count(*) filter (where l.sold_loose),
        'loose_litres',  coalesce(sum(ls.litres) filter (where l.sold_loose), 0),
        'loose_amount',  coalesce(sum(ls.amount) filter (where l.sold_loose), 0)
      ) from public.lubricant_sales ls
        join public.lubricants l on l.id = ls.lubricant_id
       where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0),
        'loose_litres',    coalesce(sum(lp.quantity_litres) filter (where l.sold_loose), 0),
        'loose_cost',      coalesce(sum(lp.total_cost) filter (where l.sold_loose), 0)
      ) from public.lubricant_purchases lp
        join public.lubricants l on l.id = lp.lubricant_id
       where lp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit', round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',              d::date,
               'litres_sold',      f.litres_sold,
               'petrol_litres',    f.petrol_litres,
               'diesel_litres',    f.diesel_litres,
               'sale_amount',      f.sale_amount,
               'cash_amount',      f.cash_amount,
               'credit_amount',    f.credit_amount,
               'lubricant_litres', lu.litres,
               'lubricant_amount', lu.amount
             ) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join lateral (
        select coalesce(sum(nr.litres_sold), 0)   as litres_sold,
               coalesce(sum(nr.sale_amount), 0)   as sale_amount,
               coalesce(sum(nr.cash_amount), 0)   as cash_amount,
               coalesce(sum(nr.credit_amount), 0) as credit_amount,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = d::date
      ) f on true
      left join lateral (
        select coalesce(sum(ls.litres), 0) as litres,
               coalesce(sum(ls.amount), 0) as amount
          from public.lubricant_sales ls
         where ls.sale_date = d::date
      ) lu on true
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    -- What is left on the lubricant shelf at month end. Kept beside the tanks'
    -- closing stock for the same reason: it is money sitting in stock rather
    -- than profit that was never made.
    'lubricant_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           l.name,
               'closing_litres', public.calculate_lubricant_stock(l.id, v_to)
             ) order by l.name)
      from public.lubricants l
      where l.is_active
         or exists (select 1 from public.lubricant_sales ls
                     where ls.lubricant_id = l.id and ls.sale_date between v_from and v_to)
    ), '[]'::jsonb),

    -- Fuel and lubricant deliveries in one list, ordered by date. `item` is the
    -- tank for fuel and the product for a lubricant, so the sheet reads down
    -- one column either way.
    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', r.date, 'tank', r.item, 'fuel_type', r.kind,
               'supplier', r.supplier, 'invoice', r.invoice,
               'litres', r.litres, 'rate', r.rate, 'cost', r.cost,
               'payment_status', r.payment_status
             ) order by r.date, r.created_at)
      from (
        select fp.purchase_date as date, t.name as item, t.fuel_type::text as kind,
               fp.supplier_name as supplier, fp.invoice_number as invoice,
               fp.quantity_litres as litres, fp.rate, fp.total_cost as cost,
               fp.payment_status::text as payment_status, fp.created_at
          from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
         where fp.purchase_date between v_from and v_to
        union all
        select lp.purchase_date, l.name, 'lubricant',
               lp.supplier_name, lp.invoice_number,
               lp.quantity_litres, lp.rate, lp.total_cost,
               lp.payment_status::text, lp.created_at
          from public.lubricant_purchases lp join public.lubricants l on l.id = lp.lubricant_id
         where lp.purchase_date between v_from and v_to
      ) r
    ), '[]'::jsonb),

    -- Every counter sale in the month, itemised.
    'lubricant_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', ls.sale_date, 'name', l.name, 'sold_loose', l.sold_loose,
               'litres', ls.litres, 'rate', ls.rate_per_litre, 'amount', ls.amount,
               'cash_amount', ls.cash_amount, 'credit_amount', ls.credit_amount,
               'customer', c.name, 'note', ls.note
             ) order by ls.sale_date, ls.created_at)
      from public.lubricant_sales ls
      join public.lubricants l on l.id = ls.lubricant_id
      left join public.customers c on c.id = ls.customer_id
      where ls.sale_date between v_from and v_to
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
