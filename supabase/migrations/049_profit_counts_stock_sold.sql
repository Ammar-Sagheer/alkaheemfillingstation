-- =============================================================================
-- 049_profit_counts_stock_sold.sql
--
-- Profit was counting stock BOUGHT instead of stock SOLD.
--
-- THE BUG, IN THE OWNER'S OWN AUGUST. He bought 49,000 L and sold 43,418 L,
-- including two 5,000 L petrol loads on the 21st. Every rupee of that fuel was
-- charged against August, and the 5,582 L still in the tanks - about
-- Rs 1,866,000 of it - will not be sold until September. The page showed
-- profit as MINUS Rs 1,464,581 for a month the pump actually made money in.
--
-- The old formula, in all three reporting RPCs:
--
--     profit = sales - purchases - expenses
--
-- There is no opening or closing stock in it anywhere. It is only correct in a
-- month where litres bought happen to equal litres sold at the same rate, which
-- is no month. A month ending with fuel in the tank is understated by the value
-- of that fuel; a month that runs the tanks down is OVERSTATED, because it sells
-- stock a previous month already paid for. The errors cancel over years and
-- never within a month, which is the only period anybody reads.
--
--     profit = sales - cost of goods SOLD - expenses
--     cost of goods sold = opening stock + purchases - closing stock
--
-- =============================================================================
-- HOW STOCK IS VALUED, AND WHY THIS WAY
--
-- A litre in a tank has no price tag on it, so one has to be chosen. This
-- values the stock on hand at the WEIGHTED AVERAGE COST OF THE DELIVERIES IT IS
-- ACTUALLY MADE OF: walk that tank's purchases newest-first until enough litres
-- are accounted for, and average their rates weighted by how many litres of
-- each are still there.
--
-- The obvious alternative - one flat average over every purchase ever - was
-- rejected because it quietly reintroduces a smaller version of the same bug.
-- With rates rising through August (321 -> 336 per litre), an average that
-- still carries last year's cheap deliveries values today's full tank below
-- what it cost, and understates profit for exactly as long as prices keep
-- rising. Weighting by what is physically left has no such drift, and for a
-- tank it is also the truth: the fuel in there IS the last few loads.
--
-- STOCK THE RECORDS DO NOT REACH. The tanks were given an opening quantity in
-- Settings when the pump joined the app - 854 L of petrol and 5,556 L of diesel
-- - with no delivery behind it and therefore no cost. Litres not covered by
-- recorded purchases are valued at that tank's all-time average purchase rate,
-- which is an estimate and is flagged as one. It affects only the first month
-- that has purchases; every month after opens on stock the app watched arrive.
--
-- LUBRICANTS GET THE SAME TREATMENT, for the same reason. It matters less
-- today - the shelf turns over slowly and August restocked nothing - but a
-- half-fixed profit figure is worse than an unfixed one, because it looks
-- trustworthy.
--
-- WHAT THIS DOES NOT CHANGE. "Stock bought" stays on the page as its own
-- figure; it is a real thing the owner wants to see, it is what he owes
-- suppliers against, and it is what the Treasury and Banking pages move. It is
-- simply no longer subtracted from sales to make profit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- What the fuel in one tank is worth on a given day.
-- ---------------------------------------------------------------------------
create or replace function public.tank_stock_value(p_tank_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_litres   numeric := coalesce(public.calculate_expected_stock(p_tank_id, p_on), 0);
  v_value    numeric := 0;
  v_covered  numeric := 0;
  v_avg_rate numeric;
begin
  -- A tank cannot be worth a negative amount. If the books say it holds less
  -- than nothing, that is a stock problem for the Stock page to show, not
  -- something to feed into profit as a credit.
  if v_litres <= 0 then
    return 0;
  end if;

  /*
   * Deliveries newest first, taking from each only the litres still on hand.
   * `cum` is the running total of litres walking backwards; a delivery is
   * partly on hand when the total BEFORE it is still short of what the tank
   * holds, and `least` clips the last one to whatever is left over.
   */
  select coalesce(sum(t.litres * t.rate), 0), coalesce(sum(t.litres), 0)
    into v_value, v_covered
    from (
      select least(r.quantity_litres, v_litres - (r.cum - r.quantity_litres)) as litres,
             r.rate
        from (
          select fp.quantity_litres,
                 fp.total_cost / fp.quantity_litres as rate,
                 sum(fp.quantity_litres) over (
                   order by fp.purchase_date desc, fp.created_at desc, fp.id desc
                   rows between unbounded preceding and current row
                 ) as cum
            from public.fuel_purchases fp
           where fp.tank_id = p_tank_id
             and fp.purchase_date <= p_on
             and fp.quantity_litres > 0
        ) r
       where r.cum - r.quantity_litres < v_litres
    ) t;

  -- Litres older than any delivery on record - the opening quantity typed into
  -- Settings. Valued at this tank's all-time average, which is the best guess
  -- available and is an estimate. See the header.
  if v_covered < v_litres then
    select sum(fp.total_cost) / nullif(sum(fp.quantity_litres), 0)
      into v_avg_rate
      from public.fuel_purchases fp
     where fp.tank_id = p_tank_id and fp.quantity_litres > 0;

    v_value := v_value + (v_litres - v_covered) * coalesce(v_avg_rate, 0);
  end if;

  return round(v_value, 2);
end;
$$;

comment on function public.tank_stock_value(uuid, date) is
  'What the fuel in one tank is worth on a date, valued at the weighted '
  'average cost of the deliveries it is actually made of. See migration 049.';

-- ---------------------------------------------------------------------------
-- The same, for one lubricant on the shelf.
-- ---------------------------------------------------------------------------
create or replace function public.lubricant_stock_value(p_lubricant_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_litres   numeric := coalesce(public.calculate_lubricant_stock(p_lubricant_id, p_on), 0);
  v_value    numeric := 0;
  v_covered  numeric := 0;
  v_avg_rate numeric;
begin
  if v_litres <= 0 then
    return 0;
  end if;

  select coalesce(sum(t.litres * t.rate), 0), coalesce(sum(t.litres), 0)
    into v_value, v_covered
    from (
      select least(r.quantity_litres, v_litres - (r.cum - r.quantity_litres)) as litres,
             r.rate
        from (
          select lp.quantity_litres,
                 lp.total_cost / lp.quantity_litres as rate,
                 sum(lp.quantity_litres) over (
                   order by lp.purchase_date desc, lp.created_at desc, lp.id desc
                   rows between unbounded preceding and current row
                 ) as cum
            from public.lubricant_purchases lp
           where lp.lubricant_id = p_lubricant_id
             and lp.purchase_date <= p_on
             and lp.quantity_litres > 0
        ) r
       where r.cum - r.quantity_litres < v_litres
    ) t;

  if v_covered < v_litres then
    select sum(lp.total_cost) / nullif(sum(lp.quantity_litres), 0)
      into v_avg_rate
      from public.lubricant_purchases lp
     where lp.lubricant_id = p_lubricant_id and lp.quantity_litres > 0;

    v_value := v_value + (v_litres - v_covered) * coalesce(v_avg_rate, 0);
  end if;

  return round(v_value, 2);
end;
$$;

comment on function public.lubricant_stock_value(uuid, date) is
  'What one lubricant on the shelf is worth on a date, on the same basis as '
  'tank_stock_value. See migration 049.';

-- ---------------------------------------------------------------------------
-- Everything the pump is holding, fuel and oil, on one date.
-- ---------------------------------------------------------------------------
create or replace function public.stock_value_at(p_on date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
           coalesce((select sum(public.tank_stock_value(t.id, p_on)) from public.tanks t), 0)
         + coalesce((select sum(public.lubricant_stock_value(l.id, p_on))
                       from public.lubricants l), 0),
         2);
$$;

comment on function public.stock_value_at(date) is
  'The value of all stock on hand - every tank and every lubricant - on a date.';

-- ---------------------------------------------------------------------------
-- What the stock sold in a period actually cost.
--
--     opening stock + everything bought - closing stock
--
-- The one place this arithmetic lives, so the monthly report, the Excel export
-- and the register's arbitrary date range cannot arrive at different profits
-- for the same days - which is the reason the aggregation is in Postgres at
-- all.
--
-- `p_from - 1` is the close of the day before, which is the opening of the
-- first day. Getting that off by one shifts a whole day's trading into the
-- wrong month.
-- ---------------------------------------------------------------------------
create or replace function public.cost_of_goods_sold(p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
           public.stock_value_at(p_from - 1)
         + coalesce((select sum(fp.total_cost) from public.fuel_purchases fp
                      where fp.purchase_date between p_from and p_to), 0)
         + coalesce((select sum(lp.total_cost) from public.lubricant_purchases lp
                      where lp.purchase_date between p_from and p_to), 0)
         - public.stock_value_at(p_to),
         2);
$$;

comment on function public.cost_of_goods_sold(date, date) is
  'Opening stock + purchases - closing stock, for a date range. The cost of '
  'what was actually SOLD, which is what profit subtracts. See migration 049.';

-- These are only ever called from inside the reporting RPCs, which are
-- security definer and check is_super_admin() themselves. A definer function
-- runs with the owner's rights, so it can call these with no grant of its
-- own - and without one, nothing else can ask the database what the pump's
-- stock is worth.
revoke all on function public.tank_stock_value(uuid, date) from public;
revoke all on function public.lubricant_stock_value(uuid, date) from public;
revoke all on function public.stock_value_at(date) from public;
revoke all on function public.cost_of_goods_sold(date, date) from public;

-- ---------------------------------------------------------------------------
-- Point the three reporting RPCs at it.
--
-- PATCHED RATHER THAN REPRODUCED IN FULL, which is a departure from how this
-- repo has replaced functions before (see 036, 039, 044) and is deliberate.
-- Those reproduced one function to add one branch. This changes one expression
-- in THREE functions totalling about 25,000 characters, none of which is
-- otherwise touched - and three hand-copied near-duplicates is three chances
-- to silently drop a line from a report nobody re-reads.
--
-- So each function is read back with pg_get_functiondef, has exactly the two
-- known expressions swapped, and is re-declared. It IS the whole body being
-- replaced, which is what `create or replace` requires; it just is not
-- transcribed by hand.
--
-- IT FAILS LOUDLY IF THE TEXT IS NOT THERE. If a future migration rewrites one
-- of these functions and this file is ever replayed against it, the expression
-- will not match and this raises rather than silently leaving a wrong profit
-- in place. A migration that cannot do its job must not report success.
-- ---------------------------------------------------------------------------
do $$
declare
  v_target   text;
  v_from_var text;
  v_to_var   text;
  v_src      text;
  v_old_prof text;
  v_new_prof text;
  v_old_cost text;
  v_new_cost text;
  v_targets  text[] := array[
    'public.get_monthly_report(integer,integer)', 'v_from', 'v_to',
    'public.get_month_export(integer,integer)',   'v_from', 'v_to',
    'public.get_range_summary(date,date)',        'p_from', 'p_to'
  ];
  i integer;
begin
  for i in 1 .. array_length(v_targets, 1) by 3 loop
    v_target   := v_targets[i];
    v_from_var := v_targets[i + 1];
    v_to_var   := v_targets[i + 2];

    v_src := pg_get_functiondef(v_target::regprocedure);

    -- 1. Profit stops subtracting what was bought and starts subtracting what
    --    was sold.
    v_old_prof := 'round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2)';
    v_new_prof := 'round(v_sales + v_lub_sales'
               || ' - public.cost_of_goods_sold(' || v_from_var || ', ' || v_to_var || ')'
               || ' - v_expenses, 2)';

    if position(v_old_prof in v_src) = 0 then
      raise exception
        'Cannot fix profit in %: the expression this migration expects is not in it. '
        'It has been changed since 048 - re-apply the fix by hand rather than '
        'leaving profit counting stock bought.', v_target;
    end if;
    v_src := replace(v_src, v_old_prof, v_new_prof);

    -- 2. The working is published beside the answer, so the owner can see
    --    where profit came from instead of taking it on trust.
    v_old_cost := '''total_stock_cost'', round(v_cost + v_lub_cost, 2),';
    v_new_cost := v_old_cost
               || ' ''opening_stock_value'', public.stock_value_at('
                  || v_from_var || ' - 1),'
               || ' ''closing_stock_value'', public.stock_value_at(' || v_to_var || '),'
               || ' ''cost_of_goods_sold'', public.cost_of_goods_sold('
                  || v_from_var || ', ' || v_to_var || '),';

    if position(v_old_cost in v_src) = 0 then
      raise exception 'Cannot add the stock-value figures to %.', v_target;
    end if;
    v_src := replace(v_src, v_old_cost, v_new_cost);

    execute v_src;
  end loop;
end;
$$;
