-- ---------------------------------------------------------------------------
-- 042 - the phone number reaches the Customers list
--
-- `customers.phone` has existed since 001 and the add/edit dialog has always
-- written to it. Nothing ever read it back: get_customer_balances and
-- get_retired_customers both select name, vehicle and limit, so a number typed
-- into the form went into the table and was never seen again. The owner asked
-- for it as a column, which is the first time anything has needed it out.
--
-- NO SCHEMA CHANGE - the column is already there. This only widens two read
-- functions, which is why there is no data migration and nothing to back out:
-- an older app talking to a newer database gets one extra field it ignores.
--
-- Both are `create or replace` of the whole function rather than an ALTER.
-- Postgres will not change a function's return type in place, so a widened
-- `returns table (...)` needs the function dropped and rebuilt. `create or
-- replace` fails with "cannot change return type of existing function", hence
-- the explicit drops - and hence the grants being restated underneath, because
-- dropping a function takes its grants with it. Leaving those out is how a
-- migration ships a function that every signed-in user is refused by.
-- ---------------------------------------------------------------------------

drop function if exists public.get_customer_balances();

create function public.get_customer_balances()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  phone          text,
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
         c.phone,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where c.is_active
   group by c.id, c.name, c.vehicle_number, c.phone, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_customer_balances() from public, anon;
grant  execute on function public.get_customer_balances() to authenticated;


drop function if exists public.get_retired_customers();

create function public.get_retired_customers()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  phone          text,
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
         c.phone,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where not c.is_active
   group by c.id, c.name, c.vehicle_number, c.phone, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_retired_customers() from public, anon;
grant  execute on function public.get_retired_customers() to authenticated;
