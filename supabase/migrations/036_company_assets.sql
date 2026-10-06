-- =============================================================================
-- 036_company_assets.sql
--
-- What the pump has bought with its own money and kept, rather than sold or
-- consumed: a generator, a delivery motorcycle, a new dispensing pump, the
-- canopy over the forecourt. This is not fuel, oil or anything in the daily
-- takings - it is property. Nothing here feeds a sale, an expense or the
-- month's profit; it is a private record of what the business actually owns,
-- for the owner's own reference - insurance, a future valuation, knowing what
-- is his if the pump is ever sold, split, or handed to the next generation.
--
-- OWNER ONLY, END TO END. Same treatment as bank_accounts and expenses: RLS
-- refuses a data_entry login outright, because this is the owner's own
-- property rather than pump operations, and staff have no more business
-- seeing it than they do the bank balance.
-- =============================================================================

-- Five categories, chosen for what a pump actually accumulates. 'other' is the
-- default rather than a forced choice, because the form should never block a
-- save over a category nobody has thought to add yet.
create type public.asset_category as enum (
  'vehicle', 'machinery', 'property', 'electronics', 'other'
);

create table public.company_assets (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) > 0),
  category       public.asset_category not null default 'other',
  -- Two decimals, like expenses and bank transactions - this is general
  -- business money, not the customer ledger, so it does not carry that
  -- table's whole-rupee storage rule. formatPKR still rounds it for display,
  -- the same as every other figure in the app.
  purchase_value numeric(14, 2) not null check (purchase_value > 0),
  purchase_date  date not null,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table public.company_assets is
  'What the pump has bought and kept - vehicles, machinery, equipment, property. Owner-only; no effect on sales, expenses or profit.';

create index company_assets_purchase_date_idx on public.company_assets (purchase_date desc);

-- ---------------------------------------------------------------------------
-- The summary the page leads with: total value, how many, which category
-- holds the most, and the newest addition.
--
-- AN RPC, NOT A CLIENT-SIDE SUM, on purpose - see data-service.js's own rule
-- ("anything that aggregates goes through Postgres") and the changelog entry
-- it exists because of: a page that summed a capped list once under-reported
-- a total for months before anyone noticed. This total is never capped,
-- because it is never pulled into JavaScript at all.
-- ---------------------------------------------------------------------------
create or replace function public.get_company_assets_summary()
returns table (
  asset_count         integer,
  total_value         numeric,
  top_category        public.asset_category,
  top_category_value  numeric,
  newest_name         text,
  newest_date         date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see the company assets' using errcode = '42501';
  end if;

  return query
  with totals as (
    select count(*)::integer as asset_count,
           coalesce(sum(purchase_value), 0)::numeric as total_value
      from public.company_assets
  ),
  by_category as (
    select category, sum(purchase_value) as category_value
      from public.company_assets
     group by category
     order by category_value desc
     limit 1
  ),
  newest as (
    select name, purchase_date
      from public.company_assets
     order by purchase_date desc, created_at desc
     limit 1
  )
  select totals.asset_count, totals.total_value,
         by_category.category, by_category.category_value,
         newest.name, newest.purchase_date
    from totals
    left join by_category on true
    left join newest on true;
end;
$$;

comment on function public.get_company_assets_summary() is
  'Total value, count, priciest category and newest addition - the four figures the page leads with.';

revoke execute on function public.get_company_assets_summary() from public, anon;
grant  execute on function public.get_company_assets_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security - the owner only, in every direction.
-- ---------------------------------------------------------------------------
alter table public.company_assets enable row level security;

create policy "company assets: super admin only"
  on public.company_assets for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.company_assets to authenticated;
revoke all on public.company_assets from anon;

-- ---------------------------------------------------------------------------
-- Wire it into the activity log (migration 035). One new branch in the
-- trigger function - the rest of the body is unchanged, reproduced in full
-- because create or replace function replaces the whole thing - and the
-- trigger itself attached the same way as the other sixteen tables.
-- ---------------------------------------------------------------------------
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
  v_ignored text[] := array[
    'current_stock_litres', 'created_at', 'credit_sale_id', 'lubricant_sale_id'
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
      v_date := (v_row ->> 'check_date')::date;
      select t.name into v_summary from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — dipped at ' || to_char((v_row ->> 'actual_dip_reading')::numeric, 'FM999,999,990.00') || ' L'
        || ', books said ' || to_char((v_row ->> 'expected_stock')::numeric, 'FM999,999,990.00') || ' L';

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

    -- New: a company asset bought, corrected or removed. category comes
    -- through jsonb as its plain text value, so initcap reads it the same as
    -- any other lowercase word.
    when 'company_assets' then
      v_label := 'Company asset';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'purchase_value')::numeric;
      v_summary := coalesce(nullif(v_row ->> 'name', ''), 'An asset')
        || ' — ' || initcap(coalesce(v_row ->> 'category', 'other'))
        || ', Rs ' || to_char((v_row ->> 'purchase_value')::numeric, 'FM999,999,999,990');

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

drop trigger if exists company_assets_activity on public.company_assets;
create trigger company_assets_activity
  after insert or update or delete on public.company_assets
  for each row execute function public.trg_write_activity();
