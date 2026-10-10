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
