-- =============================================================================
-- 008_pump_timezone.sql
--
-- The database thought "today" was a different day from the app.
--
-- Postgres `current_date` is evaluated in the DATABASE's timezone, which on
-- Supabase is UTC. The app defines today by where the pump is (Asia/Karachi,
-- UTC+5). So between midnight and 5am local the two disagreed by a day, and:
--
--   * a rate set today looked like it started "tomorrow", so current_fuel_rate
--     found nothing and the Settings page showed "Not set" for a rate that had
--     saved perfectly well
--   * the reading sheet, daily summary and stock maths all pulled the previous
--     day's figures
--
-- Everything that meant "today" now goes through pump_today(), which matches
-- PUMP_TIMEZONE in app/_lib/date-helpers.js. Change both together if the pump
-- ever moves.
-- =============================================================================

create or replace function public.pump_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Karachi')::date;
$$;

comment on function public.pump_today() is
  'Today at the pump. Use instead of current_date, which is UTC on Supabase.';

revoke execute on function public.pump_today() from public, anon;
grant  execute on function public.pump_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Re-declare everything that defaulted to current_date.
-- Bodies are unchanged apart from the default.
-- ---------------------------------------------------------------------------

create or replace function public.current_fuel_rate(
  p_fuel_type public.fuel_type,
  p_date      date default public.pump_today()
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select fp.rate
    from public.fuel_prices fp
   where fp.fuel_type = p_fuel_type
     and fp.effective_from <= p_date
   order by fp.effective_from desc
   limit 1;
$$;

create or replace function public.calculate_expected_stock(
  p_tank_id uuid,
  p_date    date default public.pump_today()
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_baseline_qty  numeric(12, 2);
  v_baseline_date date;
  v_purchased     numeric(12, 2);
  v_sold          numeric(12, 2);
begin
  select sc.actual_dip_reading, sc.check_date
    into v_baseline_qty, v_baseline_date
    from public.stock_checks sc
   where sc.tank_id = p_tank_id
     and sc.check_date < p_date
   order by sc.check_date desc
   limit 1;

  if v_baseline_qty is null then
    select t.opening_stock_litres, t.opening_stock_date - 1
      into v_baseline_qty, v_baseline_date
      from public.tanks t
     where t.id = p_tank_id;
  end if;

  if v_baseline_qty is null then
    return null;
  end if;

  select coalesce(sum(fp.quantity_litres), 0)
    into v_purchased
    from public.fuel_purchases fp
   where fp.tank_id = p_tank_id
     and fp.purchase_date > v_baseline_date
     and fp.purchase_date <= p_date;

  select coalesce(sum(nr.litres_sold), 0)
    into v_sold
    from public.nozzle_readings nr
    join public.nozzles n on n.id = nr.nozzle_id
   where n.tank_id = p_tank_id
     and nr.reading_date > v_baseline_date
     and nr.reading_date <= p_date;

  return round(v_baseline_qty + v_purchased - v_sold, 2);
end;
$$;

-- Runs from triggers, with no app involvement, so it has to know the right day
-- on its own.
create or replace function public.recalc_tank_stock(p_tank_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tanks t
     set current_stock_litres =
           coalesce(public.calculate_expected_stock(t.id, public.pump_today()), 0)
   where t.id = p_tank_id;
end;
$$;

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
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id       uuid,
  unit_number     smallint,
  nozzle_label    text,
  tank_id         uuid,
  fuel_type       public.fuel_type,
  rate            numeric,
  opening_reading numeric,
  reading_id      uuid,
  closing_reading numeric,
  cash_amount     numeric,
  credit_amount   numeric,
  litres_sold     numeric,
  sale_amount     numeric
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
  select n.id,
         n.unit_number,
         n.nozzle_label,
         t.id,
         t.fuel_type,
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         coalesce(existing.opening_reading, prev.closing_reading, 0)::numeric,
         existing.id,
         existing.closing_reading,
         existing.cash_amount,
         existing.credit_amount,
         existing.litres_sold,
         existing.sale_amount
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.*
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date = p_date
       limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date < p_date
       order by nr.reading_date desc
       limit 1
    ) prev on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

-- New tanks should also start from the pump's day, not UTC's.
alter table public.tanks
  alter column opening_stock_date set default public.pump_today();
