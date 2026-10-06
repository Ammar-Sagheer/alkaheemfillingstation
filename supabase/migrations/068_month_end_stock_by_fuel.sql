-- 068: The stock at a month's close, per fuel, with the rate it is valued at.
--
-- WHY. Profit (049) is sales less the cost of stock SOLD, and the cost of
-- stock sold is opening stock + purchases - closing stock. The opening and
-- closing figures were only ever printed as one combined sum, inside a
-- sentence on the Reports page. Nowhere did the app say "749 L of diesel at
-- Rs 392.89 a litre = Rs 294,276". The owner's accountant works the month out
-- by hand, the two profits disagreed for September 2026, and there was no
-- way to put the app's closing stock beside the accountant's to see where.
--
-- WHAT. get_month_end_stock(year, month): for each fuel, the litres in its
-- tanks at the close of the month's last day and at the close of the day
-- before it began (= this month's opening), each with:
--
--   value       tank_stock_value(), exactly what cost_of_goods_sold()
--               subtracts, so the figures here add up to the profit's own
--   cost_rate   value / litres: the cost a litre of that stock is carried at
--               (the deliveries it is made of, newest first - see 049)
--   sell_rate   the pump price in force that day (fuel_prices)
--   sell_value  litres x sell_rate: what the same stock is worth at the pump
--               price, which is how an accountant often values a closing stock
--
-- and, for each side, totals worked out here rather than on the page: the
-- fuels' value, their pump-price value and the gap between the two, the
-- lubricants' value, and stock_value_at() - the same opening and closing the
-- monthly report prints, so the fuels plus the lubricants visibly add up to
-- the figure the profit used.
--
-- Read only: no table is touched, no column added, nothing for the backup to
-- learn about.

create or replace function public.get_month_end_stock(p_year integer, p_month integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from    date;
  v_to      date;
  v_fuels   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the value of the stock'
      using errcode = '42501';
  end if;

  if p_month < 1 or p_month > 12 then
    raise exception 'There is no month %', p_month;
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'fuel_type', s.fuel_type,
           'opening', public.stock_at_close_for_fuel(s.fuel_type, v_from - 1),
           'closing', public.stock_at_close_for_fuel(s.fuel_type, v_to)
         ) order by s.fuel_type), '[]'::jsonb)
    into v_fuels
    from (select distinct t.fuel_type from public.tanks t) s;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'opening_on', v_from - 1,
    'fuels', v_fuels,
    -- Every figure a reader might want as a total is totalled here, in
    -- numeric, so the page never adds money up itself.
    'opening', public.stock_totals(v_fuels, 'opening', v_from - 1),
    'closing', public.stock_totals(v_fuels, 'closing', v_to)
  );
end;
$$;

-- The totals row for one side (opening or closing): the fuels' values and
-- pump-price values summed, the lubricants' value, and the whole stock's
-- value from stock_value_at() itself - the very figure the profit uses, so a
-- reader can tick it against the Reports page.
create or replace function public.stock_totals(p_fuels jsonb, p_side text, p_on date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select (e->p_side->>'value')::numeric      as value,
           (e->p_side->>'sell_value')::numeric as sell_value,
           (e->p_side->>'sell_gap')::numeric   as sell_gap
      from jsonb_array_elements(p_fuels) e
  )
  select jsonb_build_object(
           'on', p_on,
           'fuel_value', (select round(coalesce(sum(value), 0), 2) from f),
           'fuel_sell_value', (select round(sum(sell_value), 2) from f),
           'fuel_sell_gap', (select round(sum(sell_gap), 2) from f),
           'lubricants_value',
             coalesce((select round(sum(public.lubricant_stock_value(l.id, p_on)), 2)
                         from public.lubricants l), 0),
           'value', public.stock_value_at(p_on)
         );
$$;

-- One fuel, every tank that holds it, at the close of one day.
create or replace function public.stock_at_close_for_fuel(p_fuel public.fuel_type, p_on date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with tank_rows as (
    select coalesce(public.tank_stock_on_hand(t.id, p_on), 0) as litres,
           public.tank_stock_value(t.id, p_on)                as value
      from public.tanks t
     where t.fuel_type = p_fuel
  ),
  totals as (
    select greatest(coalesce(sum(litres), 0), 0) as litres,
           round(coalesce(sum(value), 0), 2)      as value
      from tank_rows
  ),
  price as (
    select fp.rate, fp.effective_from
      from public.fuel_prices fp
     where fp.fuel_type = p_fuel
       and fp.effective_from <= p_on
     order by fp.effective_from desc
     limit 1
  )
  select jsonb_build_object(
           'on', p_on,
           'litres', t.litres,
           'value', t.value,
           'cost_rate', case when t.litres > 0 then round(t.value / t.litres, 2) end,
           'sell_rate', (select rate from price),
           'sell_value', (select round(t.litres * rate, 2) from price),
           -- How much more the same litres are worth at the pump price than at
           -- cost: the amount by which a profit worked out with stock at the
           -- pump price comes out higher.
           'sell_gap', (select round(t.litres * rate, 2) - t.value from price)
         )
    from totals t;
$$;

revoke all on function public.stock_at_close_for_fuel(public.fuel_type, date) from public, anon, authenticated;
revoke all on function public.stock_totals(jsonb, text, date) from public, anon, authenticated;
revoke all on function public.get_month_end_stock(integer, integer) from public, anon;
grant execute on function public.get_month_end_stock(integer, integer) to authenticated;

comment on function public.get_month_end_stock(integer, integer) is
  'Per fuel: litres, cost rate, value and pump-price value at the close of the '
  'month and at the close of the day before it (its opening). The values are '
  'the ones cost_of_goods_sold() uses. Super admin only. See migration 068.';
