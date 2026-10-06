-- =============================================================================
-- 003_rls_policies.sql
--
-- Row Level Security. This is the source of truth for what each role can do -
-- the requireRole() helper in the app is a second line of defence, not the
-- first. Everything is denied unless a policy below allows it.
--
-- Roles in short:
--   data_entry   - records daily work: readings, purchases, stock dips,
--                  customers, ledger payments. Cannot see money reports,
--                  cannot change past entries, cannot touch configuration.
--   super_admin  - everything, including prices, tanks, nozzles, expenses,
--                  reports, and correcting past entries.
--
-- Note on the ledger: it has NO update or delete policy at all, on purpose.
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.tanks           enable row level security;
alter table public.nozzles         enable row level security;
alter table public.fuel_prices     enable row level security;
alter table public.customers       enable row level security;
alter table public.nozzle_readings enable row level security;
alter table public.credit_sales    enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.fuel_purchases  enable row level security;
alter table public.stock_checks    enable row level security;
alter table public.expenses        enable row level security;

-- ---------------------------------------------------------------------------
-- profiles - you can see yourself; a super_admin can see and manage everyone.
-- Nobody deletes a profile: deactivate with is_active = false so their past
-- entries keep their author.
-- ---------------------------------------------------------------------------
create policy "profiles: read own or all as super admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_super_admin());

create policy "profiles: super admin creates"
  on public.profiles for insert to authenticated
  with check (public.is_super_admin());

create policy "profiles: super admin updates"
  on public.profiles for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Configuration: tanks, nozzles, fuel prices.
-- Staff need to read these to enter a reading (which nozzle, what rate), but
-- only a super_admin may change them.
-- ---------------------------------------------------------------------------
create policy "tanks: staff read"
  on public.tanks for select to authenticated
  using (public.is_active_staff());

create policy "tanks: super admin writes"
  on public.tanks for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "nozzles: staff read"
  on public.nozzles for select to authenticated
  using (public.is_active_staff());

create policy "nozzles: super admin writes"
  on public.nozzles for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "fuel prices: staff read"
  on public.fuel_prices for select to authenticated
  using (public.is_active_staff());

create policy "fuel prices: super admin writes"
  on public.fuel_prices for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- customers - staff may add new credit customers (they meet them at the pump),
-- but editing or removing one is a super_admin decision.
-- ---------------------------------------------------------------------------
create policy "customers: staff read"
  on public.customers for select to authenticated
  using (public.is_active_staff());

create policy "customers: staff create"
  on public.customers for insert to authenticated
  with check (public.is_active_staff());

create policy "customers: super admin updates"
  on public.customers for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "customers: super admin deletes"
  on public.customers for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- nozzle_readings - the daily entry. Staff add today's numbers and can see
-- what has been entered (so yesterday's closing can carry over and so they do
-- not enter a nozzle twice). Only a super_admin may correct a past entry.
-- ---------------------------------------------------------------------------
create policy "readings: staff read"
  on public.nozzle_readings for select to authenticated
  using (public.is_active_staff());

create policy "readings: staff create"
  on public.nozzle_readings for insert to authenticated
  with check (public.is_active_staff());

create policy "readings: super admin updates"
  on public.nozzle_readings for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "readings: super admin deletes"
  on public.nozzle_readings for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- credit_sales - the credit slips attached to a reading. Same rules as the
-- reading they belong to.
-- ---------------------------------------------------------------------------
create policy "credit sales: staff read"
  on public.credit_sales for select to authenticated
  using (public.is_active_staff());

create policy "credit sales: staff create"
  on public.credit_sales for insert to authenticated
  with check (public.is_active_staff());

create policy "credit sales: super admin updates"
  on public.credit_sales for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "credit sales: super admin deletes"
  on public.credit_sales for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- ledger_entries - APPEND ONLY.
--
-- Read and insert only. There is deliberately no update policy and no delete
-- policy, for anyone, including super_admin: this is money customers owe, and
-- the history has to stay auditable. A mistake is corrected by posting a new
-- offsetting entry. A trigger in 002 enforces the same rule below RLS, so even
-- the service-role key cannot rewrite it.
-- ---------------------------------------------------------------------------
create policy "ledger: staff read"
  on public.ledger_entries for select to authenticated
  using (public.is_active_staff());

create policy "ledger: staff create"
  on public.ledger_entries for insert to authenticated
  with check (public.is_active_staff());

-- ---------------------------------------------------------------------------
-- fuel_purchases - staff record incoming stock from the OMC.
-- ---------------------------------------------------------------------------
create policy "purchases: staff read"
  on public.fuel_purchases for select to authenticated
  using (public.is_active_staff());

create policy "purchases: staff create"
  on public.fuel_purchases for insert to authenticated
  with check (public.is_active_staff());

create policy "purchases: super admin updates"
  on public.fuel_purchases for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "purchases: super admin deletes"
  on public.fuel_purchases for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- stock_checks - staff record the physical dip.
-- ---------------------------------------------------------------------------
create policy "stock checks: staff read"
  on public.stock_checks for select to authenticated
  using (public.is_active_staff());

create policy "stock checks: staff create"
  on public.stock_checks for insert to authenticated
  with check (public.is_active_staff());

create policy "stock checks: super admin updates"
  on public.stock_checks for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "stock checks: super admin deletes"
  on public.stock_checks for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- expenses - super_admin only in every direction, since this feeds profit.
-- ---------------------------------------------------------------------------
create policy "expenses: super admin only"
  on public.expenses for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Function permissions.
--
-- security definer functions run with the owner's rights, so they must not be
-- callable by logged-out visitors. Trigger functions are never called directly.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.trg_post_credit_sale_to_ledger() from public, anon, authenticated;
revoke execute on function public.trg_validate_credit_total() from public, anon, authenticated;
revoke execute on function public.trg_validate_reading_credit_total() from public, anon, authenticated;
revoke execute on function public.trg_ledger_append_only() from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_tank_row() from public, anon, authenticated;
revoke execute on function public.trg_recalc_tank_from_reading() from public, anon, authenticated;
revoke execute on function public.recalc_tank_stock(uuid) from public, anon, authenticated;

revoke execute on function public.auth_role() from anon;
revoke execute on function public.is_super_admin() from anon;
revoke execute on function public.is_active_staff() from anon;
revoke execute on function public.current_fuel_rate(public.fuel_type, date) from anon;
revoke execute on function public.calculate_expected_stock(uuid, date) from anon;
revoke execute on function public.customer_balance(uuid) from anon;
