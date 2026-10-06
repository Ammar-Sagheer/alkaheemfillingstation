-- =============================================================================
-- 054_lifetime_fuel_totals.sql
--
-- The Dashboard's "By fuel type" section has always been for ONE day - the day
-- on screen. There was nowhere on the app that answered "how many litres of
-- petrol has this pump sold, ever" - a lifetime total, not a daily one.
--
-- Added as `lifetime_by_fuel_type` inside `get_daily_summary()` rather than a
-- separate RPC: the Dashboard already calls this function once per render for
-- everything else on the page, and the figure does not depend on which date is
-- on screen, so folding it in costs nothing extra - one round trip either way,
-- not two. Same join shape as `by_fuel_type` immediately above it, with the
-- `where nr.reading_date = p_date` filter simply dropped: every reading ever
-- saved, instead of one day's.
--
-- `create or replace` keeps the existing grants (006 already opened this
-- function to `authenticated`) - see migration 052's note on why replacing a
-- function does not drop its ACL. Body otherwise unchanged from 039.
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
    -- Every reading ever saved, not just the day on screen - see the header.
    'lifetime_by_fuel_type', coalesce((
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
