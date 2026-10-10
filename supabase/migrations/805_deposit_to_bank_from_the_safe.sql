-- =============================================================================
-- 805: depositing cash from the safe into a bank account is ONE entry.
--
-- WHY. The safe (Treasury, 044) and the bank accounts (018) were two separate
-- books. Taking cash to the bank meant two entries: "Deposited in a bank" out of
-- the safe, and a deposit into the account. Forgetting one left the safe lower
-- and the bank no higher (or the bank higher and the safe unchanged), and the
-- owner reconciles both against a bank slip.
--
-- WHAT. deposit_to_bank() writes both in one transaction:
--   * a Treasury entry, cash OUT, category 'bank_deposit', naming the account;
--   * a bank deposit into that account, same date and amount;
-- and links them: bank_transactions.treasury_entry_id points at the safe entry.
-- Deleting either one deletes the other, so the two books cannot drift apart.
--
-- THE SAFE'S OWN RULE STILL APPLIES, in its own words: the safe cannot be driven
-- below nothing (treasury_never_negative, checked at the end of the transaction),
-- so a deposit the safe cannot cover fails and writes neither half. The bank's
-- rule (020) only refuses payments that overdraw, never deletes ("deletes are
-- corrections and must stay possible"), so deleting a deposit stays possible
-- from either side, and takes its other half with it.
--
-- NOTHING EXISTING CHANGES. The new column is nullable (051), null on every
-- existing row, and a safe entry of 'bank_deposit' written by hand before this
-- stays a plain safe entry with no bank half, as it always was.
-- =============================================================================

alter table public.bank_transactions
  add column if not exists treasury_entry_id uuid
  references public.treasury_entries (id) on delete cascade;

create index if not exists bank_transactions_treasury_entry_idx
  on public.bank_transactions (treasury_entry_id)
  where treasury_entry_id is not null;

comment on column public.bank_transactions.treasury_entry_id is
  'Set when this deposit was made from the safe by deposit_to_bank() (805): the safe entry it came out of. Deleting either deletes the other.';

-- Deleting the bank half removes the safe half. (Deleting the safe half removes
-- the bank half through the foreign key above; by then the safe row is already
-- gone, so this has nothing to do.)
create or replace function public.trg_bank_deposit_takes_its_safe_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.treasury_entry_id is not null then
    delete from public.treasury_entries where id = old.treasury_entry_id;
  end if;
  return old;
end;
$$;

drop trigger if exists bank_transactions_take_safe_entry on public.bank_transactions;
create trigger bank_transactions_take_safe_entry
  after delete on public.bank_transactions
  for each row execute function public.trg_bank_deposit_takes_its_safe_entry();

create or replace function public.deposit_to_bank(
  p_account_id uuid, p_amount numeric, p_date date, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc    public.bank_accounts;
  v_amount numeric(14, 2) := round(p_amount, 2);
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_entry  uuid;
  v_txn    uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may deposit to a bank' using errcode = '42501';
  end if;

  select * into v_acc from public.bank_accounts where id = p_account_id;
  if v_acc.id is null then
    raise exception 'That bank account is no longer there. Reload the page.' using errcode = 'P0001';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter how much is being deposited, above zero.' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'Enter the date of the deposit.' using errcode = 'P0001';
  end if;

  insert into public.treasury_entries (entry_date, direction, amount, category, details, created_by)
  values (p_date, 'out', v_amount, 'bank_deposit',
          'Deposited in ' || v_acc.bank_name || ', ' || v_acc.account_label
            || coalesce('. ' || v_note, ''),
          auth.uid())
  returning id into v_entry;

  insert into public.bank_transactions
    (account_id, txn_type, amount, txn_date, category, note, created_by, treasury_entry_id)
  values
    (p_account_id, 'deposit', v_amount, p_date, null,
     coalesce(v_note, 'Cash from the safe'), auth.uid(), v_entry)
  returning id into v_txn;

  return jsonb_build_object(
    'treasury_entry_id', v_entry,
    'bank_transaction_id', v_txn,
    'message', 'Rs ' || to_char(v_amount, 'FM999,999,999,990') || ' taken out of the safe and deposited in '
               || v_acc.bank_name || ', ' || v_acc.account_label || '.'
  );
end;
$$;

revoke all on function public.deposit_to_bank(uuid, numeric, date, text) from public, anon;
grant execute on function public.deposit_to_bank(uuid, numeric, date, text) to authenticated;
revoke all on function public.trg_bank_deposit_takes_its_safe_entry() from public, anon, authenticated;
