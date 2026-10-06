-- =============================================================================
-- 031_remove_a_customer.sql
--
-- Taking a customer off the list - a name typed wrong, a duplicate, or an
-- account that has genuinely finished.
--
-- THE SAME TWO MEANINGS AS delete_lubricant (migration 024), for the same
-- reason:
--
--   never traded    - a typo, or an account opened and never used. There is
--                     nothing to preserve, so it is deleted outright.
--   has any history - deleting would tear a hole in months that have already
--                     been reported and exported, and the ledger's whole point
--                     is that it still adds up a year later. The account is
--                     RETIRED instead: it leaves the customer list and the
--                     credit-slip dropdown, and every entry it ever carried
--                     keeps counting.
--
-- Which one happened comes back in the result, so the screen can say so rather
-- than leaving the owner to guess.
--
-- AND ONE GUARD THAT delete_lubricant DOES NOT NEED.
--
-- A retired customer disappears from get_customer_balances, which is what the
-- Customers page totals "still outstanding" from. Retire someone who owes
-- Rs 50,000 and the pump's own record of what it is owed silently drops by
-- Rs 50,000, with nothing on screen to say why. So an account may only be
-- removed when it is SQUARE.
--
-- Both directions are refused, not just a debt:
--
--   balance > 0   they owe the pump. Removing it writes the debt off by
--                 accident.
--   balance < 0   the pump owes them - they have paid ahead, or a payment was
--                 recorded against the wrong name. Hiding that loses money
--                 belonging to a customer, which is worse than an untidy list.
--
-- The way out of both is on the customer's own page: record the settling
-- payment, or post an adjustment, and then remove them.
--
-- Deleting is not the same as the ledger being editable. The append-only rule
-- (migration 014) is about CORRECTING an entry, which is still forbidden; this
-- removes a name that has no entries, or hides one whose entries all stay put.
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

  -- The account has to be square first. Named amounts and a next step, because
  -- this message is the only explanation the owner gets.
  if v_balance > 0 then
    raise exception
      '% still owes Rs %. Removing the account now would drop that from what the '
      'pump is owed, and nothing would show it had gone. Record the payment on '
      'their page first, then remove them.',
      v_name, trim(to_char(v_balance, 'FM999999999990.00'))
      using errcode = '23514';
  end if;

  if v_balance < 0 then
    raise exception
      'The pump owes % Rs % - they have paid more than they have taken. Removing '
      'the account would lose that. Settle it on their page first (or post an '
      'adjustment if the payment belongs to someone else), then remove them.',
      v_name, trim(to_char(-v_balance, 'FM999999999990.00'))
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
  'history. Refuses either way while the account is not square, so a balance '
  'cannot vanish from what the pump is owed.';

revoke execute on function public.delete_customer(uuid) from public, anon;
grant  execute on function public.delete_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Retired customers have to be findable, or "removed" is indistinguishable
-- from "lost". get_customer_balances only returns active ones, on purpose -
-- that is the working list. This is the other half.
--
-- Balances come along because a retired account is not guaranteed to be square
-- for ever: the trigger checks at the moment of removal, and a later
-- correction elsewhere could move it. Showing the figure means that is visible
-- rather than hidden behind is_active.
-- ---------------------------------------------------------------------------
create or replace function public.get_retired_customers()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  credit_limit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.vehicle_number,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where not c.is_active
   group by c.id, c.name, c.vehicle_number, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_retired_customers() from public, anon;
grant  execute on function public.get_retired_customers() to authenticated;
