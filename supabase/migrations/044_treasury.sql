-- =============================================================================
-- 044_treasury.sql
--
-- The treasury: the cash actually sitting in the safe on the pump site.
--
-- WHAT THIS MODELS, AND WHY IT IS NOT BANKING. Banking (018) is money in a
-- bank account, moved by transfer, with a statement behind it. This is
-- physical notes in a strongbox in the office. Cash comes in off the shift and
-- as hand-carried entries during the day; it goes out to people the owner
-- lends to, to suppliers as a code transfer, into a bank account, and back out
-- as pocket cash. None of that money is in the banking system, and until now
-- the only record of it was an Excel sheet on the owner's laptop called
-- "Tajori" - Date, Cash In, Cash Out, Balance, Details.
--
-- THIS TABLE IS THAT SHEET. One row per movement, one running balance, and a
-- free-text Details box, because that is what the owner already writes and
-- what he will keep writing. The one thing added on top is a category, so the
-- app can answer "how much has gone out to people this month" without anyone
-- reading thirty lines of prose.
--
-- STANDALONE ON PURPOSE. Nothing else in the app writes here and nothing reads
-- from it. Cash of shift closing is typed in by hand even though Readings
-- knows the day's cash figure, and cash deposited into a bank account is typed
-- into Banking separately if the owner wants it there. That was the owner's
-- call, and it is the right one for a first cut: the safe is reconciled
-- against notes in a drawer, not against another screen, so an entry that
-- appeared in it by itself would be an entry nobody counted.
--
-- OWNER ONLY, in the database and in the app. This is the owner's own cash,
-- the same reasoning as banking, expenses and company assets.
-- =============================================================================

-- 'in' = notes going into the safe. 'out' = notes coming out of it.
create type public.treasury_direction as enum ('in', 'out');

-- ---------------------------------------------------------------------------
-- treasury_entries
--
-- `seq` is the sheet's row order, and it is what makes a running balance
-- meaningful. Two entries on one date have no times behind them - the owner
-- writes a line when the cash moves, not a clock reading - so the order they
-- were written in IS the order they happened in. `created_at` cannot do this
-- job on its own: a line typed in later for the same day would sort by when it
-- was typed, and identity ordering at least sorts by when it was told.
--
-- The chain is therefore ordered by (entry_date, seq) everywhere: in the view,
-- in the balance rule below, and on screen. A back-dated entry lands at the end
-- of its own date, which is the only honest place to put it when nothing knows
-- what time of day it happened.
--
-- NO CAP, unlike bank_transactions. The 60-entry cap there was a deliberate
-- trade for a table nobody reads past the last page of. This one replaces a
-- spreadsheet the owner scrolls back through, and losing the detail would lose
-- the point. At five or six lines a day it is under two thousand rows a year.
-- ---------------------------------------------------------------------------
create table public.treasury_entries (
  id         uuid primary key default gen_random_uuid(),
  entry_date date not null,
  direction  public.treasury_direction not null,
  amount     numeric(14, 2) not null check (amount > 0),
  category   text not null,
  details    text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  seq        bigint generated always as identity,

  -- A category belongs to one direction. "Deposited in bank" is not something
  -- cash can arrive by, and "Cash of shift closing" is not a way it leaves.
  -- Kept as a check constraint against text rather than two enums, because
  -- the labels these values wear live in app/_lib/treasury-categories.js and
  -- adding one there should be a one-line migration, not a type rewrite.
  constraint treasury_entries_category_fits_direction check (
    (direction = 'in'
       and category in ('opening', 'shift_closing', 'entry', 'returned', 'other'))
    or
    (direction = 'out'
       and category in ('given', 'bank_deposit', 'supplier', 'expense', 'other'))
  )
);

comment on table public.treasury_entries is
  'Cash moving in and out of the safe on the pump site. One row per movement, '
  'in the order it happened. The owner''s "Tajori" sheet, in the database.';

comment on column public.treasury_entries.seq is
  'Row order within a date. Two entries on one day have no time behind them, '
  'so the order they were recorded in is the order they happened in.';

comment on column public.treasury_entries.details is
  'Free text, exactly as written on the sheet - who took it, what code it was '
  'transferred against, which account it went into.';

-- The order the ledger reads in, and the order the balance rule walks in.
create index treasury_entries_chain_idx
  on public.treasury_entries (entry_date, seq);

-- ---------------------------------------------------------------------------
-- One opening entry, ever.
--
-- 'opening' means "this is what was already in the safe when we started
-- writing it down" - Rs 25,550 on 14 Aug 2026, in the owner's own words
-- "Already present". There is exactly one such moment. A second one is always
-- a miscategorised cash-in, and left alone it would read as the books being
-- restarted halfway down the page.
-- ---------------------------------------------------------------------------
create unique index treasury_entries_one_opening
  on public.treasury_entries (category)
  where category = 'opening';

-- ---------------------------------------------------------------------------
-- The safe may never hold less than nothing.
--
-- This is the one money rule the treasury has, and it is a hard one rather
-- than a warning: a safe cannot hand out notes it does not contain. Unlike the
-- bank's no-overdraw rule (020), which only has to look at one balance, this
-- has to look at the whole chain - an entry inserted or deleted in the middle
-- of the sheet moves every balance after it, so a row that is fine where it
-- lands can still push a later day below zero.
--
-- DEFERRED TO COMMIT, which is why it is a constraint trigger rather than a
-- plain one. A multi-row change has to be judged on where it leaves the sheet,
-- not on each row as it lands: the seed in 045 writes thirty-six rows in one
-- statement, and any correction that replaces a cash-out with a smaller one has
-- a moment mid-statement where the chain is short. Checking at commit means the
-- only state ever judged is the state that survives.
--
-- The message names the entry that breaks, so the owner can find the line
-- rather than hunt for it - and it names both ways out, because a breach can
-- be caused just as easily by removing an earlier cash-in as by adding a
-- cash-out.
-- ---------------------------------------------------------------------------
create or replace function public.treasury_never_negative()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad record;
begin
  select t.entry_date, t.direction, t.amount, t.details, t.category, t.running
    into v_bad
    from (
      select e.entry_date,
             e.seq,
             e.direction,
             e.amount,
             e.details,
             e.category,
             sum(case when e.direction = 'in' then e.amount else -e.amount end)
               over (order by e.entry_date, e.seq
                     rows between unbounded preceding and current row) as running
        from public.treasury_entries e
    ) t
   where t.running < 0
   -- The FIRST line the chain breaks on, in sheet order. Later ones are
   -- consequences of it, and naming a consequence would send the owner to
   -- the wrong row.
   order by t.entry_date, t.seq
   limit 1;

  if found then
    raise exception
      'This leaves the safe holding less than nothing. On %, after "%" (Rs % %), the safe would be at minus Rs %. Cash cannot be paid out of a safe that does not have it — record the money that came in before it, or remove a later entry instead.',
      to_char(v_bad.entry_date, 'FMDD Mon YYYY'),
      coalesce(nullif(btrim(coalesce(v_bad.details, '')), ''), v_bad.category),
      to_char(v_bad.amount, 'FM999,999,999,990'),
      case v_bad.direction when 'in' then 'in' else 'out' end,
      to_char(abs(v_bad.running), 'FM999,999,999,990');
  end if;

  return null;
end;
$$;

comment on function public.treasury_never_negative() is
  'Refuses any change that would drive the safe''s running balance below zero '
  'at any point in the sheet, naming the entry it breaks on.';

create constraint trigger treasury_entries_never_negative
  after insert or update or delete on public.treasury_entries
  deferrable initially deferred
  for each row execute function public.treasury_never_negative();

-- ---------------------------------------------------------------------------
-- What the page reads: every entry with the balance the safe stood at
-- immediately after it.
--
-- The running balance is computed here rather than in JavaScript for the
-- reason the rest of this app's aggregation is: the page shows twenty-five
-- rows at a time, and a balance worked out from the rows on screen would be
-- the balance of a page rather than of the safe. The window runs over every
-- row regardless of which ones the reader is looking at.
--
-- security_invoker so the policy below still applies - a view is otherwise
-- read with its owner's rights.
-- ---------------------------------------------------------------------------
create or replace view public.treasury_ledger
with (security_invoker = true) as
select e.id,
       e.entry_date,
       e.direction,
       e.amount,
       e.category,
       e.details,
       e.created_at,
       e.seq,
       sum(case when e.direction = 'in' then e.amount else -e.amount end)
         over (order by e.entry_date, e.seq
               rows between unbounded preceding and current row) as balance_after
  from public.treasury_entries e;

comment on view public.treasury_ledger is
  'Every treasury entry in sheet order, with the safe''s balance immediately '
  'after it. The running balance is over the whole sheet, not over a page.';

-- ---------------------------------------------------------------------------
-- Everything the page's headline figures and its chart need, in one call.
--
-- One RPC rather than four queries for the reason the reporting RPCs exist:
-- the balance in the tile, the balance the chart ends on and the balance on
-- the last row of the table are the same number, and the only way to keep
-- them the same number is to compute them in one place.
--
-- `p_days` is the window the chart and the two movement tiles describe. The
-- balance and the lifetime totals ignore it - "what is in the safe" is not a
-- question with a date range.
--
-- The daily series carries the balance FORWARD across days with no entries.
-- A safe with nothing happening to it still holds what it held yesterday, and
-- a line that dropped to zero on a quiet Sunday would be a lie told by a gap.
-- ---------------------------------------------------------------------------
create or replace function public.treasury_overview(p_days integer default 30)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days   integer := greatest(coalesce(p_days, 30), 1);
  v_today  date    := public.pump_today();
  v_first  date;
  v_last   date;
  v_from   date;
  v_to     date;
  v_result jsonb;
begin
  select min(entry_date), max(entry_date) into v_first, v_last
    from public.treasury_entries;

  -- Nothing recorded yet: an empty shape rather than nulls, so the page has
  -- the same fields to read whether or not the safe has been used.
  if v_first is null then
    return jsonb_build_object(
      'balance', 0, 'total_in', 0, 'total_out', 0, 'entry_count', 0,
      'window_in', 0, 'window_out', 0, 'window_days', v_days,
      'first_date', null, 'last_date', null,
      'daily', '[]'::jsonb, 'out_by_category', '[]'::jsonb,
      'in_by_category', '[]'::jsonb
    );
  end if;

  -- The window ends today, or on the last entry if one is dated ahead of it -
  -- otherwise a mistyped year would put an entry outside every window and the
  -- chart would end on a balance the table does not show.
  v_to := greatest(v_today, v_last);

  -- And it never starts before the safe did. Asking for 90 days of a sheet
  -- that is eight days old would otherwise draw eighty-two days of flat line
  -- before the only part worth looking at.
  v_from := greatest(v_first, v_to - (v_days - 1));

  with chain as (
    select e.entry_date,
           e.seq,
           sum(case when e.direction = 'in' then e.amount else -e.amount end)
             over (order by e.entry_date, e.seq
                   rows between unbounded preceding and current row) as running
      from public.treasury_entries e
  ),
  -- The safe's balance at the close of each day it saw movement: the running
  -- total after that day's last line.
  closings as (
    select distinct on (c.entry_date) c.entry_date, c.running as closing
      from chain c
     order by c.entry_date, c.seq desc
  ),
  totals as (
    select coalesce(sum(amount) filter (where direction = 'in'), 0)  as total_in,
           coalesce(sum(amount) filter (where direction = 'out'), 0) as total_out,
           count(*)                                                  as entry_count,
           min(entry_date)                                           as first_date,
           max(entry_date)                                           as last_date
      from public.treasury_entries
  ),
  windowed as (
    select coalesce(sum(amount) filter (where direction = 'in'), 0)  as window_in,
           coalesce(sum(amount) filter (where direction = 'out'), 0) as window_out
      from public.treasury_entries
     where entry_date between v_from and v_to
  ),
  -- Every day in the window, whether or not anything happened on it, carrying
  -- the last known balance forward.
  series as (
    select d::date as day,
           (select c.closing
              from closings c
             where c.entry_date <= d::date
             order by c.entry_date desc
             limit 1) as closing,
           coalesce((select sum(e.amount) from public.treasury_entries e
                      where e.entry_date = d::date and e.direction = 'in'), 0) as cash_in,
           coalesce((select sum(e.amount) from public.treasury_entries e
                      where e.entry_date = d::date and e.direction = 'out'), 0) as cash_out
      from generate_series(v_from, v_to, interval '1 day') d
  ),
  out_cats as (
    select category, sum(amount) as amount
      from public.treasury_entries
     where direction = 'out' and entry_date between v_from and v_to
     group by category
  ),
  in_cats as (
    select category, sum(amount) as amount
      from public.treasury_entries
     where direction = 'in' and entry_date between v_from and v_to
     group by category
  )
  select jsonb_build_object(
           'balance',     t.total_in - t.total_out,
           'total_in',    t.total_in,
           'total_out',   t.total_out,
           'entry_count', t.entry_count,
           'first_date',  t.first_date,
           'last_date',   t.last_date,
           'window_in',   w.window_in,
           'window_out',  w.window_out,
           'window_days', v_days,
           'window_from', v_from,
           'window_to',   v_to,
           'daily', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'day', s.day,
                      'closing', coalesce(s.closing, 0),
                      'cash_in', s.cash_in,
                      'cash_out', s.cash_out
                    ) order by s.day), '[]'::jsonb)
               from series s
           ),
           'out_by_category', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'category', o.category, 'amount', o.amount
                    ) order by o.amount desc), '[]'::jsonb)
               from out_cats o
           ),
           'in_by_category', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'category', i.category, 'amount', i.amount
                    ) order by i.amount desc), '[]'::jsonb)
               from in_cats i
           )
         )
    into v_result
    from totals t, windowed w;

  return v_result;
end;
$$;

comment on function public.treasury_overview(integer) is
  'The safe''s balance, its lifetime totals, and a day-by-day closing balance '
  'over the last p_days - everything the Treasury page''s tiles and chart show.';

-- ---------------------------------------------------------------------------
-- Row Level Security - the owner only, in every direction.
-- ---------------------------------------------------------------------------
alter table public.treasury_entries enable row level security;

create policy "treasury: super admin only"
  on public.treasury_entries for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.treasury_entries to authenticated;
grant select on public.treasury_ledger to authenticated;
revoke all on public.treasury_entries from anon;

revoke all on function public.treasury_overview(integer) from public;
grant execute on function public.treasury_overview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Wire it into the activity log (035, extended by 036 and 039).
--
-- Reproduced in full because create or replace function replaces the whole
-- thing; the only change is the treasury_entries branch near the bottom.
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
  -- Columns recomputed by other triggers, or noise. A change to these alone is
  -- not somebody doing something, so the write goes unlogged.
  v_ignored text[] := array[
    'current_stock_litres', 'created_at', 'credit_sale_id', 'lubricant_sale_id',
    'expected_stock', 'gain_loss'
  ];
begin
  v_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row := coalesce(v_new, v_old);

  v_action := case tg_op when 'INSERT' then 'created'
                         when 'UPDATE' then 'changed'
                         else 'deleted' end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field', t.k, 'from', v_old -> t.k, 'to', v_new -> t.k
           ) order by t.k), '[]'::jsonb)
      into v_changes
      from jsonb_object_keys(v_new) as t(k)
     where not (t.k = any (v_ignored))
       and (v_old -> t.k) is distinct from (v_new -> t.k);

    if jsonb_array_length(v_changes) = 0 then
      return coalesce(new, old);
    end if;
  end if;

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
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'ledger_entries' then
      v_label := case v_row ->> 'entry_type' when 'credit' then 'Payment or credit'
                                             else 'Charge to a customer' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'lubricant_sales' then
      v_label := 'Oil sale';
      v_date := (v_row ->> 'sale_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select l.name into v_summary from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.000') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'lubricant_purchases' then
      v_label := 'Oil delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select l.name into v_summary from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990');

    when 'fuel_purchases' then
      v_label := 'Fuel delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990')
        || ' · ' || (v_row ->> 'payment_status');

    when 'stock_checks' then
      v_label := 'Tank dip';
      v_date := (v_row ->> 'books_date')::date;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — dipped at ' || to_char((v_row ->> 'actual_dip_reading')::numeric, 'FM999,999,990.00') || ' L'
        || ', books said ' || to_char((v_row ->> 'expected_stock')::numeric, 'FM999,999,990.00') || ' L'
        || ' (measured ' || (v_row ->> 'taken') || ' of '
        || to_char((v_row ->> 'check_date')::date, 'FMDD Mon YYYY') || ')';

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

    when 'company_assets' then
      v_label := 'Company asset';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'purchase_value')::numeric;
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'An asset')
        || ' — ' || initcap(coalesce(v_row ->> 'category', 'other'))
        || ', Rs ' || to_char((v_row ->> 'purchase_value')::numeric, 'FM999,999,999,990');

    -- New: cash into or out of the safe. The details line is the whole point
    -- of the entry - "Munir sb by Hamza saqib", "Zamzam code transfer 118014"
    -- - so it is carried into the log rather than left behind in the row.
    when 'treasury_entries' then
      v_label := case v_row ->> 'direction' when 'in' then 'Cash into the safe'
                                            else 'Cash out of the safe' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      v_summary := 'Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || ' · ' || initcap(replace(coalesce(v_row ->> 'category', 'other'), '_', ' '))
        || coalesce(' — ' || nullif(btrim(coalesce(v_row ->> 'details', '')), ''), '');

    else
      v_label := tg_table_name;
      v_summary := tg_table_name;
  end case;

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
  return coalesce(new, old);
end;
$$;

drop trigger if exists treasury_entries_activity on public.treasury_entries;
create trigger treasury_entries_activity
  after insert or update or delete on public.treasury_entries
  for each row execute function public.trg_write_activity();
