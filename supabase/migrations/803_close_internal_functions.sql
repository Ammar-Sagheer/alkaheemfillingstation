-- =============================================================================
-- 803_close_internal_functions.sql        AL HAKEEM (the master has this in 073/074)
--
-- 801 and 802 revoked their internal functions from `public, anon` only.
-- Supabase also grants EXECUTE on every new function to `authenticated`
-- directly (072's finding), so any staff login could call them. The one that
-- mattered: staff_rate_on() and staff_month_earned() would tell a staff login
-- any person's daily rate and month's pay, which RLS keeps from them. Read-only;
-- nothing could be changed through them.
--
-- Every caller is a trigger or a SECURITY DEFINER function, so no role needs
-- them. backup_table_order() is closed again too, as 072 left it, since 801 and
-- 802 redefined it. Fails, and so changes nothing, if any is still open.
-- No row is touched.
-- =============================================================================

do $$
declare
  f text;
  v_list text[] := array[
    'staff_rate_on(uuid, date)', 'staff_month_earned(uuid, date)',
    'trg_staff_attendance_rules()', 'trg_staff_rate_rules()',
    'trg_vehicle_belongs_to_customer()', 'trg_customer_main_vehicle()',
    'backup_table_order()'
  ];
  v_open text;
begin
  foreach f in array v_list loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  select string_agg(p.oid::regprocedure::text, ', ')
    into v_open
    from pg_proc p
   where p.oid = any (select ('public.' || x)::regprocedure::oid from unnest(v_list) x)
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception '803: still callable from outside: %', v_open;
  end if;
end;
$$;
