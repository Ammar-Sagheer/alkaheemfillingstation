-- =============================================================================
-- 033_purge_a_mistyped_customer.sql
--
-- Deleting a customer PERMANENTLY - the row and the ledger entries with it.
--
-- Migration 031 gave the owner Remove, which deletes an account that never
-- traded and retires one that did. He then asked the obvious next question: a
-- customer added by mistake that somehow picked up entries is retired for ever
-- and sits in the Removed list looking like a real customer who left.
--
-- WHAT THIS IS ALLOWED TO TOUCH, AND WHY THAT LINE IS WHERE IT IS.
--
-- Only an account whose entire footprint is entries the owner TYPED HIMSELF -
-- payments and adjustments. No credit slips, no lubricant sales.
--
-- That is not squeamishness, it is the difference between two kinds of row:
--
--   a credit slip      belongs to a nozzle reading. A saved reading's
--                      credit_amount must equal the sum of its slips
--                      (nozzle_readings_credit_matches), and the litres behind
--                      it are part of that day's takings and that month's
--                      report. Deleting one either breaks the constraint or
--                      silently rewrites a day that has already been reported
--                      and exported.
--   a typed entry      belongs to nobody but the customer. No reading depends
--                      on it, no month's litres come from it. If the customer
--                      was a mistake then the entry was the same mistake, and
--                      removing both leaves every other figure in the database
--                      exactly where it was.
--
-- So: a customer who has ever actually traded cannot be purged, and the owner
-- is told why. Clearing the day on Readings is the route for that, and it
-- reverses the slip properly rather than hiding it.
--
-- HOW IT GETS PAST THE APPEND-ONLY GUARD.
--
-- ledger_entries has a BEFORE DELETE trigger that refuses everything, service
-- role included. That guarantee is the most valuable thing in this schema and
-- is not being weakened for convenience - so rather than disabling the trigger
-- (which would be off for every other session while it was off), the guard
-- learns ONE named exception: a delete is permitted only while
-- `app.purging_customer` holds this customer's id.
--
-- That setting is transaction-local and is set in exactly one place, by the
-- security-definer function below, after every check has passed. A stray
-- DELETE from the API, from server code, or from a future refactor still hits
-- the same refusal it always did, because none of them set it.
--
-- WHAT IT LEAVES BEHIND: nothing. The owner asked for gone, and a tombstone
-- row would mean the name never really left. The record of a purge is the
-- changelog and this file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The guard, with the new exception.
--
-- The UPDATE half is copied verbatim from migration 024 - restated in full
-- because a `create or replace` has to carry the whole body, and a reader
-- should not have to diff three migrations to know what the trigger does.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'created_by' - 'credit_sale_id' - 'lubricant_sale_id'
       = to_jsonb(old) - 'created_by' - 'credit_sale_id' - 'lubricant_sale_id'
     and (new.created_by        is not distinct from old.created_by        or new.created_by        is null)
     and (new.credit_sale_id    is not distinct from old.credit_sale_id    or new.credit_sale_id    is null)
     and (new.lubricant_sale_id is not distinct from old.lubricant_sale_id or new.lubricant_sale_id is null)
  then
    return new;
  end if;

  -- The one way a ledger entry may be deleted: purge_customer() is running,
  -- has already established that this customer never traded, and has named
  -- this customer in a transaction-local setting. Nothing else sets it.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purging_customer', true), '') = old.customer_id::text
  then
    return old;
  end if;

  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_ledger_append_only() is
  'Blocks UPDATE and DELETE on ledger_entries. Exceptions, and only these: '
  'created_by, credit_sale_id and lubricant_sale_id may be nulled when the row '
  'they point at is deleted; and a DELETE is allowed while '
  'app.purging_customer names the entry''s customer, which only '
  'purge_customer() ever sets.';

-- ---------------------------------------------------------------------------
-- The purge itself.
--
-- p_confirm_name is required and must match the customer's name. This is an
-- irreversible delete of money records reached from a table row, so a
-- mis-aimed click must not be enough - the owner has to type the name, and the
-- comparison is forgiving about case and surrounding space but nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.purge_customer(
  p_customer_id  uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_balance   numeric(14, 2);
  v_entries   int;
  v_slips     int;
  v_lub_sales int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may permanently delete a customer' using errcode = '42501';
  end if;

  select c.name into v_name from public.customers c where c.id = p_customer_id;
  if v_name is null then
    raise exception 'That customer no longer exists' using errcode = 'P0002';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception
      'To delete % permanently, type the name exactly as it appears.', v_name
      using errcode = '23514';
  end if;

  select count(*) into v_slips
    from public.credit_sales cs where cs.customer_id = p_customer_id;
  select count(*) into v_lub_sales
    from public.lubricant_sales ls where ls.customer_id = p_customer_id;

  -- Anything that came from a reading or a counter sale is part of a day that
  -- has been reported. Name the route out rather than just refusing.
  if v_slips > 0 or v_lub_sales > 0 then
    raise exception
      '% cannot be deleted permanently: % fuel credit slip(s) and % lubricant sale(s) '
      'are recorded against them, and those belong to days already on the books. '
      'Removing the account keeps that history intact, which is what Remove does. '
      'If the slips themselves are wrong, clear the day on Readings first - that '
      'reverses them properly.',
      v_name, v_slips, v_lub_sales
      using errcode = '23514';
  end if;

  select coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0),
         count(*)
    into v_balance, v_entries
    from public.ledger_entries le
   where le.customer_id = p_customer_id;

  -- Square first, to the rupee, exactly as Remove requires - deleting an
  -- account still carrying money would take that money off the books silently.
  if round(v_balance) <> 0 then
    raise exception
      '% is not settled - the balance stands at Rs %. Square the account first, '
      'then delete it.',
      v_name, trim(to_char(round(v_balance), 'FM999999999990'))
      using errcode = '23514';
  end if;

  -- Everything has passed. Name the customer so the append-only guard will let
  -- these particular rows go, and no others. set_config with is_local = true
  -- scopes it to this transaction, so it is gone the moment this returns.
  perform set_config('app.purging_customer', p_customer_id::text, true);

  delete from public.ledger_entries where customer_id = p_customer_id;
  delete from public.customers       where id          = p_customer_id;

  perform set_config('app.purging_customer', '', true);

  return jsonb_build_object('name', v_name, 'entries_deleted', v_entries);
end;
$$;

comment on function public.purge_customer(uuid, text) is
  'Deletes a customer and their ledger entries for good. Owner only, name must '
  'be typed to confirm, and only for an account that never traded - no credit '
  'slips, no lubricant sales - and is settled.';

revoke execute on function public.purge_customer(uuid, text) from public, anon;
grant  execute on function public.purge_customer(uuid, text) to authenticated;
