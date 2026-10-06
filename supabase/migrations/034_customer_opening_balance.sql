-- =============================================================================
-- 034_customer_opening_balance.sql
--
-- Creating a customer who already has a balance.
--
-- Most of the names going into this app are not new customers - they are
-- people who have been taking fuel on credit out of a paper register for
-- years, and some of them owe money on the day they are typed in. A few are
-- the other way round and have paid ahead. Until now the only route was:
-- create the customer, then remember to go into their page and post a manual
-- adjustment. The second half is easy to forget, and a customer silently
-- starting at zero when they owe Rs 40,000 is money quietly leaving the books.
--
-- WHY THIS IS A FUNCTION AND NOT TWO INSERTS FROM THE ACTION. The customer row
-- and the opening entry have to land together. Two separate inserts can leave
-- the customer created and the balance missing if the second one fails - which
-- is exactly the silent zero this is meant to prevent. One function, one
-- transaction, both or neither.
--
-- The opening entry is an ordinary ledger row and the append-only rule applies
-- to it in full: it can never be edited or deleted, only offset by another
-- entry. That is the point. It also means the note has to say what it is
-- without anyone remembering the conversation, so the function writes it.
-- =============================================================================

create or replace function public.create_customer_with_opening(
  p_name              text,
  p_vehicle_number    text    default null,
  p_phone             text    default null,
  p_credit_limit      numeric default null,
  -- Always a positive figure; the direction says which way it goes. Asking for
  -- a signed number here would mean the caller could send -500 with a
  -- direction of 'owes', and the two would disagree with nothing to arbitrate.
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
      case when p_opening_direction = 'owes' then 'debit' else 'credit' end,
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
  'decides whether it is a debit or a credit.';

revoke execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text)
  from public, anon;
grant  execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text)
  to authenticated;
