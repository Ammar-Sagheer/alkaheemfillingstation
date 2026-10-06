-- =============================================================================
-- 048_treasury_in_the_activity_log.sql
--
-- REPAIR. 044 wires treasury_entries into the activity log; the copy of 044
-- that was applied to the live project did not include that half, so on the
-- live database the eighteenth table was never attached and cash moving in and
-- out of the safe went unlogged.
--
-- A fresh database running the migrations in order gets this from 044 and then
-- gets it again here, which is harmless: `create or replace function` and
-- `drop trigger if exists` are both idempotent. Written as a new numbered file
-- rather than by editing 044, because a migration that has run is never edited
-- - see README.md.
--
-- HOW IT WAS FOUND, since the answer is not "a test": a documentation audit.
-- README says the activity trigger covers seventeen tables and 044 claimed an
-- eighteenth, so the number was checked against pg_trigger before the sentence
-- was updated - and the database said seventeen. The count in a doc is only
-- worth writing if it is worth checking, and this is what checking one buys.
--
-- The function body below is 044's verbatim, which is 039's with the
-- treasury_entries branch added. Reproduced in full because
-- `create or replace function` replaces the whole thing.
-- =============================================================================

create or replace function public.trg_write_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new       jsonb;
  v_old       jsonb;
  v_row       jsonb;
  v_action    text;
  v_label     text;
  v_summary   text;
  v_date      date;
  v_amount    numeric;
  v_changes   jsonb;
  v_actor_id  uuid;
  v_actor     text;
  v_details   jsonb;
  -- Columns recomputed by other triggers, or noise. A change to these alone is
  -- not somebody doing something, so the write goes unlogged.
  v_ignored text[] := array[
    'current_stock_litres', 'created_at', 'credit_sale_id', 'lubricant_sale_id',
    'expected_stock', 'gain_loss'
  ];
begin
  v_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row := coalesce(v_new, v_old);

  v_action := case tg_op when 'INSERT' then 'created'
                         when 'UPDATE' then 'changed'
                         else 'deleted' end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field', t.k, 'from', v_old -> t.k, 'to', v_new -> t.k
           ) order by t.k), '[]'::jsonb)
      into v_changes
      from jsonb_object_keys(v_new) as t(k)
     where not (t.k = any (v_ignored))
       and (v_old -> t.k) is distinct from (v_new -> t.k);

    if jsonb_array_length(v_changes) = 0 then
      return coalesce(new, old);
    end if;
  end if;

  if tg_table_name = 'ledger_entries'
     and (v_row ->> 'credit_sale_id' is not null or v_row ->> 'lubricant_sale_id' is not null)
  then
    return coalesce(new, old);
  end if;

  select a.actor_id, a.actor_name into v_actor_id, v_actor from public.activity_actor() a;

  case tg_table_name

    when 'nozzle_readings' then
      v_label := 'Reading';
      v_date := (v_row ->> 'reading_date')::date;
      v_amount := (v_row ->> 'sale_amount')::numeric;
      select 'Unit ' || n.unit_number || ' · Nozzle ' || n.nozzle_label
        into v_summary from public.nozzles n where n.id = (v_row ->> 'nozzle_id')::uuid;
      v_summary := coalesce(v_summary, 'A nozzle')
        || ' — ' || to_char((v_row ->> 'litres_sold')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'sale_amount')::numeric, 'FM999,999,999,990');

    when 'credit_sales' then
      v_label := 'Credit slip';
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'ledger_entries' then
      v_label := case v_row ->> 'entry_type' when 'credit' then 'Payment or credit'
                                             else 'Charge to a customer' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'lubricant_sales' then
      v_label := 'Oil sale';
      v_date := (v_row ->> 'sale_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select l.name into v_summary from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.000') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'lubricant_purchases' then
      v_label := 'Oil delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select l.name into v_summary from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990');

    when 'fuel_purchases' then
      v_label := 'Fuel delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990')
        || ' · ' || (v_row ->> 'payment_status');

    when 'stock_checks' then
      v_label := 'Tank dip';
      v_date := (v_row ->> 'books_date')::date;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — dipped at ' || to_char((v_row ->> 'actual_dip_reading')::numeric, 'FM999,999,990.00') || ' L'
        || ', books said ' || to_char((v_row ->> 'expected_stock')::numeric, 'FM999,999,990.00') || ' L'
        || ' (measured ' || (v_row ->> 'taken') || ' of '
        || to_char((v_row ->> 'check_date')::date, 'FMDD Mon YYYY') || ')';

    when 'expenses' then
      v_label := 'Expense';
      v_date := (v_row ->> 'expense_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      v_summary := coalesce(nullif(v_row ->> 'category', ''), 'Uncategorised')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'bank_transactions' then
      v_label := case v_row ->> 'txn_type' when 'deposit' then 'Money into the bank'
                                           else 'Money out of the bank' end;
      v_date := (v_row ->> 'txn_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select b.bank_name || coalesce(' · ' || b.account_label, '') into v_summary
        from public.bank_accounts b where b.id = (v_row ->> 'account_id')::uuid;
      v_summary := coalesce(v_summary, 'An account')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'category', ''), '');

    when 'bank_accounts' then
      v_label := 'Bank account';
      v_summary := coalesce(v_row ->> 'bank_name', 'An account')
        || coalesce(' · ' || nullif(v_row ->> 'account_label', ''), '');

    when 'customers' then
      v_label := 'Customer';
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A customer')
        || coalesce(' · ' || nullif(v_row ->> 'vehicle_number', ''), '');

    when 'lubricants' then
      v_label := 'Lubricant';
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A lubricant');

    when 'fuel_prices' then
      v_label := 'Fuel rate';
      v_summary := initcap(v_row ->> 'fuel_type')
        || ' — Rs ' || to_char((v_row ->> 'rate')::numeric, 'FM999,990.00') || ' / L'
        || ' from ' || to_char((v_row ->> 'effective_from')::date, 'DD Mon YYYY');

    when 'tanks' then
      v_label := 'Tank';
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A tank')
        || ' · ' || coalesce(v_row ->> 'fuel_type', '');

    when 'nozzles' then
      v_label := 'Nozzle';
      v_summary := 'Unit ' || coalesce(v_row ->> 'unit_number', '?')
        || ' · Nozzle ' || coalesce(v_row ->> 'nozzle_label', '?');

    when 'profiles' then
      v_label := 'Login';
      v_summary := coalesce(nullif(v_row ->> 'full_name', ''), 'Someone')
        || ' · ' || coalesce(v_row ->> 'role', '')
        || case when (v_row ->> 'is_active')::boolean then '' else ' · deactivated' end;

    when 'company_assets' then
      v_label := 'Company asset';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'purchase_value')::numeric;
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'An asset')
        || ' — ' || initcap(coalesce(v_row ->> 'category', 'other'))
        || ', Rs ' || to_char((v_row ->> 'purchase_value')::numeric, 'FM999,999,999,990');

    -- New: cash into or out of the safe. The details line is the whole point
    -- of the entry - "Munir sb by Hamza saqib", "Zamzam code transfer 118014"
    -- - so it is carried into the log rather than left behind in the row.
    when 'treasury_entries' then
      v_label := case v_row ->> 'direction' when 'in' then 'Cash into the safe'
                                            else 'Cash out of the safe' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      v_summary := 'Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || ' · ' || initcap(replace(coalesce(v_row ->> 'category', 'other'), '_', ' '))
        || coalesce(' — ' || nullif(btrim(coalesce(v_row ->> 'details', '')), ''), '');

    else
      v_label := tg_table_name;
      v_summary := tg_table_name;
  end case;

  v_details := jsonb_build_object('row', v_row)
             || case when v_changes is null then '{}'::jsonb
                     else jsonb_build_object('changes', v_changes) end;

  insert into public.activity_log
    (actor_id, actor_name, action, entity, entity_label, entity_id,
     summary, entry_date, amount, details)
  values
    (v_actor_id, v_actor, v_action, tg_table_name, v_label,
     (v_row ->> 'id')::uuid, v_summary, v_date, v_amount, v_details);

  return coalesce(new, old);

exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists treasury_entries_activity on public.treasury_entries;
create trigger treasury_entries_activity
  after insert or update or delete on public.treasury_entries
  for each row execute function public.trg_write_activity();
