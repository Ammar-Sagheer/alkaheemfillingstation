-- =============================================================================
-- Al Hakeem Filling Station PSO: start with an empty forecourt.
-- Run ONCE on a new database, after all the migrations (001 to 072 and 800).
--
-- The master's migrations seed two tanks (004), six nozzles (004/012/013) and
-- four placeholder suppliers (067). This pump's owner sets up his own tanks
-- and nozzles under Settings (migration 800), so a new database should start
-- with none of them.
--
-- Refuses to run once anything has traded, so it can never empty a working
-- pump. One transaction: all of it or none of it.
-- =============================================================================
begin;

do $$
begin
  if exists (select 1 from public.nozzle_readings)
     or exists (select 1 from public.fuel_purchases)
     or exists (select 1 from public.stock_checks) then
    raise exception 'STOPPED: this pump already has readings, deliveries or dips. Nothing was changed.';
  end if;
  if to_regprocedure('public.add_tank(text, public.fuel_type, numeric, numeric, date)') is null then
    raise exception 'STOPPED: migration 800 is not applied yet, so the owner could not add tanks. Run it first. Nothing was changed.';
  end if;

  delete from public.nozzles where true;
  delete from public.tanks   where true;
  delete from public.suppliers s
   where s.note = 'Placeholder. Rename it under Suppliers, or retire it.'
     and not exists (select 1 from public.supplier_ledger_entries e where e.supplier_id = s.id);
end;
$$;

-- Expect 0, 0 and 0.
select (select count(*) from public.tanks)     as tanks,
       (select count(*) from public.nozzles)   as nozzles,
       (select count(*) from public.suppliers) as suppliers;

commit;
