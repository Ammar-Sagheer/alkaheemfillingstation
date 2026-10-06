-- =============================================================================
-- 059_stock_is_valued_at_what_the_tank_holds.sql
--
-- PROFIT WAS CHARGING EACH MONTH-END'S STOCK LOSS TO THE FOLLOWING MONTH.
--
-- Found on 01 Sep 2026. September had nothing in it at all - no readings, no
-- deliveries, no dips, no expenses - and the Reports page showed a loss of
-- Rs 9,585 for the month:
--
--   Rs 614,973 in the tanks at the start, plus Rs 0 bought,
--   less Rs 605,389 still there at the end  ->  Rs 9,585 of stock "sold"
--
-- Nothing had moved, so those two figures are the same litres valued twice.
-- They are not. They are the TWO SIDES OF THE 31 AUGUST DIP:
--
--   Diesel   books said   981.85 L    the dip measured   971.00 L   -10.85 L
--   Petrol   books said   759.67 L    the dip measured   743.00 L   -16.67 L
--
-- 27.52 litres really did go missing and the 31 August dip really did find it.
-- Rs 9,585 is the right amount of money. It is in the wrong month.
--
-- ---------------------------------------------------------------------------
-- WHY IT LANDED THERE. Two different questions were being answered by one
-- function.
--
-- `calculate_expected_stock(tank, d)` answers "what do the BOOKS say should be
-- in this tank at the close of d". It takes the last dip closing a day
-- STRICTLY BEFORE d and rolls purchases and sales forward - and the strictness
-- is deliberate and correct where it lives (039): a dip closing d is the thing
-- that figure is about to be COMPARED WITH, so letting it be its own baseline
-- would make expected equal actual and every gain/loss nought.
--
-- `stock_value_at(d)` was reusing it, through `tank_stock_value()`, to answer a
-- different question: "what is the stock in this tank WORTH at the close of d".
-- That question wants the best knowledge available of what is physically in the
-- tank, and when somebody has dipped it that morning, the dip IS the best
-- knowledge available. Inheriting the exclusion made the valuation deliberately
-- ignore the most accurate measurement it had.
--
-- The consequence is a one-day slip at every month boundary:
--
--   August closes on the BOOK figure     (the 31 Aug dip is excluded, being 31 Aug)
--   September opens on that same figure  (continuous, so nothing looks wrong)
--   September closes on the MEASURED one (by 30 Sep the 31 Aug dip is in the past)
--
-- and the shortfall falls through the crack between the two months. This pump
-- dips every day, so EVERY month-end has it. In a trading month it is buried
-- inside a six-figure cost of goods and roughly cancels against the month
-- before. In a month with no trading it is the entire report.
--
-- It was also already contradicting the Stock page, which has shown 971 L and
-- 743 L since 31 August - `recalc_tank_stock` asks about today, and no dip
-- closes today, so nothing was excluded and it got the measured answer. The
-- books disagreed with themselves depending on which screen asked.
--
-- ---------------------------------------------------------------------------
-- THE FIX. A second function for the second question, rather than a flag on
-- the first. `calculate_expected_stock` is untouched and still means exactly
-- what it meant - the Stock Checks page, the gain/loss figures, the daily
-- summary, the stock register and `recalc_tank_stock` all keep asking it the
-- book question and all keep getting the same answers as before.
--
-- WHAT MOVES, AND IT IS WORTH BEING PRECISE BECAUSE IT IS A REPORTED PROFIT:
--
--   * August 2026 profit drops by Rs 9,585 - the loss is charged to the month
--     the fuel actually went missing. (The 31 July dip came out exactly level,
--     0.00 on both tanks, so August's opening figure does not move at all and
--     this is the whole of the change.)
--   * September 2026 profit becomes Rs 0, which is what an empty month says.
--   * Every earlier month shifts by the difference between its own month-end
--     dip and the previous one's, which is the correction, not a side effect.
--
-- No stored row changes. Every one of these figures is derived on read.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- What the tank actually holds at the close of a day.
--
-- Character for character `calculate_expected_stock`, with one difference:
-- `books_date <= p_date` rather than `< p_date`. When a dip closes the day
-- being asked about, that dip IS the answer - there are no purchases or sales
-- after it and on or before p_date, so the roll-forward adds nothing. When
-- there is no such dip it falls back to the nearest earlier one and rolls
-- forward, which is the book figure and the best available.
-- ---------------------------------------------------------------------------
create or replace function public.tank_stock_on_hand(
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
  select sc.actual_dip_reading, sc.books_date
    into v_baseline_qty, v_baseline_date
    from public.stock_checks sc
   where sc.tank_id = p_tank_id
     and sc.books_date <= p_date
   order by sc.books_date desc
   limit 1;

  if v_baseline_qty is null then
    select t.opening_stock_litres, t.opening_stock_date - 1
      into v_baseline_qty, v_baseline_date
      from public.tanks t
     where t.id = p_tank_id;
  end if;

  if v_baseline_qty is null then
    return null;  -- unknown tank
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

comment on function public.tank_stock_on_hand(uuid, date) is
  'What the tank actually holds at the close of a day - a dip closing that day '
  'is the answer, not excluded from it. For valuing stock. Compare '
  'calculate_expected_stock(), which is what the BOOKS say and is the figure a '
  'dip is measured against.';

revoke all on function public.tank_stock_on_hand(uuid, date) from public, anon;

-- ---------------------------------------------------------------------------
-- Valuing that stock. Reproduced from 049 with one line changed - the source
-- of v_litres. The costing below it (walk the deliveries newest first until
-- the litres are covered, fall back to the lifetime average for anything
-- older than the records) is untouched.
-- ---------------------------------------------------------------------------
create or replace function public.tank_stock_value(p_tank_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- 059: was calculate_expected_stock(), which deliberately ignores a dip
  -- closing p_on - correct for a gain/loss, wrong for a valuation.
  v_litres   numeric := coalesce(public.tank_stock_on_hand(p_tank_id, p_on), 0);
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

revoke all on function public.tank_stock_value(uuid, date) from public, anon;

-- ---------------------------------------------------------------------------
-- The closing litres printed under the profit must be the litres the profit
-- was worked out from.
--
-- The Reports page prints the working in a sentence - "Rs 614,973 in the tanks
-- at the start, plus Rs 0 bought, less Rs 605,389 still there at the end" -
-- and then a table of closing litres per tank underneath it. Those two come
-- from different places: the sentence from `stock_value_at`, now fixed above,
-- and the table from `calculate_expected_stock`. Fixing only the sentence would
-- have left the page showing 981.85 L in a tank it had just valued at 971 L.
--
-- PATCHED RATHER THAN REPRODUCED, for the reason 049 set out when it did the
-- same to the same two functions: they are thousands of characters of report
-- nobody re-reads, and hand-copying them to change one expression is a chance
-- to silently drop a line. It fails loudly if the expression has moved.
-- ---------------------------------------------------------------------------
do $$
declare
  v_target  text;
  v_src     text;
  v_old     text := '''closing_litres'', public.calculate_expected_stock(t.id, v_to)';
  v_new     text := '''closing_litres'', public.tank_stock_on_hand(t.id, v_to)';
  v_targets text[] := array[
    'public.get_monthly_report(integer,integer)',
    'public.get_month_export(integer,integer)'
  ];
begin
  foreach v_target in array v_targets loop
    v_src := pg_get_functiondef(v_target::regprocedure);

    if position(v_old in v_src) = 0 then
      raise exception
        'Cannot fix the closing stock in %: the expression this migration expects is not '
        'in it. It has been changed since 049 - re-apply the fix by hand rather than '
        'leaving the closing litres disagreeing with the value printed beside them.',
        v_target;
    end if;

    execute replace(v_src, v_old, v_new);
  end loop;
end;
$$;
