-- A NEW DATABASE for Al Hakeem Filling Station PSO, part 1 of 4, run in order.
-- Al Hakeem's repo at its latest migration (001 to 072, then 800 to 812), then start-empty.
-- Run ONLY on a brand-new, empty Supabase project. Each migration commits on its
-- own; if one stops, fix the cause and run the file again from that migration.
-- This part holds: 001_core_schema.sql to 029_lubricant_trend.sql

-- ===================================================================== 001_core_schema.sql
-- =============================================================================
-- 001_core_schema.sql
--
-- Enums, tables, constraints and indexes for the petrol pump management system.
--
-- Physical setup this models:
--   * 2 underground tanks  - petrol (25,000 L) and diesel (50,000 L)
--   * 3 dispensing units, each with 2 nozzles = 6 nozzles, each tied to a tank
--   * one reading per nozzle per day (the `shift` enum leaves room to split the
--     day later without a data migration - see nozzle_readings.shift)
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Two admin levels. 'data_entry' staff can only record daily data;
-- 'super_admin' can see money reports and change configuration.
create type public.user_role as enum ('super_admin', 'data_entry');

create type public.fuel_type as enum ('petrol', 'diesel');

-- Readings are recorded once per whole day today. 'day' and 'night' are defined
-- up front so that splitting into shifts later is a UI change only - the unique
-- constraint on (nozzle_id, reading_date, shift) already allows for it.
create type public.shift_type as enum ('full_day', 'day', 'night');

create type public.payment_status as enum ('paid', 'pending');

-- debit  = customer took fuel on credit (they owe more)
-- credit = customer paid money back     (they owe less)
create type public.ledger_entry_type as enum ('debit', 'credit');

-- ---------------------------------------------------------------------------
-- profiles - one row per login, holds the role. Created automatically by a
-- trigger on auth.users (see 002). Roles are never hardcoded to an email.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       public.user_role not null default 'data_entry',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Login profile and role. Deactivate with is_active = false rather than deleting.';

-- ---------------------------------------------------------------------------
-- tanks - the underground storage. current_stock_litres is a cached book stock
-- kept in sync by triggers (see 002); it is always recomputed from scratch, so
-- it can never drift away from the purchase/sale/dip history that produced it.
-- ---------------------------------------------------------------------------
create table public.tanks (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  fuel_type            public.fuel_type not null,
  capacity_litres      numeric(12, 2) not null check (capacity_litres > 0),
  -- Stock in the tank at the START of opening_stock_date. This is the very
  -- first baseline; after the first physical dip, stock checks take over.
  opening_stock_litres numeric(12, 2) not null default 0 check (opening_stock_litres >= 0),
  opening_stock_date   date not null default current_date,
  current_stock_litres numeric(12, 2) not null default 0,
  created_at           timestamptz not null default now()
);

comment on column public.tanks.current_stock_litres is
  'Cached book stock, maintained by triggers. Recomputed, never incremented.';

-- ---------------------------------------------------------------------------
-- nozzles - 6 rows. Each belongs to exactly one tank, which is what makes a
-- sale on that nozzle draw down the right fuel.
-- ---------------------------------------------------------------------------
create table public.nozzles (
  id           uuid primary key default gen_random_uuid(),
  tank_id      uuid not null references public.tanks (id) on delete restrict,
  unit_number  smallint not null check (unit_number > 0),
  nozzle_label text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (unit_number, nozzle_label)
);

-- ---------------------------------------------------------------------------
-- fuel_prices - rate history per fuel type. Only super_admin may write here.
-- The reading form auto-fills from this, but every reading also stores the rate
-- it was sold at, so changing today's price never rewrites yesterday's sales.
-- ---------------------------------------------------------------------------
create table public.fuel_prices (
  id             uuid primary key default gen_random_uuid(),
  fuel_type      public.fuel_type not null,
  rate           numeric(10, 2) not null check (rate > 0),
  effective_from date not null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (fuel_type, effective_from)
);

-- ---------------------------------------------------------------------------
-- customers - credit account holders.
-- ---------------------------------------------------------------------------
create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) > 0),
  vehicle_number text,
  phone          text,
  credit_limit   numeric(14, 2) check (credit_limit >= 0),
  is_active      boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- nozzle_readings - the core daily entry. One row per nozzle per day.
--
-- litres_sold and sale_amount are generated columns: Postgres computes them, so
-- they can never disagree with the readings they came from.
--
-- The split check is the important one - cash + credit must equal what the
-- meter says was sold, so a day cannot be saved half-balanced.
-- ---------------------------------------------------------------------------
create table public.nozzle_readings (
  id              uuid primary key default gen_random_uuid(),
  nozzle_id       uuid not null references public.nozzles (id) on delete restrict,
  reading_date    date not null,
  shift           public.shift_type not null default 'full_day',
  opening_reading numeric(12, 2) not null check (opening_reading >= 0),
  closing_reading numeric(12, 2) not null check (closing_reading >= 0),
  rate_per_litre  numeric(10, 2) not null check (rate_per_litre > 0),
  litres_sold     numeric(12, 2) generated always as (closing_reading - opening_reading) stored,
  sale_amount     numeric(14, 2) generated always as
                    (round((closing_reading - opening_reading) * rate_per_litre, 2)) stored,
  cash_amount     numeric(14, 2) not null default 0 check (cash_amount >= 0),
  credit_amount   numeric(14, 2) not null default 0 check (credit_amount >= 0),
  note            text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  -- A meter never runs backwards.
  constraint nozzle_readings_closing_gte_opening
    check (closing_reading >= opening_reading),

  -- Cash + credit must account for every rupee the meter says was sold.
  constraint nozzle_readings_split_matches_sale
    check (round(cash_amount + credit_amount, 2)
           = round((closing_reading - opening_reading) * rate_per_litre, 2)),

  -- One reading per nozzle per day (per shift, if shifts are used later).
  unique (nozzle_id, reading_date, shift)
);

-- ---------------------------------------------------------------------------
-- credit_sales - the credit slips ("parchi") behind a reading's credit_amount.
-- One reading can carry many, one per customer who took fuel without paying.
-- A trigger (002) posts each of these into the customer's ledger automatically.
-- ---------------------------------------------------------------------------
create table public.credit_sales (
  id          uuid primary key default gen_random_uuid(),
  reading_id  uuid not null references public.nozzle_readings (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  litres      numeric(12, 2) not null check (litres > 0),
  amount      numeric(14, 2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ledger_entries - APPEND ONLY. This is real money owed, so nothing here is
-- ever edited or deleted; mistakes are cancelled out with a new opposite entry.
-- Enforced three ways: no update/delete RLS policies, a hard trigger guard
-- (002) that even the service role cannot get past, and restrict on the FK
-- below so deleting a reading cannot quietly erase a customer's debt.
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id) on delete restrict,
  entry_type     public.ledger_entry_type not null,
  amount         numeric(14, 2) not null check (amount > 0),
  -- Litres and fuel type are only meaningful on a debit (fuel taken).
  litres         numeric(12, 2) check (litres > 0),
  fuel_type      public.fuel_type,
  entry_date     date not null,
  note           text,
  -- Set when this entry was posted automatically from a credit sale. The unique
  -- constraint makes double-posting the same slip impossible.
  credit_sale_id uuid unique references public.credit_sales (id) on delete restrict,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint ledger_payment_has_no_fuel
    check (entry_type = 'debit' or (litres is null and fuel_type is null))
);

comment on table public.ledger_entries is
  'Append-only customer ledger. Never edit or delete - post an offsetting entry.';

-- ---------------------------------------------------------------------------
-- fuel_purchases - stock coming in from the OMC/supplier.
-- ---------------------------------------------------------------------------
create table public.fuel_purchases (
  id              uuid primary key default gen_random_uuid(),
  tank_id         uuid not null references public.tanks (id) on delete restrict,
  purchase_date   date not null,
  quantity_litres numeric(12, 2) not null check (quantity_litres > 0),
  rate            numeric(10, 2) not null check (rate > 0),
  total_cost      numeric(14, 2) generated always as (round(quantity_litres * rate, 2)) stored,
  supplier_name   text not null check (length(btrim(supplier_name)) > 0),
  invoice_number  text,
  payment_status  public.payment_status not null default 'pending',
  note            text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stock_checks - the physical dip reading versus what the books expected.
-- gain_loss is generated, so it always matches the two numbers above it.
-- A recorded dip also becomes the new baseline for future stock calculations.
-- ---------------------------------------------------------------------------
create table public.stock_checks (
  id                 uuid primary key default gen_random_uuid(),
  tank_id            uuid not null references public.tanks (id) on delete restrict,
  check_date         date not null,
  expected_stock     numeric(12, 2) not null,
  actual_dip_reading numeric(12, 2) not null check (actual_dip_reading >= 0),
  gain_loss          numeric(12, 2) generated always as (actual_dip_reading - expected_stock) stored,
  note               text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (tank_id, check_date)
);

-- ---------------------------------------------------------------------------
-- expenses - optional running costs, used by the monthly profit calculation.
-- super_admin only, since this feeds profit/loss.
-- ---------------------------------------------------------------------------
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (length(btrim(category)) > 0),
  amount       numeric(14, 2) not null check (amount > 0),
  expense_date date not null,
  note         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes - everything here is queried by date or by parent record.
-- ---------------------------------------------------------------------------
create index nozzles_tank_id_idx            on public.nozzles (tank_id);
create index fuel_prices_lookup_idx         on public.fuel_prices (fuel_type, effective_from desc);
create index nozzle_readings_date_idx       on public.nozzle_readings (reading_date desc);
create index nozzle_readings_nozzle_idx     on public.nozzle_readings (nozzle_id, reading_date desc);
create index credit_sales_reading_idx       on public.credit_sales (reading_id);
create index credit_sales_customer_idx      on public.credit_sales (customer_id);
create index ledger_entries_customer_idx    on public.ledger_entries (customer_id, entry_date desc, created_at desc);
create index fuel_purchases_tank_date_idx   on public.fuel_purchases (tank_id, purchase_date desc);
create index fuel_purchases_date_idx        on public.fuel_purchases (purchase_date desc);
create index stock_checks_tank_date_idx     on public.stock_checks (tank_id, check_date desc);
create index expenses_date_idx              on public.expenses (expense_date desc);
create index customers_name_idx             on public.customers (name);

-- ===================================================================== 002_functions_and_triggers.sql
-- =============================================================================
-- 002_functions_and_triggers.sql
--
-- Role helpers, stock calculation, and the triggers that keep the books honest:
--   * new logins automatically get a profile (always as data_entry)
--   * a credit sale automatically posts a debit into the customer's ledger
--   * credit lines must add up to the reading's credit amount (checked at commit)
--   * the ledger physically refuses updates and deletes
--   * tank stock is recomputed from history after every relevant write
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers. Used by every RLS policy so the rules live in one place.
-- security definer is required: these read profiles, and the policies ON
-- profiles would otherwise recurse.
-- ---------------------------------------------------------------------------

create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_active;
$$;

comment on function public.auth_role() is
  'Role of the current login, or null if logged out or deactivated.';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() = 'super_admin', false);
$$;

-- Any active login: super_admin or data_entry.
create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Every new auth user gets a profile. The role is ALWAYS data_entry here, even
-- if something was passed in the signup metadata - promoting someone to
-- super_admin is a separate, deliberate action by an existing super_admin.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    'data_entry'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Fuel pricing. Returns the rate in force on a given date - the most recent
-- price whose effective_from is on or before that date.
-- ---------------------------------------------------------------------------
create or replace function public.current_fuel_rate(
  p_fuel_type public.fuel_type,
  p_date      date default current_date
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

-- ---------------------------------------------------------------------------
-- Expected stock in a tank at the END of a given date.
--
--   expected = baseline + fuel purchased since - litres sold since
--
-- The baseline is the last physical dip before that date (a measured number
-- beats a calculated one). Before the first dip it falls back to the tank's
-- opening stock.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_expected_stock(
  p_tank_id uuid,
  p_date    date default current_date
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
  -- Last measured dip strictly before the date we are asking about.
  select sc.actual_dip_reading, sc.check_date
    into v_baseline_qty, v_baseline_date
    from public.stock_checks sc
   where sc.tank_id = p_tank_id
     and sc.check_date < p_date
   order by sc.check_date desc
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

-- ---------------------------------------------------------------------------
-- Refresh a tank's cached stock. Always recomputed from history rather than
-- added to, so the cache can never drift out of step with the underlying data.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_tank_stock(p_tank_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tanks t
     set current_stock_litres = coalesce(public.calculate_expected_stock(t.id, current_date), 0)
   where t.id = p_tank_id;
end;
$$;

create or replace function public.trg_recalc_tank_from_tank_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_tank_stock(old.tank_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_tank_stock(new.tank_id);
  end if;
  return null;
end;
$$;

-- Readings point at a nozzle, so the tank has to be looked up.
create or replace function public.trg_recalc_tank_from_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tank_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select n.tank_id into v_tank_id from public.nozzles n where n.id = old.nozzle_id;
    perform public.recalc_tank_stock(v_tank_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select n.tank_id into v_tank_id from public.nozzles n where n.id = new.nozzle_id;
    perform public.recalc_tank_stock(v_tank_id);
  end if;
  return null;
end;
$$;

create trigger recalc_tank_after_purchase
  after insert or update or delete on public.fuel_purchases
  for each row execute function public.trg_recalc_tank_from_tank_row();

create trigger recalc_tank_after_stock_check
  after insert or update or delete on public.stock_checks
  for each row execute function public.trg_recalc_tank_from_tank_row();

create trigger recalc_tank_after_reading
  after insert or update or delete on public.nozzle_readings
  for each row execute function public.trg_recalc_tank_from_reading();

-- ---------------------------------------------------------------------------
-- Credit sale -> ledger debit, automatically.
--
-- This is the "type it once" rule: staff record the credit slip on the reading
-- screen, and the customer's balance moves from that. The unique constraint on
-- ledger_entries.credit_sale_id makes posting the same slip twice impossible.
-- ---------------------------------------------------------------------------
create or replace function public.trg_post_credit_sale_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date;
  v_fuel    public.fuel_type;
  v_creator uuid;
begin
  select nr.reading_date, t.fuel_type, nr.created_by
    into v_date, v_fuel, v_creator
    from public.nozzle_readings nr
    join public.nozzles n on n.id = nr.nozzle_id
    join public.tanks   t on t.id = n.tank_id
   where nr.id = new.reading_id;

  insert into public.ledger_entries (
    customer_id, entry_type, amount, litres, fuel_type,
    entry_date, note, credit_sale_id, created_by
  )
  values (
    new.customer_id, 'debit', new.amount, new.litres, v_fuel,
    v_date, 'Fuel taken on credit', new.id, v_creator
  );

  return new;
end;
$$;

create trigger post_credit_sale_to_ledger
  after insert on public.credit_sales
  for each row execute function public.trg_post_credit_sale_to_ledger();

-- ---------------------------------------------------------------------------
-- The credit lines on a reading must add up to its credit_amount.
--
-- These are DEFERRED constraint triggers: they run at the end of the
-- transaction, once the reading and all its credit lines have been written.
-- That lets a reading be saved together with its slips, while still refusing
-- to commit if the two sides disagree by even one rupee.
-- ---------------------------------------------------------------------------
create or replace function public.trg_validate_credit_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reading_id uuid;
  v_declared   numeric(14, 2);
  v_lines      numeric(14, 2);
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT, so pick by op
  -- rather than coalescing the two.
  if tg_op = 'DELETE' then
    v_reading_id := old.reading_id;
  else
    v_reading_id := new.reading_id;
  end if;

  select nr.credit_amount into v_declared
    from public.nozzle_readings nr
   where nr.id = v_reading_id;

  -- The reading itself is gone (cascade delete) - nothing left to check.
  if v_declared is null then
    return null;
  end if;

  select coalesce(sum(cs.amount), 0) into v_lines
    from public.credit_sales cs
   where cs.reading_id = v_reading_id;

  if round(v_declared, 2) <> round(v_lines, 2) then
    raise exception
      'Credit slips add up to %, but the reading records % as credit',
      v_lines, v_declared
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create or replace function public.trg_validate_reading_credit_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lines numeric(14, 2);
begin
  select coalesce(sum(cs.amount), 0) into v_lines
    from public.credit_sales cs
   where cs.reading_id = new.id;

  if round(new.credit_amount, 2) <> round(v_lines, 2) then
    raise exception
      'Reading records % as credit, but its credit slips add up to %',
      new.credit_amount, v_lines
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger credit_sales_total_matches
  after insert or update or delete on public.credit_sales
  deferrable initially deferred
  for each row execute function public.trg_validate_credit_total();

create constraint trigger nozzle_readings_credit_matches
  after insert or update on public.nozzle_readings
  deferrable initially deferred
  for each row execute function public.trg_validate_reading_credit_total();

-- ---------------------------------------------------------------------------
-- The ledger is append-only, enforced in the database itself.
--
-- RLS alone is not enough here: the service-role key bypasses RLS entirely, so
-- a bug in server code could otherwise rewrite what a customer owes. A trigger
-- cannot be bypassed that way. Corrections are made by posting a new opposite
-- entry, which leaves the original visible - that is the point.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

create trigger ledger_entries_no_update
  before update on public.ledger_entries
  for each row execute function public.trg_ledger_append_only();

create trigger ledger_entries_no_delete
  before delete on public.ledger_entries
  for each row execute function public.trg_ledger_append_only();

-- ---------------------------------------------------------------------------
-- What a customer currently owes: total debits minus total credits.
-- Positive = they owe money.
-- ---------------------------------------------------------------------------
create or replace function public.customer_balance(p_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    sum(case when le.entry_type = 'debit' then le.amount else -le.amount end), 0)
    from public.ledger_entries le
   where le.customer_id = p_customer_id;
$$;

-- ===================================================================== 003_rls_policies.sql
-- =============================================================================
-- 003_rls_policies.sql
--
-- Row Level Security. This is the source of truth for what each role can do -
-- the requireRole() helper in the app is a second line of defence, not the
-- first. Everything is denied unless a policy below allows it.
--
-- Roles in short:
--   data_entry   - records daily work: readings, purchases, stock dips,
--                  customers, ledger payments. Cannot see money reports,
--                  cannot change past entries, cannot touch configuration.
--   super_admin  - everything, including prices, tanks, nozzles, expenses,
--                  reports, and correcting past entries.
--
-- Note on the ledger: it has NO update or delete policy at all, on purpose.
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.tanks           enable row level security;
alter table public.nozzles         enable row level security;
alter table public.fuel_prices     enable row level security;
alter table public.customers       enable row level security;
alter table public.nozzle_readings enable row level security;
alter table public.credit_sales    enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.fuel_purchases  enable row level security;
alter table public.stock_checks    enable row level security;
alter table public.expenses        enable row level security;

-- ---------------------------------------------------------------------------
-- profiles - you can see yourself; a super_admin can see and manage everyone.
-- Nobody deletes a profile: deactivate with is_active = false so their past
-- entries keep their author.
-- ---------------------------------------------------------------------------
create policy "profiles: read own or all as super admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_super_admin());

create policy "profiles: super admin creates"
  on public.profiles for insert to authenticated
  with check (public.is_super_admin());

create policy "profiles: super admin updates"
  on public.profiles for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Configuration: tanks, nozzles, fuel prices.
-- Staff need to read these to enter a reading (which nozzle, what rate), but
-- only a super_admin may change them.
-- ---------------------------------------------------------------------------
create policy "tanks: staff read"
  on public.tanks for select to authenticated
  using (public.is_active_staff());

create policy "tanks: super admin writes"
  on public.tanks for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "nozzles: staff read"
  on public.nozzles for select to authenticated
  using (public.is_active_staff());

create policy "nozzles: super admin writes"
  on public.nozzles for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "fuel prices: staff read"
  on public.fuel_prices for select to authenticated
  using (public.is_active_staff());

create policy "fuel prices: super admin writes"
  on public.fuel_prices for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- customers - staff may add new credit customers (they meet them at the pump),
-- but editing or removing one is a super_admin decision.
-- ---------------------------------------------------------------------------
create policy "customers: staff read"
  on public.customers for select to authenticated
  using (public.is_active_staff());

create policy "customers: staff create"
  on public.customers for insert to authenticated
  with check (public.is_active_staff());

create policy "customers: super admin updates"
  on public.customers for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "customers: super admin deletes"
  on public.customers for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- nozzle_readings - the daily entry. Staff add today's numbers and can see
-- what has been entered (so yesterday's closing can carry over and so they do
-- not enter a nozzle twice). Only a super_admin may correct a past entry.
-- ---------------------------------------------------------------------------
create policy "readings: staff read"
  on public.nozzle_readings for select to authenticated
  using (public.is_active_staff());

create policy "readings: staff create"
  on public.nozzle_readings for insert to authenticated
  with check (public.is_active_staff());

create policy "readings: super admin updates"
  on public.nozzle_readings for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "readings: super admin deletes"
  on public.nozzle_readings for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- credit_sales - the credit slips attached to a reading. Same rules as the
-- reading they belong to.
-- ---------------------------------------------------------------------------
create policy "credit sales: staff read"
  on public.credit_sales for select to authenticated
  using (public.is_active_staff());

create policy "credit sales: staff create"
  on public.credit_sales for insert to authenticated
  with check (public.is_active_staff());

create policy "credit sales: super admin updates"
  on public.credit_sales for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "credit sales: super admin deletes"
  on public.credit_sales for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- ledger_entries - APPEND ONLY.
--
-- Read and insert only. There is deliberately no update policy and no delete
-- policy, for anyone, including super_admin: this is money customers owe, and
-- the history has to stay auditable. A mistake is corrected by posting a new
-- offsetting entry. A trigger in 002 enforces the same rule below RLS, so even
-- the service-role key cannot rewrite it.
-- ---------------------------------------------------------------------------
create policy "ledger: staff read"
  on public.ledger_entries for select to authenticated
  using (public.is_active_staff());

create policy "ledger: staff create"
  on public.ledger_entries for insert to authenticated
  with check (public.is_active_staff());

-- ---------------------------------------------------------------------------
-- fuel_purchases - staff record incoming stock from the OMC.
-- ---------------------------------------------------------------------------
create policy "purchases: staff read"
  on public.fuel_purchases for select to authenticated
  using (public.is_active_staff());

create policy "purchases: staff create"
  on public.fuel_purchases for insert to authenticated
  with check (public.is_active_staff());

create policy "purchases: super admin updates"
  on public.fuel_purchases for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "purchases: super admin deletes"
  on public.fuel_purchases for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- stock_checks - staff record the physical dip.
-- ---------------------------------------------------------------------------
create policy "stock checks: staff read"
  on public.stock_checks for select to authenticated
  using (public.is_active_staff());

create policy "stock checks: staff create"
  on public.stock_checks for insert to authenticated
  with check (public.is_active_staff());

create policy "stock checks: super admin updates"
  on public.stock_checks for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "stock checks: super admin deletes"
  on public.stock_checks for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- expenses - super_admin only in every direction, since this feeds profit.
-- ---------------------------------------------------------------------------
create policy "expenses: super admin only"
  on public.expenses for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Function permissions.
--
-- security definer functions run with the owner's rights, so they must not be
-- callable by logged-out visitors. Trigger functions are never called directly.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.trg_post_credit_sale_to_ledger() from public, anon, authenticated;
revoke execute on function public.trg_validate_credit_total() from public, anon, authenticated;
revoke execute on function public.trg_validate_reading_credit_total() from public, anon, authenticated;
revoke execute on function public.trg_ledger_append_only() from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_tank_row() from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_reading() from public, anon, authenticated;
revoke execute on function public.recalc_tank_stock(uuid) from public, anon, authenticated;

revoke execute on function public.auth_role() from anon;
revoke execute on function public.is_super_admin() from anon;
revoke execute on function public.is_active_staff() from anon;
revoke execute on function public.current_fuel_rate(public.fuel_type, date) from anon;
revoke execute on function public.calculate_expected_stock(uuid, date) from anon;
revoke execute on function public.customer_balance(uuid) from anon;

-- ===================================================================== 004_seed_tanks_and_nozzles.sql
-- =============================================================================
-- 004_seed_tanks_and_nozzles.sql
--
-- The physical hardware at the pump: 2 underground tanks and 6 nozzles across
-- 3 double dispensing units.
--
-- ASSUMPTION worth checking: each unit is set up with one petrol nozzle (A) and
-- one diesel nozzle (B). If a unit actually runs both nozzles on the same fuel,
-- change that nozzle's tank_id from the Settings screen - no migration needed.
--
-- Opening stock is seeded at 0. Record the first physical dip on the Stock
-- Checks screen and that measured number becomes the baseline for everything
-- afterwards.
-- =============================================================================

insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
values
  ('Petrol Tank', 'petrol', 25000, 0, current_date),
  ('Diesel Tank', 'diesel', 50000, 0, current_date);

insert into public.nozzles (tank_id, unit_number, nozzle_label)
select t.id, u.unit_number, u.nozzle_label
  from (values
          (1::smallint, 'A', 'petrol'),
          (1::smallint, 'B', 'diesel'),
          (2::smallint, 'A', 'petrol'),
          (2::smallint, 'B', 'diesel'),
          (3::smallint, 'A', 'petrol'),
          (3::smallint, 'B', 'diesel')
       ) as u (unit_number, nozzle_label, fuel)
  join public.tanks t on t.fuel_type = u.fuel::public.fuel_type;

-- ===================================================================== 005_reporting_rpcs.sql
-- =============================================================================
-- 005_reporting_rpcs.sql
--
-- All aggregation happens here in Postgres, not in the browser - reports stay
-- fast and the numbers cannot be fiddled with client-side.
--
-- Reporting functions are security definer with an explicit role check at the
-- top, so a data_entry login calling them directly gets a hard refusal.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Save a day's reading together with its credit slips, in ONE transaction.
--
-- security invoker on purpose: RLS still applies, so a logged-out or
-- deactivated user cannot use this as a side door. If any credit line fails,
-- the whole reading rolls back - there is never a half-saved day.
--
-- p_credit_lines looks like:
--   [{"customer_id": "...", "litres": 40, "amount": 11200}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_nozzle_reading(
  p_nozzle_id    uuid,
  p_reading_date date,
  p_opening      numeric,
  p_closing      numeric,
  p_rate         numeric,
  p_cash         numeric,
  p_credit_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reading_id   uuid;
  v_credit_total numeric(14, 2);
  v_line         jsonb;
begin
  -- The reading's credit_amount is derived from the slips, never typed, so the
  -- two can't disagree.
  select coalesce(sum((l ->> 'amount')::numeric), 0)
    into v_credit_total
    from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb)) l;

  insert into public.nozzle_readings (
    nozzle_id, reading_date, opening_reading, closing_reading,
    rate_per_litre, cash_amount, credit_amount, created_by
  )
  values (
    p_nozzle_id, p_reading_date, p_opening, p_closing,
    p_rate, p_cash, v_credit_total, auth.uid()
  )
  returning id into v_reading_id;

  for v_line in
    select value from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb))
  loop
    insert into public.credit_sales (reading_id, customer_id, litres, amount)
    values (
      v_reading_id,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'litres')::numeric,
      (v_line ->> 'amount')::numeric
    );
  end loop;

  return v_reading_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything the dashboard needs for one day, in a single round trip.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_summary(p_date date default current_date)
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
    raise exception 'Only a super admin may view the daily summary'
      using errcode = '42501';
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
      from public.nozzle_readings nr
      where nr.reading_date = p_date
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
      left join public.stock_checks sc
        on sc.tank_id = t.id and sc.check_date = p_date
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0)
      )
      from public.fuel_purchases fp
      where fp.purchase_date = p_date
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Day-by-day sales for the 30-day performance view. Missing days come back as
-- zeros rather than gaps, so the trend line stays honest.
-- ---------------------------------------------------------------------------
create or replace function public.get_sales_trend(p_from date, p_to date)
returns table (
  day           date,
  litres_sold   numeric,
  sale_amount   numeric,
  cash_amount   numeric,
  credit_amount numeric,
  petrol_litres numeric,
  diesel_litres numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  return query
  select d::date,
         coalesce(sum(nr.litres_sold), 0)::numeric,
         coalesce(sum(nr.sale_amount), 0)::numeric,
         coalesce(sum(nr.cash_amount), 0)::numeric,
         coalesce(sum(nr.credit_amount), 0)::numeric,
         coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0)::numeric,
         coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.nozzle_readings nr on nr.reading_date = d::date
    left join public.nozzles n on n.id = nr.nozzle_id
    left join public.tanks   t on t.id = n.tank_id
   group by d
   order by d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Monthly report: sales, cost of fuel bought, expenses, profit, and closing
-- stock per tank.
--
--   profit = sales - fuel purchased - expenses
--
-- Note this is cash-basis against fuel PURCHASED in the month, not fuel sold
-- from stock. In a month with a big delivery near month-end, profit will look
-- low and the closing inventory figure is where that money went.
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14, 2);
  v_cost     numeric(14, 2);
  v_expenses numeric(14, 2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the monthly report'
      using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr
   where nr.reading_date between v_from and v_to;

  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp
   where fp.purchase_date between v_from and v_to;

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
   where e.expense_date between v_from and v_to;

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
      from public.nozzle_readings nr
      where nr.reading_date between v_from and v_to
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
      from public.fuel_purchases fp
      where fp.purchase_date between v_from and v_to
    ),
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
    'profit', round(v_sales - v_cost - v_expenses, 2),
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

-- ---------------------------------------------------------------------------
-- A customer's full picture: who they are, what they owe, and how much petrol
-- and diesel they have taken in total.
--
-- Available to data_entry too - staff need to see a balance before recording a
-- payment. It exposes one customer only, never the whole book.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_statement(p_customer_id uuid)
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
    'customer', (select to_jsonb(c) from public.customers c where c.id = p_customer_id),
    'balance',  public.customer_balance(p_customer_id),
    'total_debits', (
      select coalesce(sum(le.amount), 0) from public.ledger_entries le
       where le.customer_id = p_customer_id and le.entry_type = 'debit'
    ),
    'total_credits', (
      select coalesce(sum(le.amount), 0) from public.ledger_entries le
       where le.customer_id = p_customer_id and le.entry_type = 'credit'
    ),
    'fuel_taken', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type', s.fuel_type,
               'litres',    s.litres,
               'amount',    s.amount
             ) order by s.fuel_type)
      from (
        select le.fuel_type, sum(le.litres) as litres, sum(le.amount) as amount
          from public.ledger_entries le
         where le.customer_id = p_customer_id
           and le.entry_type = 'debit'
           and le.fuel_type is not null
         group by le.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outstanding balance for every customer, for the customer list screen.
-- One query instead of one per customer.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_balances()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  credit_limit   numeric,
  balance        numeric
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
  select c.id,
         c.name,
         c.vehicle_number,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where c.is_active
   group by c.id, c.name, c.vehicle_number, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_daily_summary(date) from anon;
revoke execute on function public.get_sales_trend(date, date) from anon;
revoke execute on function public.get_monthly_report(int, int) from anon;
revoke execute on function public.get_customer_statement(uuid) from anon;
revoke execute on function public.get_customer_balances() from anon;
revoke execute on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb) from anon;

-- ===================================================================== 006_lock_down_function_grants.sql
-- =============================================================================
-- 006_lock_down_function_grants.sql
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. The
-- revokes in 003/005 only named `anon`, which left that PUBLIC grant in place -
-- so the reporting functions were still reachable without signing in. (The role
-- checks inside them would have refused, but they should not be callable at
-- all.)
--
-- This migration revokes PUBLIC + anon explicitly on every function, then
-- grants back only what a signed-in user actually calls. Revokes are listed one
-- function at a time rather than "all functions in schema public" so that
-- extension functions living in the same schema are left alone.
--
-- The role helpers stay callable by authenticated on purpose: RLS policies
-- reference them, and they only ever report on the caller's own account.
-- =============================================================================

-- Trigger functions need a pinned search_path like everything else.
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Nothing is callable by anonymous visitors.
-- ---------------------------------------------------------------------------
revoke execute on function public.auth_role()                                    from public, anon;
revoke execute on function public.is_super_admin()                               from public, anon;
revoke execute on function public.is_active_staff()                              from public, anon;
revoke execute on function public.handle_new_user()                              from public, anon, authenticated;
revoke execute on function public.current_fuel_rate(public.fuel_type, date)      from public, anon;
revoke execute on function public.calculate_expected_stock(uuid, date)           from public, anon;
revoke execute on function public.recalc_tank_stock(uuid)                        from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_tank_row()                from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_reading()                 from public, anon, authenticated;
revoke execute on function public.trg_post_credit_sale_to_ledger()               from public, anon, authenticated;
revoke execute on function public.trg_validate_credit_total()                    from public, anon, authenticated;
revoke execute on function public.trg_validate_reading_credit_total()            from public, anon, authenticated;
revoke execute on function public.trg_ledger_append_only()                       from public, anon, authenticated;
revoke execute on function public.customer_balance(uuid)                         from public, anon;
revoke execute on function public.get_daily_summary(date)                        from public, anon;
revoke execute on function public.get_sales_trend(date, date)                    from public, anon;
revoke execute on function public.get_monthly_report(int, int)                   from public, anon;
revoke execute on function public.get_customer_statement(uuid)                   from public, anon;
revoke execute on function public.get_customer_balances()                        from public, anon;
revoke execute on function
  public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb)
  from public, anon;

-- ---------------------------------------------------------------------------
-- Grant back exactly what a signed-in user needs.
--
-- The reporting functions still carry their own is_super_admin() check inside,
-- so a data_entry login that calls them directly is refused by the function
-- even though it is allowed to reach it.
-- ---------------------------------------------------------------------------
grant execute on function public.auth_role()                               to authenticated;
grant execute on function public.is_super_admin()                          to authenticated;
grant execute on function public.is_active_staff()                         to authenticated;
grant execute on function public.current_fuel_rate(public.fuel_type, date) to authenticated;
grant execute on function public.calculate_expected_stock(uuid, date)      to authenticated;
grant execute on function public.customer_balance(uuid)                    to authenticated;
grant execute on function public.get_daily_summary(date)                   to authenticated;
grant execute on function public.get_sales_trend(date, date)               to authenticated;
grant execute on function public.get_monthly_report(int, int)              to authenticated;
grant execute on function public.get_customer_statement(uuid)              to authenticated;
grant execute on function public.get_customer_balances()                   to authenticated;
grant execute on function
  public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb)
  to authenticated;

-- ===================================================================== 007_reading_sheet_rpc.sql
-- =============================================================================
-- 007_reading_sheet_rpc.sql
--
-- Everything the daily reading screen needs, for all 6 nozzles, in one query.
--
-- This is what makes the daily entry fast. For each nozzle it returns:
--   * the opening reading, already filled in from yesterday's closing so staff
--     never retype it
--   * the rate in force for that fuel on that date
--   * whatever has already been entered for that date, so the screen shows
--     progress and nobody enters the same nozzle twice
-- =============================================================================

create or replace function public.get_reading_sheet(p_date date default current_date)
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
         -- An already-saved reading keeps the rate it was sold at; a new one
         -- picks up today's price.
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         -- Opening = yesterday's closing. Falls back to 0 on a brand new pump.
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
       where nr.nozzle_id = n.id
         and nr.reading_date = p_date
       limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date < p_date
       order by nr.reading_date desc
       limit 1
    ) prev on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;

-- ===================================================================== 008_pump_timezone.sql
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

-- ===================================================================== 009_reading_chain_context.sql
-- =============================================================================
-- 009_reading_chain_context.sql
--
-- A nozzle's meter is continuous, so its readings should form an unbroken
-- chain: every reading's opening ought to equal the previous reading's closing.
-- Nothing checked that, and two ways of breaking it both went unnoticed:
--
--   1. BACK-FILLING. Miss the 3rd, enter the 4th, then go back. The 4th was
--      entered with the 2nd's closing as its opening, so it already covers two
--      days. Adding the 3rd counts those litres a second time.
--   2. ENTERING OUT OF ORDER. Enter the 3rd first (no earlier reading, so it
--      opens at 0), then enter the 2nd. The two rows now overlap.
--
-- Either way sales are inflated and tank stock is drawn down twice, so the
-- stock loss someone then investigates is fictional.
--
-- The reading sheet now also returns the neighbouring readings, so the form can
-- say what is wrong before anything is saved. This is context only - it does
-- not block a save, because meters really do get replaced and reset.
-- =============================================================================

drop function if exists public.get_reading_sheet(date);

create or replace function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id        uuid,
  unit_number      smallint,
  nozzle_label     text,
  tank_id          uuid,
  fuel_type        public.fuel_type,
  rate             numeric,
  opening_reading  numeric,
  reading_id       uuid,
  closing_reading  numeric,
  cash_amount      numeric,
  credit_amount    numeric,
  litres_sold      numeric,
  sale_amount      numeric,
  -- the nearest reading BEFORE this date, for the chain check
  previous_date    date,
  previous_closing numeric,
  -- the nearest reading AFTER this date; if one exists we are back-filling
  later_date       date,
  later_opening    numeric
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
         existing.sale_amount,
         prev.reading_date,
         prev.closing_reading,
         later.reading_date,
         later.opening_reading
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.*
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date = p_date
       limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading, nr.reading_date
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date < p_date
       order by nr.reading_date desc
       limit 1
    ) prev on true
    left join lateral (
      select nr.reading_date, nr.opening_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date > p_date
       order by nr.reading_date asc
       limit 1
    ) later on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;

-- ===================================================================== 010_month_export_rpc.sql
-- =============================================================================
-- 010_month_export_rpc.sql
--
-- Everything the monthly Excel workbook needs, in one call.
--
-- One RPC rather than seven round trips: the workbook is built in a single
-- request, and doing it in the database means the numbers in the spreadsheet
-- come out of exactly the same SQL as the numbers on the Reports page.
--
-- SECURITY DEFINER with its own is_super_admin() check, like the other
-- reporting functions - a data_entry login must not be able to pull a month of
-- financials out through the API, and RLS alone would not stop the read.
--
-- NOTE ON THE 'daily' BLOCK. It aggregates per day in a subquery and only then
-- runs jsonb_agg over the result. The obvious shorter form -
--
--     select jsonb_agg(jsonb_build_object('day', d, 'sale', sum(...)))
--     from generate_series(...) d left join ... group by d
--
-- - is rejected by Postgres with "aggregate function calls cannot be nested",
-- because sum() sits inside jsonb_agg(). The two levels have to be separated.
-- =============================================================================

create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14,2);
  v_cost     numeric(14,2);
  v_expenses numeric(14,2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;
  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;
  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'profit', round(v_sales - v_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',           day,
               'litres_sold',   litres_sold,
               'petrol_litres', petrol_litres,
               'diesel_litres', diesel_litres,
               'sale_amount',   sale_amount,
               'cash_amount',   cash_amount,
               'credit_amount', credit_amount
             ) order by day)
      from (
        select d::date                                                              as day,
               coalesce(sum(nr.litres_sold), 0)                                     as litres_sold,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres,
               coalesce(sum(nr.sale_amount), 0)                                     as sale_amount,
               coalesce(sum(nr.cash_amount), 0)                                     as cash_amount,
               coalesce(sum(nr.credit_amount), 0)                                   as credit_amount
          from generate_series(v_from, v_to, interval '1 day') d
          left join public.nozzle_readings nr on nr.reading_date = d::date
          left join public.nozzles n on n.id = nr.nozzle_id
          left join public.tanks   t on t.id = n.tank_id
         group by d
      ) per_day
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', fp.purchase_date, 'tank', t.name, 'fuel_type', t.fuel_type,
               'supplier', fp.supplier_name, 'invoice', fp.invoice_number,
               'litres', fp.quantity_litres, 'rate', fp.rate, 'cost', fp.total_cost,
               'payment_status', fp.payment_status
             ) order by fp.purchase_date, fp.created_at)
      from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
      where fp.purchase_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Same lock-down as migration 006: nobody reaches it unauthenticated, and the
-- is_super_admin() check inside handles the rest.
revoke execute on function public.get_month_export(int, int) from public, anon;
grant  execute on function public.get_month_export(int, int) to authenticated;

-- ===================================================================== 011_delete_staff_account.sql
-- =============================================================================
-- 011_delete_staff_account.sql
--
-- Lets a staff login be deleted outright, not just switched off.
--
-- THE PROBLEM THIS FIXES. Deleting a login could never work, and failed in a
-- way nobody would have guessed from the error message:
--
--   ledger_entries.created_by references profiles ON DELETE SET NULL, so
--   removing a profile makes Postgres UPDATE every ledger row that person
--   wrote, setting created_by to null. The append-only trigger sees an UPDATE
--   on ledger_entries and refuses it. The delete then fails with
--
--     0A000  The customer ledger is append-only.
--
--   which is true, and completely unhelpful - the caller was deleting a user,
--   not touching the ledger.
--
-- THE FIX. The trigger now allows exactly one update: created_by being cleared
-- as a profile goes away. Every other column must be byte-for-byte identical,
-- so this cannot be used as a way in to edit an amount. Deletes are still
-- refused outright, and so is any update that changes anything real.
--
-- Why not simply drop the foreign key or stop nulling it? Because then a
-- deleted profile would leave a dangling reference, and 'who recorded this'
-- would start pointing at a row that no longer exists. Null is the honest
-- answer: the account is gone, the entry stays, and the amount is untouched.
-- =============================================================================

create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- The one permitted update: a profile being deleted clears created_by.
    -- Compared as whole rows, so adding a column later cannot silently widen
    -- what this allows.
    if old.created_by is not null
       and new.created_by is null
       and to_jsonb(new) - 'created_by' = to_jsonb(old) - 'created_by'
    then
      return new;
    end if;
  end if;

  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_ledger_append_only() is
  'Blocks UPDATE and DELETE on ledger_entries. The sole exception is created_by '
  'being nulled when the profile that wrote the entry is deleted.';

-- ===================================================================== 012_nozzle_starting_reading.sql
-- =============================================================================
-- 012_nozzle_starting_reading.sql
--
-- Where each nozzle's meter stood on the day the pump started using this app.
--
-- THE PROBLEM. get_reading_sheet worked out the opening figure as
--
--   coalesce(this day's saved opening, the previous day's closing, 0)
--
-- That 0 is only right for a brand new pump. A pump that has been trading for
-- years has meters reading, say, 482,910 litres on the day it switches over -
-- and the very first entry would open at 0, so that first day would record the
-- entire lifetime of the meter as one day's sales. Every figure downstream
-- (sales, cash, tank stock, profit) would be wrong, and the tank would be drawn
-- down by hundreds of thousands of litres it never held.
--
-- THE FIX. Each nozzle carries its own starting reading, set once in Settings,
-- and that is what the chain falls back to instead of 0. It is only ever used
-- until the nozzle has its first saved reading; after that the previous day's
-- closing takes over, exactly as before.
-- =============================================================================

alter table public.nozzles
  add column if not exists starting_reading numeric(12,2) not null default 0;

alter table public.nozzles
  drop constraint if exists nozzles_starting_reading_not_negative;

alter table public.nozzles
  add constraint nozzles_starting_reading_not_negative
  check (starting_reading >= 0);

comment on column public.nozzles.starting_reading is
  'Meter reading on the day this pump began using the app. Used as the opening '
  'figure until the nozzle has its first saved reading, then the previous '
  'day''s closing takes over.';

-- Recreated only to change the final fallback in the opening figure, from a
-- hard-coded 0 to the nozzle''s own starting reading. Everything else is
-- unchanged from migration 009.
create or replace function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id uuid, unit_number smallint, nozzle_label text, tank_id uuid,
  fuel_type public.fuel_type, rate numeric, opening_reading numeric,
  reading_id uuid, closing_reading numeric, cash_amount numeric,
  credit_amount numeric, litres_sold numeric, sale_amount numeric,
  previous_date date, previous_closing numeric,
  later_date date, later_opening numeric
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
  select n.id, n.unit_number, n.nozzle_label, t.id, t.fuel_type,
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         coalesce(existing.opening_reading, prev.closing_reading,
                  n.starting_reading)::numeric,
         existing.id, existing.closing_reading, existing.cash_amount,
         existing.credit_amount, existing.litres_sold, existing.sale_amount,
         prev.reading_date, prev.closing_reading,
         later.reading_date, later.opening_reading
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.* from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date = p_date limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading, nr.reading_date from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date < p_date
       order by nr.reading_date desc limit 1
    ) prev on true
    left join lateral (
      select nr.reading_date, nr.opening_reading from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date > p_date
       order by nr.reading_date asc limit 1
    ) later on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;

-- ===================================================================== 013_correct_nozzle_fuel_layout.sql
-- =============================================================================
-- 013_correct_nozzle_fuel_layout.sql
--
-- Corrects the guess made in migration 004.
--
-- That migration assumed each unit ran one petrol nozzle and one diesel nozzle,
-- and said so in its own header as an assumption worth checking. It was wrong.
-- The real layout at this pump is by UNIT, not by nozzle:
--
--   Unit 1 - both nozzles diesel
--   Unit 2 - both nozzles petrol
--   Unit 3 - both nozzles petrol
--
-- This matters beyond labelling: tank_id decides which tank a sale is drawn
-- out of, so a wrong mapping silently empties the wrong tank and makes the
-- stock gain/loss figure for both tanks fiction.
--
-- Written as a correction rather than an edit to 004 so the applied history
-- stays intact. It is idempotent and matches by unit number, so it is a no-op
-- on a database where the mapping has already been fixed by hand in Settings.
-- =============================================================================

update public.nozzles n
   set tank_id = t.id
  from public.tanks t
 where t.fuel_type = (case when n.unit_number = 1 then 'diesel' else 'petrol' end)::public.fuel_type
   and n.tank_id is distinct from t.id;

-- ===================================================================== 014_clear_day_and_reset.sql
-- =============================================================================
-- 014_clear_day_and_reset.sql
--
-- Two ways to undo entry mistakes:
--
--   clear_day(date)   - wipes one day's nozzle entries so it can be redone.
--                       Permanent feature; the mistake it fixes does not stop
--                       happening when testing ends.
--   reset_all_data()  - empties the books completely. Scaffolding for the
--                       testing phase; the app only shows the button for it
--                       when ALLOW_FULL_RESET is set, so removing that one
--                       environment variable retires it.
--
-- Both are SECURITY DEFINER with their own is_super_admin() check, like the
-- reporting functions. Staff must not be able to reach either.
--
-- THE CREDIT SLIP PROBLEM. Deleting a reading cascades to its credit slips,
-- and ledger_entries pointed at those slips with ON DELETE RESTRICT - so any
-- day where somebody took fuel on credit could not be cleared at all. That is
-- exactly the day most likely to be wrong.
--
-- The fix is not to erase the ledger. The FK becomes ON DELETE SET NULL, the
-- append-only trigger gains a second narrow exception for that column, and
-- clear_day posts an offsetting credit for every slip it removes. The original
-- debit stays on the customer's account, the reversal sits beside it, and the
-- balance comes back to correct - which is what the app already tells you to do
-- when you try to edit a ledger entry by hand.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Let a deleted credit slip release its ledger entry
-- ---------------------------------------------------------------------------
alter table public.ledger_entries
  drop constraint if exists ledger_entries_credit_sale_id_fkey;

alter table public.ledger_entries
  add constraint ledger_entries_credit_sale_id_fkey
  foreign key (credit_sale_id) references public.credit_sales (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Widen the append-only exception to cover it
--
-- Migration 011 allowed created_by to be nulled when a profile is deleted.
-- credit_sale_id needs the same treatment for the same reason: a foreign key
-- releasing its reference is not an edit to the entry. Both columns may go to
-- null; every other column must be byte-for-byte identical, so this still
-- cannot be used as a way in to change an amount, a date or a customer.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'created_by' - 'credit_sale_id'
       = to_jsonb(old) - 'created_by' - 'credit_sale_id'
     and (new.created_by     is not distinct from old.created_by     or new.created_by     is null)
     and (new.credit_sale_id is not distinct from old.credit_sale_id or new.credit_sale_id is null)
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
  'created_by and credit_sale_id being nulled when the row they point at is '
  'deleted; no other column may change.';

-- ---------------------------------------------------------------------------
-- 3. Clear one day
-- ---------------------------------------------------------------------------
create or replace function public.clear_day(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_readings int;
  v_slips    int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may clear a day' using errcode = '42501';
  end if;

  -- Reverse first, delete second. If the delete fails the whole thing rolls
  -- back together, so a reversal can never be left behind without its cause.
  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by)
  select cs.customer_id, 'credit', cs.amount, p_date,
         'Reversal - the nozzle entries for ' || to_char(p_date, 'DD Mon YYYY')
           || ' were cleared and will be re-entered',
         auth.uid()
    from public.credit_sales cs
    join public.nozzle_readings nr on nr.id = cs.reading_id
   where nr.reading_date = p_date;

  get diagnostics v_slips = row_count;

  delete from public.nozzle_readings where reading_date = p_date;
  get diagnostics v_readings = row_count;

  return jsonb_build_object('readings', v_readings, 'slips_reversed', v_slips);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Empty the books
--
-- Kept: the logins, the tanks and their capacities, the nozzles and their
-- starting meter readings. Those describe the pump itself, not its trading -
-- re-typing them after every test round would be busywork.
--
-- The trigger comes off only inside this function, which runs as the table
-- owner, and goes back on before it returns. The app's own role cannot do this
-- on its own, which is the point.
-- ---------------------------------------------------------------------------
create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may reset the data' using errcode = '42501';
  end if;

  v_counts := jsonb_build_object(
    'readings',  (select count(*) from public.nozzle_readings),
    'customers', (select count(*) from public.customers),
    'purchases', (select count(*) from public.fuel_purchases),
    'expenses',  (select count(*) from public.expenses)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales;
  delete from public.nozzle_readings;
  delete from public.stock_checks;
  delete from public.fuel_purchases;
  delete from public.expenses;
  delete from public.customers;
  delete from public.fuel_prices;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today();

  return v_counts;
end;
$$;

revoke execute on function public.clear_day(date)   from public, anon;
revoke execute on function public.reset_all_data()  from public, anon;
grant  execute on function public.clear_day(date)   to authenticated;
grant  execute on function public.reset_all_data()  to authenticated;

-- ===================================================================== 015_delete_reading_reverses_slips.sql
-- =============================================================================
-- 015_delete_reading_reverses_slips.sql
--
-- Closes a hole that migration 014 opened.
--
-- Before 014, ledger_entries.credit_sale_id was ON DELETE RESTRICT, so deleting
-- a single reading that had credit slips simply failed - and the app caught
-- that and told the owner to post an offsetting entry by hand.
--
-- 014 changed that FK to SET NULL so a whole day could be cleared. The side
-- effect: deleting ONE reading now succeeds quietly, taking the credit slip
-- with it and leaving the customer's debit standing on the ledger with nothing
-- to cancel it. The customer would appear to owe money for fuel the books no
-- longer show them taking.
--
-- So the single-reading delete gets the same treatment as clear_day: reverse
-- first, delete second, both in one transaction.
-- =============================================================================

create or replace function public.delete_reading(p_reading_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date;
  v_slips int;
  v_gone  int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may delete a reading' using errcode = '42501';
  end if;

  select reading_date into v_date
    from public.nozzle_readings where id = p_reading_id;

  if v_date is null then
    raise exception 'That reading no longer exists' using errcode = 'P0002';
  end if;

  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by)
  select cs.customer_id, 'credit', cs.amount, v_date,
         'Reversal - the nozzle entry for ' || to_char(v_date, 'DD Mon YYYY')
           || ' was deleted',
         auth.uid()
    from public.credit_sales cs
   where cs.reading_id = p_reading_id;

  get diagnostics v_slips = row_count;

  delete from public.nozzle_readings where id = p_reading_id;
  get diagnostics v_gone = row_count;

  return jsonb_build_object('deleted', v_gone, 'slips_reversed', v_slips);
end;
$$;

revoke execute on function public.delete_reading(uuid) from public, anon;
grant  execute on function public.delete_reading(uuid) to authenticated;

-- ===================================================================== 016_reset_all_data_safeupdate.sql
-- =============================================================================
-- 016_reset_all_data_safeupdate.sql
--
-- Fixes "DELETE requires a WHERE clause" when emptying the books.
--
-- Supabase preloads the `safeupdate` library into every connection the app
-- makes. Check it for yourself:
--
--   select rolname, rolconfig from pg_roles where rolname = 'authenticator';
--   -- {"session_preload_libraries=supautils, safeupdate", ...}
--
-- It rejects any UPDATE or DELETE written without a WHERE clause - the guard
-- against the classic slip of running `delete from customers` and taking the
-- table with it. reset_all_data() means exactly that, every row, so it was
-- written the obvious way and was refused on its first statement every time.
--
-- SECURITY DEFINER does not get around it. The check runs when the statement is
-- parsed, before privileges are looked at, and the library is loaded into the
-- session by the role the connection is made with - not the role the function
-- runs as. Nothing about this function's rights was ever the problem.
--
-- clear_day() was never affected: every statement in it is already narrowed to
-- one date.
--
-- The fix is `where true`. It reads as the deliberate "yes, all of them" that
-- this function actually means, and the guard is satisfied by a WHERE clause
-- being present. Only the statements changed; the behaviour is the one
-- migration 014 described.
-- =============================================================================

create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may reset the data' using errcode = '42501';
  end if;

  v_counts := jsonb_build_object(
    'readings',  (select count(*) from public.nozzle_readings),
    'customers', (select count(*) from public.customers),
    'purchases', (select count(*) from public.fuel_purchases),
    'expenses',  (select count(*) from public.expenses)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries where true;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales     where true;
  delete from public.nozzle_readings  where true;
  delete from public.stock_checks     where true;
  delete from public.fuel_purchases   where true;
  delete from public.expenses         where true;
  delete from public.customers        where true;
  delete from public.fuel_prices      where true;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  return v_counts;
end;
$$;

comment on function public.reset_all_data() is
  'Empties the books, keeping logins, tanks and nozzles. Testing scaffolding - '
  'the app only offers it while ALLOW_FULL_RESET is set. Every statement carries '
  'an explicit WHERE TRUE because Supabase preloads safeupdate, which refuses '
  'WHERE-less UPDATE and DELETE.';

revoke execute on function public.reset_all_data() from public, anon;
grant  execute on function public.reset_all_data() to authenticated;

-- ===================================================================== 017_tank_opening_stock_within_capacity.sql
-- =============================================================================
-- 017_tank_opening_stock_within_capacity.sql
--
-- A tank cannot hold more than it holds.
--
-- Both tanks were saved above their own capacity - 50,000 L in a 25,000 L
-- petrol tank, 60,000 L in a 50,000 L diesel one - because nothing checked the
-- two figures against each other. updateTank now refuses it, and the settings
-- form shows the overflow as it is typed. This is the last line: the same rule
-- stated in the schema, so it holds for anything that writes to the table,
-- including SQL run by hand.
--
-- APPLY THIS ONLY ONCE BOTH TANKS ARE VALID. Correct them under Settings first
-- - either lower the opening stock or raise the capacity, whichever is the
-- wrong number. The guard below refuses to run while any row still violates the
-- rule, and names the offenders rather than failing with a bare constraint
-- error.
--
-- The order matters and is not fussiness. A CHECK constraint is re-evaluated
-- against the whole row on every UPDATE, not just the columns being written -
-- so adding it while a row is invalid would make the daily readings fail the
-- moment one of them updated that tank's current_stock_litres. Clean data
-- first, constraint second, and that cannot happen.
--
-- Only opening stock is constrained. current_stock_litres is deliberately left
-- alone: it is written by the stock triggers as readings and deliveries land,
-- and a constraint there would turn a mistyped delivery into a failed day's
-- entry rather than a number somebody can see and correct.
-- =============================================================================

do $$
declare
  v_offenders text;
begin
  select string_agg(
           format('%s (%s L opening in a %s L tank)',
                  name, opening_stock_litres, capacity_litres),
           ', ' order by name)
    into v_offenders
    from public.tanks
   where opening_stock_litres > capacity_litres;

  if v_offenders is not null then
    raise exception 'Cannot add the capacity rule yet - these tanks break it: %', v_offenders
      using hint = 'Fix them under Settings -> Tanks first. Lower the opening stock, '
                   'or raise the capacity if the tank really is bigger.';
  end if;
end $$;

alter table public.tanks
  drop constraint if exists tanks_opening_stock_within_capacity;

alter table public.tanks
  add constraint tanks_opening_stock_within_capacity
  check (opening_stock_litres <= capacity_litres);

comment on constraint tanks_opening_stock_within_capacity on public.tanks is
  'Opening stock is the baseline every later litre is measured against. Above '
  'capacity it overstates the fuel on hand from that day onward, and the '
  'dashboard reports stock that was never in the ground.';

-- ===================================================================== 018_bank_accounts.sql
-- =============================================================================
-- 018_bank_accounts.sql
--
-- The owner's bank accounts, and the money moving through them.
--
-- What this models: cash from the pump is paid into a bank account, and pump
-- costs - fuel deliveries, salaries, the electricity bill - are paid out of it
-- by online transfer. Two questions have to be answerable at any moment:
-- how much has been put in, and how much is left.
--
-- THE 60-ENTRY CAP. Only the 60 most recent transactions per account are kept;
-- older ones are removed automatically as new ones arrive. Deleting rows out of
-- something that is summed is normally how a balance goes quietly wrong, so the
-- amounts are not simply thrown away: as each row is removed its value is
-- folded into pruned_deposits / pruned_payments on the account. The balance and
-- the lifetime deposit total are therefore exact forever, and what the cap
-- actually costs is the itemised history beyond the last 60 - which is the
-- trade that was asked for. Anything older than that should already be in the
-- month's Excel export, which is written before the rows age out.
-- =============================================================================

-- deposit = money put into the bank. payment = money sent out of it.
create type public.bank_txn_type as enum ('deposit', 'payment');

-- ---------------------------------------------------------------------------
-- bank_accounts
--
-- opening_balance is what was in the account when it was added to this app, so
-- the running balance means something from day one rather than starting at zero
-- under an account that already held money.
--
-- The pruned_* columns are the memory of everything the 60-entry cap has
-- removed. They only ever grow, and only the trim trigger writes them.
-- ---------------------------------------------------------------------------
create table public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  bank_name       text not null check (length(btrim(bank_name)) > 0),
  account_label   text not null check (length(btrim(account_label)) > 0),
  account_number  text,
  opening_balance numeric(14, 2) not null default 0,
  pruned_deposits numeric(14, 2) not null default 0 check (pruned_deposits >= 0),
  pruned_payments numeric(14, 2) not null default 0 check (pruned_payments >= 0),
  pruned_count    integer        not null default 0 check (pruned_count >= 0),
  created_at      timestamptz    not null default now()
);

comment on table public.bank_accounts is
  'A bank account the pump''s money passes through. Deleting one removes its '
  'transactions with it.';

comment on column public.bank_accounts.pruned_deposits is
  'Deposits removed by the 60-entry cap. Added to the retained rows so the '
  'balance stays exact after old detail is dropped. Written only by the trim '
  'trigger.';

-- ---------------------------------------------------------------------------
-- bank_transactions
--
-- category is free text on a payment - fuel, salaries, electricity - and is
-- left null on a deposit, where it would say nothing.
-- ---------------------------------------------------------------------------
create table public.bank_transactions (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts (id) on delete cascade,
  txn_type   public.bank_txn_type not null,
  amount     numeric(14, 2) not null check (amount > 0),
  txn_date   date not null,
  category   text,
  note       text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The order the cap works in, and the order the page reads in. One index does
-- both.
create index bank_transactions_account_date_idx
  on public.bank_transactions (account_id, txn_date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- The 60-entry cap
--
-- Runs after each insert. Deletes everything past the 60 most recent for that
-- account and folds what it deleted into the account's pruned_* totals, in one
-- statement - the DELETE ... RETURNING is what the totals are computed from, so
-- a row can never be dropped without being counted.
-- ---------------------------------------------------------------------------
create or replace function public.trim_bank_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposits numeric(14, 2);
  v_payments numeric(14, 2);
  v_count    integer;
begin
  with doomed as (
    delete from public.bank_transactions
     where id in (
             select id
               from public.bank_transactions
              where account_id = new.account_id
              order by txn_date desc, created_at desc, id desc
             offset 60
           )
    returning txn_type, amount
  )
  select coalesce(sum(amount) filter (where txn_type = 'deposit'), 0),
         coalesce(sum(amount) filter (where txn_type = 'payment'), 0),
         count(*)
    into v_deposits, v_payments, v_count
    from doomed;

  if v_count > 0 then
    update public.bank_accounts
       set pruned_deposits = pruned_deposits + v_deposits,
           pruned_payments = pruned_payments + v_payments,
           pruned_count    = pruned_count + v_count
     where id = new.account_id;
  end if;

  return null;
end;
$$;

comment on function public.trim_bank_transactions() is
  'Keeps the 60 most recent transactions per account, folding the value of '
  'anything it removes into the account so the balance stays exact.';

create trigger bank_transactions_trim
  after insert on public.bank_transactions
  for each row execute function public.trim_bank_transactions();

-- ---------------------------------------------------------------------------
-- What the app actually reads
--
-- security_invoker so the row policies below still apply - a view is otherwise
-- read with its owner's rights, which would hand the data to anyone who can
-- select from it.
-- ---------------------------------------------------------------------------
create or replace view public.bank_account_balances
with (security_invoker = true) as
select a.id,
       a.bank_name,
       a.account_label,
       a.account_number,
       a.opening_balance,
       a.pruned_count,
       a.created_at,
       a.pruned_deposits
         + coalesce(sum(t.amount) filter (where t.txn_type = 'deposit'), 0) as total_deposited,
       a.pruned_payments
         + coalesce(sum(t.amount) filter (where t.txn_type = 'payment'), 0) as total_paid,
       a.opening_balance
         + a.pruned_deposits - a.pruned_payments
         + coalesce(sum(t.amount) filter (where t.txn_type = 'deposit'), 0)
         - coalesce(sum(t.amount) filter (where t.txn_type = 'payment'), 0) as balance,
       count(t.id) as kept_count
  from public.bank_accounts a
  left join public.bank_transactions t on t.account_id = a.id
 group by a.id;

comment on view public.bank_account_balances is
  'Each account with its balance and lifetime totals. Includes what the '
  '60-entry cap removed, so the figures do not change when old detail ages out.';

-- ---------------------------------------------------------------------------
-- Row Level Security - the owner only, in every direction.
--
-- This is his own bank money, not pump operations. Staff record readings and
-- deliveries; they have no business seeing what is in the account, the same way
-- expenses are already closed to them because they feed profit.
-- ---------------------------------------------------------------------------
alter table public.bank_accounts     enable row level security;
alter table public.bank_transactions enable row level security;

create policy "bank accounts: super admin only"
  on public.bank_accounts for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "bank transactions: super admin only"
  on public.bank_transactions for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.bank_accounts     to authenticated;
grant select, insert, update, delete on public.bank_transactions to authenticated;
grant select                         on public.bank_account_balances to authenticated;

-- ===================================================================== 019_month_export_with_banking.sql
-- =============================================================================
-- 019_month_export_with_banking.sql
--
-- Adds the bank movements to the monthly export.
--
-- This is not only a convenience. The Banking page keeps the last 60
-- transactions per account and drops older ones automatically, so the month's
-- workbook is what makes the detail durable - it is written from the rows while
-- they still exist. Take the report each month and nothing is ever actually
-- lost; skip it and the itemised history really is gone once 60 is passed.
--
-- Three additions, everything else is migration 010 unchanged:
--   bank_rows      - every deposit and payment dated in the month
--   bank_accounts  - where each account stands as the report is taken
--   bank_month     - the month's totals in and out
-- =============================================================================

create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14,2);
  v_cost     numeric(14,2);
  v_expenses numeric(14,2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;
  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;
  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'profit', round(v_sales - v_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',           day,
               'litres_sold',   litres_sold,
               'petrol_litres', petrol_litres,
               'diesel_litres', diesel_litres,
               'sale_amount',   sale_amount,
               'cash_amount',   cash_amount,
               'credit_amount', credit_amount
             ) order by day)
      from (
        select d::date                                                              as day,
               coalesce(sum(nr.litres_sold), 0)                                     as litres_sold,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres,
               coalesce(sum(nr.sale_amount), 0)                                     as sale_amount,
               coalesce(sum(nr.cash_amount), 0)                                     as cash_amount,
               coalesce(sum(nr.credit_amount), 0)                                   as credit_amount
          from generate_series(v_from, v_to, interval '1 day') d
          left join public.nozzle_readings nr on nr.reading_date = d::date
          left join public.nozzles n on n.id = nr.nozzle_id
          left join public.tanks   t on t.id = n.tank_id
         group by d
      ) per_day
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', fp.purchase_date, 'tank', t.name, 'fuel_type', t.fuel_type,
               'supplier', fp.supplier_name, 'invoice', fp.invoice_number,
               'litres', fp.quantity_litres, 'rate', fp.rate, 'cost', fp.total_cost,
               'payment_status', fp.payment_status
             ) order by fp.purchase_date, fp.created_at)
      from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
      where fp.purchase_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb),

    -- Every bank movement in the month, itemised. Written before the 60-entry
    -- cap can reach these rows, so the workbook is the durable record once they
    -- age off the Banking page.
    'bank_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', bt.txn_date, 'account', ba.account_label, 'bank', ba.bank_name,
               'direction', bt.txn_type, 'category', bt.category,
               'note', bt.note, 'amount', bt.amount
             ) order by bt.txn_date, bt.created_at)
      from public.bank_transactions bt
      join public.bank_accounts ba on ba.id = bt.account_id
      where bt.txn_date between v_from and v_to
    ), '[]'::jsonb),

    -- Where each account stood when the report was taken.
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', b.account_label, 'bank', b.bank_name,
               'balance', b.balance, 'total_deposited', b.total_deposited,
               'total_paid', b.total_paid
             ) order by b.created_at)
      from public.bank_account_balances b
    ), '[]'::jsonb),

    'bank_month', (
      select jsonb_build_object(
               'deposits', coalesce(sum(bt.amount) filter (where bt.txn_type = 'deposit'), 0),
               'payments', coalesce(sum(bt.amount) filter (where bt.txn_type = 'payment'), 0)
             )
        from public.bank_transactions bt where bt.txn_date between v_from and v_to
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_month_export(int, int) from public, anon;
grant  execute on function public.get_month_export(int, int) to authenticated;

-- ===================================================================== 020_bank_no_overdraw.sql
-- =============================================================================
-- 020_bank_no_overdraw.sql
--
-- Money out may not exceed the money there is.
--
-- The rule is deliberately across ALL accounts together, not per account: the
-- owner treats the two as one pot and moves money between them, so a payment
-- from one covered by cash sitting in the other is normal and should not be
-- refused. What is refused is paying out more than exists anywhere.
--
-- "The money there is" is every account's opening balance, plus everything paid
-- in, minus everything paid out - including the amounts the 60-entry cap has
-- already folded into pruned_deposits / pruned_payments. Old detail ageing off
-- the page therefore does not quietly free up headroom.
--
-- WHY ONLY ON INSERT. A payment being recorded is the thing worth stopping, and
-- it is stopped before it lands. Deletes are left alone on purpose:
--
--   * deleting a transaction is how a mistake gets corrected, and blocking a
--     correction because the books are already wrong traps the owner - he would
--     have to unpick entries in an exact order to get back to a legal state
--   * an account delete cascades to its rows, and a per-row delete check would
--     abort that cascade half way through
--
-- A correction can therefore still leave the total negative. That is visible
-- rather than silent: the balance shows in red on the Banking page, and the
-- next payment is refused until it is put right.
-- =============================================================================

create or replace function public.check_bank_funds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available numeric(14, 2);
begin
  -- Money in never needs checking; it can only increase what is there.
  if new.txn_type <> 'payment' then
    return new;
  end if;

  select coalesce(sum(a.opening_balance + a.pruned_deposits - a.pruned_payments), 0)
       + coalesce((
           select sum(case when t.txn_type = 'deposit' then t.amount else -t.amount end)
             from public.bank_transactions t
         ), 0)
    into v_available
    from public.bank_accounts a;

  if new.amount > v_available then
    raise exception
      'That is more than the money in the accounts. Across every account there is Rs %, and this pays out Rs %.',
      trim(to_char(v_available, 'FM999,999,999,990.00')),
      trim(to_char(new.amount,  'FM999,999,999,990.00'))
      using hint = 'Record the deposit that covers it first, or correct the amount.';
  end if;

  return new;
end;
$$;

comment on function public.check_bank_funds() is
  'Refuses a payment larger than the combined balance of every account. Insert '
  'only - deletes are corrections and must stay possible, and an account delete '
  'cascade must not be aborted part way.';

create trigger bank_transactions_check_funds
  before insert on public.bank_transactions
  for each row execute function public.check_bank_funds();

-- ===================================================================== 021_bank_split_payments.sql
-- =============================================================================
-- 021_bank_split_payments.sql
--
-- No account may go negative, and a payment too big for one account can be
-- covered from the others.
--
-- Migration 020 checked the combined balance of every account, which let a
-- single account go overdrawn as long as another held enough to cover it. The
-- rule is now per account: each one must stand up on its own. That is strictly
-- stronger - if no account is negative the total cannot be either - so the
-- combined check is replaced rather than kept alongside.
--
-- Refusing more often needs a way through, which is what record_bank_payment()
-- is for. A payment larger than the chosen account takes what that account has
-- and draws the rest from the other accounts the owner picked, in the order he
-- picked them, writing one transaction per account.
--
-- WHY AN RPC AND NOT A LOOP IN THE APP. A split is several inserts that are one
-- payment. Sent one at a time from the app, a failure half way through leaves
-- part of a payment recorded and the books wrong in a way nobody would think to
-- look for. In here they are one statement and one transaction: all of them or
-- none.
--
-- The split is also computed HERE, from the balances as they actually are, and
-- never from figures the browser posted. The form works the same allocation out
-- while the owner types, but that is for showing him - what gets written is
-- decided against the real numbers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One definition of what an account holds, used by everything below.
--
-- Returns the true balance, which may be negative - callers clamp it themselves
-- when they mean "available to draw". Includes what the 60-entry cap folded
-- away, so old detail ageing off the page cannot free up headroom.
-- ---------------------------------------------------------------------------
create or replace function public.bank_account_balance(p_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
           select a.opening_balance + a.pruned_deposits - a.pruned_payments
             from public.bank_accounts a where a.id = p_account_id
         ), 0)
       + coalesce((
           select sum(case when t.txn_type = 'deposit' then t.amount else -t.amount end)
             from public.bank_transactions t where t.account_id = p_account_id
         ), 0);
$$;

comment on function public.bank_account_balance(uuid) is
  'What one account holds: opening balance, plus everything paid in, minus '
  'everything paid out, including amounts the 60-entry cap has folded away. '
  'May be negative.';

-- ---------------------------------------------------------------------------
-- Per-account guard, replacing the combined one from migration 020
-- ---------------------------------------------------------------------------
create or replace function public.check_bank_funds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available numeric(14, 2);
  v_label     text;
begin
  -- Money in never needs checking; it can only increase what is there.
  if new.txn_type <> 'payment' then
    return new;
  end if;

  v_available := greatest(public.bank_account_balance(new.account_id), 0);

  if new.amount > v_available then
    select account_label into v_label from public.bank_accounts where id = new.account_id;

    raise exception
      'That is more than % holds. It has Rs %, and this pays out Rs %.',
      coalesce(v_label, 'this account'),
      trim(to_char(v_available, 'FM999,999,999,990.00')),
      trim(to_char(new.amount,  'FM999,999,999,990.00'))
      using hint = 'Take the rest from another account, or record the deposit that covers it first.';
  end if;

  return new;
end;
$$;

comment on function public.check_bank_funds() is
  'Refuses a payment larger than that one account holds. Insert only - deletes '
  'are corrections and must stay possible, and an account delete cascade must '
  'not be aborted part way.';

-- ---------------------------------------------------------------------------
-- One payment, across as many accounts as it takes
-- ---------------------------------------------------------------------------
create or replace function public.record_bank_payment(
  p_account_id uuid,
  p_amount     numeric,
  p_date       date,
  p_category   text default null,
  p_note       text default null,
  p_cover_ids  uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(14, 2);
  v_order     uuid[];
  v_id        uuid;
  v_take      numeric(14, 2);
  v_available numeric(14, 2);
  v_parts     jsonb := '[]'::jsonb;
  v_count     integer := 0;
  v_part      jsonb;
  v_note      text;
  v_category  text;
  v_labels    text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may record a bank payment' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero.';
  end if;
  if p_date is null then
    raise exception 'Enter the date.';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_account_id) then
    raise exception 'That account no longer exists. Reload the page and try again.';
  end if;

  -- The chosen account first - it is the one the owner meant - then the others
  -- in the order he picked them. The chosen account and any repeats are dropped
  -- from the cover list so no account is drawn on twice.
  v_order := array[p_account_id];
  if p_cover_ids is not null then
    foreach v_id in array p_cover_ids loop
      if v_id is not null and not (v_id = any(v_order)) then
        v_order := v_order || v_id;
      end if;
    end loop;
  end if;

  v_remaining := round(p_amount, 2);

  -- Work out who pays what before writing anything, so a shortfall is refused
  -- with nothing recorded rather than part way through.
  foreach v_id in array v_order loop
    exit when v_remaining <= 0;

    v_available := greatest(public.bank_account_balance(v_id), 0);
    v_take := least(v_remaining, v_available);

    if v_take > 0 then
      v_count  := v_count + 1;
      v_parts  := v_parts || jsonb_build_object('account_id', v_id, 'amount', v_take);
      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  if v_remaining > 0 then
    raise exception
      'Rs % of this payment is not covered by the accounts chosen.',
      trim(to_char(v_remaining, 'FM999,999,999,990.00'))
      using hint = 'Pick another account to take it from, or record the deposit that covers it first.';
  end if;

  v_category := nullif(btrim(coalesce(p_category, '')), '');
  v_note     := nullif(btrim(coalesce(p_note, '')), '');

  -- A split is one payment written as several rows. Saying so on each row is
  -- what makes three entries dated the same day read as one payment later,
  -- rather than three that happen to look similar.
  if v_count > 1 then
    v_note := concat_ws(' · ', v_note,
                format('part of a Rs %s payment split across %s accounts',
                       trim(to_char(round(p_amount, 2), 'FM999,999,999,990.00')), v_count));
  end if;

  for v_part in select * from jsonb_array_elements(v_parts) loop
    insert into public.bank_transactions
      (account_id, txn_type, amount, txn_date, category, note, created_by)
    values
      ((v_part ->> 'account_id')::uuid, 'payment', (v_part ->> 'amount')::numeric,
       p_date, v_category, v_note, auth.uid());
  end loop;

  select string_agg(format('Rs %s from %s',
                           trim(to_char((part ->> 'amount')::numeric, 'FM999,999,999,990.00')),
                           a.account_label), ', ')
    into v_labels
    from jsonb_array_elements(v_parts) part
    join public.bank_accounts a on a.id = (part ->> 'account_id')::uuid;

  return jsonb_build_object(
    'accounts_used', v_count,
    'message', case when v_count > 1
                    then format('Payment recorded across %s accounts: %s.', v_count, v_labels)
                    else format('Payment recorded: %s.', v_labels) end
  );
end;
$$;

comment on function public.record_bank_payment(uuid, numeric, date, text, text, uuid[]) is
  'Records one payment, taking what the chosen account holds and drawing the '
  'rest from the accounts given, in order. All rows or none. The split is '
  'computed here from real balances, never from what the browser posted.';

revoke execute on function public.bank_account_balance(uuid) from public, anon;
revoke execute on function public.record_bank_payment(uuid, numeric, date, text, text, uuid[])
  from public, anon;
grant  execute on function public.bank_account_balance(uuid) to authenticated;
grant  execute on function public.record_bank_payment(uuid, numeric, date, text, text, uuid[])
  to authenticated;

-- ===================================================================== 022_set_nozzle_wiring.sql
-- =============================================================================
-- 022_set_nozzle_wiring.sql
--
-- All six nozzles' tank and starting reading, saved as one action.
--
-- The settings dialog used to carry a Save button per row, which made six
-- separate writes out of what is really a single job done once in the pump's
-- life: describing how the place is plumbed. One button is what the owner
-- expects, and one button means one write.
--
-- WHY AN RPC AND NOT SIX UPDATES FROM THE APP. Same reason record_bank_payment()
-- exists: six statements sent one at a time can fail after the third, leaving
-- half the nozzles pointing at the new tanks and half at the old. That is worse
-- than not saving at all, because nothing on screen says which half took - and
-- tank_id decides which tank a sale draws down, so a half-applied change quietly
-- drains the wrong tank. As one UPDATE it is all six or none.
-- =============================================================================

create or replace function public.set_nozzle_wiring(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change the nozzle wiring' using errcode = '42501';
  end if;

  update public.nozzles n
     set tank_id          = (row_data->>'tank_id')::uuid,
         starting_reading = (row_data->>'starting_reading')::numeric
    from jsonb_array_elements(p_rows) as row_data
   where n.id = (row_data->>'nozzle_id')::uuid;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_nozzle_wiring(jsonb) from public, anon;
grant  execute on function public.set_nozzle_wiring(jsonb) to authenticated;

-- ===================================================================== 023_purchase_total_is_the_input.sql
-- =============================================================================
-- 023_purchase_total_is_the_input.sql
--
-- Swaps which of a delivery's two money figures is the recorded fact.
--
-- Before: rate was typed in and total_cost was generated as litres x rate.
-- After:  total_cost is typed in and rate is generated as total_cost / litres.
--
-- WHY. The delivery note from the OMC states litres and an amount payable. That
-- amount is what leaves the bank, and it is what monthly profit is computed
-- from - so it is the fact, and the rate is a convenience derived from it.
--
-- Asking for the rate instead forced the owner to divide by hand, and could not
-- represent his invoice exactly: rate is numeric(10,2), so on a 20,000 litre
-- load every stored total was pinned to a multiple of 20,000 x 0.01 = Rs 200.
-- An invoice of Rs 4,800,010 could only be stored as Rs 4,800,000. Small, but
-- it is the books disagreeing with the paperwork, silently, on every load that
-- did not divide cleanly.
--
-- The derived rate keeps 4 decimals rather than 2. It is display-only now, and
-- rounding it to paisa would make a 20,000 litre load's implied total drift
-- from the total actually stored - the very thing this migration removes.
--
-- Nothing is lost converting: total_cost already held round(litres x rate, 2)
-- for every existing row, so copying it into a real column preserves each one
-- exactly, and the rate those rows show afterwards is the same figure they were
-- entered with (to within the extra decimals it can now carry).
-- =============================================================================

-- 1. total_cost becomes a real, stored column, carrying its existing values.
alter table public.fuel_purchases add column total_cost_input numeric(14, 2);

update public.fuel_purchases set total_cost_input = total_cost;

alter table public.fuel_purchases drop column total_cost;
alter table public.fuel_purchases rename column total_cost_input to total_cost;

alter table public.fuel_purchases
  alter column total_cost set not null;

alter table public.fuel_purchases
  add constraint fuel_purchases_total_cost_positive check (total_cost > 0);

-- 2. rate becomes generated from it. Dropping the old column takes its
--    check constraint with it; a generated rate cannot be non-positive anyway,
--    since both columns it divides are constrained positive.
alter table public.fuel_purchases drop column rate;

alter table public.fuel_purchases
  add column rate numeric(12, 4)
  generated always as (round(total_cost / quantity_litres, 4)) stored;

comment on column public.fuel_purchases.total_cost is
  'The amount on the delivery note - the recorded fact, typed in as it appears.';
comment on column public.fuel_purchases.rate is
  'Derived: total_cost / quantity_litres. For display only; never entered.';

-- ===================================================================== 024_lubricants.sql
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

-- ===================================================================== 025_lubricants_in_reports.sql
-- =============================================================================
-- 025_lubricants_in_reports.sql
--
-- Puts lubricants into every figure that is supposed to describe the whole
-- business: the dashboard's day, the day-by-day trend, the monthly report and
-- the Excel export. Plus the full reset, which is meant to empty the books and
-- would otherwise leave the lubricant shelf behind.
--
-- THE PROFIT LINE CHANGES. It was:
--
--     profit = fuel sales - fuel bought - expenses
--
-- and is now:
--
--     profit = fuel sales + lubricant sales
--            - fuel bought - lubricants bought
--            - expenses
--
-- A pump that sells Rs 200,000 of oil a month and reports none of it is not
-- reporting its profit, so this is a correction rather than an addition. The
-- cash-basis caveat is unchanged and now applies to both: stock BOUGHT in the
-- month is counted, not stock sold from the shelf, which is why closing stock
-- is reported beside it.
--
-- clear_day() is deliberately NOT extended to lubricant sales. It exists for
-- the one mistake that cannot be unpicked row by row - a whole day of nozzle
-- meters entered wrongly - while deliveries, expenses and now lubricant sales
-- are each deleted on their own screen, where you can see what you are
-- removing. A counter sale is one row, so it belongs in that second group.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The dashboard's day
--
-- Body is migration 008's, with the lubricant block added at the end.
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
      left join public.stock_checks sc on sc.tank_id = t.id and sc.check_date = p_date
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
-- Day-by-day trend
--
-- Two columns added, so the function has to be dropped and recreated - Postgres
-- will not replace a set-returning function whose output columns changed.
--
-- The per-day figures now come from lateral aggregates rather than one big
-- group-by. Joining lubricant sales onto the same rows as nozzle readings would
-- have multiplied one against the other and inflated both.
-- ---------------------------------------------------------------------------
drop function if exists public.get_sales_trend(date, date);

create function public.get_sales_trend(p_from date, p_to date)
returns table (
  day              date,
  litres_sold      numeric,
  sale_amount      numeric,
  cash_amount      numeric,
  credit_amount    numeric,
  petrol_litres    numeric,
  diesel_litres    numeric,
  lubricant_litres numeric,
  lubricant_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports' using errcode = '42501';
  end if;

  return query
  select d::date,
         f.litres_sold,
         f.sale_amount,
         f.cash_amount,
         f.credit_amount,
         f.petrol_litres,
         f.diesel_litres,
         lu.litres,
         lu.amount
    from generate_series(p_from, p_to, interval '1 day') d
    left join lateral (
      select coalesce(sum(nr.litres_sold), 0)::numeric   as litres_sold,
             coalesce(sum(nr.sale_amount), 0)::numeric   as sale_amount,
             coalesce(sum(nr.cash_amount), 0)::numeric   as cash_amount,
             coalesce(sum(nr.credit_amount), 0)::numeric as credit_amount,
             coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0)::numeric as petrol_litres,
             coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0)::numeric as diesel_litres
        from public.nozzle_readings nr
        join public.nozzles n on n.id = nr.nozzle_id
        join public.tanks   t on t.id = n.tank_id
       where nr.reading_date = d::date
    ) f on true
    left join lateral (
      select coalesce(sum(ls.litres), 0)::numeric as litres,
             coalesce(sum(ls.amount), 0)::numeric as amount
        from public.lubricant_sales ls
       where ls.sale_date = d::date
    ) lu on true
   order by d;
end;
$$;

revoke execute on function public.get_sales_trend(date, date) from public, anon;
grant  execute on function public.get_sales_trend(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The monthly report
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
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      )
      from public.lubricant_sales ls where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0)
      )
      from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to
    ),
    -- One line per product: what it sold, what was restocked, and what is left
    -- on the shelf at month end. Products with no movement in the month are
    -- left out; the Stock page is where the whole shelf is listed.
    'lubricants_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lubricant_id',   s.id,
               'name',           s.name,
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

revoke execute on function public.get_monthly_report(int, int) from public, anon;
grant  execute on function public.get_monthly_report(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The Excel export
--
-- Migration 019's body, with lubricants added in four places:
--   daily          - two more columns per day, for the workbook's Daily sheet
--   purchase_rows  - lubricant deliveries join the fuel ones, so the workbook's
--                    Purchases sheet is every purchase, which is what the
--                    Purchases screen now shows too
--   lubricant_rows - every counter sale in the month, itemised
--   lubricant_stock- what is left on the shelf at month end
-- ---------------------------------------------------------------------------
create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from      date;
  v_to        date;
  v_sales     numeric(14,2);
  v_cost      numeric(14,2);
  v_expenses  numeric(14,2);
  v_lub_sales numeric(14,2);
  v_lub_cost  numeric(14,2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
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
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      ) from public.lubricant_sales ls where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0)
      ) from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit', round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',              d::date,
               'litres_sold',      f.litres_sold,
               'petrol_litres',    f.petrol_litres,
               'diesel_litres',    f.diesel_litres,
               'sale_amount',      f.sale_amount,
               'cash_amount',      f.cash_amount,
               'credit_amount',    f.credit_amount,
               'lubricant_litres', lu.litres,
               'lubricant_amount', lu.amount
             ) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join lateral (
        select coalesce(sum(nr.litres_sold), 0)   as litres_sold,
               coalesce(sum(nr.sale_amount), 0)   as sale_amount,
               coalesce(sum(nr.cash_amount), 0)   as cash_amount,
               coalesce(sum(nr.credit_amount), 0) as credit_amount,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = d::date
      ) f on true
      left join lateral (
        select coalesce(sum(ls.litres), 0) as litres,
               coalesce(sum(ls.amount), 0) as amount
          from public.lubricant_sales ls
         where ls.sale_date = d::date
      ) lu on true
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    -- What is left on the lubricant shelf at month end. Kept beside the tanks'
    -- closing stock for the same reason: it is money sitting in stock rather
    -- than profit that was never made.
    'lubricant_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           l.name,
               'closing_litres', public.calculate_lubricant_stock(l.id, v_to)
             ) order by l.name)
      from public.lubricants l
      where l.is_active
         or exists (select 1 from public.lubricant_sales ls
                     where ls.lubricant_id = l.id and ls.sale_date between v_from and v_to)
    ), '[]'::jsonb),

    -- Fuel and lubricant deliveries in one list, ordered by date. `item` is the
    -- tank for fuel and the product for a lubricant, so the sheet reads down
    -- one column either way.
    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', r.date, 'tank', r.item, 'fuel_type', r.kind,
               'supplier', r.supplier, 'invoice', r.invoice,
               'litres', r.litres, 'rate', r.rate, 'cost', r.cost,
               'payment_status', r.payment_status
             ) order by r.date, r.created_at)
      from (
        select fp.purchase_date as date, t.name as item, t.fuel_type::text as kind,
               fp.supplier_name as supplier, fp.invoice_number as invoice,
               fp.quantity_litres as litres, fp.rate, fp.total_cost as cost,
               fp.payment_status::text as payment_status, fp.created_at
          from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
         where fp.purchase_date between v_from and v_to
        union all
        select lp.purchase_date, l.name, 'lubricant',
               lp.supplier_name, lp.invoice_number,
               lp.quantity_litres, lp.rate, lp.total_cost,
               lp.payment_status::text, lp.created_at
          from public.lubricant_purchases lp join public.lubricants l on l.id = lp.lubricant_id
         where lp.purchase_date between v_from and v_to
      ) r
    ), '[]'::jsonb),

    -- Every counter sale in the month, itemised.
    'lubricant_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', ls.sale_date, 'name', l.name,
               'litres', ls.litres, 'rate', ls.rate_per_litre, 'amount', ls.amount,
               'cash_amount', ls.cash_amount, 'credit_amount', ls.credit_amount,
               'customer', c.name, 'note', ls.note
             ) order by ls.sale_date, ls.created_at)
      from public.lubricant_sales ls
      join public.lubricants l on l.id = ls.lubricant_id
      left join public.customers c on c.id = ls.customer_id
      where ls.sale_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb),

    -- Every bank movement in the month, itemised. Written before the 60-entry
    -- cap can reach these rows, so the workbook is the durable record once they
    -- age off the Banking page.
    'bank_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', bt.txn_date, 'account', ba.account_label, 'bank', ba.bank_name,
               'direction', bt.txn_type, 'category', bt.category,
               'note', bt.note, 'amount', bt.amount
             ) order by bt.txn_date, bt.created_at)
      from public.bank_transactions bt
      join public.bank_accounts ba on ba.id = bt.account_id
      where bt.txn_date between v_from and v_to
    ), '[]'::jsonb),

    -- Where each account stood when the report was taken.
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', b.account_label, 'bank', b.bank_name,
               'balance', b.balance, 'total_deposited', b.total_deposited,
               'total_paid', b.total_paid
             ) order by b.created_at)
      from public.bank_account_balances b
    ), '[]'::jsonb),

    'bank_month', (
      select jsonb_build_object(
               'deposits', coalesce(sum(bt.amount) filter (where bt.txn_type = 'deposit'), 0),
               'payments', coalesce(sum(bt.amount) filter (where bt.txn_type = 'payment'), 0)
             )
        from public.bank_transactions bt where bt.txn_date between v_from and v_to
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_month_export(int, int) from public, anon;
grant  execute on function public.get_month_export(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The full reset
--
-- Sales and deliveries go, the product list stays with its stock zeroed - the
-- same rule the tanks are treated under. Which brands the pump stocks describes
-- the pump, not its trading, and re-typing the shelf after every test round is
-- exactly the busywork migration 014 set out to avoid.
--
-- Every statement carries an explicit WHERE TRUE, because Supabase preloads
-- safeupdate, which refuses WHERE-less UPDATE and DELETE - see migration 016.
-- ---------------------------------------------------------------------------
create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may reset the data' using errcode = '42501';
  end if;

  v_counts := jsonb_build_object(
    'readings',        (select count(*) from public.nozzle_readings),
    'customers',       (select count(*) from public.customers),
    'purchases',       (select count(*) from public.fuel_purchases),
    'expenses',        (select count(*) from public.expenses),
    'lubricant_sales', (select count(*) from public.lubricant_sales)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries where true;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales        where true;
  delete from public.nozzle_readings     where true;
  delete from public.stock_checks        where true;
  delete from public.fuel_purchases      where true;
  delete from public.lubricant_sales     where true;
  delete from public.lubricant_purchases where true;
  delete from public.expenses            where true;
  delete from public.customers           where true;
  delete from public.fuel_prices         where true;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  update public.lubricants
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  return v_counts;
end;
$$;

comment on function public.reset_all_data() is
  'Empties the books, keeping logins, tanks, nozzles and the lubricant product '
  'list. Testing scaffolding - the app only offers it while ALLOW_FULL_RESET is '
  'set. Every statement carries an explicit WHERE TRUE because Supabase '
  'preloads safeupdate, which refuses WHERE-less UPDATE and DELETE.';

revoke execute on function public.reset_all_data() from public, anon;
grant  execute on function public.reset_all_data() to authenticated;

-- ===================================================================== 026_readings_may_not_overlap.sql
-- A nozzle's readings may not overlap each other.
--
-- WHY THIS EXISTS. On 07 Aug 2026 a day's six readings were entered at 13:15
-- dated the 7th, and the same meter figures were entered again at 17:35 dated
-- the 6th. Nothing removed the first set, so one movement of the meters was
-- recorded as two days: about 1,678 litres and Rs 577,000 of fuel counted
-- twice, on every nozzle.
--
-- The app did warn, in the entry dialog, and the warning was correct. It was
-- also ignorable, and it was sitting under six red "Check" badges that were
-- firing on every row of every past day. A warning that can be clicked past is
-- the wrong tool for the one mistake that silently doubles money, so this is
-- now a rule in the database, where no amount of application code can get
-- around it.
--
-- WHAT IS BLOCKED, PRECISELY. A meter only ever moves forwards, so two
-- readings for the same nozzle describe two separate spans of it. They overlap
-- - and therefore double-count - when a later reading starts before an earlier
-- one finished:
--
--     06 Aug   1,987,128.80 -> 1,987,279.95
--     07 Aug   1,987,128.80 -> 1,987,279.95     <- starts where the 6th started
--
-- A GAP IS STILL ALLOWED. If a later reading starts *after* an earlier one
-- finished, litres are missing rather than duplicated - which is what a
-- skipped day or a replaced meter looks like, and blocking it would trap
-- someone with no way forward. Those stay warnings in the dialog, as they
-- were. Only overlap, which cannot be honest, is refused.

create or replace function public.check_reading_does_not_overlap()
returns trigger
language plpgsql
as $$
declare
  v_next   record;
  v_prev   record;
begin
  -- The reading immediately after this one, if any.
  select reading_date, opening_reading
    into v_next
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date > new.reading_date
   order by reading_date asc
   limit 1;

  if found and v_next.opening_reading < new.closing_reading then
    raise exception
      'This day would overlap the reading already saved for %. That one starts at %, before this day closes at %, so the same % litres would be counted on both days. Clear % on Readings first, then enter this day again.',
      to_char(v_next.reading_date, 'DD Mon YYYY'),
      trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
      trim(to_char(new.closing_reading,    'FM9999999990.00')),
      trim(to_char(new.closing_reading - v_next.opening_reading, 'FM9999999990.00')),
      to_char(v_next.reading_date, 'DD Mon YYYY')
      using errcode = '23514';
  end if;

  -- The reading immediately before this one, if any.
  select reading_date, closing_reading
    into v_prev
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date < new.reading_date
   order by reading_date desc
   limit 1;

  if found and new.opening_reading < v_prev.closing_reading then
    raise exception
      'This day starts at % but % already closed at %, so the same % litres would be counted on both days. Check which of the two dates the meter was actually read on.',
      trim(to_char(new.opening_reading,  'FM9999999990.00')),
      to_char(v_prev.reading_date, 'DD Mon YYYY'),
      trim(to_char(v_prev.closing_reading, 'FM9999999990.00')),
      trim(to_char(v_prev.closing_reading - new.opening_reading, 'FM9999999990.00'))
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists reading_must_not_overlap on public.nozzle_readings;

create trigger reading_must_not_overlap
  before insert or update on public.nozzle_readings
  for each row
  execute function public.check_reading_does_not_overlap();

-- ===================================================================== 027_no_backfill_without_room.sql
-- A day with no room left in it cannot be entered at all.
--
-- Migration 026 refused readings that OVERLAP the next one. This closes the
-- gap it left: when the next reading opens exactly where this day starts, the
-- later day has already swallowed this one whole, and the only closing figure
-- 026 would still accept is the opening itself - a nought-litre day.
--
-- That is a lie in the books rather than a duplicate. On 06 Aug 2026 the
-- nozzles really did sell 1,678 litres; saving 06 Aug at nought would have
-- recorded "nothing sold" for a day that traded, with the litres left sitting
-- on 07 Aug. The day reads as entered, the total is wrong, and nothing flags
-- it afterwards.
--
-- WHY NOT SIMPLY BAN BACK-FILLING. Because the honest repair looks almost the
-- same and is needed: Unit 2 - Nozzle B has no reading for 04 Aug 2026, and
-- 05 Aug opens 85.35 litres above where 03 Aug closed. Entering 04 Aug there
-- is exactly right - it fills a real hole. The difference is not whether a
-- later reading exists, it is whether that later reading LEFT ROOM:
--
--     room = next reading's opening - this reading's opening
--
--     room > 0   a genuine gap; this day may be entered, up to that figure
--     room <= 0  the next day already covers this one; nothing to record
--
-- So the rule is about room, not about direction of travel.

create or replace function public.check_reading_does_not_overlap()
returns trigger
language plpgsql
as $$
declare
  v_next record;
  v_prev record;
begin
  select reading_date, opening_reading
    into v_next
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date > new.reading_date
   order by reading_date asc
   limit 1;

  if found then
    -- No room at all: the later reading starts at or before this day does.
    if v_next.opening_reading <= new.opening_reading then
      raise exception
        'The reading for % already covers this whole day - it opens at %, where this day starts, so there are no litres left to record here. Clear % on Readings first, then enter this day, then enter % again.',
        to_char(v_next.reading_date, 'DD Mon YYYY'),
        trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
        to_char(v_next.reading_date, 'DD Mon YYYY'),
        to_char(v_next.reading_date, 'DD Mon YYYY')
        using errcode = '23514';
    end if;

    -- Some room, but this day is claiming more of it than there is.
    if v_next.opening_reading < new.closing_reading then
      raise exception
        'This day would overlap the reading already saved for %. That one starts at %, before this day closes at %, so the same % litres would be counted on both days. Close this day at % or below, or clear % first.',
        to_char(v_next.reading_date, 'DD Mon YYYY'),
        trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
        trim(to_char(new.closing_reading,    'FM9999999990.00')),
        trim(to_char(new.closing_reading - v_next.opening_reading, 'FM9999999990.00')),
        trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
        to_char(v_next.reading_date, 'DD Mon YYYY')
        using errcode = '23514';
    end if;
  end if;

  select reading_date, closing_reading
    into v_prev
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date < new.reading_date
   order by reading_date desc
   limit 1;

  if found and new.opening_reading < v_prev.closing_reading then
    raise exception
      'This day starts at % but % already closed at %, so the same % litres would be counted on both days. Check which of the two dates the meter was actually read on.',
      trim(to_char(new.opening_reading,  'FM9999999990.00')),
      to_char(v_prev.reading_date, 'DD Mon YYYY'),
      trim(to_char(v_prev.closing_reading, 'FM9999999990.00')),
      trim(to_char(v_prev.closing_reading - new.opening_reading, 'FM9999999990.00'))
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ===================================================================== 028_loose_oil.sql
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

-- ===================================================================== 029_lubricant_trend.sql
-- =============================================================================
-- 029_lubricant_trend.sql
--
-- A day-by-day series for the lubricant half of the business, so the dashboard
-- can chart the shelf and the drum the way it already charts petrol and diesel.
--
-- WHY NOT EXTEND get_sales_trend. That function is the fuel trend and is read
-- by two screens; widening its return type would force both to change for a
-- figure neither of them asks for. This is a second, narrow series joined on
-- the same date spine.
--
-- WHY MONEY AND NOT LITRES. The fuel chart plots rupees, and these have to sit
-- beside it and be comparable. Litres would also make the two series here
-- unreadable together - a day might be 12 litres off the shelf and 0.4 litres
-- out of the drum, which on one axis is a bar and a flat line, while in money
-- the same day might be Rs 7,000 and Rs 900. The money is the point anyway; the
-- drum's litres are derived from a rate, so they are the softer figure of the
-- two.
--
-- The date spine is generate_series, not the sales themselves, so a day with
-- nothing sold is a zero rather than a gap - a chart that silently closes up
-- its quiet days misreads as a busier business than it is.
-- =============================================================================

create or replace function public.get_lubricant_trend(p_from date, p_to date)
returns table (
  day          date,
  pack_amount  numeric,
  loose_amount numeric,
  pack_litres  numeric,
  loose_litres numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  return query
  select d::date,
         coalesce(sum(ls.amount) filter (where not l.sold_loose), 0)::numeric,
         coalesce(sum(ls.amount) filter (where     l.sold_loose), 0)::numeric,
         coalesce(sum(ls.litres) filter (where not l.sold_loose), 0)::numeric,
         coalesce(sum(ls.litres) filter (where     l.sold_loose), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.lubricant_sales ls on ls.sale_date = d::date
    left join public.lubricants      l  on l.id = ls.lubricant_id
   group by d
   order by d;
end;
$$;

revoke execute on function public.get_lubricant_trend(date, date) from public, anon;
grant  execute on function public.get_lubricant_trend(date, date) to authenticated;

