-- =============================================================================
-- 016_reset_all_data_safeupdate.sql
--
-- Fixes "DELETE requires a WHERE clause" when emptying the books.
--
-- Supabase preloads the `safeupdate` library into every connection the app
-- makes. Check it for yourself:
--
--   select rolname, rolconfig from pg_roles where rolname = 'authenticator';
--   -- {"session_preload_libraries=supautils, safeupdate", ...}
--
-- It rejects any UPDATE or DELETE written without a WHERE clause - the guard
-- against the classic slip of running `delete from customers` and taking the
-- table with it. reset_all_data() means exactly that, every row, so it was
-- written the obvious way and was refused on its first statement every time.
--
-- SECURITY DEFINER does not get around it. The check runs when the statement is
-- parsed, before privileges are looked at, and the library is loaded into the
-- session by the role the connection is made with - not the role the function
-- runs as. Nothing about this function's rights was ever the problem.
--
-- clear_day() was never affected: every statement in it is already narrowed to
-- one date.
--
-- The fix is `where true`. It reads as the deliberate "yes, all of them" that
-- this function actually means, and the guard is satisfied by a WHERE clause
-- being present. Only the statements changed; the behaviour is the one
-- migration 014 described.
-- =============================================================================

create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may reset the data' using errcode = '42501';
  end if;

  v_counts := jsonb_build_object(
    'readings',  (select count(*) from public.nozzle_readings),
    'customers', (select count(*) from public.customers),
    'purchases', (select count(*) from public.fuel_purchases),
    'expenses',  (select count(*) from public.expenses)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries where true;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales     where true;
  delete from public.nozzle_readings  where true;
  delete from public.stock_checks     where true;
  delete from public.fuel_purchases   where true;
  delete from public.expenses         where true;
  delete from public.customers        where true;
  delete from public.fuel_prices      where true;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  return v_counts;
end;
$$;

comment on function public.reset_all_data() is
  'Empties the books, keeping logins, tanks and nozzles. Testing scaffolding - '
  'the app only offers it while ALLOW_FULL_RESET is set. Every statement carries '
  'an explicit WHERE TRUE because Supabase preloads safeupdate, which refuses '
  'WHERE-less UPDATE and DELETE.';

revoke execute on function public.reset_all_data() from public, anon;
grant  execute on function public.reset_all_data() to authenticated;
