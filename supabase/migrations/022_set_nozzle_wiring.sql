-- =============================================================================
-- 022_set_nozzle_wiring.sql
--
-- All six nozzles' tank and starting reading, saved as one action.
--
-- The settings dialog used to carry a Save button per row, which made six
-- separate writes out of what is really a single job done once in the pump's
-- life: describing how the place is plumbed. One button is what the owner
-- expects, and one button means one write.
--
-- WHY AN RPC AND NOT SIX UPDATES FROM THE APP. Same reason record_bank_payment()
-- exists: six statements sent one at a time can fail after the third, leaving
-- half the nozzles pointing at the new tanks and half at the old. That is worse
-- than not saving at all, because nothing on screen says which half took - and
-- tank_id decides which tank a sale draws down, so a half-applied change quietly
-- drains the wrong tank. As one UPDATE it is all six or none.
-- =============================================================================

create or replace function public.set_nozzle_wiring(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change the nozzle wiring' using errcode = '42501';
  end if;

  update public.nozzles n
     set tank_id          = (row_data->>'tank_id')::uuid,
         starting_reading = (row_data->>'starting_reading')::numeric
    from jsonb_array_elements(p_rows) as row_data
   where n.id = (row_data->>'nozzle_id')::uuid;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_nozzle_wiring(jsonb) from public, anon;
grant  execute on function public.set_nozzle_wiring(jsonb) to authenticated;
