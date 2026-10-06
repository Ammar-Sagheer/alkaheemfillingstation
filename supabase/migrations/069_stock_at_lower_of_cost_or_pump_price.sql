-- 069: Stock is valued at the lower of what it cost and the pump price.
--
-- WHY. Profit takes the closing stock's value (049). Until now that value was
-- always what the fuel COST. The accounting rule - IAS 2, and section 35 of
-- Pakistan's Income Tax Ordinance 2001 for stock-in-trade - is the LOWER of
-- cost and net realisable value: stock that can only be sold for less than it
-- cost is carried at what it will fetch, and the loss falls in the month the
-- price fell, not the month the fuel happens to be sold.
--
-- It matters here because cuts are large and overnight: diesel went from
-- Rs 399.30 to Rs 366.60 on 20 Aug 2026. A cut like that on a month's last day,
-- with 5,000 L bought at Rs 386 in the tank, would have overstated that month's
-- profit by about Rs 99,000 and charged it to the next.
--
-- NO PAST PROFIT CHANGES. Checked against the live books before writing this:
-- at every month end so far (31 Aug, 30 Sep) the pump price was above cost for
-- both fuels, and 31 Jul has no pump price recorded, so it stays at cost.
--
-- HOW.
--   tank_stock_cost_value()  the old tank_stock_value(), byte for byte: litres
--                            on hand at the cost of the deliveries they are
--                            made of, newest first (049, 059). Copied from the
--                            database's own definition, renamed, so no line
--                            can be lost in a hand copy.
--   fuel_rate_on()           the pump price in force on a day, or null.
--   tank_stock_value()       now the lower of the two. Everything that values
--                            stock calls this - stock_value_at(), and through
--                            it cost_of_goods_sold(), the monthly report, the
--                            Excel export and the register - so all of them
--                            take the rule at once, and a month's closing and
--                            the next month's opening stay the same figure.
--
-- The pump price stands in for net realisable value, without deducting a cost
-- of selling: a pump's cost to sell a litre is small and not recorded here,
-- and the rule is applied per tank. Lubricants are unchanged (at cost).
--
-- 068's display functions are replaced so the month-end table can show both
-- values and which one the profit used.

-- ---------------------------------------------------------------------------
-- The cost valuation, kept under its own name.
-- ---------------------------------------------------------------------------
do $$
declare
  v_src text := pg_get_functiondef('public.tank_stock_value(uuid,date)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_src, 'public.tank_stock_value(', 'public.tank_stock_cost_value(');
  if v_new = v_src then
    raise exception 'Cannot copy tank_stock_value: its definition is not in the shape 069 expects.';
  end if;
  execute v_new;
end;
$$;

comment on function public.tank_stock_cost_value(uuid, date) is
  'What the stock in a tank COST at the close of a day: the deliveries it is '
  'made of, newest first, older litres at the tank''s average purchase rate. '
  'tank_stock_value() takes the lower of this and the pump price. See 049, 059, 069.';

revoke all on function public.tank_stock_cost_value(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The pump price in force on a day.
-- ---------------------------------------------------------------------------
create or replace function public.fuel_rate_on(p_fuel public.fuel_type, p_on date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select fp.rate
    from public.fuel_prices fp
   where fp.fuel_type = p_fuel
     and fp.effective_from <= p_on
   order by fp.effective_from desc
   limit 1;
$$;

revoke all on function public.fuel_rate_on(public.fuel_type, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The value profit uses: the lower of cost and the pump price.
-- ---------------------------------------------------------------------------
create or replace function public.tank_stock_value(p_tank_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cost   numeric := public.tank_stock_cost_value(p_tank_id, p_on);
  v_litres numeric := coalesce(public.tank_stock_on_hand(p_tank_id, p_on), 0);
  v_rate   numeric;
begin
  if v_litres <= 0 then
    return v_cost;
  end if;

  select public.fuel_rate_on(t.fuel_type, p_on)
    into v_rate
    from public.tanks t
   where t.id = p_tank_id;

  -- No pump price on record for the day (before the app's first price): cost.
  if v_rate is null then
    return v_cost;
  end if;

  return least(v_cost, round(v_litres * v_rate, 2));
end;
$$;

comment on function public.tank_stock_value(uuid, date) is
  'The value of a tank''s stock at the close of a day, as profit uses it: the '
  'LOWER of what it cost (tank_stock_cost_value) and litres x the pump price '
  'that day. See migration 069.';

revoke all on function public.tank_stock_value(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The month-end table (068), now showing both values and the one used.
-- ---------------------------------------------------------------------------
create or replace function public.stock_at_close_for_fuel(p_fuel public.fuel_type, p_on date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with tank_rows as (
    select coalesce(public.tank_stock_on_hand(t.id, p_on), 0) as litres,
           public.tank_stock_cost_value(t.id, p_on)           as cost_value,
           public.tank_stock_value(t.id, p_on)                as value
      from public.tanks t
     where t.fuel_type = p_fuel
  ),
  totals as (
    select greatest(coalesce(sum(litres), 0), 0) as litres,
           round(coalesce(sum(cost_value), 0), 2) as cost_value,
           round(coalesce(sum(value), 0), 2)      as value
      from tank_rows
  ),
  price as (
    select public.fuel_rate_on(p_fuel, p_on) as rate
  )
  select jsonb_build_object(
           'on', p_on,
           'litres', t.litres,
           -- What it cost, and the rate a litre of it cost.
           'cost_value', t.cost_value,
           'cost_rate', case when t.litres > 0 then round(t.cost_value / t.litres, 2) end,
           -- The pump price that day, and the same litres at it.
           'sell_rate', p.rate,
           'sell_value', case when p.rate is not null then round(t.litres * p.rate, 2) end,
           -- Pump-price value less cost value: positive in the usual case.
           'sell_gap', case when p.rate is not null then round(t.litres * p.rate, 2) - t.cost_value end,
           -- The one profit uses: the lower of the two (tank_stock_value).
           'value', t.value,
           'written_down', t.value < t.cost_value
         )
    from totals t, price p;
$$;

create or replace function public.stock_totals(p_fuels jsonb, p_side text, p_on date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select (e->p_side->>'value')::numeric      as value,
           (e->p_side->>'cost_value')::numeric as cost_value,
           (e->p_side->>'sell_value')::numeric as sell_value,
           (e->p_side->>'sell_gap')::numeric   as sell_gap
      from jsonb_array_elements(p_fuels) e
  )
  select jsonb_build_object(
           'on', p_on,
           'fuel_value', (select round(coalesce(sum(value), 0), 2) from f),
           'fuel_cost_value', (select round(coalesce(sum(cost_value), 0), 2) from f),
           'fuel_sell_value', (select round(sum(sell_value), 2) from f),
           'fuel_sell_gap', (select round(sum(sell_gap), 2) from f),
           'lubricants_value',
             coalesce((select round(sum(public.lubricant_stock_value(l.id, p_on)), 2)
                         from public.lubricants l), 0),
           'value', public.stock_value_at(p_on)
         );
$$;

revoke all on function public.stock_at_close_for_fuel(public.fuel_type, date) from public, anon, authenticated;
revoke all on function public.stock_totals(jsonb, text, date) from public, anon, authenticated;
