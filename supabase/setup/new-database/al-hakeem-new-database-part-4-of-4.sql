-- A NEW DATABASE for Al Hakeem Filling Station PSO, part 4 of 4, run in order.
-- Al Hakeem's repo at its latest migration (001 to 072, then 800 to 812), then start-empty.
-- Run ONLY on a brand-new, empty Supabase project. Each migration commits on its
-- own; if one stops, fix the cause and run the file again from that migration.
-- This part holds: 801_customer_vehicles.sql to start-empty.sql

-- ===================================================================== 801_customer_vehicles.sql
-- =============================================================================
-- 801_customer_vehicles.sql        AL HAKEEM FIRST - to be copied to the others
--
-- One customer, many vehicles, one ledger.
--
-- Some of this pump's credit customers run 10 or 15 vehicles on one account.
-- The master gives a customer one vehicle_number box and records no vehicle on
-- a slip, so a fleet's account could say what was owed but not which truck
-- took it. Here a customer has a list of vehicles, every credit slip and every
-- lubricant sale on credit can name the vehicle, and the vehicle is carried
-- onto the ledger line the slip posts. The account stays ONE account: one
-- balance, one credit limit, payments off the one total.
--
--   customer_vehicles          the list, per customer. A vehicle number is
--                              unique among ACTIVE vehicles across the whole
--                              pump (ignoring case, spaces and dashes), so a
--                              number typed at the pump finds one account.
--   credit_sales.vehicle_id    } nullable: a slip without a vehicle is still a
--   lubricant_sales.vehicle_id } slip, and every slip from before this is one.
--   ledger_entries.vehicle_id  copied from the slip or sale by the posting
--                              triggers; never typed.
--
-- RULES IN THE DATABASE, as everywhere here. A vehicle used on a slip must
-- belong to that slip's customer and be active when the slip is saved. A
-- vehicle that has been used is never deleted (the foreign keys are RESTRICT,
-- and ledger_entries is append-only, so SET NULL would be refused anyway); it
-- is RETIRED (is_active = false) and keeps its old slips. One never used may
-- be deleted - a mistake when typing it in.
--
-- BACKUPS (051). customer_vehicles joins backup_table_order() straight after
-- customers, so a backup carries it and a restore loads it before the slips
-- that point at it. The three new columns are nullable, so a backup from before
-- this migration restores unchanged (its rows simply have no vehicle). A
-- backup taken BEFORE 801 has no customer_vehicles section, which the restore
-- reads as an empty list.
--
-- THE OLD vehicle_number BOX stays, as the customer's main vehicle: it is what
-- the customer list and the New customer form already show. Whatever is typed
-- there joins the vehicle list too (a trigger here), and every customer's
-- existing number is copied in once, below.
-- =============================================================================

-- ------------------------------------------------------------------ the table
create table public.customer_vehicles (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  vehicle_number text not null check (length(btrim(vehicle_number)) > 0),
  is_active      boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table public.customer_vehicles is
  'The vehicles on a customer''s account (801). One account, one balance; each '
  'slip may name the vehicle that took the fuel. Retired, never deleted, once used.';

-- How a vehicle number is compared: no case, no spaces, no dashes, so
-- "LES-4471", "les 4471" and "LES4471" are the same truck.
create or replace function public.vehicle_key(p_number text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_number, ''), '[\s\-]', '', 'g'));
$$;

create unique index customer_vehicles_one_active_number
  on public.customer_vehicles (public.vehicle_key(vehicle_number))
  where is_active;

create index customer_vehicles_customer_idx on public.customer_vehicles (customer_id);

alter table public.customer_vehicles enable row level security;

-- The same reach as customers: staff read and add (they add customers too);
-- only the owner changes or removes.
create policy "customer_vehicles: staff read" on public.customer_vehicles
  for select using (public.is_active_staff());
create policy "customer_vehicles: staff create" on public.customer_vehicles
  for insert with check (public.is_active_staff());
create policy "customer_vehicles: super admin updates" on public.customer_vehicles
  for update using (public.is_super_admin()) with check (public.is_super_admin());
create policy "customer_vehicles: super admin deletes" on public.customer_vehicles
  for delete using (public.is_super_admin());

grant select, insert, update, delete on public.customer_vehicles to authenticated;

-- --------------------------------------------- the columns that name a vehicle
alter table public.credit_sales
  add column vehicle_id uuid references public.customer_vehicles (id) on delete restrict;
alter table public.lubricant_sales
  add column vehicle_id uuid references public.customer_vehicles (id) on delete restrict;
alter table public.ledger_entries
  add column vehicle_id uuid references public.customer_vehicles (id) on delete restrict;

create index credit_sales_vehicle_idx    on public.credit_sales (vehicle_id)    where vehicle_id is not null;
create index lubricant_sales_vehicle_idx on public.lubricant_sales (vehicle_id) where vehicle_id is not null;
create index ledger_entries_vehicle_idx  on public.ledger_entries (vehicle_id)  where vehicle_id is not null;

-- A vehicle on a slip or sale must be on that customer's account, and in use.
create or replace function public.trg_vehicle_belongs_to_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_active boolean;
  v_number text;
begin
  if new.vehicle_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.vehicle_id is not distinct from old.vehicle_id
     and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;

  select customer_id, is_active, vehicle_number
    into v_owner, v_active, v_number
    from public.customer_vehicles where id = new.vehicle_id;

  if v_owner is null or v_owner is distinct from new.customer_id then
    raise exception 'Vehicle % is not on this customer''s account. Choose one of theirs, or add it to them first.',
      coalesce(v_number, '') using errcode = '23514';
  end if;
  if not v_active then
    raise exception 'Vehicle % has been removed from this account. Bring it back on the customer''s page first.',
      v_number using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger credit_sales_vehicle_belongs
  before insert or update on public.credit_sales
  for each row execute function public.trg_vehicle_belongs_to_customer();
create trigger lubricant_sales_vehicle_belongs
  before insert or update on public.lubricant_sales
  for each row execute function public.trg_vehicle_belongs_to_customer();

-- ------------------------------------- the posting triggers carry the vehicle
-- Both as they stood (035's credit slip posting, 024's lubricant posting), with
-- vehicle_id added to the ledger row and nothing else changed.
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
    entry_date, note, credit_sale_id, created_by, vehicle_id
  )
  values (
    new.customer_id, 'debit', new.amount, new.litres, v_fuel,
    v_date, 'Fuel taken on credit', new.id, v_creator, new.vehicle_id
  );

  return new;
end;
$$;

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
    entry_date, note, lubricant_sale_id, created_by, vehicle_id
  )
  values (
    new.customer_id, 'debit', new.credit_amount, new.litres, null,
    new.sale_date, coalesce(v_name, 'Lubricant') || ' taken on credit',
    new.id, new.created_by, new.vehicle_id
  );

  return new;
end;
$$;

-- ------------------------------------- a reading's slips carry their vehicle
-- 052's create_nozzle_reading, unchanged except that each credit line may
-- carry a vehicle_id. A line without one is saved exactly as before.
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
set search_path = public
as $$
declare
  v_reading_id   uuid;
  v_credit_total numeric(14, 2);
  v_sale         numeric(14, 2);
  v_cash         numeric(14, 2);
  v_line         jsonb;
begin
  select coalesce(sum((l ->> 'amount')::numeric), 0)
    into v_credit_total
    from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb)) l;

  v_sale := round((p_closing - p_opening) * p_rate, 2);
  v_cash := v_sale - v_credit_total;

  if v_cash < 0 then
    raise exception
      'The credit slips come to Rs %, which is more than the Rs % sold on this nozzle. '
      'Check the slips.',
      to_char(v_credit_total, 'FM999,999,999,990.00'),
      to_char(v_sale, 'FM999,999,999,990.00')
      using errcode = '23514';
  end if;

  insert into public.nozzle_readings (
    nozzle_id, reading_date, opening_reading, closing_reading,
    rate_per_litre, cash_amount, credit_amount, created_by
  )
  values (
    p_nozzle_id, p_reading_date, p_opening, p_closing,
    p_rate, v_cash, v_credit_total, auth.uid()
  )
  returning id into v_reading_id;

  for v_line in
    select value from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb))
  loop
    insert into public.credit_sales (reading_id, customer_id, litres, amount, vehicle_id)
    values (
      v_reading_id,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'litres')::numeric,
      (v_line ->> 'amount')::numeric,
      nullif(v_line ->> 'vehicle_id', '')::uuid
    );
  end loop;

  return v_reading_id;
end;
$$;

-- ------------------------------ the old vehicle box joins the vehicle list
create or replace function public.trg_customer_main_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.vehicle_number, '')), '') is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and public.vehicle_key(new.vehicle_number) = public.vehicle_key(old.vehicle_number) then
    return new;
  end if;
  if exists (select 1 from public.customer_vehicles v
              where v.customer_id = new.id
                and public.vehicle_key(v.vehicle_number) = public.vehicle_key(new.vehicle_number)) then
    -- Already on the list (perhaps retired): bring it back rather than add twice.
    update public.customer_vehicles v
       set is_active = true
     where v.customer_id = new.id
       and public.vehicle_key(v.vehicle_number) = public.vehicle_key(new.vehicle_number)
       and not v.is_active;
    return new;
  end if;

  insert into public.customer_vehicles (customer_id, vehicle_number, created_by)
  values (new.id, btrim(new.vehicle_number), auth.uid());
  return new;
exception when unique_violation then
  raise exception 'Vehicle % is already on another customer''s account.', btrim(new.vehicle_number)
    using errcode = '23505';
end;
$$;

create trigger customers_main_vehicle
  after insert or update of vehicle_number on public.customers
  for each row execute function public.trg_customer_main_vehicle();

-- Every customer's existing number, once. (A number on two accounts already
-- would break the unique index: the second one is left off the list, and the
-- owner sees it still in the old box.)
insert into public.customer_vehicles (customer_id, vehicle_number, created_by)
select distinct on (public.vehicle_key(c.vehicle_number))
       c.id, btrim(c.vehicle_number), c.created_by
  from public.customers c
 where nullif(btrim(coalesce(c.vehicle_number, '')), '') is not null
 order by public.vehicle_key(c.vehicle_number), c.created_at;

-- ---------------------------------------------------- what each vehicle took
-- For the customer page and the statement: litres and rupees per vehicle over
-- a span of days, from the slips and lubricant sales as they stand now. A slip
-- whose reading was deleted is gone from credit_sales (its ledger lines stay,
-- debit and reversal side by side), so it is rightly not counted here.
create or replace function public.get_customer_vehicle_totals(
  p_customer_id uuid,
  p_from        date default null,
  p_to          date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'vehicle_id', x.vehicle_id,
             'vehicle_number', x.vehicle_number,
             'is_active', x.is_active,
             'fuel_litres', x.fuel_litres,
             'fuel_amount', x.fuel_amount,
             'lubricant_amount', x.lube_amount,
             'slips', x.slips
           ) order by x.vehicle_number nulls last)
      from (
        select v.id as vehicle_id, v.vehicle_number, v.is_active,
               coalesce(f.litres, 0) as fuel_litres, coalesce(f.amount, 0) as fuel_amount,
               coalesce(l.amount, 0) as lube_amount,
               coalesce(f.n, 0) + coalesce(l.n, 0) as slips
          from (select id, vehicle_number, is_active from public.customer_vehicles
                 where customer_id = p_customer_id
                union all select null, null, true) v
          left join lateral (
            select sum(cs.litres) as litres, sum(cs.amount) as amount, count(*) as n
              from public.credit_sales cs
              join public.nozzle_readings nr on nr.id = cs.reading_id
             where cs.customer_id = p_customer_id
               and cs.vehicle_id is not distinct from v.id
               and (p_from is null or nr.reading_date >= p_from)
               and (p_to   is null or nr.reading_date <= p_to)
          ) f on true
          left join lateral (
            select sum(ls.credit_amount) as amount, count(*) as n
              from public.lubricant_sales ls
             where ls.customer_id = p_customer_id
               and ls.credit_amount > 0
               and ls.vehicle_id is not distinct from v.id
               and (p_from is null or ls.sale_date >= p_from)
               and (p_to   is null or ls.sale_date <= p_to)
          ) l on true
         where v.id is not null or coalesce(f.n, 0) + coalesce(l.n, 0) > 0
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_customer_vehicle_totals(uuid, date, date) from public, anon;
grant execute on function public.get_customer_vehicle_totals(uuid, date, date) to authenticated;

-- ------------------------------------------------------------- the backup
create or replace function public.backup_table_order()
returns text[]
language sql
immutable
as $$
  select array[
    'tanks', 'nozzles', 'customers', 'customer_vehicles', 'lubricants', 'bank_accounts', 'suppliers',
    'fuel_prices', 'company_assets', 'expenses', 'treasury_entries',
    'nozzle_readings', 'fuel_purchases', 'lubricant_purchases', 'stock_checks',
    'lubricant_sales', 'credit_sales', 'ledger_entries', 'bank_transactions',
    'supplier_ledger_entries'
  ]::text[];
$$;

-- -------------------------------------------------------- the activity log
-- 035's trigger on the new table, with a line that reads as a vehicle rather
-- than as a table name. The writer's CASE has no branch for this table; one is
-- added by editing the installed function, so every other branch stays exactly
-- as its last migration left it. Refuses if the place to add it is not found.
do $$
declare
  v_def text := pg_get_functiondef('public.trg_write_activity()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    $f$    when 'customers' then$f$,
    $f$    when 'customer_vehicles' then
      v_label := 'Vehicle';
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_row ->> 'vehicle_number', '') || coalesce(' · ' || v_summary, '')
        || case when (v_row ->> 'is_active')::boolean then '' else ' (removed)' end;
    when 'customers' then$f$);
  if v_new = v_def then
    raise exception '801: could not find where to add the vehicle line in trg_write_activity.';
  end if;
  execute v_new;
end;
$$;

create trigger customer_vehicles_activity
  after insert or update or delete on public.customer_vehicles
  for each row execute function public.trg_write_activity();

-- ------------------------------------------- removing and bringing back
-- One button for the owner: a vehicle never used is deleted (a typing
-- mistake); one with slips is retired, keeping its old slips on the ledger.
create or replace function public.remove_customer_vehicle(p_vehicle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a vehicle' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customer_vehicles where id = p_vehicle_id) then
    raise exception 'That vehicle no longer exists. Reload the page.' using errcode = 'P0002';
  end if;

  v_used := exists (select 1 from public.credit_sales    where vehicle_id = p_vehicle_id)
         or exists (select 1 from public.lubricant_sales where vehicle_id = p_vehicle_id)
         or exists (select 1 from public.ledger_entries  where vehicle_id = p_vehicle_id);

  if v_used then
    update public.customer_vehicles set is_active = false where id = p_vehicle_id;
    return 'retired';
  end if;

  delete from public.customer_vehicles where id = p_vehicle_id;
  return 'deleted';
end;
$$;

-- Bringing a retired vehicle back, refused in words if its number has since
-- gone onto another account.
create or replace function public.restore_customer_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may bring a vehicle back' using errcode = '42501';
  end if;
  select vehicle_number into v_number from public.customer_vehicles where id = p_vehicle_id;
  if v_number is null then
    raise exception 'That vehicle no longer exists. Reload the page.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.customer_vehicles
              where is_active and id <> p_vehicle_id
                and public.vehicle_key(vehicle_number) = public.vehicle_key(v_number)) then
    raise exception 'Vehicle % is now on another account, so it cannot come back here.', v_number
      using errcode = '23505';
  end if;
  update public.customer_vehicles set is_active = true where id = p_vehicle_id;
end;
$$;

revoke all on function public.remove_customer_vehicle(uuid)  from public, anon;
revoke all on function public.restore_customer_vehicle(uuid) from public, anon;
grant execute on function public.remove_customer_vehicle(uuid)  to authenticated;
grant execute on function public.restore_customer_vehicle(uuid) to authenticated;

-- ===================================================================== 802_staff_salaries.sql
-- =============================================================================
-- 802_staff_salaries.sql        AL HAKEEM FIRST - to be copied to the others
--
-- The people who work the forecourt, a register of the days they worked, and
-- their pay at the end of the month, which goes into Expenses (and so comes
-- off the month's profit) as one "Salaries" line per person.
--
-- NOT LOGINS. A staff member here is anyone the pump pays by the day: an
-- attendant, a night guard, a cleaner. Most never touch the app. The logins
-- under Account are a different list and stay so.
--
-- A DAILY RATE, DATED. staff_rates is a history, like fuel_prices: a raise is
-- a new row from a date, so the days before it are still paid at the old rate.
-- A day is paid at the rate in force on it; a day before a person's first rate
-- is paid at that first rate (the owner sets the rate when he adds someone, and
-- may then mark days he worked before that).
--
-- PRESENT, HALF DAY OR ABSENT, one row per person per day. A day with no row is
-- "not marked", which is counted and shown, never paid.
--
-- PAID ONCE A MONTH, through pay_salary(). Earned is summed HERE, in numeric,
-- in whole rupees, never in JavaScript. Paying writes one expense (category
-- "Salaries") and one salary_payments row pointing at it. The expense is dated
-- in the month that was WORKED - the payment date, or the month's last day if
-- the pay goes out early next month - so October's wages come off October's
-- profit. Deleting that expense (here, or from the Expenses page) undoes the
-- payment: the row goes with it (on delete cascade).
--
-- A PAID MONTH IS CLOSED. Attendance in it cannot be changed, and no rate can
-- be added or removed that would reprice one of its days, until the payment is
-- cancelled. Otherwise the register and the expense would quietly disagree.
--
-- BACKUPS (051). All four tables join backup_table_order(); salary_payments
-- after expenses, which it points at. Every person column is created_by, the
-- one restore_everything() remaps onto the new project's logins.
-- =============================================================================

-- ---------------------------------------------------------------- the people
create table public.staff_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  job         text,
  phone       text,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index staff_members_one_active_name
  on public.staff_members (lower(btrim(name))) where is_active;

create table public.staff_rates (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_members (id) on delete cascade,
  daily_rate      numeric(12, 2) not null check (daily_rate > 0),
  effective_from  date not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (staff_id, effective_from)
);

create table public.staff_attendance (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff_members (id) on delete restrict,
  work_date   date not null,
  status      text not null check (status in ('present', 'half', 'absent')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (staff_id, work_date)
);

create index staff_attendance_date_idx on public.staff_attendance (work_date);

create table public.salary_payments (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.staff_members (id) on delete restrict,
  salary_month  date not null check (salary_month = date_trunc('month', salary_month)::date),
  days_worked   numeric(5, 1) not null,
  earned        numeric(14, 2) not null,
  amount        numeric(14, 2) not null check (amount > 0),
  paid_on       date not null,
  expense_id    uuid not null unique references public.expenses (id) on delete cascade,
  note          text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (staff_id, salary_month)
);

-- ---------------------------------------------------------------------- RLS
-- Names and the register: both roles (staff mark attendance at the pump).
-- Rates and pay: the owner's, like Expenses.
alter table public.staff_members    enable row level security;
alter table public.staff_rates      enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.salary_payments  enable row level security;

create policy "staff_members: staff read" on public.staff_members
  for select using (public.is_active_staff());
create policy "staff_members: super admin writes" on public.staff_members
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "staff_rates: super admin" on public.staff_rates
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "staff_attendance: staff read" on public.staff_attendance
  for select using (public.is_active_staff());
create policy "staff_attendance: staff create" on public.staff_attendance
  for insert with check (public.is_active_staff());
create policy "staff_attendance: staff change" on public.staff_attendance
  for update using (public.is_active_staff()) with check (public.is_active_staff());
create policy "staff_attendance: staff clear" on public.staff_attendance
  for delete using (public.is_active_staff());

create policy "salary_payments: super admin reads" on public.salary_payments
  for select using (public.is_super_admin());

grant select, insert, update, delete on public.staff_members    to authenticated;
grant select, insert, update, delete on public.staff_rates      to authenticated;
grant select, insert, update, delete on public.staff_attendance to authenticated;
grant select                         on public.salary_payments  to authenticated;

-- --------------------------------------------------------- the rate on a day
create or replace function public.staff_rate_on(p_staff_id uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.daily_rate from public.staff_rates r
      where r.staff_id = p_staff_id and r.effective_from <= p_date
      order by r.effective_from desc limit 1),
    (select r.daily_rate from public.staff_rates r
      where r.staff_id = p_staff_id
      order by r.effective_from limit 1));
$$;

revoke all on function public.staff_rate_on(uuid, date) from public, anon;

-- ------------------------------------------------- a paid month is closed
create or replace function public.trg_staff_attendance_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_attendance := case when tg_op = 'DELETE' then old else new end;
  v_name text;
begin
  select name into v_name from public.staff_members where id = v_row.staff_id;

  if exists (select 1 from public.salary_payments p
              where p.staff_id = v_row.staff_id
                and p.salary_month = date_trunc('month', v_row.work_date)::date)
     or (tg_op = 'UPDATE' and exists (select 1 from public.salary_payments p
              where p.staff_id = old.staff_id
                and p.salary_month = date_trunc('month', old.work_date)::date)) then
    raise exception '% has already been paid for %. Cancel that salary payment first to change the attendance.',
      v_name, to_char(v_row.work_date, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  if tg_op <> 'DELETE' then
    if new.work_date > public.pump_today() then
      raise exception 'Attendance cannot be marked for a day that has not come yet.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.staff_members where id = new.staff_id and is_active) then
      raise exception '% has been removed from the staff list. Bring them back first.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  return v_row;
end;
$$;

create trigger staff_attendance_rules
  before insert or update or delete on public.staff_attendance
  for each row execute function public.trg_staff_attendance_rules();

-- A rate from date D reprices D onward (and, if it is the first rate, every
-- day before it too). Refused if any of those days is in a paid month.
create or replace function public.trg_staff_rate_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_rates := case when tg_op = 'DELETE' then old else new end;
  v_last_paid date;
  v_name text;
begin
  select max(p.salary_month) + interval '1 month' - interval '1 day'
    into v_last_paid
    from public.salary_payments p where p.staff_id = v_row.staff_id;

  if v_last_paid is not null
     and (v_row.effective_from <= v_last_paid
          or (tg_op = 'UPDATE' and old.effective_from <= v_last_paid)) then
    select name into v_name from public.staff_members where id = v_row.staff_id;
    raise exception '% has been paid up to %. A new daily rate has to start after that, on % or later.',
      v_name, to_char(v_last_paid, 'FMDD Mon YYYY'), to_char(v_last_paid + 1, 'FMDD Mon YYYY')
      using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

create trigger staff_rate_rules
  before insert or update or delete on public.staff_rates
  for each row execute function public.trg_staff_rate_rules();

-- -------------------------------------------------------------- the people
create or replace function public.add_staff_member(
  p_name text, p_job text, p_phone text, p_daily_rate numeric, p_from date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may add staff' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Enter the name.' using errcode = 'P0001';
  end if;
  if p_daily_rate is null or p_daily_rate <= 0 then
    raise exception 'Enter a daily rate above zero.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.staff_members
              where is_active and lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'There is already someone called % on the staff list.', btrim(p_name)
      using errcode = 'P0001';
  end if;

  insert into public.staff_members (name, job, phone, created_by)
  values (btrim(p_name), nullif(btrim(p_job), ''), nullif(btrim(p_phone), ''), auth.uid())
  returning id into v_id;

  insert into public.staff_rates (staff_id, daily_rate, effective_from, created_by)
  values (v_id, round(p_daily_rate, 2), coalesce(p_from, public.pump_today()), auth.uid());

  return v_id;
end;
$$;

create or replace function public.set_staff_rate(p_staff_id uuid, p_daily_rate numeric, p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a daily rate' using errcode = '42501';
  end if;
  if p_daily_rate is null or p_daily_rate <= 0 then
    raise exception 'Enter a daily rate above zero.' using errcode = 'P0001';
  end if;
  if p_from is null then
    raise exception 'Enter the date the new rate starts.' using errcode = 'P0001';
  end if;

  insert into public.staff_rates (staff_id, daily_rate, effective_from, created_by)
  values (p_staff_id, round(p_daily_rate, 2), p_from, auth.uid())
  on conflict (staff_id, effective_from)
  do update set daily_rate = excluded.daily_rate, created_by = excluded.created_by;
end;
$$;

-- Never worked a day: deleted (a typing mistake). Otherwise retired and kept,
-- with his register and pay, and brought back with restore_staff_member().
create or replace function public.remove_staff_member(p_staff_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove staff' using errcode = '42501';
  end if;

  if not exists (select 1 from public.staff_attendance where staff_id = p_staff_id)
     and not exists (select 1 from public.salary_payments where staff_id = p_staff_id) then
    delete from public.staff_members where id = p_staff_id;
    return 'deleted';
  end if;

  update public.staff_members set is_active = false where id = p_staff_id;
  return 'retired';
end;
$$;

create or replace function public.restore_staff_member(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may bring someone back' using errcode = '42501';
  end if;
  select name into v_name from public.staff_members where id = p_staff_id;
  if exists (select 1 from public.staff_members
              where is_active and id <> p_staff_id and lower(btrim(name)) = lower(btrim(v_name))) then
    raise exception 'Someone else called % is on the staff list now. Rename one of them first.', v_name
      using errcode = 'P0001';
  end if;
  update public.staff_members set is_active = true where id = p_staff_id;
end;
$$;

-- ---------------------------------------------------------- the month's pay
-- What one person earned in one month, from the register, in whole rupees.
create or replace function public.staff_month_earned(p_staff_id uuid, p_month date)
returns table (days_present int, days_half int, days_absent int, days_worked numeric, earned numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where a.status = 'present')::int,
    count(*) filter (where a.status = 'half')::int,
    count(*) filter (where a.status = 'absent')::int,
    coalesce(sum(case a.status when 'present' then 1 when 'half' then 0.5 else 0 end), 0),
    round(coalesce(sum(public.staff_rate_on(a.staff_id, a.work_date)
                       * case a.status when 'present' then 1 when 'half' then 0.5 else 0 end), 0), 0)
  from public.staff_attendance a
  where a.staff_id = p_staff_id
    and a.work_date >= date_trunc('month', p_month)::date
    and a.work_date <  (date_trunc('month', p_month) + interval '1 month')::date;
$$;

revoke all on function public.staff_month_earned(uuid, date) from public, anon;

-- The Salaries table for one month: everyone on the list, and anyone retired
-- who worked or was paid in it.
create or replace function public.get_salary_month(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_upto  date := least(v_end, public.pump_today());
  v_days  int  := greatest(0, v_upto - v_start + 1);
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see salaries' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row_json order by is_active desc, lower(name))
    from (
      select s.is_active, s.name,
        jsonb_build_object(
          'staff_id', s.id,
          'name', s.name,
          'job', s.job,
          'is_active', s.is_active,
          'daily_rate', public.staff_rate_on(s.id, greatest(v_start, least(v_upto, v_end))),
          'rate_changes', (select count(*) from public.staff_rates r
                            where r.staff_id = s.id and r.effective_from > v_start and r.effective_from <= v_end),
          'present', e.days_present,
          'half', e.days_half,
          'absent', e.days_absent,
          'days_worked', e.days_worked,
          'not_marked', greatest(0, v_days - (e.days_present + e.days_half + e.days_absent)),
          'earned', e.earned,
          'payment', (select jsonb_build_object('id', p.id, 'amount', p.amount, 'paid_on', p.paid_on,
                                                'note', p.note, 'earned', p.earned)
                        from public.salary_payments p
                       where p.staff_id = s.id and p.salary_month = v_start)
        ) as row_json
      from public.staff_members s
      cross join lateral public.staff_month_earned(s.id, v_start) e
      where s.is_active
         or e.days_present + e.days_half + e.days_absent > 0
         or exists (select 1 from public.salary_payments p where p.staff_id = s.id and p.salary_month = v_start)
    ) t
  ), '[]'::jsonb);
end;
$$;

-- Pay one person for one month. p_amount null means what the register earned;
-- a different figure (an advance taken off, a bonus) is allowed, and the
-- earned figure is kept beside it.
create or replace function public.pay_salary(
  p_staff_id uuid, p_month date, p_paid_on date, p_amount numeric default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_staff public.staff_members;
  v_e     record;
  v_amount numeric;
  v_expense uuid;
  v_payment uuid;
  v_detail text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may pay salaries' using errcode = '42501';
  end if;

  select * into v_staff from public.staff_members where id = p_staff_id;
  if v_staff.id is null then
    raise exception 'That person is no longer on the staff list.' using errcode = 'P0001';
  end if;
  if v_start > public.pump_today() then
    raise exception 'That month has not started yet.' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on < v_start then
    raise exception 'The date paid has to be in % or after it.', to_char(v_start, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.salary_payments where staff_id = p_staff_id and salary_month = v_start) then
    raise exception '% has already been paid for %.', v_staff.name, to_char(v_start, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  select * into v_e from public.staff_month_earned(p_staff_id, v_start);
  v_amount := round(coalesce(p_amount, v_e.earned), 0);
  if v_amount <= 0 then
    raise exception 'There is nothing to pay: % has no days marked present in %.',
      v_staff.name, to_char(v_start, 'FMMonth YYYY') using errcode = 'P0001';
  end if;

  v_detail := v_staff.name || ', ' || to_char(v_start, 'FMMonth YYYY') || ' ('
    || trim(to_char(v_e.days_worked, 'FM990.0')) || ' days)'
    || coalesce('. ' || nullif(btrim(p_note), ''), '');
  v_detail := replace(v_detail, '.0 days', ' days');

  insert into public.expenses (category, amount, expense_date, note, created_by)
  values ('Salaries', v_amount, least(p_paid_on, v_end), v_detail, auth.uid())
  returning id into v_expense;

  insert into public.salary_payments
    (staff_id, salary_month, days_worked, earned, amount, paid_on, expense_id, note, created_by)
  values
    (p_staff_id, v_start, v_e.days_worked, v_e.earned, v_amount, p_paid_on, v_expense,
     nullif(btrim(p_note), ''), auth.uid())
  returning id into v_payment;

  return v_payment;
end;
$$;

-- Undo a payment: its expense is deleted, and the payment row goes with it.
create or replace function public.cancel_salary_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may cancel a salary payment' using errcode = '42501';
  end if;
  select expense_id into v_expense from public.salary_payments where id = p_payment_id;
  if v_expense is null then
    raise exception 'That payment has already been cancelled.' using errcode = 'P0001';
  end if;
  delete from public.expenses where id = v_expense;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'add_staff_member(text, text, text, numeric, date)',
    'set_staff_rate(uuid, numeric, date)',
    'remove_staff_member(uuid)',
    'restore_staff_member(uuid)',
    'get_salary_month(date)',
    'pay_salary(uuid, date, date, numeric, text)',
    'cancel_salary_payment(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ------------------------------------------------------------- the backup
create or replace function public.backup_table_order()
returns text[]
language sql
immutable
as $$
  select array[
    'tanks', 'nozzles', 'customers', 'customer_vehicles', 'lubricants', 'bank_accounts', 'suppliers',
    'staff_members', 'staff_rates',
    'fuel_prices', 'company_assets', 'expenses', 'treasury_entries',
    'nozzle_readings', 'fuel_purchases', 'lubricant_purchases', 'stock_checks',
    'lubricant_sales', 'credit_sales', 'ledger_entries', 'bank_transactions',
    'supplier_ledger_entries', 'staff_attendance', 'salary_payments'
  ]::text[];
$$;

-- -------------------------------------------------------------- the reset
-- reset_all_data() (067) clears the register and the pay with the expenses;
-- the people stay, like the tanks and the suppliers. Added by editing the
-- installed function so the rest of it stays as 067 left it.
do $$
declare
  v_def text := pg_get_functiondef('public.reset_all_data()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    $f$  delete from public.expenses            where true;$f$,
    $f$  delete from public.salary_payments     where true;
  delete from public.staff_attendance    where true;
  delete from public.expenses            where true;$f$);
  if v_new = v_def then
    raise exception '802: could not find where to add the salaries to reset_all_data.';
  end if;
  execute v_new;
end;
$$;

-- -------------------------------------------------------- the activity log
-- The people and their rates. Attendance is not logged line by line (thirty
-- rows a day would bury everything else); a payment is logged as the expense
-- it writes.
do $$
declare
  v_def text := pg_get_functiondef('public.trg_write_activity()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    $f$    when 'customers' then$f$,
    $f$    when 'staff_members' then
      v_label := 'Staff member';
      v_summary := coalesce(v_row ->> 'name', '')
        || coalesce(' · ' || nullif(v_row ->> 'job', ''), '')
        || case when (v_row ->> 'is_active')::boolean then '' else ' (removed)' end;
    when 'staff_rates' then
      v_label := 'Daily rate';
      v_date := (v_row ->> 'effective_from')::date;
      v_amount := (v_row ->> 'daily_rate')::numeric;
      select s.name into v_summary from public.staff_members s where s.id = (v_row ->> 'staff_id')::uuid;
      v_summary := coalesce(v_summary, 'Staff') || ': Rs '
        || to_char((v_row ->> 'daily_rate')::numeric, 'FM999,999,990') || ' a day from '
        || to_char((v_row ->> 'effective_from')::date, 'FMDD Mon YYYY');
    when 'customers' then$f$);
  if v_new = v_def then
    raise exception '802: could not find where to add the staff lines in trg_write_activity.';
  end if;
  execute v_new;
end;
$$;

create trigger staff_members_activity
  after insert or update or delete on public.staff_members
  for each row execute function public.trg_write_activity();
create trigger staff_rates_activity
  after insert or update or delete on public.staff_rates
  for each row execute function public.trg_write_activity();

-- ===================================================================== 803_close_internal_functions.sql
-- =============================================================================
-- 803_close_internal_functions.sql        AL HAKEEM (the master has this in 073/074)
--
-- 801 and 802 revoked their internal functions from `public, anon` only.
-- Supabase also grants EXECUTE on every new function to `authenticated`
-- directly (072's finding), so any staff login could call them. The one that
-- mattered: staff_rate_on() and staff_month_earned() would tell a staff login
-- any person's daily rate and month's pay, which RLS keeps from them. Read-only;
-- nothing could be changed through them.
--
-- Every caller is a trigger or a SECURITY DEFINER function, so no role needs
-- them. backup_table_order() is closed again too, as 072 left it, since 801 and
-- 802 redefined it. Fails, and so changes nothing, if any is still open.
-- No row is touched.
-- =============================================================================

do $$
declare
  f text;
  v_list text[] := array[
    'staff_rate_on(uuid, date)', 'staff_month_earned(uuid, date)',
    'trg_staff_attendance_rules()', 'trg_staff_rate_rules()',
    'trg_vehicle_belongs_to_customer()', 'trg_customer_main_vehicle()',
    'backup_table_order()'
  ];
  v_open text;
begin
  foreach f in array v_list loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  select string_agg(p.oid::regprocedure::text, ', ')
    into v_open
    from pg_proc p
   where p.oid = any (select ('public.' || x)::regprocedure::oid from unnest(v_list) x)
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception '803: still callable from outside: %', v_open;
  end if;
end;
$$;

-- ===================================================================== 804_staff_advances_and_part_payments.sql
-- =============================================================================
-- 804: a salary can be paid in parts: advances, then the balance.
--
-- WHAT WENT WRONG. Salaries (802) allowed ONE payment per person per month, and
-- that payment closed the month's attendance. The owner gave an advance by
-- pressing Pay with a smaller amount (Rs 500 to one man, Rs 3,000 to another).
-- That recorded "Rs 500" as the whole of the month: the page still said Rs 5,994
-- earned with nothing taken off it, the rest could not be paid (the month "had
-- already been paid"), and the attendance for the days still to come was locked.
--
-- WHAT IT IS NOW.
--   * A person can have any number of payments in a month.
--   * Each payment is an ADVANCE (is_final = false: the month stays open) or the
--     SETTLING payment (is_final = true: the month is done and its attendance
--     closes, as every payment used to).
--   * Pending = earned - everything paid so far, until a settling payment is made.
--   * Every payment still writes its own "Salaries" expense, dated in the month,
--     so profit counts what has been paid out, when it was paid, as before.
--
-- EXISTING ROWS ARE NOT TOUCHED. is_final is added empty (null), and null is read
-- as it always meant: a payment that covered what was earned (amount >= earned)
-- settled the month, one that did not was only part of it. So Rs 500 against
-- Rs 5,994 turns into an advance by itself, and a payment in full stays a
-- settled month. No money figure in any table changes.
--
-- A column added to a table the backup covers is nullable (051): this one is.
-- =============================================================================

-- One payment per person per month goes. A plain index keeps the lookups fast.
do $$
declare
  c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.salary_payments'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(staff_id, salary_month)%';
  if c is not null then
    execute format('alter table public.salary_payments drop constraint %I', c);
  end if;
end;
$$;

create index if not exists salary_payments_staff_month_idx
  on public.salary_payments (staff_id, salary_month);

alter table public.salary_payments add column if not exists is_final boolean;

comment on column public.salary_payments.is_final is
  'true: this payment settles the month and closes its attendance. false: an advance or part payment, the month stays open. null (rows from before 804): settled when amount >= earned.';

-- Has a settling payment been made for this person and month?
create or replace function public.salary_month_settled(p_staff_id uuid, p_month date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.salary_payments p
     where p.staff_id = p_staff_id
       and p.salary_month = date_trunc('month', p_month)::date
       and coalesce(p.is_final, p.amount >= p.earned)
  );
$$;

revoke all on function public.salary_month_settled(uuid, date) from public, anon;

-- ------------------------------------------- a SETTLED month is the closed one
create or replace function public.trg_staff_attendance_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_attendance := case when tg_op = 'DELETE' then old else new end;
  v_name text;
begin
  select name into v_name from public.staff_members where id = v_row.staff_id;

  if public.salary_month_settled(v_row.staff_id, v_row.work_date)
     or (tg_op = 'UPDATE' and public.salary_month_settled(old.staff_id, old.work_date)) then
    raise exception '%''s pay for % has been settled. Cancel the settling salary payment first to change the attendance.',
      v_name, to_char(v_row.work_date, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  if tg_op <> 'DELETE' then
    if new.work_date > public.pump_today() then
      raise exception 'Attendance cannot be marked for a day that has not come yet.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.staff_members where id = new.staff_id and is_active) then
      raise exception '% has been removed from the staff list. Bring them back first.', v_name
        using errcode = 'P0001';
    end if;
  end if;

  return v_row;
end;
$$;

-- A rate is refused only back into months that are SETTLED, not months with an
-- advance in them.
create or replace function public.trg_staff_rate_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_rates := case when tg_op = 'DELETE' then old else new end;
  v_last_paid date;
  v_name text;
begin
  select max(p.salary_month) + interval '1 month' - interval '1 day'
    into v_last_paid
    from public.salary_payments p
   where p.staff_id = v_row.staff_id
     and coalesce(p.is_final, p.amount >= p.earned);

  if v_last_paid is not null
     and (v_row.effective_from <= v_last_paid
          or (tg_op = 'UPDATE' and old.effective_from <= v_last_paid)) then
    select name into v_name from public.staff_members where id = v_row.staff_id;
    raise exception '% has been paid up to %. A new daily rate has to start after that, on % or later.',
      v_name, to_char(v_last_paid, 'FMDD Mon YYYY'), to_char(v_last_paid + 1, 'FMDD Mon YYYY')
      using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

-- --------------------------------------------------- the Salaries table, again
-- Now with what has been paid so far, what is still pending, and every payment.
create or replace function public.get_salary_month(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_upto  date := least(v_end, public.pump_today());
  v_days  int  := greatest(0, v_upto - v_start + 1);
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see salaries' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row_json order by is_active desc, lower(name))
    from (
      select s.is_active, s.name,
        jsonb_build_object(
          'staff_id', s.id,
          'name', s.name,
          'job', s.job,
          'is_active', s.is_active,
          'daily_rate', public.staff_rate_on(s.id, greatest(v_start, least(v_upto, v_end))),
          'rate_changes', (select count(*) from public.staff_rates r
                            where r.staff_id = s.id and r.effective_from > v_start and r.effective_from <= v_end),
          'present', e.days_present,
          'half', e.days_half,
          'absent', e.days_absent,
          'days_worked', e.days_worked,
          'not_marked', greatest(0, v_days - (e.days_present + e.days_half + e.days_absent)),
          'earned', e.earned,
          -- Paid so far, whether the month is settled, and what is still owed.
          -- Once settled nothing is pending, whatever the sums say: the owner
          -- agreed the figure by settling it.
          'paid', pay.paid,
          'settled', pay.settled,
          'pending', case when pay.settled then 0 else e.earned - pay.paid end,
          'payments', pay.list
        ) as row_json
      from public.staff_members s
      cross join lateral public.staff_month_earned(s.id, v_start) e
      cross join lateral (
        select coalesce(sum(p.amount), 0) as paid,
               coalesce(bool_or(coalesce(p.is_final, p.amount >= p.earned)), false) as settled,
               coalesce(jsonb_agg(jsonb_build_object(
                          'id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'note', p.note,
                          'is_final', coalesce(p.is_final, p.amount >= p.earned))
                        order by p.paid_on, p.created_at), '[]'::jsonb) as list
          from public.salary_payments p
         where p.staff_id = s.id and p.salary_month = v_start
      ) pay
      where s.is_active
         or e.days_present + e.days_half + e.days_absent > 0
         or pay.list <> '[]'::jsonb
    ) t
  ), '[]'::jsonb);
end;
$$;

-- --------------------------------------------------------------- paying
-- Same name, one more argument; the old five-argument one goes so a call with
-- five named arguments cannot match both.
drop function if exists public.pay_salary(uuid, date, date, numeric, text);

-- p_final = true  (the default): the payment that settles the month. p_amount
--   null means what is still pending. The month's attendance closes.
-- p_final = false: an advance or part payment. p_amount is required. The month
--   stays open and the amount comes off what is pending.
create or replace function public.pay_salary(
  p_staff_id uuid, p_month date, p_paid_on date,
  p_amount numeric default null, p_note text default null, p_final boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_staff public.staff_members;
  v_e     record;
  v_paid  numeric;
  v_amount numeric;
  v_expense uuid;
  v_payment uuid;
  v_detail text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may pay salaries' using errcode = '42501';
  end if;

  select * into v_staff from public.staff_members where id = p_staff_id;
  if v_staff.id is null then
    raise exception 'That person is no longer on the staff list.' using errcode = 'P0001';
  end if;
  if v_start > public.pump_today() then
    raise exception 'That month has not started yet.' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on < v_start then
    raise exception 'The date paid has to be in % or after it.', to_char(v_start, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;
  if public.salary_month_settled(p_staff_id, v_start) then
    raise exception '%''s pay for % has already been settled. Cancel the settling payment first to pay more.',
      v_staff.name, to_char(v_start, 'FMMonth YYYY') using errcode = 'P0001';
  end if;

  select * into v_e from public.staff_month_earned(p_staff_id, v_start);
  select coalesce(sum(amount), 0) into v_paid
    from public.salary_payments where staff_id = p_staff_id and salary_month = v_start;

  if coalesce(p_final, true) then
    v_amount := round(coalesce(p_amount, v_e.earned - v_paid), 0);
    if v_amount <= 0 then
      raise exception 'There is nothing left to pay: % has been paid Rs % of the Rs % earned in %.',
        v_staff.name, to_char(v_paid, 'FM999,999,990'), to_char(v_e.earned, 'FM999,999,990'),
        to_char(v_start, 'FMMonth YYYY') using errcode = 'P0001';
    end if;
  else
    v_amount := round(p_amount, 0);
    if v_amount is null or v_amount <= 0 then
      raise exception 'Enter the amount of the advance, above zero.' using errcode = 'P0001';
    end if;
  end if;

  v_detail := v_staff.name || ', ' || to_char(v_start, 'FMMonth YYYY')
    || case
         when not coalesce(p_final, true) then ' (advance)'
         when v_paid > 0 then ' (balance, after Rs ' || to_char(v_paid, 'FM999,999,990') || ' paid before)'
         else ' (' || trim(to_char(v_e.days_worked, 'FM990.0')) || ' days)'
       end
    || coalesce('. ' || nullif(btrim(p_note), ''), '');
  v_detail := replace(v_detail, '.0 days', ' days');

  insert into public.expenses (category, amount, expense_date, note, created_by)
  values ('Salaries', v_amount, least(p_paid_on, v_end), v_detail, auth.uid())
  returning id into v_expense;

  insert into public.salary_payments
    (staff_id, salary_month, days_worked, earned, amount, paid_on, expense_id, note, is_final, created_by)
  values
    (p_staff_id, v_start, v_e.days_worked, v_e.earned, v_amount, p_paid_on, v_expense,
     nullif(btrim(p_note), ''), coalesce(p_final, true), auth.uid())
  returning id into v_payment;

  return v_payment;
end;
$$;

-- Undo a payment: its expense goes, and the payment row with it. An advance
-- cannot be cancelled underneath a settling payment (it would change what that
-- payment settled): cancel the settling one first.
create or replace function public.cancel_salary_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.salary_payments;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may cancel a salary payment' using errcode = '42501';
  end if;
  select * into v_pay from public.salary_payments where id = p_payment_id;
  if v_pay.id is null then
    raise exception 'That payment has already been cancelled.' using errcode = 'P0001';
  end if;
  if not coalesce(v_pay.is_final, v_pay.amount >= v_pay.earned)
     and public.salary_month_settled(v_pay.staff_id, v_pay.salary_month) then
    raise exception 'This month has been settled. Cancel the settling payment first, then this advance.'
      using errcode = 'P0001';
  end if;
  delete from public.expenses where id = v_pay.expense_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'get_salary_month(date)',
    'pay_salary(uuid, date, date, numeric, text, boolean)',
    'cancel_salary_payment(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ===================================================================== 805_deposit_to_bank_from_the_safe.sql
-- =============================================================================
-- 805: depositing cash from the safe into a bank account is ONE entry.
--
-- WHY. The safe (Treasury, 044) and the bank accounts (018) were two separate
-- books. Taking cash to the bank meant two entries: "Deposited in a bank" out of
-- the safe, and a deposit into the account. Forgetting one left the safe lower
-- and the bank no higher (or the bank higher and the safe unchanged), and the
-- owner reconciles both against a bank slip.
--
-- WHAT. deposit_to_bank() writes both in one transaction:
--   * a Treasury entry, cash OUT, category 'bank_deposit', naming the account;
--   * a bank deposit into that account, same date and amount;
-- and links them: bank_transactions.treasury_entry_id points at the safe entry.
-- Deleting either one deletes the other, so the two books cannot drift apart.
--
-- THE SAFE'S OWN RULE STILL APPLIES, in its own words: the safe cannot be driven
-- below nothing (treasury_never_negative, checked at the end of the transaction),
-- so a deposit the safe cannot cover fails and writes neither half. The bank's
-- rule (020) only refuses payments that overdraw, never deletes ("deletes are
-- corrections and must stay possible"), so deleting a deposit stays possible
-- from either side, and takes its other half with it.
--
-- NOTHING EXISTING CHANGES. The new column is nullable (051), null on every
-- existing row, and a safe entry of 'bank_deposit' written by hand before this
-- stays a plain safe entry with no bank half, as it always was.
-- =============================================================================

alter table public.bank_transactions
  add column if not exists treasury_entry_id uuid
  references public.treasury_entries (id) on delete cascade;

create index if not exists bank_transactions_treasury_entry_idx
  on public.bank_transactions (treasury_entry_id)
  where treasury_entry_id is not null;

comment on column public.bank_transactions.treasury_entry_id is
  'Set when this deposit was made from the safe by deposit_to_bank() (805): the safe entry it came out of. Deleting either deletes the other.';

-- Deleting the bank half removes the safe half. (Deleting the safe half removes
-- the bank half through the foreign key above; by then the safe row is already
-- gone, so this has nothing to do.)
create or replace function public.trg_bank_deposit_takes_its_safe_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.treasury_entry_id is not null then
    delete from public.treasury_entries where id = old.treasury_entry_id;
  end if;
  return old;
end;
$$;

drop trigger if exists bank_transactions_take_safe_entry on public.bank_transactions;
create trigger bank_transactions_take_safe_entry
  after delete on public.bank_transactions
  for each row execute function public.trg_bank_deposit_takes_its_safe_entry();

create or replace function public.deposit_to_bank(
  p_account_id uuid, p_amount numeric, p_date date, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc    public.bank_accounts;
  v_amount numeric(14, 2) := round(p_amount, 2);
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_entry  uuid;
  v_txn    uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may deposit to a bank' using errcode = '42501';
  end if;

  select * into v_acc from public.bank_accounts where id = p_account_id;
  if v_acc.id is null then
    raise exception 'That bank account is no longer there. Reload the page.' using errcode = 'P0001';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter how much is being deposited, above zero.' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'Enter the date of the deposit.' using errcode = 'P0001';
  end if;

  insert into public.treasury_entries (entry_date, direction, amount, category, details, created_by)
  values (p_date, 'out', v_amount, 'bank_deposit',
          'Deposited in ' || v_acc.bank_name || ', ' || v_acc.account_label
            || coalesce('. ' || v_note, ''),
          auth.uid())
  returning id into v_entry;

  insert into public.bank_transactions
    (account_id, txn_type, amount, txn_date, category, note, created_by, treasury_entry_id)
  values
    (p_account_id, 'deposit', v_amount, p_date, null,
     coalesce(v_note, 'Cash from the safe'), auth.uid(), v_entry)
  returning id into v_txn;

  return jsonb_build_object(
    'treasury_entry_id', v_entry,
    'bank_transaction_id', v_txn,
    'message', 'Rs ' || to_char(v_amount, 'FM999,999,999,990') || ' taken out of the safe and deposited in '
               || v_acc.bank_name || ', ' || v_acc.account_label || '.'
  );
end;
$$;

revoke all on function public.deposit_to_bank(uuid, numeric, date, text) from public, anon;
grant execute on function public.deposit_to_bank(uuid, numeric, date, text) to authenticated;
revoke all on function public.trg_bank_deposit_takes_its_safe_entry() from public, anon, authenticated;

-- ===================================================================== 806_what_is_still_to_collect_from_the_staff.sql
-- =============================================================================
-- 806: what the staff still owe the owner for a day.
--
-- Asked for by Al Hakeem as the most important thing on his Dashboard. The men
-- at the pumps take the money; at the end of the day he wants one comparison:
-- how much should be in his hands, and how much has actually reached him.
--
--   Fuel sold at the nozzles, as cash      (readings: cash_amount; the part
--                                           that went on credit slips is not
--                                           cash, so it is already out)
--   less the day's expenses                (money the pump paid out that day,
--                                           net of recoveries; salaries and
--                                           advances given that day included)
--   = TO COLLECT
--   less what has been handed in           (Treasury cash-in dated the same
--                                           day: "Cash of shift closing" and
--                                           "Entry")
--   = STILL TO COLLECT
--
-- Worked out here, in exact numeric, and read back by the Dashboard: this is a
-- money figure, and the page does no arithmetic of its own on it.
--
-- WHAT IS NOT IN IT YET, on purpose, until the owner says: cash from oil sales,
-- and cash paid straight into a bank account without going through the safe.
-- Oil cash is returned beside the figures (oil_cash_sales) so adding it is a
-- decision and not a rebuild.
--
-- READ-ONLY. Nothing is written, no row changes.
-- =============================================================================

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales   numeric;
  v_credit  numeric;
  v_cash    numeric;
  v_exp     numeric;
  v_handed  numeric;
  v_oil     numeric;
  v_n       integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(ls.cash_amount), 0) into v_oil
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'expenses', v_exp,
    'to_collect', v_cash - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_cash - v_exp - v_handed,
    'oil_cash_sales', v_oil
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;

-- ===================================================================== 807_collection_counts_oil_and_shows_credit.sql
-- =============================================================================
-- 807: the day's collection counts oil, and says the credit as its own figure.
--
-- Al Hakeem checked 806 against his handwritten sheet for 3 Oct 2026: his
-- "total sales" (823,890) includes the oil line, and he takes off three things
-- in turn, each as a minus: CREDIT, EXPENSES, and what went into the safe.
--
--   total sales (fuel + oil)
--   less credit (fuel slips + oil sold on credit)
--   less the day's expenses
--   = TO COLLECT
--   less Treasury cash-in of the day (shift closing, entry)
--   = STILL TO COLLECT
--
-- 806 left oil out and returned only fuel cash. This replaces the function (same
-- signature, so the grants stand) with the same figures PLUS total_sales,
-- total_credit, oil_sales and oil_credit. Every key 806 returned is still there;
-- fuel_cash and oil_cash_sales keep their meaning, to_collect and
-- still_to_collect now include oil. READ-ONLY, no row touched.
-- =============================================================================

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'expenses', v_exp,
    'to_collect', v_total - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;

-- ===================================================================== 808_customer_payments_in_the_days_collection.sql
-- =============================================================================
-- 808: money a customer pays in is part of the day's cash to collect.
--
-- Al Hakeem's number for the master's 084 (his 800s run 804 to 807 = 080 to 083).
--
-- Al Tufail's daily sheet adds "Receiving" (what credit customers paid over the
-- counter) into the day's total sale, then takes off the credit slips and the
-- expenses to reach TOTAL CASH, what the staff hand in:
--
--   petrol + diesel + oil + RECEIVING = total sale
--   less credit, less expenses        = total cash
--
-- The Dashboard's "To collect from the staff" (082, 083 in the master; Al
-- Hakeem's 806, 807) had everything but the receiving, so it read short by what
-- customers had paid in. This adds it, as its own figure.
--
-- A PAYMENT HAS TO BE RECOGNISED: a credit ledger entry is a payment, a reversal
-- of a deleted slip, or an owner's adjustment, and only the note tells them
-- apart. So a new nullable flag, is_payment (051: a column on a backed-up table
-- is nullable), is set by "Record a payment" and by nothing else. Null on every
-- row before this, so earlier payments are not counted: they were taken in on
-- days that are over.
--
-- READ-ONLY apart from the new column. No row changes.
-- =============================================================================

alter table public.ledger_entries
  add column if not exists is_payment boolean;

comment on column public.ledger_entries.is_payment is
  'True on a customer payment entered through Record a payment or Money received (900). Null on everything else, including payments before 900.';

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_received   numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(le.amount), 0) into v_received
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'credit'
     and le.is_payment is true;

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'received', v_received,
    'expenses', v_exp,
    'to_collect', v_total + v_received - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total + v_received - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;

-- ===================================================================== 809_hand_entered_customer_debits_count_as_credit.sql
-- =============================================================================
-- 809: customer debits entered by hand count as credit in the day's collection.
--
-- AL HAKEEM ONLY for now (his number; not yet in the master).
--
-- He gives fuel on credit and writes it on the customer's own page ("adjust the
-- balance", a debit) rather than as a credit slip on the nozzle's reading, so the
-- Dashboard's "To collect from the staff", which counted only slips on readings
-- and oil sales, never saw it: 10 Oct 2026, Shah Ali pur Rs 14,320, PM Relief
-- Rs 138,500. The cash those men hold is smaller by exactly that, so
-- get_day_collection now counts such a debit, dated the day, as credit.
--
-- WHICH DEBITS: ledger debits dated the day that were NOT posted by a credit slip
-- or an oil sale (those are already in the readings' and oil figures) and are not
-- the reversal of another entry. Returned on its own as entered_credit and
-- included in total_credit.
--
-- CAVEAT, accepted by the owner: an opening balance carried over from an old
-- register and entered the same way would count on its date as well.
--
-- READ-ONLY. No row changes.
-- =============================================================================

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_received   numeric;
  v_entered    numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(le.amount), 0) into v_received
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'credit'
     and le.is_payment is true;

  select coalesce(sum(le.amount), 0) into v_entered
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'debit'
     and le.credit_sale_id is null
     and le.lubricant_sale_id is null
     and le.corrects_entry_id is null;

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit + v_entered;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'received', v_received,
    'entered_credit', v_entered,
    'expenses', v_exp,
    'to_collect', v_total + v_received - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total + v_received - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;

-- ===================================================================== 810_collection_ignores_cancelled_entries.sql
-- =============================================================================
-- 810: the day's collection no longer counts entries that were cancelled.
--
-- AL HAKEEM ONLY for now. A fix to 808 and 809, found on his live books on
-- 11 Oct 2026: 809 counted EVERY hand-made debit of the day, including
--   * the orphans of credit slips whose day was cleared (clearing a day deletes
--     the slips, the ledger debit stays with credit_sale_id set to null, and a
--     reversal credit is posted beside it), and
--   * debits that were later cancelled with "correct this entry",
-- so the panel took far too much off the cash to collect (358,133 of "credit"
-- on 10 Oct when 186,227 was real). 808's received had the same hole for a
-- payment that was cancelled. Now a debit counts only if it is a hand entry that
-- still stands, and a payment only if it was not cancelled.
--
-- READ-ONLY. No row changes. create or replace: nothing to undo.
-- =============================================================================

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_received   numeric;
  v_entered    numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(le.amount), 0) into v_received
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'credit'
     and le.is_payment is true
     and not exists (select 1 from public.ledger_entries x where x.corrects_entry_id = le.id);

  -- A debit counts only if it is a hand entry that still stands: not posted by a
  -- slip or oil sale, not a reversal, not cancelled by a correction, and not the
  -- orphan of a slip whose day was cleared (that debit keeps the system's own
  -- "Fuel taken on credit" note and its reversal is a credit beside it).
  select coalesce(sum(le.amount), 0) into v_entered
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'debit'
     and le.credit_sale_id is null
     and le.lubricant_sale_id is null
     and le.corrects_entry_id is null
     and coalesce(le.note, '') not ilike 'Fuel taken on credit%'
     and coalesce(le.note, '') not ilike 'Lubricant%'
     and not exists (select 1 from public.ledger_entries x where x.corrects_entry_id = le.id);

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit + v_entered;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'received', v_received,
    'entered_credit', v_entered,
    'expenses', v_exp,
    'to_collect', v_total + v_received - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total + v_received - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;

-- ===================================================================== 811_reset_clears_the_safe_and_the_bank.sql
-- =============================================================================
-- 811: "Empty everything" also empties the safe and the bank.
--
-- AL HAKEEM'S OWN (carried to the others only if asked).
--
-- reset_all_data() (067, then 802 for the salaries) cleared the register, the
-- ledgers, the deliveries and the pay, but left two books standing: the safe
-- (treasury_entries, 044) and the bank (bank_transactions, 018). A pump that
-- empties everything to start again would have kept its old cash and its old
-- bank figures and had to remove them by hand.
--
-- What it adds, in the same transaction as the rest:
--   * every bank transaction goes (a deposit made from the safe takes its safe
--     half with it, 805), then every safe entry;
--   * each bank account is kept, with its name and number, but starts again at
--     nothing: opening_balance and the pruned_* totals (018) go to zero, so its
--     balance is 0 until the real figure is entered as the first deposit.
--
-- Unchanged: logins, staff (people and their daily rates), tanks, nozzles,
-- suppliers, lubricants and company assets are kept. Salary payments (advances
-- included) and attendance were already cleared by 802; customer vehicles go
-- with their customers.
--
-- Done by editing the installed function, as 802 did, so the rest of it stays
-- exactly as it is. Safe to run once; refuses if it has already been added.
-- =============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.reset_all_data()'::regprocedure);
  v_new text;
begin
  if position('delete from public.treasury_entries' in v_def) > 0 then
    raise exception '811: reset_all_data() already clears the safe. Nothing was changed.';
  end if;

  v_new := replace(v_def,
    $f$  update public.tanks$f$,
    $f$  -- The bank first: a deposit made from the safe deletes its safe half too.
  delete from public.bank_transactions   where true;
  delete from public.treasury_entries    where true;
  update public.bank_accounts
     set opening_balance = 0,
         pruned_deposits = 0,
         pruned_payments = 0,
         pruned_count    = 0
   where true;

  update public.tanks$f$);

  if v_new = v_def then
    raise exception '811: could not find where to add the safe and the bank to reset_all_data.';
  end if;
  execute v_new;
end;
$$;

-- ===================================================================== 812_opening_balance_can_be_dated.sql
-- =============================================================================
-- 812 (the master's 086): a new customer's opening balance can carry its own date.
--
-- create_customer_with_opening() (034, 071) dated the opening entry with
-- pump_today(), the day the form was filled in. A pump that starts the app on
-- the 1st and then types the month in after the fact (the days already in its
-- paper register) therefore got an opening balance dated AFTER the days it
-- should sit before: on the customer's statement it appeared below the October
-- slips, and the running balance on every earlier day read from zero. The
-- manual adjustment on the customer's page already takes a date; this gives
-- the new-customer form the same.
--
-- The new argument, p_opening_date, is optional: null means today, exactly as
-- before. A date in the future is refused. Nothing else changes, and no
-- existing row is touched. The old six-argument function is replaced, not kept
-- beside the new one, so a call cannot be ambiguous.
-- =============================================================================

drop function if exists public.create_customer_with_opening(text, text, text, numeric, numeric, text);

create or replace function public.create_customer_with_opening(
  p_name              text,
  p_vehicle_number    text    default null,
  p_phone             text    default null,
  p_credit_limit      numeric default null,
  -- Always a positive figure; the direction says which way it goes.
  p_opening_amount    numeric default 0,
  p_opening_direction text    default null,   -- 'owes' | 'in_credit'
  -- The day the balance stood. Null is today.
  p_opening_date      date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_amount  numeric(14, 2);
  v_actor   uuid := auth.uid();
  v_date    date := coalesce(p_opening_date, public.pump_today());
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the customer''s name' using errcode = '23514';
  end if;

  -- Whole rupees, like every other ledger write since migration 032.
  v_amount := round(coalesce(p_opening_amount, 0));

  if v_amount < 0 then
    raise exception
      'Enter the opening balance as a positive figure and choose which way it goes.'
      using errcode = '23514';
  end if;

  if v_amount > 0 and coalesce(p_opening_direction, '') not in ('owes', 'in_credit') then
    raise exception
      'Say whether the customer owes this amount or is in credit for it.'
      using errcode = '23514';
  end if;

  if v_date > public.pump_today() then
    raise exception 'The opening balance cannot be dated in the future.'
      using errcode = '23514';
  end if;

  insert into public.customers (name, vehicle_number, phone, credit_limit, created_by)
  values (btrim(p_name),
          nullif(btrim(coalesce(p_vehicle_number, '')), ''),
          nullif(btrim(coalesce(p_phone, '')), ''),
          p_credit_limit,
          v_actor)
  returning id into v_id;

  if v_amount > 0 then
    insert into public.ledger_entries
      (customer_id, entry_type, amount, entry_date, note, created_by)
    values (
      v_id,
      (case when p_opening_direction = 'owes' then 'debit' else 'credit' end)::public.ledger_entry_type,
      v_amount,
      v_date,
      case when p_opening_direction = 'owes'
           then 'Opening balance - owed when the account was set up'
           else 'Opening balance - paid ahead when the account was set up'
      end,
      v_actor
    );
  end if;

  return v_id;
end;
$$;

comment on function public.create_customer_with_opening(text, text, text, numeric, numeric, text, date) is
  'Creates a customer and, in the same transaction, the opening ledger entry '
  'for any balance they already carried, dated p_opening_date (today when null, '
  'never in the future). Amount is positive; the direction decides whether it is '
  'a debit or a credit. See 034, 071 and 812.';

revoke execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text, date)
  from public, anon;
grant  execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text, date)
  to authenticated;

-- ===================================================================== start-empty.sql
-- =============================================================================
-- Al Hakeem Filling Station PSO: start with an empty forecourt.
-- Run ONCE on a new database, after all the migrations (001 to 072 and 800).
--
-- The master's migrations seed two tanks (004), six nozzles (004/012/013) and
-- four placeholder suppliers (067). This pump's owner sets up his own tanks
-- and nozzles under Settings (migration 800), so a new database should start
-- with none of them.
--
-- Refuses to run once anything has traded, so it can never empty a working
-- pump. One transaction: all of it or none of it.
-- =============================================================================
begin;

do $$
begin
  if exists (select 1 from public.nozzle_readings)
     or exists (select 1 from public.fuel_purchases)
     or exists (select 1 from public.stock_checks) then
    raise exception 'STOPPED: this pump already has readings, deliveries or dips. Nothing was changed.';
  end if;
  if to_regprocedure('public.add_tank(text, public.fuel_type, numeric, numeric, date)') is null then
    raise exception 'STOPPED: migration 800 is not applied yet, so the owner could not add tanks. Run it first. Nothing was changed.';
  end if;

  delete from public.nozzles where true;
  delete from public.tanks   where true;
  delete from public.suppliers s
   where s.note = 'Placeholder. Rename it under Suppliers, or retire it.'
     and not exists (select 1 from public.supplier_ledger_entries e where e.supplier_id = s.id);
end;
$$;

-- Expect 0, 0 and 0.
select (select count(*) from public.tanks)     as tanks,
       (select count(*) from public.nozzles)   as nozzles,
       (select count(*) from public.suppliers) as suppliers;

commit;

