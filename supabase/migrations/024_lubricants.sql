-- =============================================================================
-- 024_lubricants.sql
--
-- Engine oil and the rest of the lubricant shelf: the products, what is bought
-- in, and what is sold over the counter.
--
-- WHY THIS IS NOT JUST ANOTHER FUEL. Petrol and diesel live in two fixed tanks
-- and are sold through metered nozzles, so a day's sale is worked out from
-- meter readings. Lubricants are a changing list of products sold one tin at a
-- time, so a sale is typed as a sale. Modelling them as another fuel_type would
-- have meant inventing a nozzle for each brand, and re-typing the enum every
-- time the owner switched supplier.
--
-- EVERYTHING IS LITRES. A 4 litre carton and 250 ml of loose oil poured from an
-- open drum are the same stock measured the same way - the pack size is only a
-- convenience for typing a sale quickly. Keeping one unit is what lets the
-- stock figure stay honest when a pump sells both, which most of them do.
--
-- MONEY IS TYPED, THE RATE IS DERIVED. Same rule as fuel deliveries in
-- migration 023: what the customer paid, and what the invoice says, are the
-- facts. Rate per litre is arithmetic on those and is generated, never entered
-- - which is what makes a 4 L carton at Rs 4,500 and 250 ml at Rs 400 both
-- recordable without anyone dividing anything by hand.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- lubricants - the product list.
--
-- current_stock_litres is a cached book stock kept in step by the triggers
-- below. Like tanks.current_stock_litres it is always RECOMPUTED from the
-- purchase and sale history, never incremented, so it cannot drift.
--
-- Retiring rather than deleting is the normal end of a product's life once it
-- has been traded - see delete_lubricant() at the bottom for why, and for the
-- one case where a real delete is the right answer.
-- ---------------------------------------------------------------------------
create table public.lubricants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(btrim(name)) > 0),
  -- The size the product normally comes in: 4 for a 4 litre carton, 1 for a
  -- litre bottle. Only used to prefill a sale; loose oil ignores it entirely.
  pack_size_litres     numeric(8, 2) not null default 1 check (pack_size_litres > 0),
  -- Used to prefill the amount when a sale is typed. Nullable, because a shelf
  -- that is priced per pack rather than per litre is perfectly normal.
  sale_rate_per_litre  numeric(12, 2) check (sale_rate_per_litre > 0),
  -- Stock on hand at the START of opening_stock_date - what was on the shelf
  -- when this product was first entered into the app.
  opening_stock_litres numeric(12, 2) not null default 0 check (opening_stock_litres >= 0),
  opening_stock_date   date not null default public.pump_today(),
  current_stock_litres numeric(12, 2) not null default 0,
  is_active            boolean not null default true,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now()
);

comment on table public.lubricants is
  'A lubricant product on the shelf. Stock is always in litres, whether it is '
  'sold as a sealed carton or poured loose.';

comment on column public.lubricants.current_stock_litres is
  'Cached book stock, maintained by triggers. Recomputed, never incremented.';

-- Two products may not share a name while both are being sold. The index is
-- partial on purpose: a retired name is released, so an owner who drops a brand
-- and later takes it back on can add it again without inventing a spelling.
create unique index lubricants_active_name_unique
  on public.lubricants (lower(btrim(name)))
  where is_active;

-- ---------------------------------------------------------------------------
-- lubricant_purchases - stock coming in from the distributor.
--
-- Deliberately the same shape as fuel_purchases, down to the payment status, so
-- that the Purchases screen can show both in one list and "what do I still owe"
-- means the same thing on both halves of it.
-- ---------------------------------------------------------------------------
create table public.lubricant_purchases (
  id              uuid primary key default gen_random_uuid(),
  lubricant_id    uuid not null references public.lubricants (id) on delete restrict,
  purchase_date   date not null,
  quantity_litres numeric(12, 2) not null check (quantity_litres > 0),
  total_cost      numeric(14, 2) not null check (total_cost > 0),
  rate            numeric(12, 4) generated always as (round(total_cost / quantity_litres, 4)) stored,
  supplier_name   text not null check (length(btrim(supplier_name)) > 0),
  invoice_number  text,
  payment_status  public.payment_status not null default 'pending',
  note            text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on column public.lubricant_purchases.rate is
  'Derived: total_cost / quantity_litres. For display only; never entered.';

-- ---------------------------------------------------------------------------
-- lubricant_sales - one row per sale over the counter.
--
-- litres carries two decimals, which is what makes 0.25 (a 250 ml pour from an
-- open drum) and 4 (a sealed carton) the same kind of row.
--
-- The split check is the same rule the nozzle readings live under: cash plus
-- credit must account for every rupee of the sale, so a sale cannot be saved
-- half-balanced. A sale with any credit on it must name the customer, or there
-- would be a debt with nobody attached to it.
-- ---------------------------------------------------------------------------
create table public.lubricant_sales (
  id            uuid primary key default gen_random_uuid(),
  lubricant_id  uuid not null references public.lubricants (id) on delete restrict,
  sale_date     date not null,
  litres        numeric(12, 2) not null check (litres > 0),
  amount        numeric(14, 2) not null check (amount > 0),
  rate_per_litre numeric(12, 4) generated always as (round(amount / litres, 4)) stored,
  cash_amount   numeric(14, 2) not null default 0 check (cash_amount >= 0),
  credit_amount numeric(14, 2) not null default 0 check (credit_amount >= 0),
  customer_id   uuid references public.customers (id) on delete restrict,
  note          text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint lubricant_sales_split_matches_amount
    check (round(cash_amount + credit_amount, 2) = round(amount, 2)),

  constraint lubricant_sales_credit_needs_customer
    check (credit_amount = 0 or customer_id is not null)
);

comment on table public.lubricant_sales is
  'One counter sale. Cash and credit must add up to the amount, and any credit '
  'names the customer it is owed by.';

create index lubricant_purchases_date_idx      on public.lubricant_purchases (purchase_date desc);
create index lubricant_purchases_product_idx   on public.lubricant_purchases (lubricant_id, purchase_date desc);
create index lubricant_sales_date_idx          on public.lubricant_sales (sale_date desc);
create index lubricant_sales_product_idx       on public.lubricant_sales (lubricant_id, sale_date desc);
create index lubricant_sales_customer_idx      on public.lubricant_sales (customer_id);

-- ---------------------------------------------------------------------------
-- The ledger link
--
-- A lubricant taken on credit is the same debt as fuel taken on credit, so it
-- belongs on the same customer ledger rather than in a second place that would
-- have to be added up separately. The column mirrors credit_sale_id: unique, so
-- one sale cannot be posted twice, and ON DELETE SET NULL so a deleted sale
-- releases its reference instead of taking the debt with it.
-- ---------------------------------------------------------------------------
alter table public.ledger_entries
  add column lubricant_sale_id uuid unique
    references public.lubricant_sales (id) on delete set null;

comment on column public.ledger_entries.lubricant_sale_id is
  'Set when this entry was posted automatically from a lubricant sale. Unique, '
  'so the same sale can never be posted to the ledger twice.';

-- The append-only guard has to learn about the new column. Same narrow
-- exception as created_by and credit_sale_id in migration 014: a foreign key
-- releasing its reference is not an edit to the entry, and every other column
-- must still be byte-for-byte identical.
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'created_by' - 'credit_sale_id' - 'lubricant_sale_id'
       = to_jsonb(old) - 'created_by' - 'credit_sale_id' - 'lubricant_sale_id'
     and (new.created_by        is not distinct from old.created_by        or new.created_by        is null)
     and (new.credit_sale_id    is not distinct from old.credit_sale_id    or new.credit_sale_id    is null)
     and (new.lubricant_sale_id is not distinct from old.lubricant_sale_id or new.lubricant_sale_id is null)
  then
    return new;
  end if;

  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_ledger_append_only() is
  'Blocks UPDATE and DELETE on ledger_entries. The only exceptions are '
  'created_by, credit_sale_id and lubricant_sale_id being nulled when the row '
  'they point at is deleted; no other column may change.';

-- A lubricant sold on credit posts itself to the customer's account, exactly
-- the way a fuel credit slip does. fuel_type is left null - it is not a fuel -
-- which the ledger's own check constraint allows on a debit, and which keeps
-- the customer statement's petrol/diesel breakdown honest.
create or replace function public.trg_post_lubricant_sale_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.credit_amount <= 0 then
    return new;
  end if;

  select l.name into v_name from public.lubricants l where l.id = new.lubricant_id;

  insert into public.ledger_entries (
    customer_id, entry_type, amount, litres, fuel_type,
    entry_date, note, lubricant_sale_id, created_by
  )
  values (
    new.customer_id, 'debit', new.credit_amount, new.litres, null,
    new.sale_date, coalesce(v_name, 'Lubricant') || ' taken on credit',
    new.id, new.created_by
  );

  return new;
end;
$$;

create trigger post_lubricant_sale_to_ledger
  after insert on public.lubricant_sales
  for each row execute function public.trg_post_lubricant_sale_to_ledger();

-- ---------------------------------------------------------------------------
-- Stock
--
--   stock = opening stock + everything bought since - everything sold since
--
-- There is no dip stick for a shelf of tins, so unlike a tank there is no
-- measured baseline to fall back on: the opening stock the owner types when he
-- adds the product is the only baseline there is, and everything is counted
-- from that date forward.
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
  v_opening      numeric(12, 2);
  v_opening_date date;
  v_purchased    numeric(12, 2);
  v_sold         numeric(12, 2);
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

  return round(v_opening + v_purchased - v_sold, 2);
end;
$$;

create or replace function public.recalc_lubricant_stock(p_lubricant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lubricants l
     set current_stock_litres =
           coalesce(public.calculate_lubricant_stock(l.id, public.pump_today()), 0)
   where l.id = p_lubricant_id;
end;
$$;

create or replace function public.trg_recalc_lubricant_from_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_lubricant_stock(old.lubricant_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_lubricant_stock(new.lubricant_id);
  end if;
  return null;
end;
$$;

-- Editing the product itself moves its stock too: the opening figure and the
-- date it counts from are both inputs to the sum above.
create or replace function public.trg_recalc_lubricant_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_lubricant_stock(new.id);
  return null;
end;
$$;

create trigger recalc_lubricant_after_purchase
  after insert or update or delete on public.lubricant_purchases
  for each row execute function public.trg_recalc_lubricant_from_row();

create trigger recalc_lubricant_after_sale
  after insert or update or delete on public.lubricant_sales
  for each row execute function public.trg_recalc_lubricant_from_row();

create trigger recalc_lubricant_after_product_change
  after insert on public.lubricants
  for each row execute function public.trg_recalc_lubricant_from_product();

-- Guarded with `when`, so the recalculation only runs when a column it actually
-- depends on moved - otherwise flipping is_active would rewrite stock for no
-- reason, and the trigger would fire itself in a loop writing the cache.
create trigger recalc_lubricant_after_product_update
  after update of opening_stock_litres, opening_stock_date on public.lubricants
  for each row
  when (old.opening_stock_litres is distinct from new.opening_stock_litres
     or old.opening_stock_date   is distinct from new.opening_stock_date)
  execute function public.trg_recalc_lubricant_from_product();

-- ---------------------------------------------------------------------------
-- Reads used by the screens
-- ---------------------------------------------------------------------------

/*
 * The shelf as at a date: what was bought, what went out, what is left.
 *
 * Retired products are included when they still have stock or history, because
 * a tin that is still on the shelf does not stop existing because the owner
 * stopped restocking it. They drop out once they are empty and untraded.
 */
create or replace function public.get_lubricant_stock(p_date date default public.pump_today())
returns table (
  id                  uuid,
  name                text,
  pack_size_litres    numeric,
  sale_rate_per_litre numeric,
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
         l.is_active,
         l.opening_stock_litres,
         coalesce(bought.litres, 0)::numeric,
         coalesce(sold.litres, 0)::numeric,
         round(l.opening_stock_litres
               + coalesce(bought.litres, 0)
               - coalesce(sold.litres, 0), 2)::numeric
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
   order by l.is_active desc, l.name;
end;
$$;

/*
 * One day of counter sales, with its totals - everything the Lubricants screen
 * shows for the date on it, in one round trip.
 */
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
               'credit_amount', coalesce(sum(ls.credit_amount), 0)
             )
        from public.lubricant_sales ls
       where ls.sale_date = p_date
    ),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            ls.id,
               'lubricant_id',  ls.lubricant_id,
               'name',          l.name,
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
-- Removing a sale
--
-- Same treatment as deleting a nozzle reading (migration 015): reverse the
-- ledger first, delete second, both in one transaction. Deleting the sale on
-- its own would release the ledger entry's pointer and leave the customer
-- owing money for a tin the books no longer show them taking.
-- ---------------------------------------------------------------------------
create or replace function public.delete_lubricant_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date;
  v_credit  numeric(14, 2);
  v_customer uuid;
  v_name    text;
  v_gone    int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may delete a lubricant sale' using errcode = '42501';
  end if;

  select ls.sale_date, ls.credit_amount, ls.customer_id, l.name
    into v_date, v_credit, v_customer, v_name
    from public.lubricant_sales ls
    join public.lubricants l on l.id = ls.lubricant_id
   where ls.id = p_sale_id;

  if v_date is null then
    raise exception 'That sale no longer exists' using errcode = 'P0002';
  end if;

  if v_credit > 0 and v_customer is not null then
    insert into public.ledger_entries
      (customer_id, entry_type, amount, entry_date, note, created_by)
    values (
      v_customer, 'credit', v_credit, v_date,
      'Reversal - the ' || v_name || ' sale on '
        || to_char(v_date, 'DD Mon YYYY') || ' was deleted',
      auth.uid()
    );
  end if;

  delete from public.lubricant_sales where id = p_sale_id;
  get diagnostics v_gone = row_count;

  return jsonb_build_object('deleted', v_gone, 'credit_reversed', v_credit > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Removing a product
--
-- The owner asked for a way to drop a lubricant when he changes brand, and
-- there are two honest answers depending on whether it was ever traded:
--
--   never bought, never sold  - a typo or a product that never arrived. There
--                               is nothing to preserve, so it is deleted.
--   bought or sold at some point - deleting it would tear a hole in months that
--                               have already been reported and exported. It is
--                               retired instead: it disappears from the sale
--                               form and the product list, its history stays
--                               intact, and its name is released so a
--                               replacement can reuse it.
--
-- Which of the two happened comes back in the result, so the screen can say so
-- rather than leaving the owner to guess.
-- ---------------------------------------------------------------------------
create or replace function public.delete_lubricant(p_lubricant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_purchases int;
  v_sales     int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a lubricant' using errcode = '42501';
  end if;

  select l.name into v_name from public.lubricants l where l.id = p_lubricant_id;
  if v_name is null then
    raise exception 'That lubricant no longer exists' using errcode = 'P0002';
  end if;

  select count(*) into v_purchases
    from public.lubricant_purchases lp where lp.lubricant_id = p_lubricant_id;
  select count(*) into v_sales
    from public.lubricant_sales ls where ls.lubricant_id = p_lubricant_id;

  if v_purchases = 0 and v_sales = 0 then
    delete from public.lubricants where id = p_lubricant_id;
    return jsonb_build_object('name', v_name, 'removed', true,
                              'purchases', 0, 'sales', 0);
  end if;

  update public.lubricants
     set is_active = false
   where id = p_lubricant_id;

  return jsonb_build_object('name', v_name, 'removed', false,
                            'purchases', v_purchases, 'sales', v_sales);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Sales and purchases are daily work, so staff record both, exactly as they do
-- for fuel. The product list is configuration - which brands the pump stocks,
-- what they cost, what the opening stock was - so it is the owner's, like tanks
-- and fuel prices. Correcting anything already recorded stays with the owner.
-- ---------------------------------------------------------------------------
alter table public.lubricants          enable row level security;
alter table public.lubricant_purchases enable row level security;
alter table public.lubricant_sales     enable row level security;

create policy "lubricants: staff read"
  on public.lubricants for select to authenticated
  using (public.is_active_staff());

create policy "lubricants: super admin writes"
  on public.lubricants for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "lubricant purchases: staff read"
  on public.lubricant_purchases for select to authenticated
  using (public.is_active_staff());

create policy "lubricant purchases: staff create"
  on public.lubricant_purchases for insert to authenticated
  with check (public.is_active_staff());

create policy "lubricant purchases: super admin updates"
  on public.lubricant_purchases for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "lubricant purchases: super admin deletes"
  on public.lubricant_purchases for delete to authenticated
  using (public.is_super_admin());

create policy "lubricant sales: staff read"
  on public.lubricant_sales for select to authenticated
  using (public.is_active_staff());

create policy "lubricant sales: staff create"
  on public.lubricant_sales for insert to authenticated
  with check (public.is_active_staff());

create policy "lubricant sales: super admin updates"
  on public.lubricant_sales for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "lubricant sales: super admin deletes"
  on public.lubricant_sales for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.lubricants          to authenticated;
grant select, insert, update, delete on public.lubricant_purchases to authenticated;
grant select, insert, update, delete on public.lubricant_sales     to authenticated;

-- ---------------------------------------------------------------------------
-- Function permissions. Trigger functions are never called directly, and the
-- security definer readers must not be reachable by a logged-out visitor.
-- ---------------------------------------------------------------------------
revoke execute on function public.trg_post_lubricant_sale_to_ledger()   from public, anon, authenticated;
revoke execute on function public.trg_recalc_lubricant_from_row()       from public, anon, authenticated;
revoke execute on function public.trg_recalc_lubricant_from_product()   from public, anon, authenticated;
revoke execute on function public.recalc_lubricant_stock(uuid)          from public, anon, authenticated;

revoke execute on function public.calculate_lubricant_stock(uuid, date) from public, anon;
revoke execute on function public.get_lubricant_stock(date)             from public, anon;
revoke execute on function public.get_lubricant_day(date)               from public, anon;
revoke execute on function public.delete_lubricant_sale(uuid)           from public, anon;
revoke execute on function public.delete_lubricant(uuid)                from public, anon;

grant execute on function public.calculate_lubricant_stock(uuid, date) to authenticated;
grant execute on function public.get_lubricant_stock(date)             to authenticated;
grant execute on function public.get_lubricant_day(date)               to authenticated;
grant execute on function public.delete_lubricant_sale(uuid)           to authenticated;
grant execute on function public.delete_lubricant(uuid)                to authenticated;
