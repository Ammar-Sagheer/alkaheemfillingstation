-- =============================================================================
-- 015_delete_reading_reverses_slips.sql
--
-- Closes a hole that migration 014 opened.
--
-- Before 014, ledger_entries.credit_sale_id was ON DELETE RESTRICT, so deleting
-- a single reading that had credit slips simply failed - and the app caught
-- that and told the owner to post an offsetting entry by hand.
--
-- 014 changed that FK to SET NULL so a whole day could be cleared. The side
-- effect: deleting ONE reading now succeeds quietly, taking the credit slip
-- with it and leaving the customer's debit standing on the ledger with nothing
-- to cancel it. The customer would appear to owe money for fuel the books no
-- longer show them taking.
--
-- So the single-reading delete gets the same treatment as clear_day: reverse
-- first, delete second, both in one transaction.
-- =============================================================================

create or replace function public.delete_reading(p_reading_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date;
  v_slips int;
  v_gone  int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may delete a reading' using errcode = '42501';
  end if;

  select reading_date into v_date
    from public.nozzle_readings where id = p_reading_id;

  if v_date is null then
    raise exception 'That reading no longer exists' using errcode = 'P0002';
  end if;

  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by)
  select cs.customer_id, 'credit', cs.amount, v_date,
         'Reversal - the nozzle entry for ' || to_char(v_date, 'DD Mon YYYY')
           || ' was deleted',
         auth.uid()
    from public.credit_sales cs
   where cs.reading_id = p_reading_id;

  get diagnostics v_slips = row_count;

  delete from public.nozzle_readings where id = p_reading_id;
  get diagnostics v_gone = row_count;

  return jsonb_build_object('deleted', v_gone, 'slips_reversed', v_slips);
end;
$$;

revoke execute on function public.delete_reading(uuid) from public, anon;
grant  execute on function public.delete_reading(uuid) to authenticated;
