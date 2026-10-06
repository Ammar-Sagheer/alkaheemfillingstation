-- =============================================================================
-- 039_dip_belongs_to_the_day_it_closes.sql
--
-- The Stock page was reporting losses of one whole day's fuel, every day.
--
-- On 11 Aug 2026 the petrol tank showed a LOSS OF 1,652 L and the diesel tank
-- a loss of 212 L. Petrol had sold 1,683 L the day before and diesel 207 L.
-- That is not a coincidence and it was not a leak: the books were being asked
-- the wrong question.
--
-- The pump dips the tanks FIRST THING IN THE MORNING, before the pumps are
-- switched on, and enters that dip against the same day. So a dip dated the
-- 11th measures the tank as it stood at the CLOSE OF THE 10TH. The stock maths
-- assumed the opposite - that a dip dated the 11th was taken after the 11th
-- had finished trading - so it subtracted the 11th's sales (nothing yet, since
-- the 11th had barely begun) instead of the 10th's. Every morning dip was
-- therefore compared against a book figure that still had yesterday's fuel in
-- it, and the difference was reported as a loss.
--
-- Corrected, the same two dips read +31 L on petrol and -5 L on diesel. That
-- is a pump measuring itself accurately, which is what it was doing all along.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
-- A dip is a MOMENT, not a day. `check_date` keeps its meaning - the day the
-- rod went in the tank, which is what the person recording it knows - and a
-- new `taken` column says whether that was before the day started or after it
-- finished. From the two, `books_date` is generated: THE TRADING DAY THE DIP
-- CLOSES, and the day every gain/loss figure is now computed and reported
-- against.
--
--     taken = 'morning'   books_date = check_date - 1
--     taken = 'evening'   books_date = check_date
--
-- Existing rows default to 'morning' because that is, and always has been, the
-- pump's routine. Nothing is re-dated: the dips stay on the day they were
-- physically taken and simply start being counted against the day they close.
--
-- ---------------------------------------------------------------------------
-- And a second bug, found while proving the first
-- ---------------------------------------------------------------------------
-- `stock_checks.expected_stock` was written once, at the moment the dip was
-- saved, and never looked at again. `gain_loss` is generated from it. So
-- anything entered AFTERWARDS for an earlier date - a back-filled dip, a
-- reading typed the next morning, a delivery dated to when it actually
-- arrived - left the figure permanently wrong, with nothing on screen to say
-- so.
--
-- This had already happened. The dips for 3-8 Aug were back-filled on the 11th
-- in newest-first order, so every one of them took its baseline from the 2 Aug
-- dip instead of from the day before it, and all six landed on the same
-- phantom "gain of about 3,300 L". Nothing was wrong with the fuel; the rows
-- were computed against a baseline that was superseded a minute later.
--
-- `expected_stock` is now RECALCULATED FROM HISTORY by trigger, the same way
-- `tanks.current_stock_litres` already is, and for the same reason: a cached
-- figure that is only ever written once will drift away from the facts behind
-- it, and this is a money tool.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- When in the day the rod went in.
-- ---------------------------------------------------------------------------
create type public.dip_timing as enum ('morning', 'evening');

comment on type public.dip_timing is
  'Whether a dip was taken before the day traded or after it. Decides which trading day it closes.';

alter table public.stock_checks
  add column taken public.dip_timing not null default 'morning';

-- Generated rather than written by the app: it is arithmetic on two columns of
-- the same row, and a column the reports group by must not be able to disagree
-- with the two figures it comes from.
alter table public.stock_checks
  add column books_date date
    generated always as (
      case when taken = 'morning' then check_date - 1 else check_date end
    ) stored;

comment on column public.stock_checks.check_date is
  'The day the rod went in the tank.';
comment on column public.stock_checks.taken is
  'Before the day traded, or after it. The pump dips in the morning.';
comment on column public.stock_checks.books_date is
  'The trading day this dip closes. Gain/loss is computed and reported against this, not check_date.';
comment on column public.stock_checks.expected_stock is
  'What the books said at the close of books_date. Recalculated from history by trigger - never edit by hand.';

-- Two dips may not close the same trading day for one tank: an evening dip on
-- the 10th and a morning dip on the 11th are two measurements of one moment,
-- and the reports would count both. The existing unique (tank_id, check_date)
-- stays - it stops the same rod reading being entered twice.
create unique index stock_checks_tank_books_date_key
  on public.stock_checks (tank_id, books_date);

-- ---------------------------------------------------------------------------
-- The baseline is the last dip that closed an EARLIER trading day.
--
-- Body is otherwise unchanged from 008: only the two `check_date` references
-- become `books_date`, which is the whole of this fix on the read side.
-- ---------------------------------------------------------------------------
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
  -- The last dip closing a day strictly before the one being asked about. A
  -- dip closing p_date itself is the answer's measured counterpart, not its
  -- baseline - using it would make expected equal actual and the gain/loss
  -- always nought.
  select sc.actual_dip_reading, sc.books_date
    into v_baseline_qty, v_baseline_date
    from public.stock_checks sc
   where sc.tank_id = p_tank_id
     and sc.books_date < p_date
   order by sc.books_date desc
   limit 1;

  -- No dip recorded yet - start from the tank's opening stock. Subtracting a
  -- day makes purchases on the opening date itself count.
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

comment on function public.calculate_expected_stock(uuid, date) is
  'What the books say is in a tank at the close of p_date: last dip closing an earlier day, plus deliveries since, minus litres sold since.';

-- ---------------------------------------------------------------------------
-- Recalculate stored gain/loss from history.
--
-- Only dips closing p_from or later can be affected by a change on p_from: a
-- dip's figure is built from the baseline behind it and the deliveries and
-- sales between the two, so nothing earlier can move.
--
-- `gain_loss` is generated from `expected_stock`, so setting one fixes both.
-- The `is distinct from` guard means an unchanged figure is not rewritten,
-- which keeps this quiet in the activity log and cheap on a day's readings.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_stock_checks(p_tank_id uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tank_id is null then
    return;
  end if;

  update public.stock_checks sc
     set expected_stock = fresh.expected
    from (
      select s.id,
             coalesce(public.calculate_expected_stock(s.tank_id, s.books_date), 0) as expected
        from public.stock_checks s
       where s.tank_id = p_tank_id
         and s.books_date >= p_from
    ) fresh
   where fresh.id = sc.id
     and sc.expected_stock is distinct from fresh.expected;
end;
$$;

comment on function public.recalc_stock_checks(uuid, date) is
  'Rebuild expected_stock (and so gain_loss) for every dip on a tank closing p_from or later.';

-- ---------------------------------------------------------------------------
-- Everything that can move a dip's expected figure, wired to the recalc.
--
-- Deliveries and readings are the two things that happen BETWEEN dips; a dip
-- itself is the baseline for the next one; a tank's opening stock is the
-- baseline for the first one.
-- ---------------------------------------------------------------------------
create or replace function public.trg_recalc_checks_from_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_stock_checks(old.tank_id, old.purchase_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_stock_checks(new.tank_id, new.purchase_date);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recalc_checks_from_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tank uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select n.tank_id into v_tank from public.nozzles n where n.id = old.nozzle_id;
    perform public.recalc_stock_checks(v_tank, old.reading_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select n.tank_id into v_tank from public.nozzles n where n.id = new.nozzle_id;
    perform public.recalc_stock_checks(v_tank, new.reading_date);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recalc_checks_from_dip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_stock_checks(old.tank_id, old.books_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_stock_checks(new.tank_id, new.books_date);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recalc_checks_from_tank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Opening stock is the baseline before the first dip, so everything moves.
  perform public.recalc_stock_checks(new.id, '-infinity'::date);
  return null;
end;
$$;

create trigger recalc_checks_after_purchase
  after insert or update or delete on public.fuel_purchases
  for each row execute function public.trg_recalc_checks_from_purchase();

create trigger recalc_checks_after_reading
  after insert or update or delete on public.nozzle_readings
  for each row execute function public.trg_recalc_checks_from_reading();

/*
 * Deliberately NOT `after update` in general.
 *
 * The recalc writes `expected_stock`, and a trigger that fired on that write
 * would call itself. Naming the columns means the trigger fires only when the
 * dip's own facts move - the rod reading, the day, the tank, whether it was
 * morning or evening - and never for the derived figure the recalc sets.
 * Postgres decides this on the columns MENTIONED in the update, so the guard
 * holds even when a value happens to come back the same.
 */
create trigger recalc_checks_after_dip
  after insert or delete
     or update of tank_id, check_date, taken, actual_dip_reading
    on public.stock_checks
  for each row execute function public.trg_recalc_checks_from_dip();

create trigger recalc_checks_after_tank_opening
  after update of opening_stock_litres, opening_stock_date on public.tanks
  for each row execute function public.trg_recalc_checks_from_tank();

revoke execute on function public.recalc_stock_checks(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The dashboard's day. The tank block now joins the dip that CLOSES the day on
-- screen. Body otherwise unchanged from 025.
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

-- ---------------------------------------------------------------------------
-- The monthly report. A dip taken on 1 September closes 31 August and belongs
-- in August's gain/loss, so the month is cut on books_date. Body otherwise
-- unchanged from 028.
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
        'credit_amount', coalesce(sum(ls.credit_amount), 0),
        'loose_count',   count(*) filter (where l.sold_loose),
        'loose_litres',  coalesce(sum(ls.litres) filter (where l.sold_loose), 0),
        'loose_amount',  coalesce(sum(ls.amount) filter (where l.sold_loose), 0)
      )
      from public.lubricant_sales ls
      join public.lubricants l on l.id = ls.lubricant_id
     where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0),
        'loose_litres',    coalesce(sum(lp.quantity_litres) filter (where l.sold_loose), 0),
        'loose_cost',      coalesce(sum(lp.total_cost) filter (where l.sold_loose), 0)
      )
      from public.lubricant_purchases lp
      join public.lubricants l on l.id = lp.lubricant_id
     where lp.purchase_date between v_from and v_to
    ),
    -- One line per product: what it sold, what was restocked, and what is left
    -- on the shelf at month end. Products with no movement in the month are
    -- left out; the Stock page is where the whole shelf is listed.
    'lubricants_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lubricant_id',   s.id,
               'name',           s.name,
               'sold_loose',     s.sold_loose,
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
               l.sold_loose,
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
         where sc.books_date between v_from and v_to
         group by sc.tank_id, t.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The activity log (035, extended by 036). Two changes, both about the recalc
-- above: the derived figures join the ignored list, and a dip is logged under
-- the day it closes. Reproduced in full because create or replace function
-- replaces the whole thing.
-- ---------------------------------------------------------------------------
create or replace function public.trg_write_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new       jsonb;
  v_old       jsonb;
  v_row       jsonb;
  v_action    text;
  v_label     text;
  v_summary   text;
  v_date      date;
  v_amount    numeric;
  v_changes   jsonb;
  v_actor_id  uuid;
  v_actor     text;
  v_details   jsonb;
  -- Columns recomputed by other triggers, or noise. A change to these alone is
  -- not somebody doing something, so the write goes unlogged. (035 explained
  -- this list; 036 reproduced the function without the note. Restored here.)
  --
  -- `expected_stock` and `gain_loss` are the two 039 adds. Both are rebuilt
  -- from history whenever a reading, a delivery or an earlier dip moves, so
  -- logging them would credit whoever typed today's readings with "changing" a
  -- dip taken last week. `gain_loss` is generated from `expected_stock`, so the
  -- pair always move together and both have to be here.
  v_ignored text[] := array[
    'current_stock_litres', 'created_at', 'credit_sale_id', 'lubricant_sale_id',
    'expected_stock', 'gain_loss'
  ];
begin
  v_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row := coalesce(v_new, v_old);

  v_action := case tg_op when 'INSERT' then 'created'
                         when 'UPDATE' then 'changed'
                         else 'deleted' end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field', t.k, 'from', v_old -> t.k, 'to', v_new -> t.k
           ) order by t.k), '[]'::jsonb)
      into v_changes
      from jsonb_object_keys(v_new) as t(k)
     where not (t.k = any (v_ignored))
       and (v_old -> t.k) is distinct from (v_new -> t.k);

    if jsonb_array_length(v_changes) = 0 then
      return coalesce(new, old);
    end if;
  end if;

  if tg_table_name = 'ledger_entries'
     and (v_row ->> 'credit_sale_id' is not null or v_row ->> 'lubricant_sale_id' is not null)
  then
    return coalesce(new, old);
  end if;

  select a.actor_id, a.actor_name into v_actor_id, v_actor from public.activity_actor() a;

  case tg_table_name

    when 'nozzle_readings' then
      v_label := 'Reading';
      v_date := (v_row ->> 'reading_date')::date;
      v_amount := (v_row ->> 'sale_amount')::numeric;
      select 'Unit ' || n.unit_number || ' · Nozzle ' || n.nozzle_label
        into v_summary from public.nozzles n where n.id = (v_row ->> 'nozzle_id')::uuid;
      v_summary := coalesce(v_summary, 'A nozzle')
        || ' — ' || to_char((v_row ->> 'litres_sold')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'sale_amount')::numeric, 'FM999,999,999,990');

    when 'credit_sales' then
      v_label := 'Credit slip';
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'ledger_entries' then
      v_label := case v_row ->> 'entry_type' when 'credit' then 'Payment or credit'
                                             else 'Charge to a customer' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'lubricant_sales' then
      v_label := 'Oil sale';
      v_date := (v_row ->> 'sale_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select l.name into v_summary from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.000') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'lubricant_purchases' then
      v_label := 'Oil delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select l.name into v_summary from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990');

    when 'fuel_purchases' then
      v_label := 'Fuel delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990')
        || ' · ' || (v_row ->> 'payment_status');

    when 'stock_checks' then
      v_label := 'Tank dip';
      -- Filed under the day the dip CLOSES, so it sits beside that day's
      -- readings in the log rather than a day after them.
      v_date := (v_row ->> 'books_date')::date;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — dipped at ' || to_char((v_row ->> 'actual_dip_reading')::numeric, 'FM999,999,990.00') || ' L'
        || ', books said ' || to_char((v_row ->> 'expected_stock')::numeric, 'FM999,999,990.00') || ' L'
        || ' (measured ' || (v_row ->> 'taken') || ' of '
        || to_char((v_row ->> 'check_date')::date, 'FMDD Mon YYYY') || ')';

    when 'expenses' then
      v_label := 'Expense';
      v_date := (v_row ->> 'expense_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      v_summary := coalesce(nullif(v_row ->> 'category', ''), 'Uncategorised')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'bank_transactions' then
      v_label := case v_row ->> 'txn_type' when 'deposit' then 'Money into the bank'
                                           else 'Money out of the bank' end;
      v_date := (v_row ->> 'txn_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select b.bank_name || coalesce(' · ' || b.account_label, '') into v_summary
        from public.bank_accounts b where b.id = (v_row ->> 'account_id')::uuid;
      v_summary := coalesce(v_summary, 'An account')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'category', ''), '');

    when 'bank_accounts' then
      v_label := 'Bank account';
      v_summary := coalesce(v_row ->> 'bank_name', 'An account')
        || coalesce(' · ' || nullif(v_row ->> 'account_label', ''), '');

    when 'customers' then
      v_label := 'Customer';
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A customer')
        || coalesce(' · ' || nullif(v_row ->> 'vehicle_number', ''), '');

    when 'lubricants' then
      v_label := 'Lubricant';
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A lubricant');

    when 'fuel_prices' then
      v_label := 'Fuel rate';
      v_summary := initcap(v_row ->> 'fuel_type')
        || ' — Rs ' || to_char((v_row ->> 'rate')::numeric, 'FM999,990.00') || ' / L'
        || ' from ' || to_char((v_row ->> 'effective_from')::date, 'DD Mon YYYY');

    when 'tanks' then
      v_label := 'Tank';
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A tank')
        || ' · ' || coalesce(v_row ->> 'fuel_type', '');

    when 'nozzles' then
      v_label := 'Nozzle';
      v_summary := 'Unit ' || coalesce(v_row ->> 'unit_number', '?')
        || ' · Nozzle ' || coalesce(v_row ->> 'nozzle_label', '?');

    when 'profiles' then
      v_label := 'Login';
      v_summary := coalesce(nullif(v_row ->> 'full_name', ''), 'Someone')
        || ' · ' || coalesce(v_row ->> 'role', '')
        || case when (v_row ->> 'is_active')::boolean then '' else ' · deactivated' end;

    -- New: a company asset bought, corrected or removed. category comes
    -- through jsonb as its plain text value, so initcap reads it the same as
    -- any other lowercase word.
    when 'company_assets' then
      v_label := 'Company asset';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'purchase_value')::numeric;
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'An asset')
        || ' — ' || initcap(coalesce(v_row ->> 'category', 'other'))
        || ', Rs ' || to_char((v_row ->> 'purchase_value')::numeric, 'FM999,999,999,990');

    else
      v_label := tg_table_name;
      v_summary := tg_table_name;
  end case;

  v_details := jsonb_build_object('row', v_row)
             || case when v_changes is null then '{}'::jsonb
                     else jsonb_build_object('changes', v_changes) end;

  insert into public.activity_log
    (actor_id, actor_name, action, entity, entity_label, entity_id,
     summary, entry_date, amount, details)
  values
    (v_actor_id, v_actor, v_action, tg_table_name, v_label,
     (v_row ->> 'id')::uuid, v_summary, v_date, v_amount, v_details);

  return coalesce(new, old);

exception when others then
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rebuild every stored figure from history, now that the maths is right.
--
-- This is what moves the existing dips onto the day they belong to. Nothing is
-- re-dated - `check_date` still says when the rod went in - but every gain and
-- loss on the books is recomputed against the day that dip actually closes.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tank record;
begin
  for v_tank in select id from public.tanks loop
    perform public.recalc_stock_checks(v_tank.id, '-infinity'::date);
    perform public.recalc_tank_stock(v_tank.id);
  end loop;
end;
$$;
