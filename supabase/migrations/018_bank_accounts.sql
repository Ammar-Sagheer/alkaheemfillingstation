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
