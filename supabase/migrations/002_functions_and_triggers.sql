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
