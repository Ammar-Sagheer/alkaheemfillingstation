-- =============================================================================
-- 005_reporting_rpcs.sql
--
-- All aggregation happens here in Postgres, not in the browser - reports stay
-- fast and the numbers cannot be fiddled with client-side.
--
-- Reporting functions are security definer with an explicit role check at the
-- top, so a data_entry login calling them directly gets a hard refusal.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Save a day's reading together with its credit slips, in ONE transaction.
--
-- security invoker on purpose: RLS still applies, so a logged-out or
-- deactivated user cannot use this as a side door. If any credit line fails,
-- the whole reading rolls back - there is never a half-saved day.
--
-- p_credit_lines looks like:
--   [{"customer_id": "...", "litres": 40, "amount": 11200}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_nozzle_reading(
  p_nozzle_id    uuid,
  p_reading_date date,
  p_opening      numeric,
  p_closing      numeric,
  p_rate         numeric,
  p_cash         numeric,
  p_credit_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reading_id   uuid;
  v_credit_total numeric(14, 2);
  v_line         jsonb;
begin
  -- The reading's credit_amount is derived from the slips, never typed, so the
  -- two can't disagree.
  select coalesce(sum((l ->> 'amount')::numeric), 0)
    into v_credit_total
    from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb)) l;

  insert into public.nozzle_readings (
    nozzle_id, reading_date, opening_reading, closing_reading,
    rate_per_litre, cash_amount, credit_amount, created_by
  )
  values (
    p_nozzle_id, p_reading_date, p_opening, p_closing,
    p_rate, p_cash, v_credit_total, auth.uid()
  )
  returning id into v_reading_id;

  for v_line in
    select value from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb))
  loop
    insert into public.credit_sales (reading_id, customer_id, litres, amount)
    values (
      v_reading_id,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'litres')::numeric,
      (v_line ->> 'amount')::numeric
    );
  end loop;

  return v_reading_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything the dashboard needs for one day, in a single round trip.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_summary(p_date date default current_date)
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
    raise exception 'Only a super admin may view the daily summary'
      using errcode = '42501';
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
      from public.nozzle_readings nr
      where nr.reading_date = p_date
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
      left join public.stock_checks sc
        on sc.tank_id = t.id and sc.check_date = p_date
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0)
      )
      from public.fuel_purchases fp
      where fp.purchase_date = p_date
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Day-by-day sales for the 30-day performance view. Missing days come back as
-- zeros rather than gaps, so the trend line stays honest.
-- ---------------------------------------------------------------------------
create or replace function public.get_sales_trend(p_from date, p_to date)
returns table (
  day           date,
  litres_sold   numeric,
  sale_amount   numeric,
  cash_amount   numeric,
  credit_amount numeric,
  petrol_litres numeric,
  diesel_litres numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  return query
  select d::date,
         coalesce(sum(nr.litres_sold), 0)::numeric,
         coalesce(sum(nr.sale_amount), 0)::numeric,
         coalesce(sum(nr.cash_amount), 0)::numeric,
         coalesce(sum(nr.credit_amount), 0)::numeric,
         coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0)::numeric,
         coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.nozzle_readings nr on nr.reading_date = d::date
    left join public.nozzles n on n.id = nr.nozzle_id
    left join public.tanks   t on t.id = n.tank_id
   group by d
   order by d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Monthly report: sales, cost of fuel bought, expenses, profit, and closing
-- stock per tank.
--
--   profit = sales - fuel purchased - expenses
--
-- Note this is cash-basis against fuel PURCHASED in the month, not fuel sold
-- from stock. In a month with a big delivery near month-end, profit will look
-- low and the closing inventory figure is where that money went.
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14, 2);
  v_cost     numeric(14, 2);
  v_expenses numeric(14, 2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the monthly report'
      using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr
   where nr.reading_date between v_from and v_to;

  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp
   where fp.purchase_date between v_from and v_to;

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
   where e.expense_date between v_from and v_to;

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
      from public.nozzle_readings nr
      where nr.reading_date between v_from and v_to
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
      from public.fuel_purchases fp
      where fp.purchase_date between v_from and v_to
    ),
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
    'profit', round(v_sales - v_cost - v_expenses, 2),
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

-- ---------------------------------------------------------------------------
-- A customer's full picture: who they are, what they owe, and how much petrol
-- and diesel they have taken in total.
--
-- Available to data_entry too - staff need to see a balance before recording a
-- payment. It exposes one customer only, never the whole book.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_statement(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'customer', (select to_jsonb(c) from public.customers c where c.id = p_customer_id),
    'balance',  public.customer_balance(p_customer_id),
    'total_debits', (
      select coalesce(sum(le.amount), 0) from public.ledger_entries le
       where le.customer_id = p_customer_id and le.entry_type = 'debit'
    ),
    'total_credits', (
      select coalesce(sum(le.amount), 0) from public.ledger_entries le
       where le.customer_id = p_customer_id and le.entry_type = 'credit'
    ),
    'fuel_taken', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type', s.fuel_type,
               'litres',    s.litres,
               'amount',    s.amount
             ) order by s.fuel_type)
      from (
        select le.fuel_type, sum(le.litres) as litres, sum(le.amount) as amount
          from public.ledger_entries le
         where le.customer_id = p_customer_id
           and le.entry_type = 'debit'
           and le.fuel_type is not null
         group by le.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outstanding balance for every customer, for the customer list screen.
-- One query instead of one per customer.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_balances()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  credit_limit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.vehicle_number,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where c.is_active
   group by c.id, c.name, c.vehicle_number, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_daily_summary(date) from anon;
revoke execute on function public.get_sales_trend(date, date) from anon;
revoke execute on function public.get_monthly_report(int, int) from anon;
revoke execute on function public.get_customer_statement(uuid) from anon;
revoke execute on function public.get_customer_balances() from anon;
revoke execute on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb) from anon;
