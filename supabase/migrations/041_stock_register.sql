-- =============================================================================
-- 041_stock_register.sql
--
-- The Daily Sale & Stock Register, and profit over an arbitrary run of days.
--
-- The owner keeps a spreadsheet called "Fuel - Daily Sale & Stock Register":
-- one row per trading day per tank, carrying opening stock, receipts, meter
-- sales, the book stock those three imply, the dip that actually measured the
-- tank, and the difference between the last two - then the same difference
-- accumulated down the month beside the sales accumulated down the month. The
-- two cumulative columns are the point of the sheet. A single day's variance is
-- noise: a rod reading is a person squinting at a wet stick, and ±30 L on a
-- 5,000 L tank is the measurement, not the fuel. What a leak or a theft looks
-- like is a cumulative variance that walks in one direction, and a cumulative
-- percentage that will not come back to zero.
--
-- Everything here is already in the database and has been since 002. What was
-- missing was the SHAPE - the app could tell you one day's gain/loss on the
-- Stock page and one month's total in the report, and neither of those answers
-- the question the spreadsheet exists to answer.
--
-- ---------------------------------------------------------------------------
-- Why the columns are derived here rather than read off stock_checks
-- ---------------------------------------------------------------------------
-- `stock_checks.gain_loss` is a generated column off `expected_stock`, which
-- migration 039 made a trigger recalculate from history. So the figure is
-- already correct and already maintained. It is recomputed here anyway, from
-- the four columns the row puts on screen:
--
--     book stock     = opening + receipts - meter sales
--     daily variance = closing dip - book stock
--
-- because a register is read across, and a variance column that did not equal
-- the arithmetic of the columns beside it would be unreadable however right it
-- was. The two agree - checked row for row against every dip the pump has
-- recorded, 1-11 Aug 2026, petrol and diesel, all 22 exact. If they ever stop
-- agreeing, `stock_checks.gain_loss` is the one to trust: it is the column the
-- rest of the app reports from.
--
-- ---------------------------------------------------------------------------
-- Opening stock is YESTERDAY'S DIP, and falls back to the books
-- ---------------------------------------------------------------------------
-- A measured number beats a calculated one, which is the same rule
-- `calculate_expected_stock` follows when it picks its baseline. So opening
-- stock is the dip that closed the previous trading day. On a day after one
-- that was never dipped there is nothing measured to use, and it falls back to
-- `calculate_expected_stock(tank, day - 1)` - the book value carried forward,
-- chained from whatever dip did come before it. The register therefore has no
-- gaps in its opening column, and a day with no dip of its own simply has no
-- variance rather than a wrong one.
--
-- Note `books_date`, never `check_date`. The pump dips in the morning, so the
-- rod that went in on the 11th measures the close of the 10th. Getting this
-- wrong reports a whole day's sales as a loss, every day - see 039.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One row per tank per day, cumulative columns included.
--
-- Cumulative means CUMULATIVE WITHIN THE RANGE ASKED FOR, not since the tank
-- was installed. That is what the spreadsheet does - the column restarts at the
-- top of each month - and it is what makes the figure answerable: "we are 213 L
-- up over these eleven days" is a sentence about a period somebody chose.
--
-- Missing days come back as rows of zeros rather than as gaps, for the same
-- reason get_sales_trend does it: a register with days missing out of the
-- middle reads as a register somebody forgot to fill in.
-- ---------------------------------------------------------------------------
create or replace function public.get_stock_register(p_from date, p_to date)
returns table (
  day                     date,
  tank_id                 uuid,
  tank_name               text,
  fuel_type               public.fuel_type,
  opening_stock           numeric,
  receipts                numeric,
  total_stock             numeric,
  meter_sales             numeric,
  sale_amount             numeric,
  book_stock              numeric,
  closing_dip             numeric,
  daily_variance          numeric,
  cumulative_sales        numeric,
  cumulative_variance     numeric,
  daily_variance_pct      numeric,
  cumulative_variance_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the stock register'
      using errcode = '42501';
  end if;

  return query
  with days as (
    select d::date as day
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  grid as (
    select t.id, t.name, t.fuel_type, d.day
      from public.tanks t
     cross join days d
  ),
  per_day as (
    select g.id,
           g.name,
           g.fuel_type,
           g.day,
           coalesce(prev.actual_dip_reading,
                    public.calculate_expected_stock(g.id, g.day - 1),
                    0)                       as opening_stock,
           coalesce(rec.litres, 0)           as receipts,
           coalesce(sold.litres, 0)          as meter_sales,
           coalesce(sold.amount, 0)          as sale_amount,
           dip.actual_dip_reading            as closing_dip
      from grid g
      left join lateral (
        select sum(fp.quantity_litres) as litres
          from public.fuel_purchases fp
         where fp.tank_id = g.id
           and fp.purchase_date = g.day
      ) rec on true
      left join lateral (
        select sum(nr.litres_sold) as litres,
               sum(nr.sale_amount) as amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
         where n.tank_id = g.id
           and nr.reading_date = g.day
      ) sold on true
      -- The dip that closes this trading day, and the one that closed the day
      -- before. books_date, not check_date - see the header.
      left join public.stock_checks dip
        on dip.tank_id = g.id and dip.books_date = g.day
      left join public.stock_checks prev
        on prev.tank_id = g.id and prev.books_date = g.day - 1
  ),
  computed as (
    select p.*,
           p.opening_stock + p.receipts                  as total_stock_c,
           p.opening_stock + p.receipts - p.meter_sales  as book_stock_c
      from per_day p
  ),
  varied as (
    select c.*,
           -- Null, not zero, on a day with no dip. A day nobody measured has an
           -- UNKNOWN variance, and zero would read as "measured, and exact" -
           -- the one thing a dip almost never is.
           case when c.closing_dip is null then null
                else c.closing_dip - c.book_stock_c
           end as daily_variance_c
      from computed c
  )
  select v.day,
         v.id,
         v.name,
         v.fuel_type,
         round(v.opening_stock, 2),
         round(v.receipts, 2),
         round(v.total_stock_c, 2),
         round(v.meter_sales, 2),
         round(v.sale_amount, 2),
         round(v.book_stock_c, 2),
         round(v.closing_dip, 2),
         round(v.daily_variance_c, 2),
         round(sum(v.meter_sales) over w, 2),
         -- An undipped day contributes nothing to the running variance rather
         -- than breaking the column. Its sales still count, which is the honest
         -- reading: the fuel left the tank whether or not anyone measured it.
         round(sum(coalesce(v.daily_variance_c, 0)) over w, 2),
         case when v.meter_sales = 0 or v.daily_variance_c is null then null
              else round(v.daily_variance_c / v.meter_sales * 100, 2)
         end,
         case when sum(v.meter_sales) over w = 0 then null
              else round(sum(coalesce(v.daily_variance_c, 0)) over w
                         / sum(v.meter_sales) over w * 100, 2)
         end
    from varied v
  window w as (partition by v.id order by v.day rows between unbounded preceding and current row)
   order by v.fuel_type, v.day;
end;
$$;

comment on function public.get_stock_register(date, date) is
  'The Daily Sale & Stock Register: one row per tank per day, with sales and variance accumulated within the range asked for.';

-- ---------------------------------------------------------------------------
-- Profit over an arbitrary run of days.
--
-- get_monthly_report answers this for a whole calendar month and cannot answer
-- it for any other span, because it takes a year and a month rather than two
-- dates. The register is read over a chosen run of days - a week, the first
-- ten days, everything up to today - and a profit figure beside it that
-- silently covered a different period would be worse than no figure at all.
--
-- SAME ARITHMETIC, deliberately:
--
--     profit = fuel sales + lubricant sales
--            - fuel bought - lubricants bought
--            - expenses
--
-- Cash basis against stock BOUGHT in the period, not stock sold from the tank.
-- A delivery near the end of a short range makes profit look bad, and over a
-- range of a few days that distortion is much larger than it is over a month -
-- which is why the page says so on screen rather than leaving it in a comment.
-- If the definition ever changes, it changes in both places together or the
-- Reports page and this one start disagreeing about the same days.
-- ---------------------------------------------------------------------------
create or replace function public.get_range_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales     numeric(14, 2);
  v_cost      numeric(14, 2);
  v_expenses  numeric(14, 2);
  v_lub_sales numeric(14, 2);
  v_lub_cost  numeric(14, 2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr
   where nr.reading_date between p_from and p_to;

  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp
   where fp.purchase_date between p_from and p_to;

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
   where e.expense_date between p_from and p_to;

  select coalesce(sum(ls.amount), 0) into v_lub_sales
    from public.lubricant_sales ls
   where ls.sale_date between p_from and p_to;

  select coalesce(sum(lp.total_cost), 0) into v_lub_cost
    from public.lubricant_purchases lp
   where lp.purchase_date between p_from and p_to;

  select jsonb_build_object(
    'from', p_from,
    'to',   p_to,
    'days', (p_to - p_from) + 1,
    'fuel_sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr
      where nr.reading_date between p_from and p_to
    ),
    -- Per fuel, which is the half of the question the register itself answers
    -- in litres: this is the same days in rupees.
    'by_fuel', coalesce((
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
         where nr.reading_date between p_from and p_to
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'fuel_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      )
      from public.fuel_purchases fp
      where fp.purchase_date between p_from and p_to
    ),
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      )
      from public.lubricant_sales ls
      where ls.sale_date between p_from and p_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0)
      )
      from public.lubricant_purchases lp
      where lp.purchase_date between p_from and p_to
    ),
    'expenses_total', v_expenses,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', s.category, 'amount', s.amount)
                       order by s.amount desc)
      from (
        select e.category, sum(e.amount) as amount
          from public.expenses e
         where e.expense_date between p_from and p_to
         group by e.category
      ) s
    ), '[]'::jsonb),
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit',           round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_range_summary(date, date) is
  'Sales, stock bought, expenses and profit over an arbitrary run of days. Same arithmetic as get_monthly_report, which only takes whole months.';

-- Same grant shape as every other reporting RPC: never anon, and the role
-- check at the top of the body is what actually refuses a staff login.
revoke execute on function public.get_stock_register(date, date) from public, anon;
grant  execute on function public.get_stock_register(date, date) to authenticated;

revoke execute on function public.get_range_summary(date, date) from public, anon;
grant  execute on function public.get_range_summary(date, date) to authenticated;
