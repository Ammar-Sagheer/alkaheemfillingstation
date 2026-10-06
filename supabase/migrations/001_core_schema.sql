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
