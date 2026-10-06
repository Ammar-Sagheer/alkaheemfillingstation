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
