-- =============================================================================
-- 067_suppliers_and_what_the_pump_owes_them.sql
--
-- An account for each supplier: every delivery they made, every rupee paid to
-- them, every discount they gave, and what the pump owes them after each.
--
-- THE ASK. A voice note from the owner, 28 Sep 2026, in Urdu: "add a sheet for
-- the suppliers' accounts. We have three or four suppliers. Their ledger is a
-- little different from the customers', because the customers are OUR
-- customers and with these, WE are THEIR customer. When their oil came, I wrote
-- the invoice, then the litres, then the rate per litre, then the money we paid
-- them, then the balance." Then, from the developer: the owner pays both in
-- cash and by bank transfer, fuel and lubricants both come from suppliers, and
-- there should be room for a discount from the supplier's side.
--
-- WHAT WAS THERE. Every delivery already carried a `supplier_name` (free text)
-- and a paid / pending flag. That answers "is this invoice settled" and nothing
-- else: no part payments, no one payment against three invoices, no advance,
-- no discount, and no running figure of what is owed to whom.
--
-- THE SHAPE, AND WHY IT IS THE CUSTOMER LEDGER TURNED ROUND.
--
--   suppliers                  a name, a phone, a note; retired, never deleted
--                              once it has history (the FKs below refuse).
--   supplier_ledger_entries    append-only, like ledger_entries: a mistake is
--                              put right by a reversing entry that points at
--                              it, never by an edit.
--
-- `direction` is 'owe_more' or 'owe_less', and the balance is the first minus
-- the second. Named for what it does to the pump's debt rather than debit /
-- credit, because on this ledger those words point the opposite way from the
-- customer ledger two pages over, and the owner reads both.
--
--   purchase     owe_more   posted by the delivery itself, never typed
--   payment      owe_less   cash from the safe, or a bank transfer
--   discount     owe_less   the supplier took something off
--   adjustment   either     an opening balance, or anything the rest miss
--   reversal     opposite   cancels one earlier entry (corrects_entry_id)
--
-- A DELIVERY POSTS ITSELF. `fuel_purchases` and `lubricant_purchases` gain a
-- nullable `supplier_id`. A delivery saved with one posts a 'purchase' entry of
-- its `total_cost` (the invoice amount, which is what is owed - the rate is
-- derived from it, see 023); deleting the delivery posts a reversal. The same
-- shape as a credit slip posting to a customer (002), so a delivery is typed
-- once and cannot be on the Purchases page without being on the account.
-- Rows already in the book have no supplier_id and post nothing: every account
-- starts at zero, which is what the owner asked for, and an opening balance is
-- an adjustment.
--
-- A PAYMENT MOVES THE MONEY IT DESCRIBES. Paid in cash, it is also a treasury
-- 'out' under the 'supplier' category that already exists (044); paid by bank
-- transfer, it is also a bank 'payment' from the chosen account. One call, one
-- transaction, so the supplier's account, the safe and the bank cannot
-- disagree about whether it happened - and the rules those two pages already
-- enforce (the safe cannot go below zero, an account cannot be overdrawn)
-- refuse a payment that could not really have been made. Cancelling the
-- payment takes the money movement back out with it.
--
-- NOT HERE, AND SAID SO: deleting the bank or safe row directly from Banking or
-- Treasury leaves the supplier's payment standing (its link goes null). The
-- supplier page is where a payment is cancelled, and it takes both sides back.
--
-- BACKUP (051). Both tables join backup_table_order(): suppliers before the
-- purchases that point at them, the ledger last. `suppliers` also joins
-- backup_seeded_tables(), because this migration seeds four placeholder names
-- and a freshly migrated project is therefore not empty. The two new
-- purchase columns are nullable, so every backup taken before this loads.
--
-- RESET (016/025). reset_all_data() also empties the supplier ledger, after the
-- purchases (whose deletion posts reversals on the way out). The suppliers
-- themselves stay, like the tanks.
--
-- ACTIVITY (035). Both tables are logged, by a function of their own rather
-- than new branches in trg_write_activity(), so the eighteen tables that
-- function already describes are not touched by this. A delivery's automatic
-- entry is not logged twice: the delivery already is.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- The suppliers
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  phone       text,
  note        text,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One "Gas & Oil", however it is typed. Case and surrounding space only.
create unique index suppliers_name_unique on public.suppliers (lower(btrim(name)));

comment on table public.suppliers is
  'Who the pump buys fuel and lubricants from. Retired rather than deleted once they have history. See 067.';


-- -----------------------------------------------------------------------------
-- The ledger
-- -----------------------------------------------------------------------------
create table public.supplier_ledger_entries (
  id                     uuid primary key default gen_random_uuid(),
  supplier_id            uuid not null references public.suppliers (id) on delete restrict,
  kind                   text not null
                           check (kind in ('purchase', 'payment', 'discount', 'adjustment', 'reversal')),
  direction              text not null check (direction in ('owe_more', 'owe_less')),
  amount                 numeric(14, 2) not null check (amount > 0),
  entry_date             date not null,
  note                   text,
  -- A delivery's own figures, copied so the ledger reads like the owner's
  -- register without a join: the invoice, the litres.
  invoice_number         text,
  litres                 numeric(12, 3) check (litres is null or litres > 0),
  fuel_purchase_id       uuid unique references public.fuel_purchases (id) on delete set null,
  lubricant_purchase_id  uuid unique references public.lubricant_purchases (id) on delete set null,
  -- Where a payment's money came from.
  paid_from              text check (paid_from in ('cash', 'bank')),
  bank_account_id        uuid references public.bank_accounts (id) on delete set null,
  bank_transaction_id    uuid references public.bank_transactions (id) on delete set null,
  treasury_entry_id      uuid references public.treasury_entries (id) on delete set null,
  corrects_entry_id      uuid references public.supplier_ledger_entries (id),
  -- Posted by a delivery (or by deleting one), not typed on this page.
  is_auto                boolean not null default false,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),

  constraint supplier_entry_direction_fits_kind check (
       (kind = 'purchase' and direction = 'owe_more')
    or (kind in ('payment', 'discount') and direction = 'owe_less')
    or kind in ('adjustment', 'reversal')
  ),
  constraint supplier_payment_says_where_from check (
    (kind = 'payment') = (paid_from is not null)
  ),
  constraint supplier_reversal_points_back check (
    (kind = 'reversal') = (corrects_entry_id is not null)
  ),
  constraint supplier_entry_not_its_own_reversal check (
    corrects_entry_id is null or corrects_entry_id <> id
  )
);

-- One cancellation per entry.
create unique index supplier_ledger_one_reversal
  on public.supplier_ledger_entries (corrects_entry_id)
  where corrects_entry_id is not null;

create index supplier_ledger_by_supplier
  on public.supplier_ledger_entries (supplier_id, entry_date, created_at, id);

comment on table public.supplier_ledger_entries is
  'What the pump owes each supplier, entry by entry. Append-only: corrected by a reversal, never edited. See 067.';


-- Append-only, with the same exceptions ledger_entries has (033): the link
-- columns may be nulled when the row they point at is deleted, and the reset
-- may empty the table.
create or replace function public.trg_supplier_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.resetting_supplier_ledger', true) = 'on' then
      return old;
    end if;
    raise exception
      'The supplier ledger is append-only. To correct an entry, cancel it on the supplier''s page.'
      using errcode = '42501';
  end if;

  -- UPDATE: only a link going null, only because what it pointed at is gone.
  if (to_jsonb(new) - array['fuel_purchase_id', 'lubricant_purchase_id', 'bank_account_id',
                            'bank_transaction_id', 'treasury_entry_id', 'created_by'])
     is distinct from
     (to_jsonb(old) - array['fuel_purchase_id', 'lubricant_purchase_id', 'bank_account_id',
                            'bank_transaction_id', 'treasury_entry_id', 'created_by'])
     or (new.fuel_purchase_id      is not null and new.fuel_purchase_id      is distinct from old.fuel_purchase_id)
     or (new.lubricant_purchase_id is not null and new.lubricant_purchase_id is distinct from old.lubricant_purchase_id)
     or (new.bank_account_id       is not null and new.bank_account_id       is distinct from old.bank_account_id)
     or (new.bank_transaction_id   is not null and new.bank_transaction_id   is distinct from old.bank_transaction_id)
     or (new.treasury_entry_id     is not null and new.treasury_entry_id     is distinct from old.treasury_entry_id)
     or (new.created_by            is not null and new.created_by            is distinct from old.created_by)
  then
    raise exception
      'The supplier ledger is append-only. To correct an entry, cancel it on the supplier''s page.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger supplier_ledger_no_update
  before update on public.supplier_ledger_entries
  for each row execute function public.trg_supplier_ledger_append_only();

create trigger supplier_ledger_no_delete
  before delete on public.supplier_ledger_entries
  for each row execute function public.trg_supplier_ledger_append_only();


-- -----------------------------------------------------------------------------
-- Deliveries name their supplier. Nullable: see the header on backups.
-- -----------------------------------------------------------------------------
alter table public.fuel_purchases
  add column supplier_id uuid references public.suppliers (id) on delete restrict;

alter table public.lubricant_purchases
  add column supplier_id uuid references public.suppliers (id) on delete restrict;

create index fuel_purchases_by_supplier on public.fuel_purchases (supplier_id) where supplier_id is not null;
create index lubricant_purchases_by_supplier on public.lubricant_purchases (supplier_id) where supplier_id is not null;


-- A delivery with a supplier posts what it costs; deleting it posts the
-- reversal. Security definer: staff record deliveries, and the ledger has no
-- insert policy of its own.
create or replace function public.trg_post_delivery_to_supplier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_fuel  boolean := tg_table_name = 'fuel_purchases';
  v_what     text;
  v_entry    public.supplier_ledger_entries%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.supplier_id is null then
      return new;
    end if;

    if v_is_fuel then
      select t.name into v_what from public.tanks t where t.id = new.tank_id;
    else
      select l.name into v_what from public.lubricants l where l.id = new.lubricant_id;
    end if;

    insert into public.supplier_ledger_entries
      (supplier_id, kind, direction, amount, entry_date, note, invoice_number, litres,
       fuel_purchase_id, lubricant_purchase_id, is_auto, created_by)
    values
      (new.supplier_id, 'purchase', 'owe_more', new.total_cost, new.purchase_date,
       coalesce(v_what, case when v_is_fuel then 'Fuel' else 'Lubricant' end),
       new.invoice_number, new.quantity_litres,
       case when v_is_fuel then new.id end,
       case when v_is_fuel then null else new.id end,
       true, new.created_by);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- The app changes only payment_status after a delivery is saved. Anything
    -- the account depends on would put the two out of step, so it is refused
    -- in words: delete the delivery and record it again.
    if new.supplier_id is distinct from old.supplier_id
       or new.total_cost is distinct from old.total_cost
       or new.purchase_date is distinct from old.purchase_date
       or new.quantity_litres is distinct from old.quantity_litres
    then
      if old.supplier_id is not null or new.supplier_id is not null then
        raise exception
          'This delivery is on a supplier''s account. To change it, delete it and record it again.'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- DELETE
  if old.supplier_id is null then
    return old;
  end if;

  select * into v_entry
    from public.supplier_ledger_entries e
   where e.kind = 'purchase'
     and (case when v_is_fuel then e.fuel_purchase_id else e.lubricant_purchase_id end) = old.id;

  -- Nothing to reverse if it was never posted (a restored row, triggers off),
  -- or already reversed.
  if not found or exists (
    select 1 from public.supplier_ledger_entries r where r.corrects_entry_id = v_entry.id
  ) then
    return old;
  end if;

  insert into public.supplier_ledger_entries
    (supplier_id, kind, direction, amount, entry_date, note, invoice_number, litres,
     corrects_entry_id, is_auto, created_by)
  values
    (v_entry.supplier_id, 'reversal', 'owe_less', v_entry.amount, v_entry.entry_date,
     'Delivery deleted', v_entry.invoice_number, v_entry.litres,
     v_entry.id, true, auth.uid());
  return old;
end;
$$;

-- The DELETE side runs BEFORE the row goes. After it, the foreign key's own
-- ON DELETE SET NULL has already cleared fuel_purchase_id on the ledger entry
-- (Postgres fires after-triggers in name order, and the constraint's
-- "RI_ConstraintTrigger" sorts ahead of these), so the entry to reverse could
-- no longer be found and the delivery would vanish from the account unreversed.
create trigger post_fuel_delivery_to_supplier
  after insert or update on public.fuel_purchases
  for each row execute function public.trg_post_delivery_to_supplier();
create trigger reverse_fuel_delivery_on_supplier
  before delete on public.fuel_purchases
  for each row execute function public.trg_post_delivery_to_supplier();

create trigger post_lubricant_delivery_to_supplier
  after insert or update on public.lubricant_purchases
  for each row execute function public.trg_post_delivery_to_supplier();
create trigger reverse_lubricant_delivery_on_supplier
  before delete on public.lubricant_purchases
  for each row execute function public.trg_post_delivery_to_supplier();


-- -----------------------------------------------------------------------------
-- Access. The names are needed by anyone recording a delivery; what is owed
-- and what was paid is the owner's, like Banking and Treasury.
-- -----------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.supplier_ledger_entries enable row level security;

create policy "suppliers are read by active staff" on public.suppliers
  for select to authenticated using (public.is_active_staff());
create policy "suppliers are added by the owner" on public.suppliers
  for insert to authenticated with check (public.is_super_admin());
create policy "suppliers are changed by the owner" on public.suppliers
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "suppliers are removed by the owner" on public.suppliers
  for delete to authenticated using (public.is_super_admin());

create policy "supplier accounts are read by the owner" on public.supplier_ledger_entries
  for select to authenticated using (public.is_super_admin());

grant select, insert, update, delete on public.suppliers to authenticated;
grant select on public.supplier_ledger_entries to authenticated;


-- -----------------------------------------------------------------------------
-- Writing to the ledger by hand: a payment, a discount, an adjustment.
-- -----------------------------------------------------------------------------
create or replace function public.supplier_name_or_refuse(p_supplier_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_active boolean;
begin
  select s.name, s.is_active into v_name, v_active from public.suppliers s where s.id = p_supplier_id;
  if v_name is null then
    raise exception 'That supplier is no longer there. Reload the page.' using errcode = 'P0002';
  end if;
  return v_name;
end;
$$;


create or replace function public.record_supplier_payment(
  p_supplier_id     uuid,
  p_amount          numeric,
  p_entry_date      date,
  p_paid_from       text,
  p_bank_account_id uuid default null,
  p_note            text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_amount   numeric(14, 2) := round(p_amount, 2);
  v_bank_txn uuid;
  v_treasury uuid;
  v_entry    uuid;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may pay a supplier' using errcode = '42501';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter an amount above zero.' using errcode = '23514';
  end if;
  if p_entry_date is null then
    raise exception 'Enter the date it was paid.' using errcode = '23514';
  end if;
  if p_paid_from not in ('cash', 'bank') then
    raise exception 'Say whether it was paid in cash or by bank transfer.' using errcode = '23514';
  end if;

  v_name := public.supplier_name_or_refuse(p_supplier_id);

  if p_paid_from = 'bank' then
    if p_bank_account_id is null then
      raise exception 'Choose the bank account it was paid from.' using errcode = '23514';
    end if;
    -- check_bank_funds (018) refuses an account this would overdraw.
    insert into public.bank_transactions
      (account_id, txn_type, amount, txn_date, category, note, created_by)
    values
      (p_bank_account_id, 'payment', v_amount, p_entry_date, 'Supplier payment',
       'To ' || v_name || coalesce(' · ' || v_note, ''), auth.uid())
    returning id into v_bank_txn;
  else
    -- treasury_never_negative (044) refuses more than the safe holds.
    insert into public.treasury_entries
      (entry_date, direction, amount, category, details, created_by)
    values
      (p_entry_date, 'out', v_amount, 'supplier',
       'Paid to ' || v_name || coalesce(' · ' || v_note, ''), auth.uid())
    returning id into v_treasury;
  end if;

  insert into public.supplier_ledger_entries
    (supplier_id, kind, direction, amount, entry_date, note, paid_from,
     bank_account_id, bank_transaction_id, treasury_entry_id, created_by)
  values
    (p_supplier_id, 'payment', 'owe_less', v_amount, p_entry_date, v_note, p_paid_from,
     case when p_paid_from = 'bank' then p_bank_account_id end, v_bank_txn, v_treasury, auth.uid())
  returning id into v_entry;

  return v_entry;
end;
$$;

comment on function public.record_supplier_payment(uuid, numeric, date, text, uuid, text) is
  'Pays a supplier: the ledger entry AND the money leaving the safe or the bank, in one transaction. Owner only. See 067.';


-- A discount, or an adjustment in either direction (an opening balance is an
-- adjustment that says the pump owes more).
create or replace function public.record_supplier_entry(
  p_supplier_id uuid,
  p_kind        text,
  p_direction   text,
  p_amount      numeric,
  p_entry_date  date,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(14, 2) := round(p_amount, 2);
  v_entry  uuid;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a supplier''s account' using errcode = '42501';
  end if;
  if p_kind not in ('discount', 'adjustment') then
    raise exception 'Only a discount or an adjustment is recorded this way.' using errcode = '23514';
  end if;
  if p_kind = 'discount' then
    p_direction := 'owe_less';
  end if;
  if p_direction not in ('owe_more', 'owe_less') then
    raise exception 'Say whether this means the pump owes more or less.' using errcode = '23514';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter an amount above zero.' using errcode = '23514';
  end if;
  if p_entry_date is null then
    raise exception 'Enter the date.' using errcode = '23514';
  end if;
  if p_kind = 'adjustment' and v_note is null then
    raise exception 'Write a line saying what this adjustment is for.' using errcode = '23514';
  end if;

  perform public.supplier_name_or_refuse(p_supplier_id);

  insert into public.supplier_ledger_entries
    (supplier_id, kind, direction, amount, entry_date, note, created_by)
  values
    (p_supplier_id, p_kind, p_direction, v_amount, p_entry_date, v_note, auth.uid())
  returning id into v_entry;

  return v_entry;
end;
$$;

comment on function public.record_supplier_entry(uuid, text, text, numeric, date, text) is
  'Records a discount (always owe_less) or an adjustment (either way, with a reason) on a supplier''s account. Owner only. See 067.';


-- Cancelling a payment, a discount or an adjustment: a reversal pointing at it,
-- and for a payment the money goes back where it came from. A delivery's entry
-- is cancelled by deleting the delivery, which is where the mistake is.
create or replace function public.cancel_supplier_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry    public.supplier_ledger_entries%rowtype;
  v_name     text;
  v_undone   text := null;
  v_reversal uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a supplier''s account' using errcode = '42501';
  end if;

  select * into v_entry from public.supplier_ledger_entries where id = p_entry_id for update;
  if not found then
    raise exception 'That entry is no longer there. Reload the page.' using errcode = 'P0002';
  end if;
  if v_entry.kind = 'purchase' then
    raise exception 'A delivery is cancelled by deleting it on the Purchases page.' using errcode = '23514';
  end if;
  if v_entry.kind = 'reversal' then
    raise exception 'That entry is itself a cancellation.' using errcode = '23514';
  end if;
  if exists (select 1 from public.supplier_ledger_entries r where r.corrects_entry_id = v_entry.id) then
    raise exception 'That entry has already been cancelled.' using errcode = '23514';
  end if;

  select s.name into v_name from public.suppliers s where s.id = v_entry.supplier_id;

  if v_entry.kind = 'payment' then
    if v_entry.paid_from = 'cash' then
      if v_entry.treasury_entry_id is not null
         and exists (select 1 from public.treasury_entries t where t.id = v_entry.treasury_entry_id)
      then
        delete from public.treasury_entries where id = v_entry.treasury_entry_id;
        v_undone := 'safe_row_removed';
      else
        -- The safe's row was removed by hand; put the cash back in so the safe
        -- is not short by a payment that is now cancelled.
        insert into public.treasury_entries (entry_date, direction, amount, category, details, created_by)
        values (public.pump_today(), 'in', v_entry.amount, 'returned',
                'Payment to ' || coalesce(v_name, 'a supplier') || ' cancelled', auth.uid());
        v_undone := 'safe_refunded';
      end if;
    else
      if v_entry.bank_transaction_id is not null
         and exists (select 1 from public.bank_transactions b where b.id = v_entry.bank_transaction_id)
      then
        delete from public.bank_transactions where id = v_entry.bank_transaction_id;
        v_undone := 'bank_row_removed';
      elsif v_entry.bank_account_id is not null
         and exists (select 1 from public.bank_accounts a where a.id = v_entry.bank_account_id)
      then
        -- Trimmed away by the 60-row retention (018), or removed by hand: the
        -- account is credited back instead.
        insert into public.bank_transactions (account_id, txn_type, amount, txn_date, category, note, created_by)
        values (v_entry.bank_account_id, 'deposit', v_entry.amount, public.pump_today(), 'Supplier payment',
                'Payment to ' || coalesce(v_name, 'a supplier') || ' cancelled', auth.uid());
        v_undone := 'bank_refunded';
      else
        v_undone := 'bank_account_gone';
      end if;
    end if;
  end if;

  insert into public.supplier_ledger_entries
    (supplier_id, kind, direction, amount, entry_date, note, corrects_entry_id, created_by)
  values
    (v_entry.supplier_id, 'reversal',
     case v_entry.direction when 'owe_more' then 'owe_less' else 'owe_more' end,
     v_entry.amount, v_entry.entry_date,
     'Cancelled: ' || case v_entry.kind when 'payment' then 'payment'
                                       when 'discount' then 'discount'
                                       else 'adjustment' end,
     v_entry.id, auth.uid())
  returning id into v_reversal;

  return jsonb_build_object('reversal_id', v_reversal, 'kind', v_entry.kind,
                            'amount', v_entry.amount, 'money', v_undone);
end;
$$;

comment on function public.cancel_supplier_entry(uuid) is
  'Cancels a payment, discount or adjustment with a reversing entry; a payment''s money goes back to the safe or the bank. Owner only. See 067.';


-- -----------------------------------------------------------------------------
-- Reading: every supplier with what is owed, and one page of one account.
-- -----------------------------------------------------------------------------
create or replace function public.get_supplier_summaries()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.is_active desc, lower(x.name))
      from (
        select s.id, s.name, s.phone, s.note, s.is_active, s.created_at,
               coalesce(sum(case when e.direction = 'owe_more' then e.amount else -e.amount end), 0) as balance,
               coalesce(sum(e.amount) filter (where e.kind = 'purchase'), 0)
                 - coalesce(sum(r.amount) filter (where r.kind = 'reversal' and t.kind = 'purchase'), 0) as bought,
               coalesce(sum(e.amount) filter (where e.kind = 'payment'), 0)
                 - coalesce(sum(r.amount) filter (where r.kind = 'reversal' and t.kind = 'payment'), 0) as paid,
               coalesce(sum(e.amount) filter (where e.kind = 'discount'), 0)
                 - coalesce(sum(r.amount) filter (where r.kind = 'reversal' and t.kind = 'discount'), 0) as discounts,
               max(e.entry_date) filter (where e.kind = 'purchase') as last_delivery,
               count(e.id) as entries
          from public.suppliers s
          left join public.supplier_ledger_entries e on e.supplier_id = s.id
          left join public.supplier_ledger_entries r on r.id = e.id and r.kind = 'reversal'
          left join public.supplier_ledger_entries t on t.id = r.corrects_entry_id
         group by s.id
      ) x
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_supplier_summaries() is
  'Every supplier with what the pump owes them now, and what was bought, paid and discounted net of cancellations. Owner only. See 067.';


create or replace function public.get_supplier_ledger_page(
  p_supplier_id uuid,
  p_limit       integer default 25,
  p_offset      integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- The running balance summed over the WHOLE account in Postgres, the way 064
  -- does it for customers, so a row reads the same on whichever page it falls.
  with running as (
    select e.*,
           sum(case when e.direction = 'owe_more' then e.amount else -e.amount end)
             over (order by e.entry_date, e.created_at, e.id
                   rows between unbounded preceding and current row) as balance_after,
           -- The rate per litre the owner writes beside each delivery, worked
           -- out here rather than in the browser (money is Postgres's to
           -- compute), from the invoice amount the entry already carries - so
           -- it survives the delivery being deleted.
           case when e.litres > 0 then round(e.amount / e.litres, 2) end as rate,
           b.bank_name || coalesce(' · ' || b.account_label, '') as bank_label
      from public.supplier_ledger_entries e
      left join public.bank_accounts b on b.id = e.bank_account_id
     where e.supplier_id = p_supplier_id
  ),
  page as (
    select r.* from running r
     order by r.entry_date desc, r.created_at desc, r.id desc
     limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.entry_date desc, p.created_at desc, p.id desc) from page p),
      '[]'::jsonb),
    'total', (select count(*) from running),
    'corrected_ids', coalesce(
      (select jsonb_agg(r.corrects_entry_id) from running r where r.corrects_entry_id is not null),
      '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_supplier_ledger_page(uuid, integer, integer) is
  'One page of a supplier''s account, newest first, each row carrying what was owed after it, summed over the whole account. Owner only. See 067.';


revoke execute on function public.record_supplier_payment(uuid, numeric, date, text, uuid, text) from public, anon;
revoke execute on function public.record_supplier_entry(uuid, text, text, numeric, date, text) from public, anon;
revoke execute on function public.cancel_supplier_entry(uuid) from public, anon;
revoke execute on function public.get_supplier_summaries() from public, anon;
revoke execute on function public.get_supplier_ledger_page(uuid, integer, integer) from public, anon;
revoke execute on function public.supplier_name_or_refuse(uuid) from public, anon;
grant execute on function public.record_supplier_payment(uuid, numeric, date, text, uuid, text) to authenticated;
grant execute on function public.record_supplier_entry(uuid, text, text, numeric, date, text) to authenticated;
grant execute on function public.cancel_supplier_entry(uuid) to authenticated;
grant execute on function public.get_supplier_summaries() to authenticated;
grant execute on function public.get_supplier_ledger_page(uuid, integer, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- The activity log, for both tables, without touching trg_write_activity().
-- -----------------------------------------------------------------------------
create or replace function public.trg_write_supplier_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new      jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old      jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row      jsonb;
  v_changes  jsonb;
  v_label    text;
  v_summary  text;
  v_date     date;
  v_amount   numeric;
  v_actor_id uuid;
  v_actor    text;
begin
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object('field', t.k, 'from', v_old -> t.k, 'to', v_new -> t.k)
                              order by t.k), '[]'::jsonb)
      into v_changes
      from jsonb_object_keys(v_new) as t(k)
     where t.k <> 'created_at' and (v_old -> t.k) is distinct from (v_new -> t.k);
    if jsonb_array_length(v_changes) = 0 then
      return coalesce(new, old);
    end if;
  end if;

  if tg_table_name = 'supplier_ledger_entries' then
    -- A delivery's own entry: the delivery is already in the log. A link going
    -- null because its row was deleted is not news either.
    if (v_row ->> 'is_auto')::boolean or tg_op = 'UPDATE' then
      return coalesce(new, old);
    end if;
    v_label := case v_row ->> 'kind'
                 when 'payment'    then 'Payment to a supplier'
                 when 'discount'   then 'Discount from a supplier'
                 when 'adjustment' then 'Supplier account adjusted'
                 else 'Supplier entry cancelled' end;
    v_date := (v_row ->> 'entry_date')::date;
    v_amount := (v_row ->> 'amount')::numeric;
    select s.name into v_summary from public.suppliers s where s.id = (v_row ->> 'supplier_id')::uuid;
    v_summary := coalesce(v_summary, 'A supplier')
      || ': Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
      || case v_row ->> 'paid_from' when 'cash' then ' in cash' when 'bank' then ' by bank transfer' else '' end
      || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');
  else
    v_label := 'Supplier';
    v_summary := coalesce(nullif(v_row ->> 'name', ''), 'A supplier')
      || coalesce(' · ' || nullif(v_row ->> 'phone', ''), '')
      || case when (v_row ->> 'is_active')::boolean then '' else ' · retired' end;
  end if;

  select a.actor_id, a.actor_name into v_actor_id, v_actor from public.activity_actor() a;

  insert into public.activity_log
    (actor_id, actor_name, action, entity, entity_label, entity_id, summary, entry_date, amount, details)
  values
    (v_actor_id, v_actor,
     case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'changed' else 'deleted' end,
     tg_table_name, v_label, (v_row ->> 'id')::uuid, v_summary, v_date, v_amount,
     jsonb_build_object('row', v_row)
       || case when v_changes is null then '{}'::jsonb else jsonb_build_object('changes', v_changes) end);

  return coalesce(new, old);

exception when others then
  -- The log must never be the reason a payment fails, the same rule as 035.
  return coalesce(new, old);
end;
$$;

create trigger suppliers_activity
  after insert or update or delete on public.suppliers
  for each row execute function public.trg_write_supplier_activity();

create trigger supplier_ledger_entries_activity
  after insert or update or delete on public.supplier_ledger_entries
  for each row execute function public.trg_write_supplier_activity();


-- -----------------------------------------------------------------------------
-- Backup (051): both tables carried; suppliers seeded, so wiped before a load.
-- -----------------------------------------------------------------------------
create or replace function public.backup_table_order()
returns text[]
language sql
immutable
as $$
  select array[
    'tanks', 'nozzles', 'customers', 'lubricants', 'bank_accounts', 'suppliers',
    'fuel_prices', 'company_assets', 'expenses', 'treasury_entries',
    'nozzle_readings', 'fuel_purchases', 'lubricant_purchases', 'stock_checks',
    'lubricant_sales', 'credit_sales', 'ledger_entries', 'bank_transactions',
    'supplier_ledger_entries'
  ]::text[];
$$;

create or replace function public.backup_seeded_tables()
returns text[]
language sql
immutable
as $$
  -- Children first: this is also the delete order. `suppliers` last, because
  -- on a freshly migrated project nothing points at the four seeded names yet.
  select array['nozzles', 'tanks', 'treasury_entries', 'suppliers']::text[];
$$;


-- -----------------------------------------------------------------------------
-- Reset (016, 025): the supplier ledger goes with the purchases. The suppliers
-- themselves stay, like the tanks and the lubricants.
-- -----------------------------------------------------------------------------
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
    'readings',        (select count(*) from public.nozzle_readings),
    'customers',       (select count(*) from public.customers),
    'purchases',       (select count(*) from public.fuel_purchases),
    'expenses',        (select count(*) from public.expenses),
    'lubricant_sales', (select count(*) from public.lubricant_sales)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries where true;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales        where true;
  delete from public.nozzle_readings     where true;
  delete from public.stock_checks        where true;
  delete from public.fuel_purchases      where true;
  delete from public.lubricant_sales     where true;
  delete from public.lubricant_purchases where true;
  delete from public.expenses            where true;
  delete from public.customers           where true;
  delete from public.fuel_prices         where true;

  -- After the purchases: deleting them posts reversals on the way out.
  perform set_config('app.resetting_supplier_ledger', 'on', true);
  delete from public.supplier_ledger_entries where true;
  perform set_config('app.resetting_supplier_ledger', 'off', true);

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  update public.lubricants
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today()
   where true;

  return v_counts;
end;
$$;


-- -----------------------------------------------------------------------------
-- Four placeholder suppliers, at zero, for the owner to rename. "Gas & Oil" is
-- the one he named in the voice note; the others are placeholders by design.
-- Safe to run twice.
-- -----------------------------------------------------------------------------
insert into public.suppliers (name, note)
values
  ('Gas & Oil',          'Placeholder. Rename it under Suppliers, or retire it.'),
  ('Fuel supplier 2',    'Placeholder. Rename it under Suppliers, or retire it.'),
  ('Fuel supplier 3',    'Placeholder. Rename it under Suppliers, or retire it.'),
  ('Lubricant supplier', 'Placeholder. Rename it under Suppliers, or retire it.')
on conflict do nothing;
