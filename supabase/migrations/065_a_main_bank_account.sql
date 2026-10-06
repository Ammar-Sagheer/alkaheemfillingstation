-- =============================================================================
-- 065_a_main_bank_account.sql
--
-- One bank account can be marked as the MAIN one, and the money in / money out
-- form on Banking starts on it.
--
-- WHY. The form used to start on whichever account was added first, which is
-- the order `getBankAccounts()` reads them in. On this pump that is not the
-- account the day's cash goes into, so every deposit began with changing the
-- account - the owner asked for the main account to be the default. Nothing in
-- the books recorded which account that is, so it is recorded here, and the
-- owner marks it himself on Banking ("Make main"). Guessing it (the busiest
-- account, the last one used) was offered and turned down: he knows which
-- account is his main one, and a guess would be wrong the month another
-- account happened to be busier.
--
-- NOTHING ALREADY IN THE BOOKS CHANGES. A new column, false/empty on every
-- existing account until one is marked; no balance, total or transaction is
-- touched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The flag.
--
-- NULLABLE ON PURPOSE, with null read as "not main". `restore_everything()`
-- (migration 051) writes every column of a table BY NAME from the backup file,
-- and a backup taken before this migration has no `is_main` in its rows, so the
-- value arrives as null. NOT NULL would refuse every account in such a file and
-- with it the whole restore - a backup that cannot be put back is worse than no
-- flag at all. A null restores as "not main", which is exactly what it was.
-- ---------------------------------------------------------------------------
alter table public.bank_accounts
  add column if not exists is_main boolean default false;

comment on column public.bank_accounts.is_main is
  'The account the Banking form starts on. At most one is true; null and false both mean not main.';

-- At most one main account. A partial unique index on a constant: every row it
-- covers has the same key, so a second `true` is refused by the database, not
-- merely avoided by the app.
create unique index if not exists bank_accounts_one_main
  on public.bank_accounts ((true))
  where is_main;

-- ---------------------------------------------------------------------------
-- The list the app reads carries it.
--
-- Recreated with `is_main` as the LAST column: CREATE OR REPLACE VIEW may only
-- add columns at the end, and the month-export functions (019, 025, 030, 040)
-- read this view by column name, so nothing they use moves. Same body as 018
-- otherwise, security_invoker kept, so the owner-only policy on the table still
-- decides who sees a row.
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
       count(t.id) as kept_count,
       coalesce(a.is_main, false) as is_main
  from public.bank_accounts a
  left join public.bank_transactions t on t.account_id = a.id
 group by a.id;

comment on view public.bank_account_balances is
  'Each account with its balance and lifetime totals. Includes what the '
  '60-entry cap removed, so the figures do not change when old detail ages out. '
  'is_main (065) says which account the Banking form starts on.';

grant select on public.bank_account_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Marking an account as the main one.
--
-- TWO STATEMENTS, AND THEIR ORDER IS THE POINT. A unique index is checked row
-- by row as an UPDATE runs, so one statement that turned the new account on
-- and the old one off could meet the new `true` before the old one was
-- cleared, and be refused depending on which row Postgres happened to visit
-- first. Clearing first and setting second, inside one function (so one
-- transaction), can never have two at once - and a failure part-way leaves no
-- main account rather than two.
--
-- Owner only, like everything on bank_accounts (018). Marking the account that
-- is already main is not an error; it changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.set_main_bank_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner can choose the main bank account.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.bank_accounts where id = p_account_id) then
    raise exception 'That account is not on the list any more. Reload the page and choose again.'
      using errcode = 'P0002';
  end if;

  update public.bank_accounts
     set is_main = false
   where is_main
     and id <> p_account_id;

  update public.bank_accounts
     set is_main = true
   where id = p_account_id
     and is_main is not true;
end;
$$;

comment on function public.set_main_bank_account(uuid) is
  'Makes one bank account the main one (the Banking form starts on it), clearing whichever was main before.';

revoke execute on function public.set_main_bank_account(uuid) from public, anon;
grant  execute on function public.set_main_bank_account(uuid) to authenticated;
