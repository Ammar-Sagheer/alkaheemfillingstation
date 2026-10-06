-- =============================================================================
-- 020_bank_no_overdraw.sql
--
-- Money out may not exceed the money there is.
--
-- The rule is deliberately across ALL accounts together, not per account: the
-- owner treats the two as one pot and moves money between them, so a payment
-- from one covered by cash sitting in the other is normal and should not be
-- refused. What is refused is paying out more than exists anywhere.
--
-- "The money there is" is every account's opening balance, plus everything paid
-- in, minus everything paid out - including the amounts the 60-entry cap has
-- already folded into pruned_deposits / pruned_payments. Old detail ageing off
-- the page therefore does not quietly free up headroom.
--
-- WHY ONLY ON INSERT. A payment being recorded is the thing worth stopping, and
-- it is stopped before it lands. Deletes are left alone on purpose:
--
--   * deleting a transaction is how a mistake gets corrected, and blocking a
--     correction because the books are already wrong traps the owner - he would
--     have to unpick entries in an exact order to get back to a legal state
--   * an account delete cascades to its rows, and a per-row delete check would
--     abort that cascade half way through
--
-- A correction can therefore still leave the total negative. That is visible
-- rather than silent: the balance shows in red on the Banking page, and the
-- next payment is refused until it is put right.
-- =============================================================================

create or replace function public.check_bank_funds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available numeric(14, 2);
begin
  -- Money in never needs checking; it can only increase what is there.
  if new.txn_type <> 'payment' then
    return new;
  end if;

  select coalesce(sum(a.opening_balance + a.pruned_deposits - a.pruned_payments), 0)
       + coalesce((
           select sum(case when t.txn_type = 'deposit' then t.amount else -t.amount end)
             from public.bank_transactions t
         ), 0)
    into v_available
    from public.bank_accounts a;

  if new.amount > v_available then
    raise exception
      'That is more than the money in the accounts. Across every account there is Rs %, and this pays out Rs %.',
      trim(to_char(v_available, 'FM999,999,999,990.00')),
      trim(to_char(new.amount,  'FM999,999,999,990.00'))
      using hint = 'Record the deposit that covers it first, or correct the amount.';
  end if;

  return new;
end;
$$;

comment on function public.check_bank_funds() is
  'Refuses a payment larger than the combined balance of every account. Insert '
  'only - deletes are corrections and must stay possible, and an account delete '
  'cascade must not be aborted part way.';

create trigger bank_transactions_check_funds
  before insert on public.bank_transactions
  for each row execute function public.check_bank_funds();
