-- 070: Banking keeps every entry. The 60-per-account cap is gone.
--
-- WHY. 018 kept only the 60 most recent transactions per account, folding
-- each removed row's amount into bank_accounts.pruned_* so the balance stayed
-- exact. The busy HBL account (Main Account 2303) fills 60 rows in about two
-- and a half weeks, so September's itemised entries were already being removed
-- before September's report had been downloaded - and the activity log showed
-- each removal as "Deleted: Money out of the bank, Rs 3,827,500" against the
-- owner's name, because it happened inside his own deposit (1 Oct 2026). The
-- owner asked for the limit to be removed.
--
-- WHAT. The trigger and its function are dropped. Nothing else changes:
--   * rows already removed (89 on Main Account 2303) are gone; their amounts
--     stay in pruned_deposits / pruned_payments / pruned_count, which the
--     balance view still adds in, so every balance is the same before and after;
--   * bank_account_balances is unchanged apart from its comment;
--   * the Banking page now asks Postgres for one page at a time, since the
--     list is no longer small (a plain select would stop silently at
--     PostgREST's 1,000-row ceiling).
--
-- No row is written by this migration.

drop trigger if exists bank_transactions_trim on public.bank_transactions;
drop function if exists public.trim_bank_transactions();

comment on view public.bank_account_balances is
  'Each account with its balance and lifetime totals. Includes the amounts of '
  'the entries the old 60-per-account cap removed before migration 070 '
  '(pruned_*), so the figures are whole. Every entry since is kept.';

comment on column public.bank_accounts.pruned_count is
  'How many entries the old 60-per-account cap removed before migration 070. '
  'Frozen since: nothing removes bank entries any more.';
