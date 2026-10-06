-- =============================================================================
-- 055_month_to_date_fuel_totals.sql
--
-- 054 added `lifetime_by_fuel_type` - petrol and diesel litres summed across
-- every reading ever saved. That was the wrong window: what was actually
-- wanted is the RUNNING MONTH, not the pump's whole history. Corrected here
-- rather than by editing 054 - a migration that has run is never edited, the
-- same reasoning 037/038 already set down for this file (037 added a feature,
-- 038 removed it one migration later; 037 was not rewritten to pretend it
-- never happened).
--
-- `month_by_fuel_type` replaces `lifetime_by_fuel_type` as the key. Same join
-- shape as `by_fuel_type` two keys above it, scoped to the CALENDAR MONTH
-- `p_date` falls in, from the 1st through `p_date` itself - not through the
-- end of the month, and not through today. This page is date-driven and every
-- other window on it ends on the day being looked at rather than on today
-- (see the trend charts' own comment: "these charts end on the day the page
-- is showing, not on today") - a reader who has stepped back to the 10th
-- should see the month-to-the-10th, not the 10th plus days that have not
-- happened yet from that day's point of view.
-- =============================================================================

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
    -- Month-to-date as of the day on screen, not the pump's whole history and
    -- not through today regardless of which day is on screen - see the header.
    'month_by_fuel_type', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',   s.fuel_type,
               'litres_sold', s.litres_sold
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold) as litres_sold
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date >= date_trunc('month', p_date)::date
           and nr.reading_date <= p_date
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
      -- The dip that CLOSES the day on screen, not one taken during it: the
      -- pump dips each morning, so the day being looked at is judged by the
      -- dip taken the following morning. See migration 039.
      left join public.stock_checks sc on sc.tank_id = t.id and sc.books_date = p_date
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
