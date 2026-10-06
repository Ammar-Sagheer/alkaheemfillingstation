-- =============================================================================
-- 032_ledger_in_whole_rupees.sql
--
-- The customer ledger works in whole rupees, because Pakistan has no coin
-- below one.
--
-- WHAT WENT WRONG. A credit slip's amount is litres times the rate, so 11
-- litres at Rs 339.48 posted a debit of Rs 3,734.28. The customer paid the
-- Rs 3,734 he was asked for, and 28 paisa stayed on his account - not as a
-- debt, because nobody can hand over 28 paisa, but as arithmetic that no
-- payment will ever clear. The screen made it worse by disagreeing with
-- itself: the headline showed "Rs -5,000" rounded while the table below it
-- showed "Rs -4,999.72".
--
-- The app side now rounds every ledger write to whole rupees - credit slips,
-- payments, adjustments and lubricant sales. This migration is the other half:
-- the one place the app ASKS the database about a balance and acts on the
-- answer.
--
-- WHY delete_customer HAD TO CHANGE WITH IT. Its guard refused removal while
-- the balance was not exactly zero. With the ledger displayed in whole rupees,
-- a legacy 28-paisa residue reads as "Rs 0" on screen and still refuses - an
-- account that looks settled, cannot be removed, and gives a reason quoting a
-- figure the owner has no way to pay. So the guard now rounds too, and the two
-- agree: if the account reads as square, it is square.
--
-- This is not a write-off waved through. It rounds to the nearest rupee, so
-- the most it can ever forgive is 49 paisa - less than the smallest coin that
-- exists. Anything a customer could actually be asked for still blocks removal
-- and still names the figure.
--
-- The meter arithmetic is deliberately NOT touched. nozzle_readings.sale_amount
-- is litres times a rate and genuinely carries paisa; rounding it would put the
-- day's takings out of step with the litres that produced them. The difference
-- lands on the cash side, which is right - cash is the residual, and it is
-- counted in notes.
-- =============================================================================

create or replace function public.delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_balance   numeric(14, 2);
  v_owed      numeric(14, 2);
  v_entries   int;
  v_slips     int;
  v_lub_sales int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a customer' using errcode = '42501';
  end if;

  select c.name into v_name from public.customers c where c.id = p_customer_id;
  if v_name is null then
    raise exception 'That customer no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0),
         count(*)
    into v_balance, v_entries
    from public.ledger_entries le
   where le.customer_id = p_customer_id;

  select count(*) into v_slips
    from public.credit_sales cs where cs.customer_id = p_customer_id;
  select count(*) into v_lub_sales
    from public.lubricant_sales ls where ls.customer_id = p_customer_id;

  -- To the rupee, matching what the screen shows and what a customer could
  -- actually be asked to hand over.
  v_owed := round(v_balance);

  if v_owed > 0 then
    raise exception
      '% still owes Rs %. Removing the account now would drop that from what the '
      'pump is owed, and nothing would show it had gone. Record the payment on '
      'their page first, then remove them.',
      v_name, trim(to_char(v_owed, 'FM999999999990'))
      using errcode = '23514';
  end if;

  if v_owed < 0 then
    raise exception
      'The pump owes % Rs % - they have paid more than they have taken. Removing '
      'the account would lose that. Settle it on their page first (or post an '
      'adjustment if the payment belongs to someone else), then remove them.',
      v_name, trim(to_char(-v_owed, 'FM999999999990'))
      using errcode = '23514';
  end if;

  if v_entries = 0 and v_slips = 0 and v_lub_sales = 0 then
    delete from public.customers where id = p_customer_id;
    return jsonb_build_object('name', v_name, 'removed', true,
                              'entries', 0, 'slips', 0, 'lubricant_sales', 0);
  end if;

  update public.customers
     set is_active = false
   where id = p_customer_id;

  return jsonb_build_object('name', v_name, 'removed', false,
                            'entries', v_entries, 'slips', v_slips,
                            'lubricant_sales', v_lub_sales);
end;
$$;

comment on function public.delete_customer(uuid) is
  'Removes a customer: deleted outright when never traded, retired when it has '
  'history. Refuses while the account is not square to the nearest rupee, so a '
  'balance cannot vanish from what the pump is owed.';
