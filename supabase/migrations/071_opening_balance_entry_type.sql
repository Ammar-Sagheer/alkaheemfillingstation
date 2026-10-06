-- =============================================================================
-- 071_opening_balance_entry_type.sql
--
-- A new customer with an opening balance could never be saved.
--
-- WHAT WENT WRONG. 034's create_customer_with_opening() chose the ledger entry's
-- type with
--
--     case when p_opening_direction = 'owes' then 'debit' else 'credit' end
--
-- Both branches are bare string literals, so Postgres types the CASE as text,
-- and ledger_entries.entry_type is the enum ledger_entry_type. There is no
-- assignment cast from text to an enum, so every call with an amount above zero
-- failed with "column entry_type is of type ledger_entry_type but expression is
-- of type text". The function is one transaction, so the customer was not
-- created either and the owner saw only an error. A customer with no opening
-- amount never reaches that insert, which is why adding customers otherwise
-- worked and the fault went unnoticed. The live books hold no opening-balance
-- entry at all (checked 3 Oct 2026), which is what never working looks like.
--
-- THE FIX. One cast on that CASE. Everything else is 034's function unchanged:
-- the same checks, the same whole-rupee rounding, the same notes on the entry,
-- the same both-or-neither transaction. No existing row is touched, and since
-- the function never succeeded with an amount there is nothing to repair.
--
-- 034 is not edited because it has run on the live database; a migration that
-- has run is never edited.
-- =============================================================================

create or replace function public.create_customer_with_opening(
  p_name              text,
  p_vehicle_number    text    default null,
  p_phone             text    default null,
  p_credit_limit      numeric default null,
  -- Always a positive figure; the direction says which way it goes.
  p_opening_amount    numeric default 0,
  p_opening_direction text    default null   -- 'owes' | 'in_credit'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_amount  numeric(14, 2);
  v_actor   uuid := auth.uid();
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the customer''s name' using errcode = '23514';
  end if;

  -- Whole rupees, like every other ledger write since migration 032.
  v_amount := round(coalesce(p_opening_amount, 0));

  if v_amount < 0 then
    raise exception
      'Enter the opening balance as a positive figure and choose which way it goes.'
      using errcode = '23514';
  end if;

  if v_amount > 0 and coalesce(p_opening_direction, '') not in ('owes', 'in_credit') then
    raise exception
      'Say whether the customer owes this amount or is in credit for it.'
      using errcode = '23514';
  end if;

  insert into public.customers (name, vehicle_number, phone, credit_limit, created_by)
  values (btrim(p_name),
          nullif(btrim(coalesce(p_vehicle_number, '')), ''),
          nullif(btrim(coalesce(p_phone, '')), ''),
          p_credit_limit,
          v_actor)
  returning id into v_id;

  if v_amount > 0 then
    insert into public.ledger_entries
      (customer_id, entry_type, amount, entry_date, note, created_by)
    values (
      v_id,
      -- The cast is the whole of this migration: without it the CASE is text.
      (case when p_opening_direction = 'owes' then 'debit' else 'credit' end)::public.ledger_entry_type,
      v_amount,
      public.pump_today(),
      case when p_opening_direction = 'owes'
           then 'Opening balance - owed when the account was set up'
           else 'Opening balance - paid ahead when the account was set up'
      end,
      v_actor
    );
  end if;

  return v_id;
end;
$$;

comment on function public.create_customer_with_opening(text, text, text, numeric, numeric, text) is
  'Creates a customer and, in the same transaction, the opening ledger entry '
  'for any balance they already carried. Amount is positive; the direction '
  'decides whether it is a debit or a credit. Fixed in 071: the entry type is '
  'cast to ledger_entry_type, without which every opening amount was refused.';

-- Unchanged from 034, restated so this file alone leaves the grants right.
revoke execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text)
  from public, anon;
grant  execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text)
  to authenticated;
