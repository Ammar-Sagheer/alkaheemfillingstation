-- =============================================================================
-- 011_delete_staff_account.sql
--
-- Lets a staff login be deleted outright, not just switched off.
--
-- THE PROBLEM THIS FIXES. Deleting a login could never work, and failed in a
-- way nobody would have guessed from the error message:
--
--   ledger_entries.created_by references profiles ON DELETE SET NULL, so
--   removing a profile makes Postgres UPDATE every ledger row that person
--   wrote, setting created_by to null. The append-only trigger sees an UPDATE
--   on ledger_entries and refuses it. The delete then fails with
--
--     0A000  The customer ledger is append-only.
--
--   which is true, and completely unhelpful - the caller was deleting a user,
--   not touching the ledger.
--
-- THE FIX. The trigger now allows exactly one update: created_by being cleared
-- as a profile goes away. Every other column must be byte-for-byte identical,
-- so this cannot be used as a way in to edit an amount. Deletes are still
-- refused outright, and so is any update that changes anything real.
--
-- Why not simply drop the foreign key or stop nulling it? Because then a
-- deleted profile would leave a dangling reference, and 'who recorded this'
-- would start pointing at a row that no longer exists. Null is the honest
-- answer: the account is gone, the entry stays, and the amount is untouched.
-- =============================================================================

create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- The one permitted update: a profile being deleted clears created_by.
    -- Compared as whole rows, so adding a column later cannot silently widen
    -- what this allows.
    if old.created_by is not null
       and new.created_by is null
       and to_jsonb(new) - 'created_by' = to_jsonb(old) - 'created_by'
    then
      return new;
    end if;
  end if;

  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_ledger_append_only() is
  'Blocks UPDATE and DELETE on ledger_entries. The sole exception is created_by '
  'being nulled when the profile that wrote the entry is deleted.';
