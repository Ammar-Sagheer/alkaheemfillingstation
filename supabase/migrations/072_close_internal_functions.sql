-- =============================================================================
-- 072_close_internal_functions.sql
--
-- Ten internal functions could be called from outside, three of them by
-- anyone holding the site's public key, without logging in.
--
-- WHAT WAS OPEN (found 3 Oct 2026, checked on the live database):
--
--   Callable by `anon` (no login at all), running with the owner's rights and
--   checking nobody's role:
--     cost_of_goods_sold(date, date)      what the fuel sold in any period cost
--     stock_value_at(date)                rupee value of all stock on any day
--     lubricant_stock_value(uuid, date)   value of one lubricant's stock
--   Together with sales these give a month's profit. Read-only: nothing could
--   be changed through them.
--
--   Callable by any logged-in staff member, though only ever meant to be
--   called from inside other functions:
--     activity_actor(), backup_seeded_tables(), backup_tables_missing(),
--     restore_remap_actor(jsonb, jsonb), supplier_name_or_refuse(uuid),
--     tank_stock_on_hand(uuid, date)
--   and backup_table_order(), callable by anon (a list of table names).
--
-- WHY. 049 (and the others) ran `revoke all ... from public`, which is the
-- Postgres default grant. Supabase ALSO grants EXECUTE on every new function
-- to `anon` and `authenticated` directly, and those grants are not part of
-- `public`, so they survived. 049's own note says the intent was that "nothing
-- else can ask the database what the pump's stock is worth".
--
-- WHY THIS BREAKS NOTHING. Every caller of these ten is a SECURITY DEFINER
-- function (the reports, the export, the restore, the supplier payments and
-- the activity-log triggers), which runs with the owner's rights and needs no
-- grant of its own; the one SECURITY INVOKER caller, backup_tables_missing(),
-- is itself only called from export_everything(), a definer. No view or RLS
-- policy uses any of them, and the app never calls them by name. Checked on the
-- live database on 3 Oct 2026. The owner (postgres) and service_role keep
-- EXECUTE.
--
-- No row is touched; this only changes who may call what.
-- =============================================================================

revoke all on function public.cost_of_goods_sold(date, date)        from public, anon, authenticated;
revoke all on function public.stock_value_at(date)                  from public, anon, authenticated;
revoke all on function public.lubricant_stock_value(uuid, date)     from public, anon, authenticated;
revoke all on function public.tank_stock_on_hand(uuid, date)        from public, anon, authenticated;
revoke all on function public.activity_actor()                      from public, anon, authenticated;
revoke all on function public.supplier_name_or_refuse(uuid)         from public, anon, authenticated;
revoke all on function public.backup_table_order()                  from public, anon, authenticated;
revoke all on function public.backup_seeded_tables()                from public, anon, authenticated;
revoke all on function public.backup_tables_missing()               from public, anon, authenticated;
revoke all on function public.restore_remap_actor(jsonb, jsonb)     from public, anon, authenticated;

-- Prove it: fail, and so change nothing, if either role can still call any of them.
do $$
declare
  v_open text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_open
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cost_of_goods_sold', 'stock_value_at', 'lubricant_stock_value',
                       'tank_stock_on_hand', 'activity_actor', 'supplier_name_or_refuse',
                       'backup_table_order', 'backup_seeded_tables', 'backup_tables_missing',
                       'restore_remap_actor')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_open is not null then
    raise exception '072: still callable from outside: %', v_open;
  end if;
end;
$$;
