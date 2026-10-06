-- =============================================================================
-- 025_lubricants_in_reports.sql
--
-- Puts lubricants into every figure that is supposed to describe the whole
-- business: the dashboard's day, the day-by-day trend, the monthly report and
-- the Excel export. Plus the full reset, which is meant to empty the books and
-- would otherwise leave the lubricant shelf behind.
--
-- THE PROFIT LINE CHANGES. It was:
--
--     profit = fuel sales - fuel bought - expenses
--
-- and is now:
--
--     profit = fuel sales + lubricant sales
--            - fuel bought - lubricants bought
--            - expenses
--
-- A pump that sells Rs 200,000 of oil a month and reports none of it is not
-- reporting its profit, so this is a correction rather than an addition. The
-- cash-basis caveat is unchanged and now applies to both: stock BOUGHT in the
-- month is counted, not stock sold from the shelf, which is why closing stock
-- is reported beside it.
--
-- clear_day() is deliberately NOT extended to lubricant sales. It exists for
-- the one mistake that cannot be unpicked row by row - a whole day of nozzle
-- meters entered wrongly - while deliveries, expenses and now lubricant sales
-- are each deleted on their own screen, where you can see what you are
-- removing. A counter sale is one row, so it belongs in that second group.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The dashboard's day
--
-- Body is migration 008's, with the lubricant block added at the end.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_summary(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the daily summary' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'date', p_date,
    'totals', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr where nr.reading_date = p_date
    ),
    'by_fuel_type', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',     s.fuel_type,
               'litres_sold',   s.litres_sold,
               'sale_amount',   s.sale_amount,
               'cash_amount',   s.cash_amount,
               'credit_amount', s.credit_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold)   as litres_sold,
               sum(nr.sale_amount)   as sale_amount,
               sum(nr.cash_amount)   as cash_amount,
               sum(nr.credit_amount) as credit_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = p_date
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'tanks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                   t.id,
               'name',                 t.name,
               'fuel_type',            t.fuel_type,
               'capacity_litres',      t.capacity_litres,
               'current_stock_litres', t.current_stock_litres,
               'expected_stock',       public.calculate_expected_stock(t.id, p_date),
               'actual_dip_reading',   sc.actual_dip_reading,
               'gain_loss',            sc.gain_loss
             ) order by t.fuel_type)
      from public.tanks t
      left join public.stock_checks sc on sc.tank_id = t.id and sc.check_date = p_date
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0)
      )
      from public.fuel_purchases fp where fp.purchase_date = p_date
    ),

    -- The day's counter sales, and what each one sold.
    'lubricants', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      )
      from public.lubricant_sales ls where ls.sale_date = p_date
    ),
    'lubricants_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',   s.name,
               'litres', s.litres,
               'amount', s.amount
             ) order by s.amount desc)
      from (
        select l.name, sum(ls.litres) as litres, sum(ls.amount) as amount
          from public.lubricant_sales ls
          join public.lubricants l on l.id = ls.lubricant_id
         where ls.sale_date = p_date
         group by l.id, l.name
      ) s
    ), '[]'::jsonb),
    -- Stock as at the date on screen, so the dashboard's shelf agrees with the
    -- Stock page's shelf when an older day is being looked at.
    'lubricant_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           l.id,
               'name',         l.name,
               'stock_litres', public.calculate_lubricant_stock(l.id, p_date)
             ) order by l.name)
      from public.lubricants l where l.is_active
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Day-by-day trend
--
-- Two columns added, so the function has to be dropped and recreated - Postgres
-- will not replace a set-returning function whose output columns changed.
--
-- The per-day figures now come from lateral aggregates rather than one big
-- group-by. Joining lubricant sales onto the same rows as nozzle readings would
-- have multiplied one against the other and inflated both.
-- ---------------------------------------------------------------------------
drop function if exists public.get_sales_trend(date, date);

create function public.get_sales_trend(p_from date, p_to date)
returns table (
  day              date,
  litres_sold      numeric,
  sale_amount      numeric,
  cash_amount      numeric,
  credit_amount    numeric,
  petrol_litres    numeric,
  diesel_litres    numeric,
  lubricant_litres numeric,
  lubricant_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports' using errcode = '42501';
  end if;

  return query
  select d::date,
         f.litres_sold,
         f.sale_amount,
         f.cash_amount,
         f.credit_amount,
         f.petrol_litres,
         f.diesel_litres,
         lu.litres,
         lu.amount
    from generate_series(p_from, p_to, interval '1 day') d
    left join lateral (
      select coalesce(sum(nr.litres_sold), 0)::numeric   as litres_sold,
             coalesce(sum(nr.sale_amount), 0)::numeric   as sale_amount,
             coalesce(sum(nr.cash_amount), 0)::numeric   as cash_amount,
             coalesce(sum(nr.credit_amount), 0)::numeric as credit_amount,
             coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0)::numeric as petrol_litres,
             coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0)::numeric as diesel_litres
        from public.nozzle_readings nr
        join public.nozzles n on n.id = nr.nozzle_id
        join public.tanks   t on t.id = n.tank_id
       where nr.reading_date = d::date
    ) f on true
    left join lateral (
      select coalesce(sum(ls.litres), 0)::numeric as litres,
             coalesce(sum(ls.amount), 0)::numeric as amount
        from public.lubricant_sales ls
       where ls.sale_date = d::date
    ) lu on true
   order by d;
end;
$$;

revoke execute on function public.get_sales_trend(date, date) from public, anon;
grant  execute on function public.get_sales_trend(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The monthly report
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from      date;
  v_to        date;
  v_sales     numeric(14, 2);
  v_cost      numeric(14, 2);
  v_expenses  numeric(14, 2);
  v_lub_sales numeric(14, 2);
  v_lub_cost  numeric(14, 2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the monthly report' using errcode = '42501';
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
      )
      from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'sales_by_fuel', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',   s.fuel_type,
               'litres_sold', s.litres_sold,
               'sale_amount', s.sale_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold) as litres_sold,
               sum(nr.sale_amount) as sale_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date between v_from and v_to
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      )
      from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),

    -- ---- lubricants ----
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      )
      from public.lubricant_sales ls where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0)
      )
      from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to
    ),
    -- One line per product: what it sold, what was restocked, and what is left
    -- on the shelf at month end. Products with no movement in the month are
    -- left out; the Stock page is where the whole shelf is listed.
    'lubricants_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lubricant_id',   s.id,
               'name',           s.name,
               'litres_sold',    s.litres_sold,
               'amount',         s.amount,
               'cash_amount',    s.cash_amount,
               'credit_amount',  s.credit_amount,
               'bought_litres',  s.bought_litres,
               'bought_cost',    s.bought_cost,
               'closing_litres', public.calculate_lubricant_stock(s.id, v_to)
             ) order by s.amount desc, s.name)
      from (
        select l.id,
               l.name,
               coalesce(sold.litres, 0)  as litres_sold,
               coalesce(sold.amount, 0)  as amount,
               coalesce(sold.cash, 0)    as cash_amount,
               coalesce(sold.credit, 0)  as credit_amount,
               coalesce(bought.litres, 0) as bought_litres,
               coalesce(bought.cost, 0)   as bought_cost
          from public.lubricants l
          left join lateral (
            select sum(ls.litres) as litres, sum(ls.amount) as amount,
                   sum(ls.cash_amount) as cash, sum(ls.credit_amount) as credit
              from public.lubricant_sales ls
             where ls.lubricant_id = l.id and ls.sale_date between v_from and v_to
          ) sold on true
          left join lateral (
            select sum(lp.quantity_litres) as litres, sum(lp.total_cost) as cost
              from public.lubricant_purchases lp
             where lp.lubricant_id = l.id and lp.purchase_date between v_from and v_to
          ) bought on true
         where coalesce(sold.litres, 0) <> 0 or coalesce(bought.litres, 0) <> 0
      ) s
    ), '[]'::jsonb),

    'expenses_total', v_expenses,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', s.category, 'amount', s.amount)
                       order by s.amount desc)
      from (
        select e.category, sum(e.amount) as amount
          from public.expenses e
         where e.expense_date between v_from and v_to
         group by e.category
      ) s
    ), '[]'::jsonb),

    -- Headline figures, with both trades folded in. The separate blocks above
    -- are what the page uses to show the split.
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit', round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tank_id',        t.id,
               'name',           t.name,
               'fuel_type',      t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to)
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),
    'stock_gain_loss', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tank_id',   s.tank_id,
               'fuel_type', s.fuel_type,
               'gain_loss', s.gain_loss
             ) order by s.fuel_type)
      from (
        select sc.tank_id, t.fuel_type, sum(sc.gain_loss) as gain_loss
          from public.stock_checks sc
          join public.tanks t on t.id = sc.tank_id
         where sc.check_date between v_from and v_to
         group by sc.tank_id, t.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_monthly_report(int, int) from public, anon;
grant  execute on function public.get_monthly_report(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The Excel export
--
-- Migration 019's body, with lubricants added in four places:
--   daily          - two more columns per day, for the workbook's Daily sheet
--   purchase_rows  - lubricant deliveries join the fuel ones, so the workbook's
--                    Purchases sheet is every purchase, which is what the
--                    Purchases screen now shows too
--   lubricant_rows - every counter sale in the month, itemised
--   lubricant_stock- what is left on the shelf at month end
-- ---------------------------------------------------------------------------
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
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      ) from public.lubricant_sales ls where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0)
      ) from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to
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
               'date', ls.sale_date, 'name', l.name,
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

revoke execute on function public.get_month_export(int, int) from public, anon;
grant  execute on function public.get_month_export(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The full reset
--
-- Sales and deliveries go, the product list stays with its stock zeroed - the
-- same rule the tanks are treated under. Which brands the pump stocks describes
-- the pump, not its trading, and re-typing the shelf after every test round is
-- exactly the busywork migration 014 set out to avoid.
--
-- Every statement carries an explicit WHERE TRUE, because Supabase preloads
-- safeupdate, which refuses WHERE-less UPDATE and DELETE - see migration 016.
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
    'readings',        (select count(*) from public.nozzle_readings),
    'customers',       (select count(*) from public.customers),
    'purchases',       (select count(*) from public.fuel_purchases),
    'expenses',        (select count(*) from public.expenses),
    'lubricant_sales', (select count(*) from public.lubricant_sales)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries where true;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales        where true;
  delete from public.nozzle_readings     where true;
  delete from public.stock_checks        where true;
  delete from public.fuel_purchases      where true;
  delete from public.lubricant_sales     where true;
  delete from public.lubricant_purchases where true;
  delete from public.expenses            where true;
  delete from public.customers           where true;
  delete from public.fuel_prices         where true;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  update public.lubricants
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  return v_counts;
end;
$$;

comment on function public.reset_all_data() is
  'Empties the books, keeping logins, tanks, nozzles and the lubricant product '
  'list. Testing scaffolding - the app only offers it while ALLOW_FULL_RESET is '
  'set. Every statement carries an explicit WHERE TRUE because Supabase '
  'preloads safeupdate, which refuses WHERE-less UPDATE and DELETE.';

revoke execute on function public.reset_all_data() from public, anon;
grant  execute on function public.reset_all_data() to authenticated;
