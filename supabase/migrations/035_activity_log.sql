-- =============================================================================
-- 035_activity_log.sql
--
-- An audit trail: who did what, and when.
--
-- WHY THIS IS IN THE DATABASE AND NOT THE APP. A log written by the Server
-- Actions would record only what went through them. It would miss a write made
-- from a second tab, from the Supabase console, from a future script, or from
-- any action somebody forgets to instrument - and the one time you go looking
-- at an audit trail is the time something happened that you did not expect.
-- Triggers see every write to the table, whatever made it.
--
-- THREE THINGS THIS DELIBERATELY DOES NOT DO:
--
--   * It never blocks a write. The whole trigger body is wrapped in an
--     exception handler, so a bug in the summary text below can never stop the
--     owner saving the evening's readings. An audit trail that takes the pump
--     off the air is worse than no audit trail. The cost is that a logging
--     failure is silent - see the note on trg_write_activity.
--
--   * It does not log stock recalculation. `tanks.current_stock_litres` and
--     `lubricants.current_stock_litres` are recomputed by trigger after every
--     reading and every delivery, so logging them would bury the day's real
--     work under a line of machine bookkeeping for each one. An update whose
--     only changed columns are ignored is not logged at all.
--
--   * It does not log the ledger entry a credit slip posts automatically. That
--     is the same event twice, and the slip is the half a person recognises.
--     Hand-made ledger rows - payments, adjustments, an opening balance, the
--     reversal a deleted reading posts - are logged, because those are someone
--     deciding something.
--
-- READ ONLY BY THE OWNER, and append-only for everybody including the owner.
-- A log that the person being logged can edit is decoration.
-- =============================================================================

create table if not exists public.activity_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),

  -- Denormalised on purpose. The id can go null when a profile is removed;
  -- the name is what the log is for, and it has to survive that.
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text not null,

  action        text not null check (action in ('created', 'changed', 'deleted')),

  -- `entity` is the table, kept for filtering later. `entity_label` is the
  -- word the owner would use for it.
  entity        text not null,
  entity_label  text not null,
  entity_id     uuid,

  -- One readable sentence, built at write time. It has to be built now rather
  -- than rendered later: after a delete, the row it describes is gone.
  summary       text not null,

  -- The business day the entry concerns, where it has one - which is not the
  -- same as when it was typed, and the difference is the point of the column.
  entry_date    date,
  amount        numeric(14, 2),

  -- The row as it stood, plus a field-by-field diff on an update.
  details       jsonb
);

comment on table public.activity_log is
  'Append-only audit trail, written by trigger. Owner reads it; nobody edits it.';

create index if not exists activity_log_occurred_at_idx
  on public.activity_log (occurred_at desc);

create index if not exists activity_log_entity_idx
  on public.activity_log (entity, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Who is writing.
--
-- security definer because it reads profiles, which the caller may not be able
-- to read all of. 'System' covers a write with no login behind it: a SQL
-- console, a scheduled job, the reset routine. Naming it is better than a null
-- the page then has to explain.
-- ---------------------------------------------------------------------------
create or replace function public.activity_actor()
returns table (actor_id uuid, actor_name text)
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()),
         coalesce(
           (select p.full_name from public.profiles p where p.id = (select auth.uid())),
           case when (select auth.uid()) is null then 'System' else 'Unknown login' end
         );
$$;

-- ---------------------------------------------------------------------------
-- The trigger.
--
-- Everything goes through to_jsonb() rather than reading NEW.column directly,
-- so one function serves sixteen tables without a compile-time dependency on
-- any of their shapes. A column renamed in a later migration degrades to a
-- less specific log line rather than breaking the write.
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

  -- Recomputed by other triggers, or noise. A change to these alone is not
  -- somebody doing something.
  --
  -- The two link columns are here because of a cascade found while testing:
  -- deleting a reading deletes its credit slips, and each slip's `on delete
  -- set null` then UPDATEs the ledger row that slip had posted. The ledger row
  -- is untouched in every way a person would care about, but the log said
  -- "Charge to a customer changed" underneath the deletion that caused it.
  v_ignored text[] := array[
    'current_stock_litres', 'created_at', 'credit_sale_id', 'lubricant_sale_id'
  ];
begin
  v_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row := coalesce(v_new, v_old);

  v_action := case tg_op when 'INSERT' then 'created'
                         when 'UPDATE' then 'changed'
                         else 'deleted' end;

  -- What actually changed, on an update. Ignored columns are dropped first, so
  -- a stock recalculation leaves an empty list and the write goes unlogged.
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field', t.k,
             'from',  v_old -> t.k,
             'to',    v_new -> t.k
           ) order by t.k), '[]'::jsonb)
      into v_changes
      from jsonb_object_keys(v_new) as t(k)
     where not (t.k = any (v_ignored))
       and (v_old -> t.k) is distinct from (v_new -> t.k);

    if jsonb_array_length(v_changes) = 0 then
      return coalesce(new, old);
    end if;
  end if;

  -- A credit slip already posts its own ledger row. Logging both describes one
  -- event twice, and the slip is the half a person recognises.
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
      select c.name into v_summary
        from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'ledger_entries' then
      v_label := case v_row ->> 'entry_type' when 'credit' then 'Payment or credit'
                                             else 'Charge to a customer' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary
        from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'lubricant_sales' then
      v_label := 'Oil sale';
      v_date := (v_row ->> 'sale_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select l.name into v_summary
        from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.000') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'lubricant_purchases' then
      v_label := 'Oil delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select l.name into v_summary
        from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990');

    when 'fuel_purchases' then
      v_label := 'Fuel delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select t.name into v_summary
        from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990')
        || ' · ' || (v_row ->> 'payment_status');

    when 'stock_checks' then
      v_label := 'Tank dip';
      v_date := (v_row ->> 'check_date')::date;
      select t.name into v_summary
        from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — dipped at ' || to_char((v_row ->> 'actual_dip_reading')::numeric, 'FM999,999,990.00') || ' L'
        || ', books said ' || to_char((v_row ->> 'expected_stock')::numeric, 'FM999,999,990.00') || ' L';

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
      -- No entry_date on purpose, though the row has a date. entry_date exists
      -- so the page can say "filed against 07 Aug" when an entry was made
      -- against an older day than it was typed on, and a rate's effective_from
      -- is not that - it is when the price starts applying, which the summary
      -- already says in words. Filling it in got the page printing
      -- "filed against 08 Aug 2026" under a line that already read "from 08 Aug
      -- 2026", which is both a repetition and the wrong word for it.
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

    else
      v_label := tg_table_name;
      v_summary := tg_table_name;
  end case;

  -- Not jsonb_strip_nulls: it recurses, and it was quietly eating the `from`
  -- of a field that had been null, which is exactly the change worth seeing.
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
  -- DELIBERATELY SWALLOWED. Failing to write a log line must never fail the
  -- write it was describing - the pump has to be able to record its day even
  -- if something here is broken. The trade is that a bug in this function is
  -- invisible except as a gap in the log. Every branch below was therefore
  -- exercised against real rows before this shipped, in transactions that
  -- deliberately aborted - see docs/CHANGELOG.md for what that caught.
  return coalesce(new, old);
end;
$$;

comment on function public.trg_write_activity() is
  'Writes one activity_log row per change. Never raises - see the handler at the end.';

-- ---------------------------------------------------------------------------
-- Attach it. after, so a write that is refused by a constraint or an earlier
-- trigger never gets logged as though it happened.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'nozzle_readings', 'credit_sales', 'ledger_entries',
    'lubricant_sales', 'lubricant_purchases', 'fuel_purchases',
    'stock_checks', 'expenses', 'bank_transactions', 'bank_accounts',
    'customers', 'lubricants', 'fuel_prices', 'tanks', 'nozzles', 'profiles'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_activity', v_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.trg_write_activity()',
      v_table || '_activity', v_table
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The log is append-only, for everyone. Same treatment as the ledger, and for
-- a stronger reason: a trail the logged person can rewrite proves nothing.
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'The activity log is append-only. It records what happened; it is not edited.'
    using errcode = '0A000';
end;
$$;

drop trigger if exists activity_log_no_update on public.activity_log;
create trigger activity_log_no_update
  before update on public.activity_log
  for each row execute function public.trg_activity_log_append_only();

drop trigger if exists activity_log_no_delete on public.activity_log;
create trigger activity_log_no_delete
  before delete on public.activity_log
  for each row execute function public.trg_activity_log_append_only();

-- ---------------------------------------------------------------------------
-- RLS. The owner reads it and that is all anybody does: there is no insert
-- policy, because the only thing that writes here is the security definer
-- trigger above. Nothing a login can send to PostgREST can forge a line.
-- ---------------------------------------------------------------------------
alter table public.activity_log enable row level security;

drop policy if exists "activity_log: super admin reads" on public.activity_log;
create policy "activity_log: super admin reads"
  on public.activity_log for select to authenticated
  using (public.is_super_admin());

revoke execute on function public.activity_actor()      from public, anon;
revoke execute on function public.trg_write_activity()  from public, anon, authenticated;
revoke all on public.activity_log from anon;
grant select on public.activity_log to authenticated;
