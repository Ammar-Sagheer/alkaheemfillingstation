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
