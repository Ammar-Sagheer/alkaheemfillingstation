-- =============================================================================
-- 812 (the master's 086): a new customer's opening balance can carry its own date.
--
-- create_customer_with_opening() (034, 071) dated the opening entry with
-- pump_today(), the day the form was filled in. A pump that starts the app on
-- the 1st and then types the month in after the fact (the days already in its
-- paper register) therefore got an opening balance dated AFTER the days it
-- should sit before: on the customer's statement it appeared below the October
-- slips, and the running balance on every earlier day read from zero. The
-- manual adjustment on the customer's page already takes a date; this gives
-- the new-customer form the same.
--
-- The new argument, p_opening_date, is optional: null means today, exactly as
-- before. A date in the future is refused. Nothing else changes, and no
-- existing row is touched. The old six-argument function is replaced, not kept
-- beside the new one, so a call cannot be ambiguous.
-- =============================================================================

drop function if exists public.create_customer_with_opening(text, text, text, numeric, numeric, text);

create or replace function public.create_customer_with_opening(
  p_name              text,
  p_vehicle_number    text    default null,
  p_phone             text    default null,
  p_credit_limit      numeric default null,
  -- Always a positive figure; the direction says which way it goes.
  p_opening_amount    numeric default 0,
  p_opening_direction text    default null,   -- 'owes' | 'in_credit'
  -- The day the balance stood. Null is today.
  p_opening_date      date    default null
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
  v_date    date := coalesce(p_opening_date, public.pump_today());
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

  if v_date > public.pump_today() then
    raise exception 'The opening balance cannot be dated in the future.'
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
      (case when p_opening_direction = 'owes' then 'debit' else 'credit' end)::public.ledger_entry_type,
      v_amount,
      v_date,
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

comment on function public.create_customer_with_opening(text, text, text, numeric, numeric, text, date) is
  'Creates a customer and, in the same transaction, the opening ledger entry '
  'for any balance they already carried, dated p_opening_date (today when null, '
  'never in the future). Amount is positive; the direction decides whether it is '
  'a debit or a credit. See 034, 071 and 812.';

revoke execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text, date)
  from public, anon;
grant  execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text, date)
  to authenticated;
