-- =============================================================================
-- 028_loose_oil.sql
--
-- Loose oil: a drum bought from a supplier and sold out of by the rupee.
--
-- WHAT THE OWNER ACTUALLY DOES. He buys a 200 litre drum of unbranded oil, the
-- same way he buys a tanker of diesel - one supplier, one invoice, no brand on
-- it. Then it is sold across the counter in rupees: "Rs 20 of oil", "Rs 50".
-- Nobody measures the pour. The money is the fact; the litres are arithmetic.
--
-- WHY THIS IS NOT A NEW TABLE. A drum is a lubricant: bought in litres from a
-- supplier, sold over the counter, taken on credit onto the same ledger,
-- counted in the same monthly report. A second table would have meant a second
-- copy of the stock triggers, the ledger posting, the delete-and-reverse RPC,
-- the report block and the export sheet - five places to keep in step for one
-- difference that is not about the stock at all. The difference is only WHICH
-- NUMBER GETS TYPED: litres for a sealed carton, rupees for a pour. So it is a
-- flag on the product, and every screen that already understands lubricants
-- keeps working with no change.
--
--   sold_loose = false   the shelf. Type the litres; the amount is prefilled
--                        from the rate. A 4 L carton for Rs 4,500.
--   sold_loose = true    the drum. Type the rupees; the litres come from the
--                        rate. Rs 20 at Rs 580 a litre is 0.034 L.
--
-- WHY THE LITRES GAINED A DECIMAL. Rs 20 out of a drum priced at Rs 580 a litre
-- is 0.0345 litres. Stored at two decimals that is 0.03 - a 13% error on every
-- pour, all of it in the same direction, on the kind of sale that happens
-- dozens of times a day. Three decimals is millilitres, which is finer than
-- anyone pours and fine enough that the drum's book stock still means something
-- after a month. Done now because lubricant_sales is empty; after a month of
-- trading this would be a data migration rather than a column change.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The flag
--
-- A loose product MUST have a sale rate, because the rate is the only thing
-- turning the rupees someone typed into litres off the drum. Without it a sale
-- could be recorded that took money but no stock, and the drum would read full
-- forever. A packed product may still have no rate - a shelf priced per carton
-- rather than per litre is perfectly normal, and that was already allowed.
-- ---------------------------------------------------------------------------
alter table public.lubricants
  add column sold_loose boolean not null default false;

comment on column public.lubricants.sold_loose is
  'True for a drum sold by the rupee rather than by the pack. Decides which '
  'number the sale form asks for, and requires a sale rate so the litres can '
  'be derived from the money.';

alter table public.lubricants
  add constraint lubricants_loose_needs_rate
    check (not sold_loose or sale_rate_per_litre is not null);

-- The owner had already added his drum as an ordinary product before there was
-- anywhere better to put it. Guarded on the rate so this stays safe to run
-- against a database where no such row exists, or where it has no rate yet.
update public.lubricants
   set sold_loose = true
 where lower(btrim(name)) in ('loose oil', 'loose')
   and sale_rate_per_litre is not null;

-- ---------------------------------------------------------------------------
-- Millilitre precision on a sale
--
-- rate_per_litre is generated FROM litres, and Postgres will not alter a column
-- a stored generated column depends on - so it comes off and goes back on
-- unchanged. Its definition is copied verbatim from migration 024 on purpose:
-- this migration is about precision, not about what the rate means.
-- ---------------------------------------------------------------------------
alter table public.lubricant_sales drop column rate_per_litre;

alter table public.lubricant_sales
  alter column litres type numeric(12, 3);

alter table public.lubricant_sales
  add column rate_per_litre numeric(12, 4)
    generated always as (round(amount / litres, 4)) stored;

comment on column public.lubricant_sales.rate_per_litre is
  'Derived: amount / litres. For display only; never entered.';

comment on column public.lubricant_sales.litres is
  'Three decimals - millilitres. A rupee-priced pour out of a drum is a '
  'fraction of a litre, and rounding it to 0.01 would lose a tenth of every '
  'sale.';

-- Stock is the sum of these, so it has to hold the same precision or the
-- decimal is thrown away again one step later.
--
-- recalc_lubricant_after_product_update names opening_stock_litres in its
-- `update of` list, and a column-list trigger pins that column's type - so the
-- trigger comes off first and goes back on unchanged afterwards. Recreated from
-- migration 024 verbatim, `when` clause included: without it, flipping
-- is_active would rewrite stock for no reason and the trigger would fire itself
-- in a loop writing its own cache.
drop trigger recalc_lubricant_after_product_update on public.lubricants;

alter table public.lubricants
  alter column opening_stock_litres type numeric(12, 3),
  alter column current_stock_litres type numeric(12, 3);

create trigger recalc_lubricant_after_product_update
  after update of opening_stock_litres, opening_stock_date on public.lubricants
  for each row
  when (old.opening_stock_litres is distinct from new.opening_stock_litres
     or old.opening_stock_date   is distinct from new.opening_stock_date)
  execute function public.trg_recalc_lubricant_from_product();

-- ---------------------------------------------------------------------------
-- The stock arithmetic, to three decimals
--
-- Unchanged except for the rounding and the widened locals. Restated in full
-- rather than patched, because a `create or replace` has to carry the whole
-- body anyway and a reader should not have to diff two migrations to know what
-- the function does today.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_lubricant_stock(
  p_lubricant_id uuid,
  p_date         date default public.pump_today()
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_opening      numeric(12, 3);
  v_opening_date date;
  v_purchased    numeric(12, 3);
  v_sold         numeric(12, 3);
begin
  select l.opening_stock_litres, l.opening_stock_date
    into v_opening, v_opening_date
    from public.lubricants l
   where l.id = p_lubricant_id;

  if v_opening is null then
    return null;  -- unknown product
  end if;

  select coalesce(sum(lp.quantity_litres), 0)
    into v_purchased
    from public.lubricant_purchases lp
   where lp.lubricant_id = p_lubricant_id
     and lp.purchase_date >= v_opening_date
     and lp.purchase_date <= p_date;

  select coalesce(sum(ls.litres), 0)
    into v_sold
    from public.lubricant_sales ls
   where ls.lubricant_id = p_lubricant_id
     and ls.sale_date >= v_opening_date
     and ls.sale_date <= p_date;

  return round(v_opening + v_purchased - v_sold, 3);
end;
$$;

-- ---------------------------------------------------------------------------
-- The shelf, now saying which rows are drums
--
-- Dropped rather than replaced: adding a column to a RETURNS TABLE changes the
-- function's return type, and `create or replace` refuses that.
-- ---------------------------------------------------------------------------
drop function if exists public.get_lubricant_stock(date);

create function public.get_lubricant_stock(p_date date default public.pump_today())
returns table (
  id                  uuid,
  name                text,
  pack_size_litres    numeric,
  sale_rate_per_litre numeric,
  sold_loose          boolean,
  is_active           boolean,
  opening_stock_litres numeric,
  purchased_litres    numeric,
  sold_litres         numeric,
  stock_litres        numeric
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
  select l.id,
         l.name,
         l.pack_size_litres,
         l.sale_rate_per_litre,
         l.sold_loose,
         l.is_active,
         l.opening_stock_litres,
         coalesce(bought.litres, 0)::numeric,
         coalesce(sold.litres, 0)::numeric,
         round(l.opening_stock_litres
               + coalesce(bought.litres, 0)
               - coalesce(sold.litres, 0), 3)::numeric
    from public.lubricants l
    left join lateral (
      select coalesce(sum(lp.quantity_litres), 0) as litres
        from public.lubricant_purchases lp
       where lp.lubricant_id = l.id
         and lp.purchase_date between l.opening_stock_date and p_date
    ) bought on true
    left join lateral (
      select coalesce(sum(ls.litres), 0) as litres
        from public.lubricant_sales ls
       where ls.lubricant_id = l.id
         and ls.sale_date between l.opening_stock_date and p_date
    ) sold on true
   where l.is_active
      or l.opening_stock_litres + coalesce(bought.litres, 0) - coalesce(sold.litres, 0) <> 0
      or coalesce(sold.litres, 0) <> 0
   order by l.sold_loose, l.is_active desc, l.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- One day at the counter, split into shelf and drum
--
-- The two halves are totalled separately because they are two different things
-- to check at the end of a day: the shelf is countable - four cartons went, four
-- gaps on the shelf - while the drum is only a running total of small cash
-- sales that nobody can verify by looking. Adding them into one figure would
-- hide the one the owner most wants to see on its own.
-- ---------------------------------------------------------------------------
create or replace function public.get_lubricant_day(p_date date default public.pump_today())
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
    'date', p_date,
    'totals', (
      select jsonb_build_object(
               'sales_count',   count(*),
               'litres',        coalesce(sum(ls.litres), 0),
               'amount',        coalesce(sum(ls.amount), 0),
               'cash_amount',   coalesce(sum(ls.cash_amount), 0),
               'credit_amount', coalesce(sum(ls.credit_amount), 0),

               'pack_count',    count(*) filter (where not l.sold_loose),
               'pack_litres',   coalesce(sum(ls.litres) filter (where not l.sold_loose), 0),
               'pack_amount',   coalesce(sum(ls.amount) filter (where not l.sold_loose), 0),

               'loose_count',   count(*) filter (where l.sold_loose),
               'loose_litres',  coalesce(sum(ls.litres) filter (where l.sold_loose), 0),
               'loose_amount',  coalesce(sum(ls.amount) filter (where l.sold_loose), 0),
               'loose_cash',    coalesce(sum(ls.cash_amount) filter (where l.sold_loose), 0),
               'loose_credit',  coalesce(sum(ls.credit_amount) filter (where l.sold_loose), 0)
             )
        from public.lubricant_sales ls
        join public.lubricants l on l.id = ls.lubricant_id
       where ls.sale_date = p_date
    ),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            ls.id,
               'lubricant_id',  ls.lubricant_id,
               'name',          l.name,
               'sold_loose',    l.sold_loose,
               'litres',        ls.litres,
               'amount',        ls.amount,
               'rate_per_litre', ls.rate_per_litre,
               'cash_amount',   ls.cash_amount,
               'credit_amount', ls.credit_amount,
               'customer_id',   ls.customer_id,
               'customer_name', c.name,
               'note',          ls.note
             ) order by ls.created_at)
        from public.lubricant_sales ls
        join public.lubricants l on l.id = ls.lubricant_id
        left join public.customers c on c.id = ls.customer_id
       where ls.sale_date = p_date
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The monthly report gains the flag, nothing else
--
-- lubricants_by_product already gives the drum its own line - it is a product,
-- and it was always going to appear there. All it needed was a way for the
-- report to LABEL that line as the drum rather than another tin, so a month
-- can be read as "the shelf did this, the drum did that".
--
-- Restated in full for the same reason as calculate_lubricant_stock above.
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
         where sc.check_date between v_from and v_to
         group by sc.tank_id, t.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- The signature of get_lubricant_stock changed (a new column in its return
-- table), so the grants are restated - `create or replace` on a function whose
-- return type changed is a drop and create underneath.
revoke execute on function public.get_lubricant_stock(date) from public, anon;
grant  execute on function public.get_lubricant_stock(date) to authenticated;
