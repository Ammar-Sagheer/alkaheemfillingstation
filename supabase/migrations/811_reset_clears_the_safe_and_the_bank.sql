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
