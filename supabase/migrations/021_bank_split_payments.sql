-- =============================================================================
-- 021_bank_split_payments.sql
--
-- No account may go negative, and a payment too big for one account can be
-- covered from the others.
--
-- Migration 020 checked the combined balance of every account, which let a
-- single account go overdrawn as long as another held enough to cover it. The
-- rule is now per account: each one must stand up on its own. That is strictly
-- stronger - if no account is negative the total cannot be either - so the
-- combined check is replaced rather than kept alongside.
--
-- Refusing more often needs a way through, which is what record_bank_payment()
-- is for. A payment larger than the chosen account takes what that account has
-- and draws the rest from the other accounts the owner picked, in the order he
-- picked them, writing one transaction per account.
--
-- WHY AN RPC AND NOT A LOOP IN THE APP. A split is several inserts that are one
-- payment. Sent one at a time from the app, a failure half way through leaves
-- part of a payment recorded and the books wrong in a way nobody would think to
-- look for. In here they are one statement and one transaction: all of them or
-- none.
--
-- The split is also computed HERE, from the balances as they actually are, and
-- never from figures the browser posted. The form works the same allocation out
-- while the owner types, but that is for showing him - what gets written is
-- decided against the real numbers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One definition of what an account holds, used by everything below.
--
-- Returns the true balance, which may be negative - callers clamp it themselves
-- when they mean "available to draw". Includes what the 60-entry cap folded
-- away, so old detail ageing off the page cannot free up headroom.
-- ---------------------------------------------------------------------------
create or replace function public.bank_account_balance(p_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
           select a.opening_balance + a.pruned_deposits - a.pruned_payments
             from public.bank_accounts a where a.id = p_account_id
         ), 0)
       + coalesce((
           select sum(case when t.txn_type = 'deposit' then t.amount else -t.amount end)
             from public.bank_transactions t where t.account_id = p_account_id
         ), 0);
$$;

comment on function public.bank_account_balance(uuid) is
  'What one account holds: opening balance, plus everything paid in, minus '
  'everything paid out, including amounts the 60-entry cap has folded away. '
  'May be negative.';

-- ---------------------------------------------------------------------------
-- Per-account guard, replacing the combined one from migration 020
-- ---------------------------------------------------------------------------
create or replace function public.check_bank_funds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available numeric(14, 2);
  v_label     text;
begin
  -- Money in never needs checking; it can only increase what is there.
  if new.txn_type <> 'payment' then
    return new;
  end if;

  v_available := greatest(public.bank_account_balance(new.account_id), 0);

  if new.amount > v_available then
    select account_label into v_label from public.bank_accounts where id = new.account_id;

    raise exception
      'That is more than % holds. It has Rs %, and this pays out Rs %.',
      coalesce(v_label, 'this account'),
      trim(to_char(v_available, 'FM999,999,999,990.00')),
      trim(to_char(new.amount,  'FM999,999,999,990.00'))
      using hint = 'Take the rest from another account, or record the deposit that covers it first.';
  end if;

  return new;
end;
$$;

comment on function public.check_bank_funds() is
  'Refuses a payment larger than that one account holds. Insert only - deletes '
  'are corrections and must stay possible, and an account delete cascade must '
  'not be aborted part way.';

-- ---------------------------------------------------------------------------
-- One payment, across as many accounts as it takes
-- ---------------------------------------------------------------------------
create or replace function public.record_bank_payment(
  p_account_id uuid,
  p_amount     numeric,
  p_date       date,
  p_category   text default null,
  p_note       text default null,
  p_cover_ids  uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(14, 2);
  v_order     uuid[];
  v_id        uuid;
  v_take      numeric(14, 2);
  v_available numeric(14, 2);
  v_parts     jsonb := '[]'::jsonb;
  v_count     integer := 0;
  v_part      jsonb;
  v_note      text;
  v_category  text;
  v_labels    text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may record a bank payment' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero.';
  end if;
  if p_date is null then
    raise exception 'Enter the date.';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_account_id) then
    raise exception 'That account no longer exists. Reload the page and try again.';
  end if;

  -- The chosen account first - it is the one the owner meant - then the others
  -- in the order he picked them. The chosen account and any repeats are dropped
  -- from the cover list so no account is drawn on twice.
  v_order := array[p_account_id];
  if p_cover_ids is not null then
    foreach v_id in array p_cover_ids loop
      if v_id is not null and not (v_id = any(v_order)) then
        v_order := v_order || v_id;
      end if;
    end loop;
  end if;

  v_remaining := round(p_amount, 2);

  -- Work out who pays what before writing anything, so a shortfall is refused
  -- with nothing recorded rather than part way through.
  foreach v_id in array v_order loop
    exit when v_remaining <= 0;

    v_available := greatest(public.bank_account_balance(v_id), 0);
    v_take := least(v_remaining, v_available);

    if v_take > 0 then
      v_count  := v_count + 1;
      v_parts  := v_parts || jsonb_build_object('account_id', v_id, 'amount', v_take);
      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  if v_remaining > 0 then
    raise exception
      'Rs % of this payment is not covered by the accounts chosen.',
      trim(to_char(v_remaining, 'FM999,999,999,990.00'))
      using hint = 'Pick another account to take it from, or record the deposit that covers it first.';
  end if;

  v_category := nullif(btrim(coalesce(p_category, '')), '');
  v_note     := nullif(btrim(coalesce(p_note, '')), '');

  -- A split is one payment written as several rows. Saying so on each row is
  -- what makes three entries dated the same day read as one payment later,
  -- rather than three that happen to look similar.
  if v_count > 1 then
    v_note := concat_ws(' · ', v_note,
                format('part of a Rs %s payment split across %s accounts',
                       trim(to_char(round(p_amount, 2), 'FM999,999,999,990.00')), v_count));
  end if;

  for v_part in select * from jsonb_array_elements(v_parts) loop
    insert into public.bank_transactions
      (account_id, txn_type, amount, txn_date, category, note, created_by)
    values
      ((v_part ->> 'account_id')::uuid, 'payment', (v_part ->> 'amount')::numeric,
       p_date, v_category, v_note, auth.uid());
  end loop;

  select string_agg(format('Rs %s from %s',
                           trim(to_char((part ->> 'amount')::numeric, 'FM999,999,999,990.00')),
                           a.account_label), ', ')
    into v_labels
    from jsonb_array_elements(v_parts) part
    join public.bank_accounts a on a.id = (part ->> 'account_id')::uuid;

  return jsonb_build_object(
    'accounts_used', v_count,
    'message', case when v_count > 1
                    then format('Payment recorded across %s accounts: %s.', v_count, v_labels)
                    else format('Payment recorded: %s.', v_labels) end
  );
end;
$$;

comment on function public.record_bank_payment(uuid, numeric, date, text, text, uuid[]) is
  'Records one payment, taking what the chosen account holds and drawing the '
  'rest from the accounts given, in order. All rows or none. The split is '
  'computed here from real balances, never from what the browser posted.';

revoke execute on function public.bank_account_balance(uuid) from public, anon;
revoke execute on function public.record_bank_payment(uuid, numeric, date, text, text, uuid[])
  from public, anon;
grant  execute on function public.bank_account_balance(uuid) to authenticated;
grant  execute on function public.record_bank_payment(uuid, numeric, date, text, text, uuid[])
  to authenticated;
