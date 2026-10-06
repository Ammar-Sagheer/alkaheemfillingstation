-- =============================================================================
-- 006_lock_down_function_grants.sql
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. The
-- revokes in 003/005 only named `anon`, which left that PUBLIC grant in place -
-- so the reporting functions were still reachable without signing in. (The role
-- checks inside them would have refused, but they should not be callable at
-- all.)
--
-- This migration revokes PUBLIC + anon explicitly on every function, then
-- grants back only what a signed-in user actually calls. Revokes are listed one
-- function at a time rather than "all functions in schema public" so that
-- extension functions living in the same schema are left alone.
--
-- The role helpers stay callable by authenticated on purpose: RLS policies
-- reference them, and they only ever report on the caller's own account.
-- =============================================================================

-- Trigger functions need a pinned search_path like everything else.
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Nothing is callable by anonymous visitors.
-- ---------------------------------------------------------------------------
revoke execute on function public.auth_role()                                    from public, anon;
revoke execute on function public.is_super_admin()                               from public, anon;
revoke execute on function public.is_active_staff()                              from public, anon;
revoke execute on function public.handle_new_user()                              from public, anon, authenticated;
revoke execute on function public.current_fuel_rate(public.fuel_type, date)      from public, anon;
revoke execute on function public.calculate_expected_stock(uuid, date)           from public, anon;
revoke execute on function public.recalc_tank_stock(uuid)                        from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_tank_row()                from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_reading()                 from public, anon, authenticated;
revoke execute on function public.trg_post_credit_sale_to_ledger()               from public, anon, authenticated;
revoke execute on function public.trg_validate_credit_total()                    from public, anon, authenticated;
revoke execute on function public.trg_validate_reading_credit_total()            from public, anon, authenticated;
revoke execute on function public.trg_ledger_append_only()                       from public, anon, authenticated;
revoke execute on function public.customer_balance(uuid)                         from public, anon;
revoke execute on function public.get_daily_summary(date)                        from public, anon;
revoke execute on function public.get_sales_trend(date, date)                    from public, anon;
revoke execute on function public.get_monthly_report(int, int)                   from public, anon;
revoke execute on function public.get_customer_statement(uuid)                   from public, anon;
revoke execute on function public.get_customer_balances()                        from public, anon;
revoke execute on function
  public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb)
  from public, anon;

-- ---------------------------------------------------------------------------
-- Grant back exactly what a signed-in user needs.
--
-- The reporting functions still carry their own is_super_admin() check inside,
-- so a data_entry login that calls them directly is refused by the function
-- even though it is allowed to reach it.
-- ---------------------------------------------------------------------------
grant execute on function public.auth_role()                               to authenticated;
grant execute on function public.is_super_admin()                          to authenticated;
grant execute on function public.is_active_staff()                         to authenticated;
grant execute on function public.current_fuel_rate(public.fuel_type, date) to authenticated;
grant execute on function public.calculate_expected_stock(uuid, date)      to authenticated;
grant execute on function public.customer_balance(uuid)                    to authenticated;
grant execute on function public.get_daily_summary(date)                   to authenticated;
grant execute on function public.get_sales_trend(date, date)               to authenticated;
grant execute on function public.get_monthly_report(int, int)              to authenticated;
grant execute on function public.get_customer_statement(uuid)              to authenticated;
grant execute on function public.get_customer_balances()                   to authenticated;
grant execute on function
  public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb)
  to authenticated;
