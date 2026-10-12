-- A NEW DATABASE for Al Hakeem Filling Station PSO, part 2 of 4, run in order.
-- Al Hakeem's repo at its latest migration (001 to 072, then 800 to 812), then start-empty.
-- Run ONLY on a brand-new, empty Supabase project. Each migration commits on its
-- own; if one stops, fix the cause and run the file again from that migration.
-- This part holds: 030_loose_oil_in_the_export.sql to 050_clear_the_old_activity_log.sql

-- ===================================================================== 030_loose_oil_in_the_export.sql
-- =============================================================================
-- 030_loose_oil_in_the_export.sql
--
-- The workbook learns about the drum.
--
-- Three additions to get_month_export, and nothing else - the export RPC is a
-- copy of the monthly report shaped for the spreadsheet, and migration 028
-- already taught the report itself. Restated in full because plpgsql has no way
-- to replace part of a function body.
--
--   lubricant_sales      gains the loose count, litres and money, so the
--                        Summary sheet can carry an "of which loose oil" line.
--                        The drum is most of the sale COUNT and a small share
--                        of the takings, so a single combined figure flatters
--                        neither half.
--   lubricant_purchases  gains the loose litres and cost, so a drum delivery is
--                        separable from a pallet of cartons.
--   lubricant_rows       gains sold_loose, which becomes a "Kind" column on the
--                        Lubricants sheet. The product name usually says so
--                        too, but a word in its own column is what makes the
--                        sheet filterable - asking for "just the drum" should
--                        not depend on how the owner spelled it.
-- =============================================================================

create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from      date;
  v_to        date;
  v_sales     numeric(14,2);
  v_cost      numeric(14,2);
  v_expenses  numeric(14,2);
  v_lub_sales numeric(14,2);
  v_lub_cost  numeric(14,2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;
  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;
  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;
  select coalesce(sum(ls.amount), 0) into v_lub_sales
    from public.lubricant_sales ls where ls.sale_date between v_from and v_to;
  select coalesce(sum(lp.total_cost), 0) into v_lub_cost
    from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0),
        'loose_count',   count(*) filter (where l.sold_loose),
        'loose_litres',  coalesce(sum(ls.litres) filter (where l.sold_loose), 0),
        'loose_amount',  coalesce(sum(ls.amount) filter (where l.sold_loose), 0)
      ) from public.lubricant_sales ls
        join public.lubricants l on l.id = ls.lubricant_id
       where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0),
        'loose_litres',    coalesce(sum(lp.quantity_litres) filter (where l.sold_loose), 0),
        'loose_cost',      coalesce(sum(lp.total_cost) filter (where l.sold_loose), 0)
      ) from public.lubricant_purchases lp
        join public.lubricants l on l.id = lp.lubricant_id
       where lp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit', round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',              d::date,
               'litres_sold',      f.litres_sold,
               'petrol_litres',    f.petrol_litres,
               'diesel_litres',    f.diesel_litres,
               'sale_amount',      f.sale_amount,
               'cash_amount',      f.cash_amount,
               'credit_amount',    f.credit_amount,
               'lubricant_litres', lu.litres,
               'lubricant_amount', lu.amount
             ) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join lateral (
        select coalesce(sum(nr.litres_sold), 0)   as litres_sold,
               coalesce(sum(nr.sale_amount), 0)   as sale_amount,
               coalesce(sum(nr.cash_amount), 0)   as cash_amount,
               coalesce(sum(nr.credit_amount), 0) as credit_amount,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = d::date
      ) f on true
      left join lateral (
        select coalesce(sum(ls.litres), 0) as litres,
               coalesce(sum(ls.amount), 0) as amount
          from public.lubricant_sales ls
         where ls.sale_date = d::date
      ) lu on true
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    -- What is left on the lubricant shelf at month end. Kept beside the tanks'
    -- closing stock for the same reason: it is money sitting in stock rather
    -- than profit that was never made.
    'lubricant_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           l.name,
               'closing_litres', public.calculate_lubricant_stock(l.id, v_to)
             ) order by l.name)
      from public.lubricants l
      where l.is_active
         or exists (select 1 from public.lubricant_sales ls
                     where ls.lubricant_id = l.id and ls.sale_date between v_from and v_to)
    ), '[]'::jsonb),

    -- Fuel and lubricant deliveries in one list, ordered by date. `item` is the
    -- tank for fuel and the product for a lubricant, so the sheet reads down
    -- one column either way.
    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', r.date, 'tank', r.item, 'fuel_type', r.kind,
               'supplier', r.supplier, 'invoice', r.invoice,
               'litres', r.litres, 'rate', r.rate, 'cost', r.cost,
               'payment_status', r.payment_status
             ) order by r.date, r.created_at)
      from (
        select fp.purchase_date as date, t.name as item, t.fuel_type::text as kind,
               fp.supplier_name as supplier, fp.invoice_number as invoice,
               fp.quantity_litres as litres, fp.rate, fp.total_cost as cost,
               fp.payment_status::text as payment_status, fp.created_at
          from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
         where fp.purchase_date between v_from and v_to
        union all
        select lp.purchase_date, l.name, 'lubricant',
               lp.supplier_name, lp.invoice_number,
               lp.quantity_litres, lp.rate, lp.total_cost,
               lp.payment_status::text, lp.created_at
          from public.lubricant_purchases lp join public.lubricants l on l.id = lp.lubricant_id
         where lp.purchase_date between v_from and v_to
      ) r
    ), '[]'::jsonb),

    -- Every counter sale in the month, itemised.
    'lubricant_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', ls.sale_date, 'name', l.name, 'sold_loose', l.sold_loose,
               'litres', ls.litres, 'rate', ls.rate_per_litre, 'amount', ls.amount,
               'cash_amount', ls.cash_amount, 'credit_amount', ls.credit_amount,
               'customer', c.name, 'note', ls.note
             ) order by ls.sale_date, ls.created_at)
      from public.lubricant_sales ls
      join public.lubricants l on l.id = ls.lubricant_id
      left join public.customers c on c.id = ls.customer_id
      where ls.sale_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb),

    -- Every bank movement in the month, itemised. Written before the 60-entry
    -- cap can reach these rows, so the workbook is the durable record once they
    -- age off the Banking page.
    'bank_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', bt.txn_date, 'account', ba.account_label, 'bank', ba.bank_name,
               'direction', bt.txn_type, 'category', bt.category,
               'note', bt.note, 'amount', bt.amount
             ) order by bt.txn_date, bt.created_at)
      from public.bank_transactions bt
      join public.bank_accounts ba on ba.id = bt.account_id
      where bt.txn_date between v_from and v_to
    ), '[]'::jsonb),

    -- Where each account stood when the report was taken.
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', b.account_label, 'bank', b.bank_name,
               'balance', b.balance, 'total_deposited', b.total_deposited,
               'total_paid', b.total_paid
             ) order by b.created_at)
      from public.bank_account_balances b
    ), '[]'::jsonb),

    'bank_month', (
      select jsonb_build_object(
               'deposits', coalesce(sum(bt.amount) filter (where bt.txn_type = 'deposit'), 0),
               'payments', coalesce(sum(bt.amount) filter (where bt.txn_type = 'payment'), 0)
             )
        from public.bank_transactions bt where bt.txn_date between v_from and v_to
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ===================================================================== 031_remove_a_customer.sql
-- =============================================================================
-- 031_remove_a_customer.sql
--
-- Taking a customer off the list - a name typed wrong, a duplicate, or an
-- account that has genuinely finished.
--
-- THE SAME TWO MEANINGS AS delete_lubricant (migration 024), for the same
-- reason:
--
--   never traded    - a typo, or an account opened and never used. There is
--                     nothing to preserve, so it is deleted outright.
--   has any history - deleting would tear a hole in months that have already
--                     been reported and exported, and the ledger's whole point
--                     is that it still adds up a year later. The account is
--                     RETIRED instead: it leaves the customer list and the
--                     credit-slip dropdown, and every entry it ever carried
--                     keeps counting.
--
-- Which one happened comes back in the result, so the screen can say so rather
-- than leaving the owner to guess.
--
-- AND ONE GUARD THAT delete_lubricant DOES NOT NEED.
--
-- A retired customer disappears from get_customer_balances, which is what the
-- Customers page totals "still outstanding" from. Retire someone who owes
-- Rs 50,000 and the pump's own record of what it is owed silently drops by
-- Rs 50,000, with nothing on screen to say why. So an account may only be
-- removed when it is SQUARE.
--
-- Both directions are refused, not just a debt:
--
--   balance > 0   they owe the pump. Removing it writes the debt off by
--                 accident.
--   balance < 0   the pump owes them - they have paid ahead, or a payment was
--                 recorded against the wrong name. Hiding that loses money
--                 belonging to a customer, which is worse than an untidy list.
--
-- The way out of both is on the customer's own page: record the settling
-- payment, or post an adjustment, and then remove them.
--
-- Deleting is not the same as the ledger being editable. The append-only rule
-- (migration 014) is about CORRECTING an entry, which is still forbidden; this
-- removes a name that has no entries, or hides one whose entries all stay put.
-- =============================================================================

create or replace function public.delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_balance   numeric(14, 2);
  v_entries   int;
  v_slips     int;
  v_lub_sales int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a customer' using errcode = '42501';
  end if;

  select c.name into v_name from public.customers c where c.id = p_customer_id;
  if v_name is null then
    raise exception 'That customer no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0),
         count(*)
    into v_balance, v_entries
    from public.ledger_entries le
   where le.customer_id = p_customer_id;

  select count(*) into v_slips
    from public.credit_sales cs where cs.customer_id = p_customer_id;
  select count(*) into v_lub_sales
    from public.lubricant_sales ls where ls.customer_id = p_customer_id;

  -- The account has to be square first. Named amounts and a next step, because
  -- this message is the only explanation the owner gets.
  if v_balance > 0 then
    raise exception
      '% still owes Rs %. Removing the account now would drop that from what the '
      'pump is owed, and nothing would show it had gone. Record the payment on '
      'their page first, then remove them.',
      v_name, trim(to_char(v_balance, 'FM999999999990.00'))
      using errcode = '23514';
  end if;

  if v_balance < 0 then
    raise exception
      'The pump owes % Rs % - they have paid more than they have taken. Removing '
      'the account would lose that. Settle it on their page first (or post an '
      'adjustment if the payment belongs to someone else), then remove them.',
      v_name, trim(to_char(-v_balance, 'FM999999999990.00'))
      using errcode = '23514';
  end if;

  if v_entries = 0 and v_slips = 0 and v_lub_sales = 0 then
    delete from public.customers where id = p_customer_id;
    return jsonb_build_object('name', v_name, 'removed', true,
                              'entries', 0, 'slips', 0, 'lubricant_sales', 0);
  end if;

  update public.customers
     set is_active = false
   where id = p_customer_id;

  return jsonb_build_object('name', v_name, 'removed', false,
                            'entries', v_entries, 'slips', v_slips,
                            'lubricant_sales', v_lub_sales);
end;
$$;

comment on function public.delete_customer(uuid) is
  'Removes a customer: deleted outright when never traded, retired when it has '
  'history. Refuses either way while the account is not square, so a balance '
  'cannot vanish from what the pump is owed.';

revoke execute on function public.delete_customer(uuid) from public, anon;
grant  execute on function public.delete_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Retired customers have to be findable, or "removed" is indistinguishable
-- from "lost". get_customer_balances only returns active ones, on purpose -
-- that is the working list. This is the other half.
--
-- Balances come along because a retired account is not guaranteed to be square
-- for ever: the trigger checks at the moment of removal, and a later
-- correction elsewhere could move it. Showing the figure means that is visible
-- rather than hidden behind is_active.
-- ---------------------------------------------------------------------------
create or replace function public.get_retired_customers()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  credit_limit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.vehicle_number,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where not c.is_active
   group by c.id, c.name, c.vehicle_number, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_retired_customers() from public, anon;
grant  execute on function public.get_retired_customers() to authenticated;

-- ===================================================================== 032_ledger_in_whole_rupees.sql
-- =============================================================================
-- 032_ledger_in_whole_rupees.sql
--
-- The customer ledger works in whole rupees, because Pakistan has no coin
-- below one.
--
-- WHAT WENT WRONG. A credit slip's amount is litres times the rate, so 11
-- litres at Rs 339.48 posted a debit of Rs 3,734.28. The customer paid the
-- Rs 3,734 he was asked for, and 28 paisa stayed on his account - not as a
-- debt, because nobody can hand over 28 paisa, but as arithmetic that no
-- payment will ever clear. The screen made it worse by disagreeing with
-- itself: the headline showed "Rs -5,000" rounded while the table below it
-- showed "Rs -4,999.72".
--
-- The app side now rounds every ledger write to whole rupees - credit slips,
-- payments, adjustments and lubricant sales. This migration is the other half:
-- the one place the app ASKS the database about a balance and acts on the
-- answer.
--
-- WHY delete_customer HAD TO CHANGE WITH IT. Its guard refused removal while
-- the balance was not exactly zero. With the ledger displayed in whole rupees,
-- a legacy 28-paisa residue reads as "Rs 0" on screen and still refuses - an
-- account that looks settled, cannot be removed, and gives a reason quoting a
-- figure the owner has no way to pay. So the guard now rounds too, and the two
-- agree: if the account reads as square, it is square.
--
-- This is not a write-off waved through. It rounds to the nearest rupee, so
-- the most it can ever forgive is 49 paisa - less than the smallest coin that
-- exists. Anything a customer could actually be asked for still blocks removal
-- and still names the figure.
--
-- The meter arithmetic is deliberately NOT touched. nozzle_readings.sale_amount
-- is litres times a rate and genuinely carries paisa; rounding it would put the
-- day's takings out of step with the litres that produced them. The difference
-- lands on the cash side, which is right - cash is the residual, and it is
-- counted in notes.
-- =============================================================================

create or replace function public.delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_balance   numeric(14, 2);
  v_owed      numeric(14, 2);
  v_entries   int;
  v_slips     int;
  v_lub_sales int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a customer' using errcode = '42501';
  end if;

  select c.name into v_name from public.customers c where c.id = p_customer_id;
  if v_name is null then
    raise exception 'That customer no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0),
         count(*)
    into v_balance, v_entries
    from public.ledger_entries le
   where le.customer_id = p_customer_id;

  select count(*) into v_slips
    from public.credit_sales cs where cs.customer_id = p_customer_id;
  select count(*) into v_lub_sales
    from public.lubricant_sales ls where ls.customer_id = p_customer_id;

  -- To the rupee, matching what the screen shows and what a customer could
  -- actually be asked to hand over.
  v_owed := round(v_balance);

  if v_owed > 0 then
    raise exception
      '% still owes Rs %. Removing the account now would drop that from what the '
      'pump is owed, and nothing would show it had gone. Record the payment on '
      'their page first, then remove them.',
      v_name, trim(to_char(v_owed, 'FM999999999990'))
      using errcode = '23514';
  end if;

  if v_owed < 0 then
    raise exception
      'The pump owes % Rs % - they have paid more than they have taken. Removing '
      'the account would lose that. Settle it on their page first (or post an '
      'adjustment if the payment belongs to someone else), then remove them.',
      v_name, trim(to_char(-v_owed, 'FM999999999990'))
      using errcode = '23514';
  end if;

  if v_entries = 0 and v_slips = 0 and v_lub_sales = 0 then
    delete from public.customers where id = p_customer_id;
    return jsonb_build_object('name', v_name, 'removed', true,
                              'entries', 0, 'slips', 0, 'lubricant_sales', 0);
  end if;

  update public.customers
     set is_active = false
   where id = p_customer_id;

  return jsonb_build_object('name', v_name, 'removed', false,
                            'entries', v_entries, 'slips', v_slips,
                            'lubricant_sales', v_lub_sales);
end;
$$;

comment on function public.delete_customer(uuid) is
  'Removes a customer: deleted outright when never traded, retired when it has '
  'history. Refuses while the account is not square to the nearest rupee, so a '
  'balance cannot vanish from what the pump is owed.';

-- ===================================================================== 033_purge_a_mistyped_customer.sql
-- =============================================================================
-- 033_purge_a_mistyped_customer.sql
--
-- Deleting a customer PERMANENTLY - the row and the ledger entries with it.
--
-- Migration 031 gave the owner Remove, which deletes an account that never
-- traded and retires one that did. He then asked the obvious next question: a
-- customer added by mistake that somehow picked up entries is retired for ever
-- and sits in the Removed list looking like a real customer who left.
--
-- WHAT THIS IS ALLOWED TO TOUCH, AND WHY THAT LINE IS WHERE IT IS.
--
-- Only an account whose entire footprint is entries the owner TYPED HIMSELF -
-- payments and adjustments. No credit slips, no lubricant sales.
--
-- That is not squeamishness, it is the difference between two kinds of row:
--
--   a credit slip      belongs to a nozzle reading. A saved reading's
--                      credit_amount must equal the sum of its slips
--                      (nozzle_readings_credit_matches), and the litres behind
--                      it are part of that day's takings and that month's
--                      report. Deleting one either breaks the constraint or
--                      silently rewrites a day that has already been reported
--                      and exported.
--   a typed entry      belongs to nobody but the customer. No reading depends
--                      on it, no month's litres come from it. If the customer
--                      was a mistake then the entry was the same mistake, and
--                      removing both leaves every other figure in the database
--                      exactly where it was.
--
-- So: a customer who has ever actually traded cannot be purged, and the owner
-- is told why. Clearing the day on Readings is the route for that, and it
-- reverses the slip properly rather than hiding it.
--
-- HOW IT GETS PAST THE APPEND-ONLY GUARD.
--
-- ledger_entries has a BEFORE DELETE trigger that refuses everything, service
-- role included. That guarantee is the most valuable thing in this schema and
-- is not being weakened for convenience - so rather than disabling the trigger
-- (which would be off for every other session while it was off), the guard
-- learns ONE named exception: a delete is permitted only while
-- `app.purging_customer` holds this customer's id.
--
-- That setting is transaction-local and is set in exactly one place, by the
-- security-definer function below, after every check has passed. A stray
-- DELETE from the API, from server code, or from a future refactor still hits
-- the same refusal it always did, because none of them set it.
--
-- WHAT IT LEAVES BEHIND: nothing. The owner asked for gone, and a tombstone
-- row would mean the name never really left. The record of a purge is the
-- changelog and this file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The guard, with the new exception.
--
-- The UPDATE half is copied verbatim from migration 024 - restated in full
-- because a `create or replace` has to carry the whole body, and a reader
-- should not have to diff three migrations to know what the trigger does.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'created_by' - 'credit_sale_id' - 'lubricant_sale_id'
       = to_jsonb(old) - 'created_by' - 'credit_sale_id' - 'lubricant_sale_id'
     and (new.created_by        is not distinct from old.created_by        or new.created_by        is null)
     and (new.credit_sale_id    is not distinct from old.credit_sale_id    or new.credit_sale_id    is null)
     and (new.lubricant_sale_id is not distinct from old.lubricant_sale_id or new.lubricant_sale_id is null)
  then
    return new;
  end if;

  -- The one way a ledger entry may be deleted: purge_customer() is running,
  -- has already established that this customer never traded, and has named
  -- this customer in a transaction-local setting. Nothing else sets it.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purging_customer', true), '') = old.customer_id::text
  then
    return old;
  end if;

  raise exception
    'The customer ledger is append-only. To correct an entry, post a new offsetting entry instead.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_ledger_append_only() is
  'Blocks UPDATE and DELETE on ledger_entries. Exceptions, and only these: '
  'created_by, credit_sale_id and lubricant_sale_id may be nulled when the row '
  'they point at is deleted; and a DELETE is allowed while '
  'app.purging_customer names the entry''s customer, which only '
  'purge_customer() ever sets.';

-- ---------------------------------------------------------------------------
-- The purge itself.
--
-- p_confirm_name is required and must match the customer's name. This is an
-- irreversible delete of money records reached from a table row, so a
-- mis-aimed click must not be enough - the owner has to type the name, and the
-- comparison is forgiving about case and surrounding space but nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.purge_customer(
  p_customer_id  uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_balance   numeric(14, 2);
  v_entries   int;
  v_slips     int;
  v_lub_sales int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may permanently delete a customer' using errcode = '42501';
  end if;

  select c.name into v_name from public.customers c where c.id = p_customer_id;
  if v_name is null then
    raise exception 'That customer no longer exists' using errcode = 'P0002';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception
      'To delete % permanently, type the name exactly as it appears.', v_name
      using errcode = '23514';
  end if;

  select count(*) into v_slips
    from public.credit_sales cs where cs.customer_id = p_customer_id;
  select count(*) into v_lub_sales
    from public.lubricant_sales ls where ls.customer_id = p_customer_id;

  -- Anything that came from a reading or a counter sale is part of a day that
  -- has been reported. Name the route out rather than just refusing.
  if v_slips > 0 or v_lub_sales > 0 then
    raise exception
      '% cannot be deleted permanently: % fuel credit slip(s) and % lubricant sale(s) '
      'are recorded against them, and those belong to days already on the books. '
      'Removing the account keeps that history intact, which is what Remove does. '
      'If the slips themselves are wrong, clear the day on Readings first - that '
      'reverses them properly.',
      v_name, v_slips, v_lub_sales
      using errcode = '23514';
  end if;

  select coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0),
         count(*)
    into v_balance, v_entries
    from public.ledger_entries le
   where le.customer_id = p_customer_id;

  -- Square first, to the rupee, exactly as Remove requires - deleting an
  -- account still carrying money would take that money off the books silently.
  if round(v_balance) <> 0 then
    raise exception
      '% is not settled - the balance stands at Rs %. Square the account first, '
      'then delete it.',
      v_name, trim(to_char(round(v_balance), 'FM999999999990'))
      using errcode = '23514';
  end if;

  -- Everything has passed. Name the customer so the append-only guard will let
  -- these particular rows go, and no others. set_config with is_local = true
  -- scopes it to this transaction, so it is gone the moment this returns.
  perform set_config('app.purging_customer', p_customer_id::text, true);

  delete from public.ledger_entries where customer_id = p_customer_id;
  delete from public.customers       where id          = p_customer_id;

  perform set_config('app.purging_customer', '', true);

  return jsonb_build_object('name', v_name, 'entries_deleted', v_entries);
end;
$$;

comment on function public.purge_customer(uuid, text) is
  'Deletes a customer and their ledger entries for good. Owner only, name must '
  'be typed to confirm, and only for an account that never traded - no credit '
  'slips, no lubricant sales - and is settled.';

revoke execute on function public.purge_customer(uuid, text) from public, anon;
grant  execute on function public.purge_customer(uuid, text) to authenticated;

-- ===================================================================== 034_customer_opening_balance.sql
-- =============================================================================
-- 034_customer_opening_balance.sql
--
-- Creating a customer who already has a balance.
--
-- Most of the names going into this app are not new customers - they are
-- people who have been taking fuel on credit out of a paper register for
-- years, and some of them owe money on the day they are typed in. A few are
-- the other way round and have paid ahead. Until now the only route was:
-- create the customer, then remember to go into their page and post a manual
-- adjustment. The second half is easy to forget, and a customer silently
-- starting at zero when they owe Rs 40,000 is money quietly leaving the books.
--
-- WHY THIS IS A FUNCTION AND NOT TWO INSERTS FROM THE ACTION. The customer row
-- and the opening entry have to land together. Two separate inserts can leave
-- the customer created and the balance missing if the second one fails - which
-- is exactly the silent zero this is meant to prevent. One function, one
-- transaction, both or neither.
--
-- The opening entry is an ordinary ledger row and the append-only rule applies
-- to it in full: it can never be edited or deleted, only offset by another
-- entry. That is the point. It also means the note has to say what it is
-- without anyone remembering the conversation, so the function writes it.
-- =============================================================================

create or replace function public.create_customer_with_opening(
  p_name              text,
  p_vehicle_number    text    default null,
  p_phone             text    default null,
  p_credit_limit      numeric default null,
  -- Always a positive figure; the direction says which way it goes. Asking for
  -- a signed number here would mean the caller could send -500 with a
  -- direction of 'owes', and the two would disagree with nothing to arbitrate.
  p_opening_amount    numeric default 0,
  p_opening_direction text    default null   -- 'owes' | 'in_credit'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_amount  numeric(14, 2);
  v_actor   uuid := auth.uid();
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the customer''s name' using errcode = '23514';
  end if;

  -- Whole rupees, like every other ledger write since migration 032.
  v_amount := round(coalesce(p_opening_amount, 0));

  if v_amount < 0 then
    raise exception
      'Enter the opening balance as a positive figure and choose which way it goes.'
      using errcode = '23514';
  end if;

  if v_amount > 0 and coalesce(p_opening_direction, '') not in ('owes', 'in_credit') then
    raise exception
      'Say whether the customer owes this amount or is in credit for it.'
      using errcode = '23514';
  end if;

  insert into public.customers (name, vehicle_number, phone, credit_limit, created_by)
  values (btrim(p_name),
          nullif(btrim(coalesce(p_vehicle_number, '')), ''),
          nullif(btrim(coalesce(p_phone, '')), ''),
          p_credit_limit,
          v_actor)
  returning id into v_id;

  if v_amount > 0 then
    insert into public.ledger_entries
      (customer_id, entry_type, amount, entry_date, note, created_by)
    values (
      v_id,
      case when p_opening_direction = 'owes' then 'debit' else 'credit' end,
      v_amount,
      public.pump_today(),
      case when p_opening_direction = 'owes'
           then 'Opening balance - owed when the account was set up'
           else 'Opening balance - paid ahead when the account was set up'
      end,
      v_actor
    );
  end if;

  return v_id;
end;
$$;

comment on function public.create_customer_with_opening(text, text, text, numeric, numeric, text) is
  'Creates a customer and, in the same transaction, the opening ledger entry '
  'for any balance they already carried. Amount is positive; the direction '
  'decides whether it is a debit or a credit.';

revoke execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text)
  from public, anon;
grant  execute on function public.create_customer_with_opening(text, text, text, numeric, numeric, text)
  to authenticated;

-- ===================================================================== 035_activity_log.sql
-- =============================================================================
-- 035_activity_log.sql
--
-- An audit trail: who did what, and when.
--
-- WHY THIS IS IN THE DATABASE AND NOT THE APP. A log written by the Server
-- Actions would record only what went through them. It would miss a write made
-- from a second tab, from the Supabase console, from a future script, or from
-- any action somebody forgets to instrument - and the one time you go looking
-- at an audit trail is the time something happened that you did not expect.
-- Triggers see every write to the table, whatever made it.
--
-- THREE THINGS THIS DELIBERATELY DOES NOT DO:
--
--   * It never blocks a write. The whole trigger body is wrapped in an
--     exception handler, so a bug in the summary text below can never stop the
--     owner saving the evening's readings. An audit trail that takes the pump
--     off the air is worse than no audit trail. The cost is that a logging
--     failure is silent - see the note on trg_write_activity.
--
--   * It does not log stock recalculation. `tanks.current_stock_litres` and
--     `lubricants.current_stock_litres` are recomputed by trigger after every
--     reading and every delivery, so logging them would bury the day's real
--     work under a line of machine bookkeeping for each one. An update whose
--     only changed columns are ignored is not logged at all.
--
--   * It does not log the ledger entry a credit slip posts automatically. That
--     is the same event twice, and the slip is the half a person recognises.
--     Hand-made ledger rows - payments, adjustments, an opening balance, the
--     reversal a deleted reading posts - are logged, because those are someone
--     deciding something.
--
-- READ ONLY BY THE OWNER, and append-only for everybody including the owner.
-- A log that the person being logged can edit is decoration.
-- =============================================================================

create table if not exists public.activity_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),

  -- Denormalised on purpose. The id can go null when a profile is removed;
  -- the name is what the log is for, and it has to survive that.
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text not null,

  action        text not null check (action in ('created', 'changed', 'deleted')),

  -- `entity` is the table, kept for filtering later. `entity_label` is the
  -- word the owner would use for it.
  entity        text not null,
  entity_label  text not null,
  entity_id     uuid,

  -- One readable sentence, built at write time. It has to be built now rather
  -- than rendered later: after a delete, the row it describes is gone.
  summary       text not null,

  -- The business day the entry concerns, where it has one - which is not the
  -- same as when it was typed, and the difference is the point of the column.
  entry_date    date,
  amount        numeric(14, 2),

  -- The row as it stood, plus a field-by-field diff on an update.
  details       jsonb
);

comment on table public.activity_log is
  'Append-only audit trail, written by trigger. Owner reads it; nobody edits it.';

create index if not exists activity_log_occurred_at_idx
  on public.activity_log (occurred_at desc);

create index if not exists activity_log_entity_idx
  on public.activity_log (entity, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Who is writing.
--
-- security definer because it reads profiles, which the caller may not be able
-- to read all of. 'System' covers a write with no login behind it: a SQL
-- console, a scheduled job, the reset routine. Naming it is better than a null
-- the page then has to explain.
-- ---------------------------------------------------------------------------
create or replace function public.activity_actor()
returns table (actor_id uuid, actor_name text)
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()),
         coalesce(
           (select p.full_name from public.profiles p where p.id = (select auth.uid())),
           case when (select auth.uid()) is null then 'System' else 'Unknown login' end
         );
$$;

-- ---------------------------------------------------------------------------
-- The trigger.
--
-- Everything goes through to_jsonb() rather than reading NEW.column directly,
-- so one function serves sixteen tables without a compile-time dependency on
-- any of their shapes. A column renamed in a later migration degrades to a
-- less specific log line rather than breaking the write.
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

  -- Recomputed by other triggers, or noise. A change to these alone is not
  -- somebody doing something.
  --
  -- The two link columns are here because of a cascade found while testing:
  -- deleting a reading deletes its credit slips, and each slip's `on delete
  -- set null` then UPDATEs the ledger row that slip had posted. The ledger row
  -- is untouched in every way a person would care about, but the log said
  -- "Charge to a customer changed" underneath the deletion that caused it.
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

  -- What actually changed, on an update. Ignored columns are dropped first, so
  -- a stock recalculation leaves an empty list and the write goes unlogged.
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field', t.k,
             'from',  v_old -> t.k,
             'to',    v_new -> t.k
           ) order by t.k), '[]'::jsonb)
      into v_changes
      from jsonb_object_keys(v_new) as t(k)
     where not (t.k = any (v_ignored))
       and (v_old -> t.k) is distinct from (v_new -> t.k);

    if jsonb_array_length(v_changes) = 0 then
      return coalesce(new, old);
    end if;
  end if;

  -- A credit slip already posts its own ledger row. Logging both describes one
  -- event twice, and the slip is the half a person recognises.
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
      select c.name into v_summary
        from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.00') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'ledger_entries' then
      v_label := case v_row ->> 'entry_type' when 'credit' then 'Payment or credit'
                                             else 'Charge to a customer' end;
      v_date := (v_row ->> 'entry_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select c.name into v_summary
        from public.customers c where c.id = (v_row ->> 'customer_id')::uuid;
      v_summary := coalesce(v_summary, 'A customer')
        || ' — Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990')
        || coalesce(' · ' || nullif(v_row ->> 'note', ''), '');

    when 'lubricant_sales' then
      v_label := 'Oil sale';
      v_date := (v_row ->> 'sale_date')::date;
      v_amount := (v_row ->> 'amount')::numeric;
      select l.name into v_summary
        from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'litres')::numeric, 'FM999,999,990.000') || ' L'
        || ', Rs ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');

    when 'lubricant_purchases' then
      v_label := 'Oil delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select l.name into v_summary
        from public.lubricants l where l.id = (v_row ->> 'lubricant_id')::uuid;
      v_summary := coalesce(v_summary, 'A lubricant')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990');

    when 'fuel_purchases' then
      v_label := 'Fuel delivery';
      v_date := (v_row ->> 'purchase_date')::date;
      v_amount := (v_row ->> 'total_cost')::numeric;
      select t.name into v_summary
        from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
      v_summary := coalesce(v_summary, 'A tank')
        || ' — ' || to_char((v_row ->> 'quantity_litres')::numeric, 'FM999,999,990.00') || ' L'
        || coalesce(' from ' || nullif(v_row ->> 'supplier_name', ''), '')
        || ', Rs ' || to_char((v_row ->> 'total_cost')::numeric, 'FM999,999,999,990')
        || ' · ' || (v_row ->> 'payment_status');

    when 'stock_checks' then
      v_label := 'Tank dip';
      v_date := (v_row ->> 'check_date')::date;
      select t.name into v_summary
        from public.tanks t where t.id = (v_row ->> 'tank_id')::uuid;
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
      -- No entry_date on purpose, though the row has a date. entry_date exists
      -- so the page can say "filed against 07 Aug" when an entry was made
      -- against an older day than it was typed on, and a rate's effective_from
      -- is not that - it is when the price starts applying, which the summary
      -- already says in words. Filling it in got the page printing
      -- "filed against 08 Aug 2026" under a line that already read "from 08 Aug
      -- 2026", which is both a repetition and the wrong word for it.
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

    else
      v_label := tg_table_name;
      v_summary := tg_table_name;
  end case;

  -- Not jsonb_strip_nulls: it recurses, and it was quietly eating the `from`
  -- of a field that had been null, which is exactly the change worth seeing.
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
  -- DELIBERATELY SWALLOWED. Failing to write a log line must never fail the
  -- write it was describing - the pump has to be able to record its day even
  -- if something here is broken. The trade is that a bug in this function is
  -- invisible except as a gap in the log. Every branch below was therefore
  -- exercised against real rows before this shipped, in transactions that
  -- deliberately aborted - see docs/CHANGELOG.md for what that caught.
  return coalesce(new, old);
end;
$$;

comment on function public.trg_write_activity() is
  'Writes one activity_log row per change. Never raises - see the handler at the end.';

-- ---------------------------------------------------------------------------
-- Attach it. after, so a write that is refused by a constraint or an earlier
-- trigger never gets logged as though it happened.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'nozzle_readings', 'credit_sales', 'ledger_entries',
    'lubricant_sales', 'lubricant_purchases', 'fuel_purchases',
    'stock_checks', 'expenses', 'bank_transactions', 'bank_accounts',
    'customers', 'lubricants', 'fuel_prices', 'tanks', 'nozzles', 'profiles'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_activity', v_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.trg_write_activity()',
      v_table || '_activity', v_table
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The log is append-only, for everyone. Same treatment as the ledger, and for
-- a stronger reason: a trail the logged person can rewrite proves nothing.
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'The activity log is append-only. It records what happened; it is not edited.'
    using errcode = '0A000';
end;
$$;

drop trigger if exists activity_log_no_update on public.activity_log;
create trigger activity_log_no_update
  before update on public.activity_log
  for each row execute function public.trg_activity_log_append_only();

drop trigger if exists activity_log_no_delete on public.activity_log;
create trigger activity_log_no_delete
  before delete on public.activity_log
  for each row execute function public.trg_activity_log_append_only();

-- ---------------------------------------------------------------------------
-- RLS. The owner reads it and that is all anybody does: there is no insert
-- policy, because the only thing that writes here is the security definer
-- trigger above. Nothing a login can send to PostgREST can forge a line.
-- ---------------------------------------------------------------------------
alter table public.activity_log enable row level security;

drop policy if exists "activity_log: super admin reads" on public.activity_log;
create policy "activity_log: super admin reads"
  on public.activity_log for select to authenticated
  using (public.is_super_admin());

revoke execute on function public.activity_actor()      from public, anon;
revoke execute on function public.trg_write_activity()  from public, anon, authenticated;
revoke all on public.activity_log from anon;
grant select on public.activity_log to authenticated;

-- ===================================================================== 036_company_assets.sql
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

-- ===================================================================== 037_reading_completion_by_date.sql
-- =============================================================================
-- 037_reading_completion_by_date.sql
--
-- How many nozzles were read on each of the last few days, so the Readings
-- page can show at a glance which days are done, half-done, or not touched at
-- all - the gap that let a whole day (09 Aug 2026) go in at zero because the
-- next day's entry was typed against the wrong date without anyone noticing
-- the day before had never been opened.
--
-- Same date-spine trick as get_lubricant_trend (029): generate_series first,
-- readings joined onto it, so a day nobody touched is a real zero in the
-- result rather than a missing row a chart or a strip would have to guess at.
-- =============================================================================

create or replace function public.get_reading_completion(p_from date, p_to date)
returns table (
  reading_date    date,
  nozzles_entered integer,
  nozzles_total   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select count(*) into v_total from public.nozzles where is_active;

  return query
  select d::date,
         count(nr.id)::integer,
         v_total
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.nozzle_readings nr
      on nr.reading_date = d::date
     and nr.nozzle_id in (select id from public.nozzles where is_active)
   group by d
   order by d;
end;
$$;

revoke execute on function public.get_reading_completion(date, date) from public, anon;
grant  execute on function public.get_reading_completion(date, date) to authenticated;

-- ===================================================================== 038_drop_reading_completion.sql
-- =============================================================================
-- 038_drop_reading_completion.sql
--
-- Removes get_reading_completion(), added one migration ago in 037.
--
-- It fed a strip of day tiles above the nozzle list on Readings, meant to show
-- at a glance which recent days had been entered. The strip was tried three
-- ways - a band of tiles under the controls, the same tiles inline, then small
-- circles centred beside the date banner - and none of them earned the room
-- they took on a screen whose whole job is six nozzles. It is gone, so its
-- query has nothing left to serve.
--
-- THE FEATURE IT WAS PART OF IS NOT GONE. The gap warning above the nozzle
-- list and the confirm checkbox inside the entry dialog both remain, and both
-- work off `previous_date`, which get_reading_sheet (009) has always returned.
-- Those two are what actually stop a day being skipped without noticing; the
-- strip was decoration on top of them.
--
-- Dropped rather than left in place: an unused security-definer function is
-- surface area nobody is checking, and the next session reading this schema
-- should not have to work out what calls it. 037 stays in the history as the
-- record of what was tried.
-- =============================================================================

drop function if exists public.get_reading_completion(date, date);

-- ===================================================================== 039_dip_belongs_to_the_day_it_closes.sql
-- =============================================================================
-- 039_dip_belongs_to_the_day_it_closes.sql
--
-- The Stock page was reporting losses of one whole day's fuel, every day.
--
-- On 11 Aug 2026 the petrol tank showed a LOSS OF 1,652 L and the diesel tank
-- a loss of 212 L. Petrol had sold 1,683 L the day before and diesel 207 L.
-- That is not a coincidence and it was not a leak: the books were being asked
-- the wrong question.
--
-- The pump dips the tanks FIRST THING IN THE MORNING, before the pumps are
-- switched on, and enters that dip against the same day. So a dip dated the
-- 11th measures the tank as it stood at the CLOSE OF THE 10TH. The stock maths
-- assumed the opposite - that a dip dated the 11th was taken after the 11th
-- had finished trading - so it subtracted the 11th's sales (nothing yet, since
-- the 11th had barely begun) instead of the 10th's. Every morning dip was
-- therefore compared against a book figure that still had yesterday's fuel in
-- it, and the difference was reported as a loss.
--
-- Corrected, the same two dips read +31 L on petrol and -5 L on diesel. That
-- is a pump measuring itself accurately, which is what it was doing all along.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
-- A dip is a MOMENT, not a day. `check_date` keeps its meaning - the day the
-- rod went in the tank, which is what the person recording it knows - and a
-- new `taken` column says whether that was before the day started or after it
-- finished. From the two, `books_date` is generated: THE TRADING DAY THE DIP
-- CLOSES, and the day every gain/loss figure is now computed and reported
-- against.
--
--     taken = 'morning'   books_date = check_date - 1
--     taken = 'evening'   books_date = check_date
--
-- Existing rows default to 'morning' because that is, and always has been, the
-- pump's routine. Nothing is re-dated: the dips stay on the day they were
-- physically taken and simply start being counted against the day they close.
--
-- ---------------------------------------------------------------------------
-- And a second bug, found while proving the first
-- ---------------------------------------------------------------------------
-- `stock_checks.expected_stock` was written once, at the moment the dip was
-- saved, and never looked at again. `gain_loss` is generated from it. So
-- anything entered AFTERWARDS for an earlier date - a back-filled dip, a
-- reading typed the next morning, a delivery dated to when it actually
-- arrived - left the figure permanently wrong, with nothing on screen to say
-- so.
--
-- This had already happened. The dips for 3-8 Aug were back-filled on the 11th
-- in newest-first order, so every one of them took its baseline from the 2 Aug
-- dip instead of from the day before it, and all six landed on the same
-- phantom "gain of about 3,300 L". Nothing was wrong with the fuel; the rows
-- were computed against a baseline that was superseded a minute later.
--
-- `expected_stock` is now RECALCULATED FROM HISTORY by trigger, the same way
-- `tanks.current_stock_litres` already is, and for the same reason: a cached
-- figure that is only ever written once will drift away from the facts behind
-- it, and this is a money tool.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- When in the day the rod went in.
-- ---------------------------------------------------------------------------
create type public.dip_timing as enum ('morning', 'evening');

comment on type public.dip_timing is
  'Whether a dip was taken before the day traded or after it. Decides which trading day it closes.';

alter table public.stock_checks
  add column taken public.dip_timing not null default 'morning';

-- Generated rather than written by the app: it is arithmetic on two columns of
-- the same row, and a column the reports group by must not be able to disagree
-- with the two figures it comes from.
alter table public.stock_checks
  add column books_date date
    generated always as (
      case when taken = 'morning' then check_date - 1 else check_date end
    ) stored;

comment on column public.stock_checks.check_date is
  'The day the rod went in the tank.';
comment on column public.stock_checks.taken is
  'Before the day traded, or after it. The pump dips in the morning.';
comment on column public.stock_checks.books_date is
  'The trading day this dip closes. Gain/loss is computed and reported against this, not check_date.';
comment on column public.stock_checks.expected_stock is
  'What the books said at the close of books_date. Recalculated from history by trigger - never edit by hand.';

-- Two dips may not close the same trading day for one tank: an evening dip on
-- the 10th and a morning dip on the 11th are two measurements of one moment,
-- and the reports would count both. The existing unique (tank_id, check_date)
-- stays - it stops the same rod reading being entered twice.
create unique index stock_checks_tank_books_date_key
  on public.stock_checks (tank_id, books_date);

-- ---------------------------------------------------------------------------
-- The baseline is the last dip that closed an EARLIER trading day.
--
-- Body is otherwise unchanged from 008: only the two `check_date` references
-- become `books_date`, which is the whole of this fix on the read side.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_expected_stock(
  p_tank_id uuid,
  p_date    date default public.pump_today()
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_baseline_qty  numeric(12, 2);
  v_baseline_date date;
  v_purchased     numeric(12, 2);
  v_sold          numeric(12, 2);
begin
  -- The last dip closing a day strictly before the one being asked about. A
  -- dip closing p_date itself is the answer's measured counterpart, not its
  -- baseline - using it would make expected equal actual and the gain/loss
  -- always nought.
  select sc.actual_dip_reading, sc.books_date
    into v_baseline_qty, v_baseline_date
    from public.stock_checks sc
   where sc.tank_id = p_tank_id
     and sc.books_date < p_date
   order by sc.books_date desc
   limit 1;

  -- No dip recorded yet - start from the tank's opening stock. Subtracting a
  -- day makes purchases on the opening date itself count.
  if v_baseline_qty is null then
    select t.opening_stock_litres, t.opening_stock_date - 1
      into v_baseline_qty, v_baseline_date
      from public.tanks t
     where t.id = p_tank_id;
  end if;

  if v_baseline_qty is null then
    return null;  -- unknown tank
  end if;

  select coalesce(sum(fp.quantity_litres), 0)
    into v_purchased
    from public.fuel_purchases fp
   where fp.tank_id = p_tank_id
     and fp.purchase_date > v_baseline_date
     and fp.purchase_date <= p_date;

  select coalesce(sum(nr.litres_sold), 0)
    into v_sold
    from public.nozzle_readings nr
    join public.nozzles n on n.id = nr.nozzle_id
   where n.tank_id = p_tank_id
     and nr.reading_date > v_baseline_date
     and nr.reading_date <= p_date;

  return round(v_baseline_qty + v_purchased - v_sold, 2);
end;
$$;

comment on function public.calculate_expected_stock(uuid, date) is
  'What the books say is in a tank at the close of p_date: last dip closing an earlier day, plus deliveries since, minus litres sold since.';

-- ---------------------------------------------------------------------------
-- Recalculate stored gain/loss from history.
--
-- Only dips closing p_from or later can be affected by a change on p_from: a
-- dip's figure is built from the baseline behind it and the deliveries and
-- sales between the two, so nothing earlier can move.
--
-- `gain_loss` is generated from `expected_stock`, so setting one fixes both.
-- The `is distinct from` guard means an unchanged figure is not rewritten,
-- which keeps this quiet in the activity log and cheap on a day's readings.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_stock_checks(p_tank_id uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tank_id is null then
    return;
  end if;

  update public.stock_checks sc
     set expected_stock = fresh.expected
    from (
      select s.id,
             coalesce(public.calculate_expected_stock(s.tank_id, s.books_date), 0) as expected
        from public.stock_checks s
       where s.tank_id = p_tank_id
         and s.books_date >= p_from
    ) fresh
   where fresh.id = sc.id
     and sc.expected_stock is distinct from fresh.expected;
end;
$$;

comment on function public.recalc_stock_checks(uuid, date) is
  'Rebuild expected_stock (and so gain_loss) for every dip on a tank closing p_from or later.';

-- ---------------------------------------------------------------------------
-- Everything that can move a dip's expected figure, wired to the recalc.
--
-- Deliveries and readings are the two things that happen BETWEEN dips; a dip
-- itself is the baseline for the next one; a tank's opening stock is the
-- baseline for the first one.
-- ---------------------------------------------------------------------------
create or replace function public.trg_recalc_checks_from_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_stock_checks(old.tank_id, old.purchase_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_stock_checks(new.tank_id, new.purchase_date);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recalc_checks_from_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tank uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select n.tank_id into v_tank from public.nozzles n where n.id = old.nozzle_id;
    perform public.recalc_stock_checks(v_tank, old.reading_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select n.tank_id into v_tank from public.nozzles n where n.id = new.nozzle_id;
    perform public.recalc_stock_checks(v_tank, new.reading_date);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recalc_checks_from_dip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_stock_checks(old.tank_id, old.books_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_stock_checks(new.tank_id, new.books_date);
  end if;
  return null;
end;
$$;

create or replace function public.trg_recalc_checks_from_tank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Opening stock is the baseline before the first dip, so everything moves.
  perform public.recalc_stock_checks(new.id, '-infinity'::date);
  return null;
end;
$$;

create trigger recalc_checks_after_purchase
  after insert or update or delete on public.fuel_purchases
  for each row execute function public.trg_recalc_checks_from_purchase();

create trigger recalc_checks_after_reading
  after insert or update or delete on public.nozzle_readings
  for each row execute function public.trg_recalc_checks_from_reading();

/*
 * Deliberately NOT `after update` in general.
 *
 * The recalc writes `expected_stock`, and a trigger that fired on that write
 * would call itself. Naming the columns means the trigger fires only when the
 * dip's own facts move - the rod reading, the day, the tank, whether it was
 * morning or evening - and never for the derived figure the recalc sets.
 * Postgres decides this on the columns MENTIONED in the update, so the guard
 * holds even when a value happens to come back the same.
 */
create trigger recalc_checks_after_dip
  after insert or delete
     or update of tank_id, check_date, taken, actual_dip_reading
    on public.stock_checks
  for each row execute function public.trg_recalc_checks_from_dip();

create trigger recalc_checks_after_tank_opening
  after update of opening_stock_litres, opening_stock_date on public.tanks
  for each row execute function public.trg_recalc_checks_from_tank();

revoke execute on function public.recalc_stock_checks(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The dashboard's day. The tank block now joins the dip that CLOSES the day on
-- screen. Body otherwise unchanged from 025.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_summary(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the daily summary' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'date', p_date,
    'totals', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr where nr.reading_date = p_date
    ),
    'by_fuel_type', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',     s.fuel_type,
               'litres_sold',   s.litres_sold,
               'sale_amount',   s.sale_amount,
               'cash_amount',   s.cash_amount,
               'credit_amount', s.credit_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold)   as litres_sold,
               sum(nr.sale_amount)   as sale_amount,
               sum(nr.cash_amount)   as cash_amount,
               sum(nr.credit_amount) as credit_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = p_date
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'tanks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                   t.id,
               'name',                 t.name,
               'fuel_type',            t.fuel_type,
               'capacity_litres',      t.capacity_litres,
               'current_stock_litres', t.current_stock_litres,
               'expected_stock',       public.calculate_expected_stock(t.id, p_date),
               'actual_dip_reading',   sc.actual_dip_reading,
               'gain_loss',            sc.gain_loss
             ) order by t.fuel_type)
      from public.tanks t
      -- The dip that CLOSES the day on screen, not one taken during it: the
      -- pump dips each morning, so the day being looked at is judged by the
      -- dip taken the following morning. See migration 039.
      left join public.stock_checks sc on sc.tank_id = t.id and sc.books_date = p_date
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0)
      )
      from public.fuel_purchases fp where fp.purchase_date = p_date
    ),

    -- The day's counter sales, and what each one sold.
    'lubricants', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      )
      from public.lubricant_sales ls where ls.sale_date = p_date
    ),
    'lubricants_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',   s.name,
               'litres', s.litres,
               'amount', s.amount
             ) order by s.amount desc)
      from (
        select l.name, sum(ls.litres) as litres, sum(ls.amount) as amount
          from public.lubricant_sales ls
          join public.lubricants l on l.id = ls.lubricant_id
         where ls.sale_date = p_date
         group by l.id, l.name
      ) s
    ), '[]'::jsonb),
    -- Stock as at the date on screen, so the dashboard's shelf agrees with the
    -- Stock page's shelf when an older day is being looked at.
    'lubricant_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           l.id,
               'name',         l.name,
               'stock_litres', public.calculate_lubricant_stock(l.id, p_date)
             ) order by l.name)
      from public.lubricants l where l.is_active
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The monthly report. A dip taken on 1 September closes 31 August and belongs
-- in August's gain/loss, so the month is cut on books_date. Body otherwise
-- unchanged from 028.
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from      date;
  v_to        date;
  v_sales     numeric(14, 2);
  v_cost      numeric(14, 2);
  v_expenses  numeric(14, 2);
  v_lub_sales numeric(14, 2);
  v_lub_cost  numeric(14, 2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;

  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;

  select coalesce(sum(ls.amount), 0) into v_lub_sales
    from public.lubricant_sales ls where ls.sale_date between v_from and v_to;

  select coalesce(sum(lp.total_cost), 0) into v_lub_cost
    from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'sales_by_fuel', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',   s.fuel_type,
               'litres_sold', s.litres_sold,
               'sale_amount', s.sale_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold) as litres_sold,
               sum(nr.sale_amount) as sale_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date between v_from and v_to
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      )
      from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),

    -- ---- lubricants ----
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0),
        'loose_count',   count(*) filter (where l.sold_loose),
        'loose_litres',  coalesce(sum(ls.litres) filter (where l.sold_loose), 0),
        'loose_amount',  coalesce(sum(ls.amount) filter (where l.sold_loose), 0)
      )
      from public.lubricant_sales ls
      join public.lubricants l on l.id = ls.lubricant_id
     where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0),
        'loose_litres',    coalesce(sum(lp.quantity_litres) filter (where l.sold_loose), 0),
        'loose_cost',      coalesce(sum(lp.total_cost) filter (where l.sold_loose), 0)
      )
      from public.lubricant_purchases lp
      join public.lubricants l on l.id = lp.lubricant_id
     where lp.purchase_date between v_from and v_to
    ),
    -- One line per product: what it sold, what was restocked, and what is left
    -- on the shelf at month end. Products with no movement in the month are
    -- left out; the Stock page is where the whole shelf is listed.
    'lubricants_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lubricant_id',   s.id,
               'name',           s.name,
               'sold_loose',     s.sold_loose,
               'litres_sold',    s.litres_sold,
               'amount',         s.amount,
               'cash_amount',    s.cash_amount,
               'credit_amount',  s.credit_amount,
               'bought_litres',  s.bought_litres,
               'bought_cost',    s.bought_cost,
               'closing_litres', public.calculate_lubricant_stock(s.id, v_to)
             ) order by s.amount desc, s.name)
      from (
        select l.id,
               l.name,
               l.sold_loose,
               coalesce(sold.litres, 0)  as litres_sold,
               coalesce(sold.amount, 0)  as amount,
               coalesce(sold.cash, 0)    as cash_amount,
               coalesce(sold.credit, 0)  as credit_amount,
               coalesce(bought.litres, 0) as bought_litres,
               coalesce(bought.cost, 0)   as bought_cost
          from public.lubricants l
          left join lateral (
            select sum(ls.litres) as litres, sum(ls.amount) as amount,
                   sum(ls.cash_amount) as cash, sum(ls.credit_amount) as credit
              from public.lubricant_sales ls
             where ls.lubricant_id = l.id and ls.sale_date between v_from and v_to
          ) sold on true
          left join lateral (
            select sum(lp.quantity_litres) as litres, sum(lp.total_cost) as cost
              from public.lubricant_purchases lp
             where lp.lubricant_id = l.id and lp.purchase_date between v_from and v_to
          ) bought on true
         where coalesce(sold.litres, 0) <> 0 or coalesce(bought.litres, 0) <> 0
      ) s
    ), '[]'::jsonb),

    'expenses_total', v_expenses,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', s.category, 'amount', s.amount)
                       order by s.amount desc)
      from (
        select e.category, sum(e.amount) as amount
          from public.expenses e
         where e.expense_date between v_from and v_to
         group by e.category
      ) s
    ), '[]'::jsonb),

    -- Headline figures, with both trades folded in. The separate blocks above
    -- are what the page uses to show the split.
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit', round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tank_id',        t.id,
               'name',           t.name,
               'fuel_type',      t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to)
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),
    'stock_gain_loss', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tank_id',   s.tank_id,
               'fuel_type', s.fuel_type,
               'gain_loss', s.gain_loss
             ) order by s.fuel_type)
      from (
        select sc.tank_id, t.fuel_type, sum(sc.gain_loss) as gain_loss
          from public.stock_checks sc
          join public.tanks t on t.id = sc.tank_id
         where sc.books_date between v_from and v_to
         group by sc.tank_id, t.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The activity log (035, extended by 036). Two changes, both about the recalc
-- above: the derived figures join the ignored list, and a dip is logged under
-- the day it closes. Reproduced in full because create or replace function
-- replaces the whole thing.
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
  -- Columns recomputed by other triggers, or noise. A change to these alone is
  -- not somebody doing something, so the write goes unlogged. (035 explained
  -- this list; 036 reproduced the function without the note. Restored here.)
  --
  -- `expected_stock` and `gain_loss` are the two 039 adds. Both are rebuilt
  -- from history whenever a reading, a delivery or an earlier dip moves, so
  -- logging them would credit whoever typed today's readings with "changing" a
  -- dip taken last week. `gain_loss` is generated from `expected_stock`, so the
  -- pair always move together and both have to be here.
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
      -- Filed under the day the dip CLOSES, so it sits beside that day's
      -- readings in the log rather than a day after them.
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

-- ---------------------------------------------------------------------------
-- Rebuild every stored figure from history, now that the maths is right.
--
-- This is what moves the existing dips onto the day they belong to. Nothing is
-- re-dated - `check_date` still says when the rod went in - but every gain and
-- loss on the books is recomputed against the day that dip actually closes.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tank record;
begin
  for v_tank in select id from public.tanks loop
    perform public.recalc_stock_checks(v_tank.id, '-infinity'::date);
    perform public.recalc_tank_stock(v_tank.id);
  end loop;
end;
$$;

-- ===================================================================== 040_company_assets_in_the_export.sql
-- =============================================================================
-- 040_company_assets_in_the_export.sql
--
-- The workbook learns what the pump owns.
--
-- Company Assets was the one section of the app with no column in the monthly
-- download - the owner opens the workbook expecting the month's whole record
-- and the vehicles, machinery and equipment were simply absent.
--
-- Two additions to get_month_export, and nothing else. Restated in full
-- because plpgsql has no way to replace part of a function body - the same
-- reason migrations 019 and 030 are full copies.
--
--   asset_rows   the WHOLE register, not just the month's purchases, with an
--                `in_month` flag on the ones bought inside it. This follows
--                `bank_accounts`, which likewise carries where every account
--                stood when the report was taken rather than only what moved.
--                An asset register answers "what does the business own", and
--                a page of it that showed only August would answer nothing -
--                most months the pump buys nothing at all, and a sheet that is
--                empty in those months reads as a bug rather than as a fact.
--
--   assets       the register's totals, plus the month's own count and spend,
--                so the Summary sheet can carry a line without the reader
--                adding a column up.
--
-- NOT PART OF PROFIT, and the Summary lines say so. An asset is bought with
-- the pump's money and kept; it is not a cost of trading the way a delivery or
-- an expense is, and the app has never counted it as one. Putting the figure
-- on the Summary sheet without that sentence is how it would end up
-- subtracted by hand.
-- =============================================================================

create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from      date;
  v_to        date;
  v_sales     numeric(14,2);
  v_cost      numeric(14,2);
  v_expenses  numeric(14,2);
  v_lub_sales numeric(14,2);
  v_lub_cost  numeric(14,2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;
  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;
  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;
  select coalesce(sum(ls.amount), 0) into v_lub_sales
    from public.lubricant_sales ls where ls.sale_date between v_from and v_to;
  select coalesce(sum(lp.total_cost), 0) into v_lub_cost
    from public.lubricant_purchases lp where lp.purchase_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0),
        'loose_count',   count(*) filter (where l.sold_loose),
        'loose_litres',  coalesce(sum(ls.litres) filter (where l.sold_loose), 0),
        'loose_amount',  coalesce(sum(ls.amount) filter (where l.sold_loose), 0)
      ) from public.lubricant_sales ls
        join public.lubricants l on l.id = ls.lubricant_id
       where ls.sale_date between v_from and v_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0),
        'pending_amount',  coalesce(sum(lp.total_cost) filter (where lp.payment_status = 'pending'), 0),
        'loose_litres',    coalesce(sum(lp.quantity_litres) filter (where l.sold_loose), 0),
        'loose_cost',      coalesce(sum(lp.total_cost) filter (where l.sold_loose), 0)
      ) from public.lubricant_purchases lp
        join public.lubricants l on l.id = lp.lubricant_id
       where lp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit', round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2),

    -- One row per calendar day, zeros included, so the chart has no gaps and
    -- its fixed range (Daily rows 2-32) always lines up with the data.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',              d::date,
               'litres_sold',      f.litres_sold,
               'petrol_litres',    f.petrol_litres,
               'diesel_litres',    f.diesel_litres,
               'sale_amount',      f.sale_amount,
               'cash_amount',      f.cash_amount,
               'credit_amount',    f.credit_amount,
               'lubricant_litres', lu.litres,
               'lubricant_amount', lu.amount
             ) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
      left join lateral (
        select coalesce(sum(nr.litres_sold), 0)   as litres_sold,
               coalesce(sum(nr.sale_amount), 0)   as sale_amount,
               coalesce(sum(nr.cash_amount), 0)   as cash_amount,
               coalesce(sum(nr.credit_amount), 0) as credit_amount,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = d::date
      ) f on true
      left join lateral (
        select coalesce(sum(ls.litres), 0) as litres,
               coalesce(sum(ls.amount), 0) as amount
          from public.lubricant_sales ls
         where ls.sale_date = d::date
      ) lu on true
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    -- What is left on the lubricant shelf at month end. Kept beside the tanks'
    -- closing stock for the same reason: it is money sitting in stock rather
    -- than profit that was never made.
    'lubricant_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           l.name,
               'closing_litres', public.calculate_lubricant_stock(l.id, v_to)
             ) order by l.name)
      from public.lubricants l
      where l.is_active
         or exists (select 1 from public.lubricant_sales ls
                     where ls.lubricant_id = l.id and ls.sale_date between v_from and v_to)
    ), '[]'::jsonb),

    -- Fuel and lubricant deliveries in one list, ordered by date. `item` is the
    -- tank for fuel and the product for a lubricant, so the sheet reads down
    -- one column either way.
    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', r.date, 'tank', r.item, 'fuel_type', r.kind,
               'supplier', r.supplier, 'invoice', r.invoice,
               'litres', r.litres, 'rate', r.rate, 'cost', r.cost,
               'payment_status', r.payment_status
             ) order by r.date, r.created_at)
      from (
        select fp.purchase_date as date, t.name as item, t.fuel_type::text as kind,
               fp.supplier_name as supplier, fp.invoice_number as invoice,
               fp.quantity_litres as litres, fp.rate, fp.total_cost as cost,
               fp.payment_status::text as payment_status, fp.created_at
          from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
         where fp.purchase_date between v_from and v_to
        union all
        select lp.purchase_date, l.name, 'lubricant',
               lp.supplier_name, lp.invoice_number,
               lp.quantity_litres, lp.rate, lp.total_cost,
               lp.payment_status::text, lp.created_at
          from public.lubricant_purchases lp join public.lubricants l on l.id = lp.lubricant_id
         where lp.purchase_date between v_from and v_to
      ) r
    ), '[]'::jsonb),

    -- Every counter sale in the month, itemised.
    'lubricant_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', ls.sale_date, 'name', l.name, 'sold_loose', l.sold_loose,
               'litres', ls.litres, 'rate', ls.rate_per_litre, 'amount', ls.amount,
               'cash_amount', ls.cash_amount, 'credit_amount', ls.credit_amount,
               'customer', c.name, 'note', ls.note
             ) order by ls.sale_date, ls.created_at)
      from public.lubricant_sales ls
      join public.lubricants l on l.id = ls.lubricant_id
      left join public.customers c on c.id = ls.customer_id
      where ls.sale_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb),

    -- Every bank movement in the month, itemised. Written before the 60-entry
    -- cap can reach these rows, so the workbook is the durable record once they
    -- age off the Banking page.
    'bank_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', bt.txn_date, 'account', ba.account_label, 'bank', ba.bank_name,
               'direction', bt.txn_type, 'category', bt.category,
               'note', bt.note, 'amount', bt.amount
             ) order by bt.txn_date, bt.created_at)
      from public.bank_transactions bt
      join public.bank_accounts ba on ba.id = bt.account_id
      where bt.txn_date between v_from and v_to
    ), '[]'::jsonb),

    -- Where each account stood when the report was taken.
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', b.account_label, 'bank', b.bank_name,
               'balance', b.balance, 'total_deposited', b.total_deposited,
               'total_paid', b.total_paid
             ) order by b.created_at)
      from public.bank_account_balances b
    ), '[]'::jsonb),

    'bank_month', (
      select jsonb_build_object(
               'deposits', coalesce(sum(bt.amount) filter (where bt.txn_type = 'deposit'), 0),
               'payments', coalesce(sum(bt.amount) filter (where bt.txn_type = 'payment'), 0)
             )
        from public.bank_transactions bt where bt.txn_date between v_from and v_to
    ),

    -- ---- company assets -------------------------------------------------
    -- The whole register. See the header for why this is not scoped to the
    -- month the way purchases and expenses are.
    'asset_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', ca.purchase_date, 'name', ca.name,
               'category', ca.category, 'value', ca.purchase_value,
               'note', ca.note,
               'in_month', (ca.purchase_date between v_from and v_to)
             ) order by ca.purchase_date, ca.created_at)
      from public.company_assets ca
    ), '[]'::jsonb),

    'assets', (
      select jsonb_build_object(
               'count', count(*),
               'total_value', coalesce(sum(ca.purchase_value), 0),
               'month_count', count(*) filter (where ca.purchase_date between v_from and v_to),
               'month_value', coalesce(sum(ca.purchase_value)
                                       filter (where ca.purchase_date between v_from and v_to), 0)
             )
        from public.company_assets ca
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ===================================================================== 041_stock_register.sql
-- =============================================================================
-- 041_stock_register.sql
--
-- The Daily Sale & Stock Register, and profit over an arbitrary run of days.
--
-- The owner keeps a spreadsheet called "Fuel - Daily Sale & Stock Register":
-- one row per trading day per tank, carrying opening stock, receipts, meter
-- sales, the book stock those three imply, the dip that actually measured the
-- tank, and the difference between the last two - then the same difference
-- accumulated down the month beside the sales accumulated down the month. The
-- two cumulative columns are the point of the sheet. A single day's variance is
-- noise: a rod reading is a person squinting at a wet stick, and ±30 L on a
-- 5,000 L tank is the measurement, not the fuel. What a leak or a theft looks
-- like is a cumulative variance that walks in one direction, and a cumulative
-- percentage that will not come back to zero.
--
-- Everything here is already in the database and has been since 002. What was
-- missing was the SHAPE - the app could tell you one day's gain/loss on the
-- Stock page and one month's total in the report, and neither of those answers
-- the question the spreadsheet exists to answer.
--
-- ---------------------------------------------------------------------------
-- Why the columns are derived here rather than read off stock_checks
-- ---------------------------------------------------------------------------
-- `stock_checks.gain_loss` is a generated column off `expected_stock`, which
-- migration 039 made a trigger recalculate from history. So the figure is
-- already correct and already maintained. It is recomputed here anyway, from
-- the four columns the row puts on screen:
--
--     book stock     = opening + receipts - meter sales
--     daily variance = closing dip - book stock
--
-- because a register is read across, and a variance column that did not equal
-- the arithmetic of the columns beside it would be unreadable however right it
-- was. The two agree - checked row for row against every dip the pump has
-- recorded, 1-11 Aug 2026, petrol and diesel, all 22 exact. If they ever stop
-- agreeing, `stock_checks.gain_loss` is the one to trust: it is the column the
-- rest of the app reports from.
--
-- ---------------------------------------------------------------------------
-- Opening stock is YESTERDAY'S DIP, and falls back to the books
-- ---------------------------------------------------------------------------
-- A measured number beats a calculated one, which is the same rule
-- `calculate_expected_stock` follows when it picks its baseline. So opening
-- stock is the dip that closed the previous trading day. On a day after one
-- that was never dipped there is nothing measured to use, and it falls back to
-- `calculate_expected_stock(tank, day - 1)` - the book value carried forward,
-- chained from whatever dip did come before it. The register therefore has no
-- gaps in its opening column, and a day with no dip of its own simply has no
-- variance rather than a wrong one.
--
-- Note `books_date`, never `check_date`. The pump dips in the morning, so the
-- rod that went in on the 11th measures the close of the 10th. Getting this
-- wrong reports a whole day's sales as a loss, every day - see 039.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One row per tank per day, cumulative columns included.
--
-- Cumulative means CUMULATIVE WITHIN THE RANGE ASKED FOR, not since the tank
-- was installed. That is what the spreadsheet does - the column restarts at the
-- top of each month - and it is what makes the figure answerable: "we are 213 L
-- up over these eleven days" is a sentence about a period somebody chose.
--
-- Missing days come back as rows of zeros rather than as gaps, for the same
-- reason get_sales_trend does it: a register with days missing out of the
-- middle reads as a register somebody forgot to fill in.
-- ---------------------------------------------------------------------------
create or replace function public.get_stock_register(p_from date, p_to date)
returns table (
  day                     date,
  tank_id                 uuid,
  tank_name               text,
  fuel_type               public.fuel_type,
  opening_stock           numeric,
  receipts                numeric,
  total_stock             numeric,
  meter_sales             numeric,
  sale_amount             numeric,
  book_stock              numeric,
  closing_dip             numeric,
  daily_variance          numeric,
  cumulative_sales        numeric,
  cumulative_variance     numeric,
  daily_variance_pct      numeric,
  cumulative_variance_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the stock register'
      using errcode = '42501';
  end if;

  return query
  with days as (
    select d::date as day
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  grid as (
    select t.id, t.name, t.fuel_type, d.day
      from public.tanks t
     cross join days d
  ),
  per_day as (
    select g.id,
           g.name,
           g.fuel_type,
           g.day,
           coalesce(prev.actual_dip_reading,
                    public.calculate_expected_stock(g.id, g.day - 1),
                    0)                       as opening_stock,
           coalesce(rec.litres, 0)           as receipts,
           coalesce(sold.litres, 0)          as meter_sales,
           coalesce(sold.amount, 0)          as sale_amount,
           dip.actual_dip_reading            as closing_dip
      from grid g
      left join lateral (
        select sum(fp.quantity_litres) as litres
          from public.fuel_purchases fp
         where fp.tank_id = g.id
           and fp.purchase_date = g.day
      ) rec on true
      left join lateral (
        select sum(nr.litres_sold) as litres,
               sum(nr.sale_amount) as amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
         where n.tank_id = g.id
           and nr.reading_date = g.day
      ) sold on true
      -- The dip that closes this trading day, and the one that closed the day
      -- before. books_date, not check_date - see the header.
      left join public.stock_checks dip
        on dip.tank_id = g.id and dip.books_date = g.day
      left join public.stock_checks prev
        on prev.tank_id = g.id and prev.books_date = g.day - 1
  ),
  computed as (
    select p.*,
           p.opening_stock + p.receipts                  as total_stock_c,
           p.opening_stock + p.receipts - p.meter_sales  as book_stock_c
      from per_day p
  ),
  varied as (
    select c.*,
           -- Null, not zero, on a day with no dip. A day nobody measured has an
           -- UNKNOWN variance, and zero would read as "measured, and exact" -
           -- the one thing a dip almost never is.
           case when c.closing_dip is null then null
                else c.closing_dip - c.book_stock_c
           end as daily_variance_c
      from computed c
  )
  select v.day,
         v.id,
         v.name,
         v.fuel_type,
         round(v.opening_stock, 2),
         round(v.receipts, 2),
         round(v.total_stock_c, 2),
         round(v.meter_sales, 2),
         round(v.sale_amount, 2),
         round(v.book_stock_c, 2),
         round(v.closing_dip, 2),
         round(v.daily_variance_c, 2),
         round(sum(v.meter_sales) over w, 2),
         -- An undipped day contributes nothing to the running variance rather
         -- than breaking the column. Its sales still count, which is the honest
         -- reading: the fuel left the tank whether or not anyone measured it.
         round(sum(coalesce(v.daily_variance_c, 0)) over w, 2),
         case when v.meter_sales = 0 or v.daily_variance_c is null then null
              else round(v.daily_variance_c / v.meter_sales * 100, 2)
         end,
         case when sum(v.meter_sales) over w = 0 then null
              else round(sum(coalesce(v.daily_variance_c, 0)) over w
                         / sum(v.meter_sales) over w * 100, 2)
         end
    from varied v
  window w as (partition by v.id order by v.day rows between unbounded preceding and current row)
   order by v.fuel_type, v.day;
end;
$$;

comment on function public.get_stock_register(date, date) is
  'The Daily Sale & Stock Register: one row per tank per day, with sales and variance accumulated within the range asked for.';

-- ---------------------------------------------------------------------------
-- Profit over an arbitrary run of days.
--
-- get_monthly_report answers this for a whole calendar month and cannot answer
-- it for any other span, because it takes a year and a month rather than two
-- dates. The register is read over a chosen run of days - a week, the first
-- ten days, everything up to today - and a profit figure beside it that
-- silently covered a different period would be worse than no figure at all.
--
-- SAME ARITHMETIC, deliberately:
--
--     profit = fuel sales + lubricant sales
--            - fuel bought - lubricants bought
--            - expenses
--
-- Cash basis against stock BOUGHT in the period, not stock sold from the tank.
-- A delivery near the end of a short range makes profit look bad, and over a
-- range of a few days that distortion is much larger than it is over a month -
-- which is why the page says so on screen rather than leaving it in a comment.
-- If the definition ever changes, it changes in both places together or the
-- Reports page and this one start disagreeing about the same days.
-- ---------------------------------------------------------------------------
create or replace function public.get_range_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales     numeric(14, 2);
  v_cost      numeric(14, 2);
  v_expenses  numeric(14, 2);
  v_lub_sales numeric(14, 2);
  v_lub_cost  numeric(14, 2);
  v_result    jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr
   where nr.reading_date between p_from and p_to;

  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp
   where fp.purchase_date between p_from and p_to;

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
   where e.expense_date between p_from and p_to;

  select coalesce(sum(ls.amount), 0) into v_lub_sales
    from public.lubricant_sales ls
   where ls.sale_date between p_from and p_to;

  select coalesce(sum(lp.total_cost), 0) into v_lub_cost
    from public.lubricant_purchases lp
   where lp.purchase_date between p_from and p_to;

  select jsonb_build_object(
    'from', p_from,
    'to',   p_to,
    'days', (p_to - p_from) + 1,
    'fuel_sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr
      where nr.reading_date between p_from and p_to
    ),
    -- Per fuel, which is the half of the question the register itself answers
    -- in litres: this is the same days in rupees.
    'by_fuel', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',     s.fuel_type,
               'litres_sold',   s.litres_sold,
               'sale_amount',   s.sale_amount,
               'cash_amount',   s.cash_amount,
               'credit_amount', s.credit_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold)   as litres_sold,
               sum(nr.sale_amount)   as sale_amount,
               sum(nr.cash_amount)   as cash_amount,
               sum(nr.credit_amount) as credit_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date between p_from and p_to
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'fuel_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      )
      from public.fuel_purchases fp
      where fp.purchase_date between p_from and p_to
    ),
    'lubricant_sales', (
      select jsonb_build_object(
        'sales_count',   count(*),
        'litres',        coalesce(sum(ls.litres), 0),
        'amount',        coalesce(sum(ls.amount), 0),
        'cash_amount',   coalesce(sum(ls.cash_amount), 0),
        'credit_amount', coalesce(sum(ls.credit_amount), 0)
      )
      from public.lubricant_sales ls
      where ls.sale_date between p_from and p_to
    ),
    'lubricant_purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(lp.quantity_litres), 0),
        'total_cost',      coalesce(sum(lp.total_cost), 0)
      )
      from public.lubricant_purchases lp
      where lp.purchase_date between p_from and p_to
    ),
    'expenses_total', v_expenses,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', s.category, 'amount', s.amount)
                       order by s.amount desc)
      from (
        select e.category, sum(e.amount) as amount
          from public.expenses e
         where e.expense_date between p_from and p_to
         group by e.category
      ) s
    ), '[]'::jsonb),
    'total_sales',      round(v_sales + v_lub_sales, 2),
    'total_stock_cost', round(v_cost + v_lub_cost, 2),
    'profit',           round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_range_summary(date, date) is
  'Sales, stock bought, expenses and profit over an arbitrary run of days. Same arithmetic as get_monthly_report, which only takes whole months.';

-- Same grant shape as every other reporting RPC: never anon, and the role
-- check at the top of the body is what actually refuses a staff login.
revoke execute on function public.get_stock_register(date, date) from public, anon;
grant  execute on function public.get_stock_register(date, date) to authenticated;

revoke execute on function public.get_range_summary(date, date) from public, anon;
grant  execute on function public.get_range_summary(date, date) to authenticated;

-- ===================================================================== 042_customer_phone_on_the_list.sql
-- ---------------------------------------------------------------------------
-- 042 - the phone number reaches the Customers list
--
-- `customers.phone` has existed since 001 and the add/edit dialog has always
-- written to it. Nothing ever read it back: get_customer_balances and
-- get_retired_customers both select name, vehicle and limit, so a number typed
-- into the form went into the table and was never seen again. The owner asked
-- for it as a column, which is the first time anything has needed it out.
--
-- NO SCHEMA CHANGE - the column is already there. This only widens two read
-- functions, which is why there is no data migration and nothing to back out:
-- an older app talking to a newer database gets one extra field it ignores.
--
-- Both are `create or replace` of the whole function rather than an ALTER.
-- Postgres will not change a function's return type in place, so a widened
-- `returns table (...)` needs the function dropped and rebuilt. `create or
-- replace` fails with "cannot change return type of existing function", hence
-- the explicit drops - and hence the grants being restated underneath, because
-- dropping a function takes its grants with it. Leaving those out is how a
-- migration ships a function that every signed-in user is refused by.
-- ---------------------------------------------------------------------------

drop function if exists public.get_customer_balances();

create function public.get_customer_balances()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  phone          text,
  credit_limit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.vehicle_number,
         c.phone,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where c.is_active
   group by c.id, c.name, c.vehicle_number, c.phone, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_customer_balances() from public, anon;
grant  execute on function public.get_customer_balances() to authenticated;


drop function if exists public.get_retired_customers();

create function public.get_retired_customers()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  phone          text,
  credit_limit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.vehicle_number,
         c.phone,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where not c.is_active
   group by c.id, c.name, c.vehicle_number, c.phone, c.credit_limit
   order by c.name;
end;
$$;

revoke execute on function public.get_retired_customers() from public, anon;
grant  execute on function public.get_retired_customers() to authenticated;

-- ===================================================================== 043_lubricant_trend_cash_and_credit.sql
-- ---------------------------------------------------------------------------
-- 043 - the lubricant trend carries its cash/credit split
--
-- The dashboard's Cash and On credit tiles are FUEL plus OIL. The percent
-- badges compare a day against the day before, and the day before could only
-- be reconstructed for fuel: get_sales_trend has cash_amount and
-- credit_amount per day, get_lubricant_trend had only amounts. So those two
-- tiles shipped without a badge, because the alternative was a percentage
-- that quietly dropped the oil half - wrong by an amount the reader could not
-- see, which is worse than absent.
--
-- lubricant_sales has carried cash_amount and credit_amount since 024, with a
-- check constraint that they add up to the amount. Nothing new is being
-- recorded here; two columns that already exist are being summed and returned.
--
-- NO SCHEMA CHANGE, and nothing to back out. As with 042 this is a widened
-- `returns table (...)`, which Postgres will not do in place - hence the drop
-- and rebuild, and hence the grants restated underneath, because dropping a
-- function takes its grants with it.
--
-- The two new columns go LAST. Every caller reads these by name, but appending
-- rather than inserting keeps positional readers working too, and costs
-- nothing.
-- ---------------------------------------------------------------------------

drop function if exists public.get_lubricant_trend(date, date);

create function public.get_lubricant_trend(p_from date, p_to date)
returns table (
  day           date,
  pack_amount   numeric,
  loose_amount  numeric,
  pack_litres   numeric,
  loose_litres  numeric,
  cash_amount   numeric,
  credit_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  return query
  select d::date,
         coalesce(sum(ls.amount) filter (where not l.sold_loose), 0)::numeric,
         coalesce(sum(ls.amount) filter (where     l.sold_loose), 0)::numeric,
         coalesce(sum(ls.litres) filter (where not l.sold_loose), 0)::numeric,
         coalesce(sum(ls.litres) filter (where     l.sold_loose), 0)::numeric,
         -- Across BOTH packed and loose: the dashboard's Cash tile is the
         -- whole day's cash, not one shelf's. The pack/loose split above is a
         -- different question and keeps its own columns.
         coalesce(sum(ls.cash_amount), 0)::numeric,
         coalesce(sum(ls.credit_amount), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.lubricant_sales ls on ls.sale_date = d::date
    left join public.lubricants      l  on l.id = ls.lubricant_id
   group by d
   order by d;
end;
$$;

revoke execute on function public.get_lubricant_trend(date, date) from public, anon;
grant  execute on function public.get_lubricant_trend(date, date) to authenticated;

-- ===================================================================== 044_treasury.sql
-- =============================================================================
-- 044_treasury.sql
--
-- The treasury: the cash actually sitting in the safe on the pump site.
--
-- WHAT THIS MODELS, AND WHY IT IS NOT BANKING. Banking (018) is money in a
-- bank account, moved by transfer, with a statement behind it. This is
-- physical notes in a strongbox in the office. Cash comes in off the shift and
-- as hand-carried entries during the day; it goes out to people the owner
-- lends to, to suppliers as a code transfer, into a bank account, and back out
-- as pocket cash. None of that money is in the banking system, and until now
-- the only record of it was an Excel sheet on the owner's laptop called
-- "Tajori" - Date, Cash In, Cash Out, Balance, Details.
--
-- THIS TABLE IS THAT SHEET. One row per movement, one running balance, and a
-- free-text Details box, because that is what the owner already writes and
-- what he will keep writing. The one thing added on top is a category, so the
-- app can answer "how much has gone out to people this month" without anyone
-- reading thirty lines of prose.
--
-- STANDALONE ON PURPOSE. Nothing else in the app writes here and nothing reads
-- from it. Cash of shift closing is typed in by hand even though Readings
-- knows the day's cash figure, and cash deposited into a bank account is typed
-- into Banking separately if the owner wants it there. That was the owner's
-- call, and it is the right one for a first cut: the safe is reconciled
-- against notes in a drawer, not against another screen, so an entry that
-- appeared in it by itself would be an entry nobody counted.
--
-- OWNER ONLY, in the database and in the app. This is the owner's own cash,
-- the same reasoning as banking, expenses and company assets.
-- =============================================================================

-- 'in' = notes going into the safe. 'out' = notes coming out of it.
create type public.treasury_direction as enum ('in', 'out');

-- ---------------------------------------------------------------------------
-- treasury_entries
--
-- `seq` is the sheet's row order, and it is what makes a running balance
-- meaningful. Two entries on one date have no times behind them - the owner
-- writes a line when the cash moves, not a clock reading - so the order they
-- were written in IS the order they happened in. `created_at` cannot do this
-- job on its own: a line typed in later for the same day would sort by when it
-- was typed, and identity ordering at least sorts by when it was told.
--
-- The chain is therefore ordered by (entry_date, seq) everywhere: in the view,
-- in the balance rule below, and on screen. A back-dated entry lands at the end
-- of its own date, which is the only honest place to put it when nothing knows
-- what time of day it happened.
--
-- NO CAP, unlike bank_transactions. The 60-entry cap there was a deliberate
-- trade for a table nobody reads past the last page of. This one replaces a
-- spreadsheet the owner scrolls back through, and losing the detail would lose
-- the point. At five or six lines a day it is under two thousand rows a year.
-- ---------------------------------------------------------------------------
create table public.treasury_entries (
  id         uuid primary key default gen_random_uuid(),
  entry_date date not null,
  direction  public.treasury_direction not null,
  amount     numeric(14, 2) not null check (amount > 0),
  category   text not null,
  details    text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  seq        bigint generated always as identity,

  -- A category belongs to one direction. "Deposited in bank" is not something
  -- cash can arrive by, and "Cash of shift closing" is not a way it leaves.
  -- Kept as a check constraint against text rather than two enums, because
  -- the labels these values wear live in app/_lib/treasury-categories.js and
  -- adding one there should be a one-line migration, not a type rewrite.
  constraint treasury_entries_category_fits_direction check (
    (direction = 'in'
       and category in ('opening', 'shift_closing', 'entry', 'returned', 'other'))
    or
    (direction = 'out'
       and category in ('given', 'bank_deposit', 'supplier', 'expense', 'other'))
  )
);

comment on table public.treasury_entries is
  'Cash moving in and out of the safe on the pump site. One row per movement, '
  'in the order it happened. The owner''s "Tajori" sheet, in the database.';

comment on column public.treasury_entries.seq is
  'Row order within a date. Two entries on one day have no time behind them, '
  'so the order they were recorded in is the order they happened in.';

comment on column public.treasury_entries.details is
  'Free text, exactly as written on the sheet - who took it, what code it was '
  'transferred against, which account it went into.';

-- The order the ledger reads in, and the order the balance rule walks in.
create index treasury_entries_chain_idx
  on public.treasury_entries (entry_date, seq);

-- ---------------------------------------------------------------------------
-- One opening entry, ever.
--
-- 'opening' means "this is what was already in the safe when we started
-- writing it down" - Rs 25,550 on 14 Aug 2026, in the owner's own words
-- "Already present". There is exactly one such moment. A second one is always
-- a miscategorised cash-in, and left alone it would read as the books being
-- restarted halfway down the page.
-- ---------------------------------------------------------------------------
create unique index treasury_entries_one_opening
  on public.treasury_entries (category)
  where category = 'opening';

-- ---------------------------------------------------------------------------
-- The safe may never hold less than nothing.
--
-- This is the one money rule the treasury has, and it is a hard one rather
-- than a warning: a safe cannot hand out notes it does not contain. Unlike the
-- bank's no-overdraw rule (020), which only has to look at one balance, this
-- has to look at the whole chain - an entry inserted or deleted in the middle
-- of the sheet moves every balance after it, so a row that is fine where it
-- lands can still push a later day below zero.
--
-- DEFERRED TO COMMIT, which is why it is a constraint trigger rather than a
-- plain one. A multi-row change has to be judged on where it leaves the sheet,
-- not on each row as it lands: the seed in 045 writes thirty-six rows in one
-- statement, and any correction that replaces a cash-out with a smaller one has
-- a moment mid-statement where the chain is short. Checking at commit means the
-- only state ever judged is the state that survives.
--
-- The message names the entry that breaks, so the owner can find the line
-- rather than hunt for it - and it names both ways out, because a breach can
-- be caused just as easily by removing an earlier cash-in as by adding a
-- cash-out.
-- ---------------------------------------------------------------------------
create or replace function public.treasury_never_negative()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad record;
begin
  select t.entry_date, t.direction, t.amount, t.details, t.category, t.running
    into v_bad
    from (
      select e.entry_date,
             e.seq,
             e.direction,
             e.amount,
             e.details,
             e.category,
             sum(case when e.direction = 'in' then e.amount else -e.amount end)
               over (order by e.entry_date, e.seq
                     rows between unbounded preceding and current row) as running
        from public.treasury_entries e
    ) t
   where t.running < 0
   -- The FIRST line the chain breaks on, in sheet order. Later ones are
   -- consequences of it, and naming a consequence would send the owner to
   -- the wrong row.
   order by t.entry_date, t.seq
   limit 1;

  if found then
    raise exception
      'This leaves the safe holding less than nothing. On %, after "%" (Rs % %), the safe would be at minus Rs %. Cash cannot be paid out of a safe that does not have it — record the money that came in before it, or remove a later entry instead.',
      to_char(v_bad.entry_date, 'FMDD Mon YYYY'),
      coalesce(nullif(btrim(coalesce(v_bad.details, '')), ''), v_bad.category),
      to_char(v_bad.amount, 'FM999,999,999,990'),
      case v_bad.direction when 'in' then 'in' else 'out' end,
      to_char(abs(v_bad.running), 'FM999,999,999,990');
  end if;

  return null;
end;
$$;

comment on function public.treasury_never_negative() is
  'Refuses any change that would drive the safe''s running balance below zero '
  'at any point in the sheet, naming the entry it breaks on.';

create constraint trigger treasury_entries_never_negative
  after insert or update or delete on public.treasury_entries
  deferrable initially deferred
  for each row execute function public.treasury_never_negative();

-- ---------------------------------------------------------------------------
-- What the page reads: every entry with the balance the safe stood at
-- immediately after it.
--
-- The running balance is computed here rather than in JavaScript for the
-- reason the rest of this app's aggregation is: the page shows twenty-five
-- rows at a time, and a balance worked out from the rows on screen would be
-- the balance of a page rather than of the safe. The window runs over every
-- row regardless of which ones the reader is looking at.
--
-- security_invoker so the policy below still applies - a view is otherwise
-- read with its owner's rights.
-- ---------------------------------------------------------------------------
create or replace view public.treasury_ledger
with (security_invoker = true) as
select e.id,
       e.entry_date,
       e.direction,
       e.amount,
       e.category,
       e.details,
       e.created_at,
       e.seq,
       sum(case when e.direction = 'in' then e.amount else -e.amount end)
         over (order by e.entry_date, e.seq
               rows between unbounded preceding and current row) as balance_after
  from public.treasury_entries e;

comment on view public.treasury_ledger is
  'Every treasury entry in sheet order, with the safe''s balance immediately '
  'after it. The running balance is over the whole sheet, not over a page.';

-- ---------------------------------------------------------------------------
-- Everything the page's headline figures and its chart need, in one call.
--
-- One RPC rather than four queries for the reason the reporting RPCs exist:
-- the balance in the tile, the balance the chart ends on and the balance on
-- the last row of the table are the same number, and the only way to keep
-- them the same number is to compute them in one place.
--
-- `p_days` is the window the chart and the two movement tiles describe. The
-- balance and the lifetime totals ignore it - "what is in the safe" is not a
-- question with a date range.
--
-- The daily series carries the balance FORWARD across days with no entries.
-- A safe with nothing happening to it still holds what it held yesterday, and
-- a line that dropped to zero on a quiet Sunday would be a lie told by a gap.
-- ---------------------------------------------------------------------------
create or replace function public.treasury_overview(p_days integer default 30)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days   integer := greatest(coalesce(p_days, 30), 1);
  v_today  date    := public.pump_today();
  v_first  date;
  v_last   date;
  v_from   date;
  v_to     date;
  v_result jsonb;
begin
  select min(entry_date), max(entry_date) into v_first, v_last
    from public.treasury_entries;

  -- Nothing recorded yet: an empty shape rather than nulls, so the page has
  -- the same fields to read whether or not the safe has been used.
  if v_first is null then
    return jsonb_build_object(
      'balance', 0, 'total_in', 0, 'total_out', 0, 'entry_count', 0,
      'window_in', 0, 'window_out', 0, 'window_days', v_days,
      'first_date', null, 'last_date', null,
      'daily', '[]'::jsonb, 'out_by_category', '[]'::jsonb,
      'in_by_category', '[]'::jsonb
    );
  end if;

  -- The window ends today, or on the last entry if one is dated ahead of it -
  -- otherwise a mistyped year would put an entry outside every window and the
  -- chart would end on a balance the table does not show.
  v_to := greatest(v_today, v_last);

  -- And it never starts before the safe did. Asking for 90 days of a sheet
  -- that is eight days old would otherwise draw eighty-two days of flat line
  -- before the only part worth looking at.
  v_from := greatest(v_first, v_to - (v_days - 1));

  with chain as (
    select e.entry_date,
           e.seq,
           sum(case when e.direction = 'in' then e.amount else -e.amount end)
             over (order by e.entry_date, e.seq
                   rows between unbounded preceding and current row) as running
      from public.treasury_entries e
  ),
  -- The safe's balance at the close of each day it saw movement: the running
  -- total after that day's last line.
  closings as (
    select distinct on (c.entry_date) c.entry_date, c.running as closing
      from chain c
     order by c.entry_date, c.seq desc
  ),
  totals as (
    select coalesce(sum(amount) filter (where direction = 'in'), 0)  as total_in,
           coalesce(sum(amount) filter (where direction = 'out'), 0) as total_out,
           count(*)                                                  as entry_count,
           min(entry_date)                                           as first_date,
           max(entry_date)                                           as last_date
      from public.treasury_entries
  ),
  windowed as (
    select coalesce(sum(amount) filter (where direction = 'in'), 0)  as window_in,
           coalesce(sum(amount) filter (where direction = 'out'), 0) as window_out
      from public.treasury_entries
     where entry_date between v_from and v_to
  ),
  -- Every day in the window, whether or not anything happened on it, carrying
  -- the last known balance forward.
  series as (
    select d::date as day,
           (select c.closing
              from closings c
             where c.entry_date <= d::date
             order by c.entry_date desc
             limit 1) as closing,
           coalesce((select sum(e.amount) from public.treasury_entries e
                      where e.entry_date = d::date and e.direction = 'in'), 0) as cash_in,
           coalesce((select sum(e.amount) from public.treasury_entries e
                      where e.entry_date = d::date and e.direction = 'out'), 0) as cash_out
      from generate_series(v_from, v_to, interval '1 day') d
  ),
  out_cats as (
    select category, sum(amount) as amount
      from public.treasury_entries
     where direction = 'out' and entry_date between v_from and v_to
     group by category
  ),
  in_cats as (
    select category, sum(amount) as amount
      from public.treasury_entries
     where direction = 'in' and entry_date between v_from and v_to
     group by category
  )
  select jsonb_build_object(
           'balance',     t.total_in - t.total_out,
           'total_in',    t.total_in,
           'total_out',   t.total_out,
           'entry_count', t.entry_count,
           'first_date',  t.first_date,
           'last_date',   t.last_date,
           'window_in',   w.window_in,
           'window_out',  w.window_out,
           'window_days', v_days,
           'window_from', v_from,
           'window_to',   v_to,
           'daily', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'day', s.day,
                      'closing', coalesce(s.closing, 0),
                      'cash_in', s.cash_in,
                      'cash_out', s.cash_out
                    ) order by s.day), '[]'::jsonb)
               from series s
           ),
           'out_by_category', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'category', o.category, 'amount', o.amount
                    ) order by o.amount desc), '[]'::jsonb)
               from out_cats o
           ),
           'in_by_category', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'category', i.category, 'amount', i.amount
                    ) order by i.amount desc), '[]'::jsonb)
               from in_cats i
           )
         )
    into v_result
    from totals t, windowed w;

  return v_result;
end;
$$;

comment on function public.treasury_overview(integer) is
  'The safe''s balance, its lifetime totals, and a day-by-day closing balance '
  'over the last p_days - everything the Treasury page''s tiles and chart show.';

-- ---------------------------------------------------------------------------
-- Row Level Security - the owner only, in every direction.
-- ---------------------------------------------------------------------------
alter table public.treasury_entries enable row level security;

create policy "treasury: super admin only"
  on public.treasury_entries for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.treasury_entries to authenticated;
grant select on public.treasury_ledger to authenticated;
revoke all on public.treasury_entries from anon;

revoke all on function public.treasury_overview(integer) from public;
grant execute on function public.treasury_overview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Wire it into the activity log (035, extended by 036 and 039).
--
-- Reproduced in full because create or replace function replaces the whole
-- thing; the only change is the treasury_entries branch near the bottom.
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

-- ===================================================================== 045_treasury_opening_entries.sql
-- =============================================================================
-- 045_treasury_opening_entries.sql
--
-- Intentionally empty in this copy. In the app this was built from, 045 loaded
-- that pump's own opening safe sheet. This pump starts
-- with an empty safe: its opening cash is entered under Treasury on day one.
-- Kept as a file so the migration numbers stay the same as the master copy.
-- =============================================================================
select 1;

-- ===================================================================== 046_treasury_series_ends_at_the_last_entry.sql
-- =============================================================================
-- 046_treasury_series_ends_at_the_last_entry.sql
--
-- The Day-by-day chart drew a flat tail from the last entry to today.
--
-- 044 ended the window at `greatest(pump_today(), max(entry_date))` and carried
-- the balance forward across days with nothing recorded, on the reasoning that
-- a safe nobody touched still holds what it held yesterday. That reasoning is
-- sound for a GAP - a quiet Tuesday between two busy days is a real day the
-- safe sat there - and wrong for the END of the sheet, which is where it was
-- also being applied.
--
-- The difference is what the last point MEANS. In the middle, a carried-forward
-- day is a day that happened and had no movement. At the end it is a day
-- nothing has been entered for YET, and drawing it says "the safe closed today
-- at Rs 8,364" when the truth is "nobody has written today down". With entries
-- to 21 Aug and a pump day of 22 Aug the chart ran a flat line out to 22/08,
-- and the owner's word for it was that it should stop where the entries stop.
--
-- His spreadsheet does carry its last balance down past the last entry, and
-- that is a spreadsheet needing somewhere to put the formula. The app computes
-- the balance from the rows, so it has nothing to gain by inventing a day.
--
-- ONE CHANGE: the window now ends at the last entry rather than at today. The
-- carry-forward inside the window is untouched, because that part was right.
--
-- The two movement tiles read from the same window, so "the last 14 days" now
-- means the fourteen days up to the last entry rather than up to today. The
-- page says so in as many words - "14 days to 21 Aug 2026" - rather than
-- leaving a window that has quietly stopped moving described as if it had not.
-- =============================================================================
create or replace function public.treasury_overview(p_days integer default 30)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days   integer := greatest(coalesce(p_days, 30), 1);
  v_first  date;
  v_last   date;
  v_from   date;
  v_to     date;
  v_result jsonb;
begin
  select min(entry_date), max(entry_date) into v_first, v_last
    from public.treasury_entries;

  -- Nothing recorded yet: an empty shape rather than nulls, so the page has
  -- the same fields to read whether or not the safe has been used.
  if v_first is null then
    return jsonb_build_object(
      'balance', 0, 'total_in', 0, 'total_out', 0, 'entry_count', 0,
      'window_in', 0, 'window_out', 0, 'window_days', v_days,
      'first_date', null, 'last_date', null,
      'daily', '[]'::jsonb, 'out_by_category', '[]'::jsonb,
      'in_by_category', '[]'::jsonb
    );
  end if;

  -- The sheet ends where the entries end. `pump_today()` is deliberately not
  -- consulted - see the header.
  v_to := v_last;

  -- And the window never starts before the safe did. Asking for 90 days of a
  -- sheet that is eight days old would otherwise draw eighty-two days of flat
  -- line before the only part worth looking at.
  v_from := greatest(v_first, v_to - (v_days - 1));

  with chain as (
    select e.entry_date,
           e.seq,
           sum(case when e.direction = 'in' then e.amount else -e.amount end)
             over (order by e.entry_date, e.seq
                   rows between unbounded preceding and current row) as running
      from public.treasury_entries e
  ),
  closings as (
    select distinct on (c.entry_date) c.entry_date, c.running as closing
      from chain c
     order by c.entry_date, c.seq desc
  ),
  totals as (
    select coalesce(sum(amount) filter (where direction = 'in'), 0)  as total_in,
           coalesce(sum(amount) filter (where direction = 'out'), 0) as total_out,
           count(*)                                                  as entry_count,
           min(entry_date)                                           as first_date,
           max(entry_date)                                           as last_date
      from public.treasury_entries
  ),
  windowed as (
    select coalesce(sum(amount) filter (where direction = 'in'), 0)  as window_in,
           coalesce(sum(amount) filter (where direction = 'out'), 0) as window_out
      from public.treasury_entries
     where entry_date between v_from and v_to
  ),
  -- Every day in the window, whether or not anything happened on it, carrying
  -- the last known balance forward. A gap inside the sheet is still a day the
  -- safe sat there holding what it held; it is only the tail past the last
  -- entry that was a fiction, and the window no longer reaches it.
  series as (
    select d::date as day,
           (select c.closing
              from closings c
             where c.entry_date <= d::date
             order by c.entry_date desc
             limit 1) as closing,
           coalesce((select sum(e.amount) from public.treasury_entries e
                      where e.entry_date = d::date and e.direction = 'in'), 0) as cash_in,
           coalesce((select sum(e.amount) from public.treasury_entries e
                      where e.entry_date = d::date and e.direction = 'out'), 0) as cash_out
      from generate_series(v_from, v_to, interval '1 day') d
  ),
  out_cats as (
    select category, sum(amount) as amount
      from public.treasury_entries
     where direction = 'out' and entry_date between v_from and v_to
     group by category
  ),
  in_cats as (
    select category, sum(amount) as amount
      from public.treasury_entries
     where direction = 'in' and entry_date between v_from and v_to
     group by category
  )
  select jsonb_build_object(
           'balance',     t.total_in - t.total_out,
           'total_in',    t.total_in,
           'total_out',   t.total_out,
           'entry_count', t.entry_count,
           'first_date',  t.first_date,
           'last_date',   t.last_date,
           'window_in',   w.window_in,
           'window_out',  w.window_out,
           'window_days', v_days,
           'window_from', v_from,
           'window_to',   v_to,
           'daily', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'day', s.day,
                      'closing', coalesce(s.closing, 0),
                      'cash_in', s.cash_in,
                      'cash_out', s.cash_out
                    ) order by s.day), '[]'::jsonb)
               from series s
           ),
           'out_by_category', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'category', o.category, 'amount', o.amount
                    ) order by o.amount desc), '[]'::jsonb)
               from out_cats o
           ),
           'in_by_category', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'category', i.category, 'amount', i.amount
                    ) order by i.amount desc), '[]'::jsonb)
               from in_cats i
           )
         )
    into v_result
    from totals t, windowed w;

  return v_result;
end;
$$;

comment on function public.treasury_overview(integer) is
  'The safe''s balance, its lifetime totals, and a day-by-day closing balance '
  'over the last p_days ending at the LAST ENTRY, not at today - see 046.';

-- ===================================================================== 047_treasury_a_page_is_a_day.sql
-- =============================================================================
-- 047_treasury_a_page_is_a_day.sql
--
-- The treasury sheet is paged by DAY, not by 25 rows.
--
-- WHY. 25 rows is the app's default page size and it is the wrong unit here.
-- A pump writes three to six treasury lines a day, so a 25-row page held four
-- and a bit days, cut mid-day at both ends, and was tall enough to hit the
-- `.table-scroll` 70vh cap - a scrollbar inside a card, inside a page that
-- also scrolls. Nothing about "25" means anything to the person reading it.
--
-- A DAY MEANS SOMETHING. It is the unit the owner counts in: he closes the
-- safe on an evening and checks that evening's closing figure against the
-- notes in the drawer. One day per page puts three to six rows on screen with
-- no scrollbar in sight, lets the date leave the table (every row shares it,
-- so it belongs in the heading), and makes room for the day's own opening and
-- closing figures, which the 25-row view could not show at all.
--
-- ADDRESSED BY DATE, NOT BY PAGE NUMBER. `?date=2026-08-21` rather than
-- `?page=3`, for two reasons. A page index is not stable - back-fill one older
-- entry and every page number after it means a different day, so a bookmarked
-- or reloaded page 3 quietly becomes page 4's contents. And a date is what the
-- app's existing `DateJump` box already navigates by, so jumping straight to a
-- day costs nothing new.
--
-- DAYS WITH NOTHING RECORDED ARE SKIPPED, which is the whole point of paging by
-- day rather than stepping a calendar. `prev_day` and `next_day` are the
-- neighbouring days that HAVE entries, not yesterday and tomorrow, so the
-- arrows never land on an empty page. This is deliberately the opposite of the
-- carry-forward the chart does inside its window (046): a chart is drawing a
-- continuous quantity over time and a gap in it is a real day the safe sat
-- there, whereas a page is a thing to read and an empty one is a dead end.
--
-- A REQUESTED DATE ALWAYS RESOLVES TO A DAY THAT EXISTS. Ask for a day with no
-- entries - by typing it into the date box, or by following an old link to a
-- day since cleared - and this answers with the nearest day at or before it,
-- falling back to the earliest day there is. The page then says which day it
-- actually landed on. A page that can render an empty table is a page that has
-- to explain itself; one that cannot does not.
-- =============================================================================
create or replace function public.treasury_day(p_date date default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day       date;
  v_count     integer;
  v_index     integer;
  v_prev      date;
  v_next      date;
  v_requested date := p_date;
  v_result    jsonb;
begin
  select count(distinct entry_date) into v_count from public.treasury_entries;

  if v_count = 0 then
    return jsonb_build_object(
      'day', null, 'day_index', 0, 'day_count', 0,
      'prev_day', null, 'next_day', null, 'requested', v_requested,
      'opening', 0, 'cash_in', 0, 'cash_out', 0, 'closing', 0,
      'entries', '[]'::jsonb
    );
  end if;

  -- No date asked for: the most recent day, which is the one being worked on.
  if v_requested is null then
    select max(entry_date) into v_day from public.treasury_entries;
  else
    -- The nearest day at or before the one asked for, else the earliest there
    -- is. Never null, so the page always has something to show.
    select max(entry_date) into v_day
      from public.treasury_entries
     where entry_date <= v_requested;

    if v_day is null then
      select min(entry_date) into v_day from public.treasury_entries;
    end if;
  end if;

  -- Which day of how many, counting the newest as 1 - the same order the page
  -- reads in.
  select count(distinct entry_date) into v_index
    from public.treasury_entries
   where entry_date >= v_day;

  -- The neighbouring days that HAVE entries. Null at either end, which is what
  -- disables the arrow rather than pointing it at nothing.
  select max(entry_date) into v_prev
    from public.treasury_entries where entry_date < v_day;
  select min(entry_date) into v_next
    from public.treasury_entries where entry_date > v_day;

  with chain as (
    select e.id, e.entry_date, e.seq, e.direction, e.amount, e.category, e.details,
           sum(case when e.direction = 'in' then e.amount else -e.amount end)
             over (order by e.entry_date, e.seq
                   rows between unbounded preceding and current row) as balance_after
      from public.treasury_entries e
  ),
  today as (
    select * from chain where entry_date = v_day
  )
  select jsonb_build_object(
           'day',        v_day,
           'day_index',  v_index,
           'day_count',  v_count,
           'prev_day',   v_prev,
           'next_day',   v_next,
           'requested',  v_requested,
           -- What the safe held before the day's first line. Taken from the
           -- chain rather than summed separately, so it cannot disagree with
           -- the balance printed against that first row.
           'opening', coalesce((
             select c.balance_after from chain c
              where c.entry_date < v_day
              order by c.entry_date desc, c.seq desc limit 1), 0),
           'cash_in',  coalesce((select sum(amount) from today where direction = 'in'), 0),
           'cash_out', coalesce((select sum(amount) from today where direction = 'out'), 0),
           'closing',  coalesce((
             select t.balance_after from today t order by t.seq desc limit 1), 0),
           'entries', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', t.id,
                      'seq', t.seq,
                      'entry_date', t.entry_date,
                      'direction', t.direction,
                      'amount', t.amount,
                      'category', t.category,
                      'details', t.details,
                      'balance_after', t.balance_after
                    ) order by t.seq desc)
               from today t), '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

comment on function public.treasury_day(date) is
  'One day of the treasury sheet: its entries newest-first with running '
  'balances, the day''s opening and closing, and the neighbouring days that '
  'have entries - so paging never lands on an empty day. See 047.';

revoke all on function public.treasury_day(date) from public;
grant execute on function public.treasury_day(date) to authenticated;

-- ===================================================================== 048_treasury_in_the_activity_log.sql
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

-- ===================================================================== 049_profit_counts_stock_sold.sql
-- =============================================================================
-- 049_profit_counts_stock_sold.sql
--
-- Profit was counting stock BOUGHT instead of stock SOLD.
--
-- THE BUG, IN THE OWNER'S OWN AUGUST. He bought 49,000 L and sold 43,418 L,
-- including two 5,000 L petrol loads on the 21st. Every rupee of that fuel was
-- charged against August, and the 5,582 L still in the tanks - about
-- Rs 1,866,000 of it - will not be sold until September. The page showed
-- profit as MINUS Rs 1,464,581 for a month the pump actually made money in.
--
-- The old formula, in all three reporting RPCs:
--
--     profit = sales - purchases - expenses
--
-- There is no opening or closing stock in it anywhere. It is only correct in a
-- month where litres bought happen to equal litres sold at the same rate, which
-- is no month. A month ending with fuel in the tank is understated by the value
-- of that fuel; a month that runs the tanks down is OVERSTATED, because it sells
-- stock a previous month already paid for. The errors cancel over years and
-- never within a month, which is the only period anybody reads.
--
--     profit = sales - cost of goods SOLD - expenses
--     cost of goods sold = opening stock + purchases - closing stock
--
-- =============================================================================
-- HOW STOCK IS VALUED, AND WHY THIS WAY
--
-- A litre in a tank has no price tag on it, so one has to be chosen. This
-- values the stock on hand at the WEIGHTED AVERAGE COST OF THE DELIVERIES IT IS
-- ACTUALLY MADE OF: walk that tank's purchases newest-first until enough litres
-- are accounted for, and average their rates weighted by how many litres of
-- each are still there.
--
-- The obvious alternative - one flat average over every purchase ever - was
-- rejected because it quietly reintroduces a smaller version of the same bug.
-- With rates rising through August (321 -> 336 per litre), an average that
-- still carries last year's cheap deliveries values today's full tank below
-- what it cost, and understates profit for exactly as long as prices keep
-- rising. Weighting by what is physically left has no such drift, and for a
-- tank it is also the truth: the fuel in there IS the last few loads.
--
-- STOCK THE RECORDS DO NOT REACH. The tanks were given an opening quantity in
-- Settings when the pump joined the app - 854 L of petrol and 5,556 L of diesel
-- - with no delivery behind it and therefore no cost. Litres not covered by
-- recorded purchases are valued at that tank's all-time average purchase rate,
-- which is an estimate and is flagged as one. It affects only the first month
-- that has purchases; every month after opens on stock the app watched arrive.
--
-- LUBRICANTS GET THE SAME TREATMENT, for the same reason. It matters less
-- today - the shelf turns over slowly and August restocked nothing - but a
-- half-fixed profit figure is worse than an unfixed one, because it looks
-- trustworthy.
--
-- WHAT THIS DOES NOT CHANGE. "Stock bought" stays on the page as its own
-- figure; it is a real thing the owner wants to see, it is what he owes
-- suppliers against, and it is what the Treasury and Banking pages move. It is
-- simply no longer subtracted from sales to make profit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- What the fuel in one tank is worth on a given day.
-- ---------------------------------------------------------------------------
create or replace function public.tank_stock_value(p_tank_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_litres   numeric := coalesce(public.calculate_expected_stock(p_tank_id, p_on), 0);
  v_value    numeric := 0;
  v_covered  numeric := 0;
  v_avg_rate numeric;
begin
  -- A tank cannot be worth a negative amount. If the books say it holds less
  -- than nothing, that is a stock problem for the Stock page to show, not
  -- something to feed into profit as a credit.
  if v_litres <= 0 then
    return 0;
  end if;

  /*
   * Deliveries newest first, taking from each only the litres still on hand.
   * `cum` is the running total of litres walking backwards; a delivery is
   * partly on hand when the total BEFORE it is still short of what the tank
   * holds, and `least` clips the last one to whatever is left over.
   */
  select coalesce(sum(t.litres * t.rate), 0), coalesce(sum(t.litres), 0)
    into v_value, v_covered
    from (
      select least(r.quantity_litres, v_litres - (r.cum - r.quantity_litres)) as litres,
             r.rate
        from (
          select fp.quantity_litres,
                 fp.total_cost / fp.quantity_litres as rate,
                 sum(fp.quantity_litres) over (
                   order by fp.purchase_date desc, fp.created_at desc, fp.id desc
                   rows between unbounded preceding and current row
                 ) as cum
            from public.fuel_purchases fp
           where fp.tank_id = p_tank_id
             and fp.purchase_date <= p_on
             and fp.quantity_litres > 0
        ) r
       where r.cum - r.quantity_litres < v_litres
    ) t;

  -- Litres older than any delivery on record - the opening quantity typed into
  -- Settings. Valued at this tank's all-time average, which is the best guess
  -- available and is an estimate. See the header.
  if v_covered < v_litres then
    select sum(fp.total_cost) / nullif(sum(fp.quantity_litres), 0)
      into v_avg_rate
      from public.fuel_purchases fp
     where fp.tank_id = p_tank_id and fp.quantity_litres > 0;

    v_value := v_value + (v_litres - v_covered) * coalesce(v_avg_rate, 0);
  end if;

  return round(v_value, 2);
end;
$$;

comment on function public.tank_stock_value(uuid, date) is
  'What the fuel in one tank is worth on a date, valued at the weighted '
  'average cost of the deliveries it is actually made of. See migration 049.';

-- ---------------------------------------------------------------------------
-- The same, for one lubricant on the shelf.
-- ---------------------------------------------------------------------------
create or replace function public.lubricant_stock_value(p_lubricant_id uuid, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_litres   numeric := coalesce(public.calculate_lubricant_stock(p_lubricant_id, p_on), 0);
  v_value    numeric := 0;
  v_covered  numeric := 0;
  v_avg_rate numeric;
begin
  if v_litres <= 0 then
    return 0;
  end if;

  select coalesce(sum(t.litres * t.rate), 0), coalesce(sum(t.litres), 0)
    into v_value, v_covered
    from (
      select least(r.quantity_litres, v_litres - (r.cum - r.quantity_litres)) as litres,
             r.rate
        from (
          select lp.quantity_litres,
                 lp.total_cost / lp.quantity_litres as rate,
                 sum(lp.quantity_litres) over (
                   order by lp.purchase_date desc, lp.created_at desc, lp.id desc
                   rows between unbounded preceding and current row
                 ) as cum
            from public.lubricant_purchases lp
           where lp.lubricant_id = p_lubricant_id
             and lp.purchase_date <= p_on
             and lp.quantity_litres > 0
        ) r
       where r.cum - r.quantity_litres < v_litres
    ) t;

  if v_covered < v_litres then
    select sum(lp.total_cost) / nullif(sum(lp.quantity_litres), 0)
      into v_avg_rate
      from public.lubricant_purchases lp
     where lp.lubricant_id = p_lubricant_id and lp.quantity_litres > 0;

    v_value := v_value + (v_litres - v_covered) * coalesce(v_avg_rate, 0);
  end if;

  return round(v_value, 2);
end;
$$;

comment on function public.lubricant_stock_value(uuid, date) is
  'What one lubricant on the shelf is worth on a date, on the same basis as '
  'tank_stock_value. See migration 049.';

-- ---------------------------------------------------------------------------
-- Everything the pump is holding, fuel and oil, on one date.
-- ---------------------------------------------------------------------------
create or replace function public.stock_value_at(p_on date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
           coalesce((select sum(public.tank_stock_value(t.id, p_on)) from public.tanks t), 0)
         + coalesce((select sum(public.lubricant_stock_value(l.id, p_on))
                       from public.lubricants l), 0),
         2);
$$;

comment on function public.stock_value_at(date) is
  'The value of all stock on hand - every tank and every lubricant - on a date.';

-- ---------------------------------------------------------------------------
-- What the stock sold in a period actually cost.
--
--     opening stock + everything bought - closing stock
--
-- The one place this arithmetic lives, so the monthly report, the Excel export
-- and the register's arbitrary date range cannot arrive at different profits
-- for the same days - which is the reason the aggregation is in Postgres at
-- all.
--
-- `p_from - 1` is the close of the day before, which is the opening of the
-- first day. Getting that off by one shifts a whole day's trading into the
-- wrong month.
-- ---------------------------------------------------------------------------
create or replace function public.cost_of_goods_sold(p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
           public.stock_value_at(p_from - 1)
         + coalesce((select sum(fp.total_cost) from public.fuel_purchases fp
                      where fp.purchase_date between p_from and p_to), 0)
         + coalesce((select sum(lp.total_cost) from public.lubricant_purchases lp
                      where lp.purchase_date between p_from and p_to), 0)
         - public.stock_value_at(p_to),
         2);
$$;

comment on function public.cost_of_goods_sold(date, date) is
  'Opening stock + purchases - closing stock, for a date range. The cost of '
  'what was actually SOLD, which is what profit subtracts. See migration 049.';

-- These are only ever called from inside the reporting RPCs, which are
-- security definer and check is_super_admin() themselves. A definer function
-- runs with the owner's rights, so it can call these with no grant of its
-- own - and without one, nothing else can ask the database what the pump's
-- stock is worth.
revoke all on function public.tank_stock_value(uuid, date) from public;
revoke all on function public.lubricant_stock_value(uuid, date) from public;
revoke all on function public.stock_value_at(date) from public;
revoke all on function public.cost_of_goods_sold(date, date) from public;

-- ---------------------------------------------------------------------------
-- Point the three reporting RPCs at it.
--
-- PATCHED RATHER THAN REPRODUCED IN FULL, which is a departure from how this
-- repo has replaced functions before (see 036, 039, 044) and is deliberate.
-- Those reproduced one function to add one branch. This changes one expression
-- in THREE functions totalling about 25,000 characters, none of which is
-- otherwise touched - and three hand-copied near-duplicates is three chances
-- to silently drop a line from a report nobody re-reads.
--
-- So each function is read back with pg_get_functiondef, has exactly the two
-- known expressions swapped, and is re-declared. It IS the whole body being
-- replaced, which is what `create or replace` requires; it just is not
-- transcribed by hand.
--
-- IT FAILS LOUDLY IF THE TEXT IS NOT THERE. If a future migration rewrites one
-- of these functions and this file is ever replayed against it, the expression
-- will not match and this raises rather than silently leaving a wrong profit
-- in place. A migration that cannot do its job must not report success.
-- ---------------------------------------------------------------------------
do $$
declare
  v_target   text;
  v_from_var text;
  v_to_var   text;
  v_src      text;
  v_old_prof text;
  v_new_prof text;
  v_old_cost text;
  v_new_cost text;
  v_targets  text[] := array[
    'public.get_monthly_report(integer,integer)', 'v_from', 'v_to',
    'public.get_month_export(integer,integer)',   'v_from', 'v_to',
    'public.get_range_summary(date,date)',        'p_from', 'p_to'
  ];
  i integer;
begin
  for i in 1 .. array_length(v_targets, 1) by 3 loop
    v_target   := v_targets[i];
    v_from_var := v_targets[i + 1];
    v_to_var   := v_targets[i + 2];

    v_src := pg_get_functiondef(v_target::regprocedure);

    -- 1. Profit stops subtracting what was bought and starts subtracting what
    --    was sold.
    v_old_prof := 'round(v_sales + v_lub_sales - v_cost - v_lub_cost - v_expenses, 2)';
    v_new_prof := 'round(v_sales + v_lub_sales'
               || ' - public.cost_of_goods_sold(' || v_from_var || ', ' || v_to_var || ')'
               || ' - v_expenses, 2)';

    if position(v_old_prof in v_src) = 0 then
      raise exception
        'Cannot fix profit in %: the expression this migration expects is not in it. '
        'It has been changed since 048 - re-apply the fix by hand rather than '
        'leaving profit counting stock bought.', v_target;
    end if;
    v_src := replace(v_src, v_old_prof, v_new_prof);

    -- 2. The working is published beside the answer, so the owner can see
    --    where profit came from instead of taking it on trust.
    v_old_cost := '''total_stock_cost'', round(v_cost + v_lub_cost, 2),';
    v_new_cost := v_old_cost
               || ' ''opening_stock_value'', public.stock_value_at('
                  || v_from_var || ' - 1),'
               || ' ''closing_stock_value'', public.stock_value_at(' || v_to_var || '),'
               || ' ''cost_of_goods_sold'', public.cost_of_goods_sold('
                  || v_from_var || ', ' || v_to_var || '),';

    if position(v_old_cost in v_src) = 0 then
      raise exception 'Cannot add the stock-value figures to %.', v_target;
    end if;
    v_src := replace(v_src, v_old_cost, v_new_cost);

    execute v_src;
  end loop;
end;
$$;

-- ===================================================================== 050_clear_the_old_activity_log.sql
-- =============================================================================
-- 050_clear_the_old_activity_log.sql
--
-- Letting the owner throw away the OLD end of the audit trail.
--
-- WHY, WHEN 035 SAID THE LOG IS APPEND-ONLY FOR EVERYBODY.
--
-- The log grows by a line per change, which on a working day is dozens: every
-- nozzle, every slip, every payment, every dip. It is read the week something
-- looks wrong, and a line from four months ago has never once been the answer -
-- it is the last few weeks that get looked at. Left alone the table grows for
-- ever and the page becomes hundreds of pages of scrolling with the useful end
-- buried at the top of it.
--
-- Append-only was never about the log lasting for ever. It is about a line not
-- being EDITABLE: the person being logged must not be able to soften what a
-- line says, or make one entry disappear while the rest stay - that is what
-- makes the trail worth anything. This keeps all of that. What it adds is one
-- coarse, whole-period, owner-only trim: everything before a cutoff goes, or
-- nothing does. Nobody can reach in and remove the one line about the payment
-- they backdated on Tuesday while leaving Monday and Wednesday in place.
--
-- FOUR THINGS THAT MAKE THIS SAFE TO HAVE:
--
--   * The cutoff is computed HERE, from pump_today(), and only four periods
--     are accepted - one, three, six or twelve months kept. A caller cannot
--     name an arbitrary instant, so "clear everything up to five minutes ago"
--     is not a thing this function can be asked to do.
--   * The most recent month can never be cleared, whatever is asked for.
--   * The trim writes its own line into the log it just trimmed, naming who
--     did it and how many lines went. The trail records that it was cut.
--   * The append-only guard is not disabled to do it. It learns one named
--     exception - `app.trimming_activity`, holding the cutoff date, set only
--     by the function below and only for the length of its transaction, and
--     even then it refuses any row that is NOT older than that cutoff. Same
--     approach as `app.purging_customer` in migration 033, and for the same
--     reason: a stray DELETE from the API, from server code or from a later
--     refactor meets the refusal it always did, because none of them set it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The cutoff, in one place.
--
-- Both the count the dialog shows and the delete it performs come through this
-- function, so the number the owner is shown and the number that actually goes
-- cannot drift apart. Dated at the pump, not at the server: "older than three
-- months" has to mean the same thing here as every other date in the app.
-- ---------------------------------------------------------------------------
create or replace function public.activity_log_cutoff(p_keep_months int)
returns date
language sql
stable
set search_path = public
as $$
  select (public.pump_today() - make_interval(months => p_keep_months))::date;
$$;

comment on function public.activity_log_cutoff(int) is
  'The date before which activity_log entries count as old, keeping p_keep_months.';

-- ---------------------------------------------------------------------------
-- What a trim would remove, before one is asked for.
--
-- The dialog cannot honestly offer "clear entries older than six months"
-- without saying how many that is - the difference between 4 lines and 4,000
-- is the difference between a tidy-up and a decision. All four periods come
-- back in one round trip, with the span of the log, so the page can also say
-- what it would be left with.
-- ---------------------------------------------------------------------------
create or replace function public.activity_log_trim_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total   bigint;
  v_oldest  timestamptz;
  v_newest  timestamptz;
  v_options jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may read the activity log' using errcode = '42501';
  end if;

  select count(*), min(occurred_at), max(occurred_at)
    into v_total, v_oldest, v_newest
    from public.activity_log;

  select coalesce(jsonb_agg(o order by o -> 'months'), '[]'::jsonb)
    into v_options
    from (
      select jsonb_build_object(
               'months', m.months,
               'cutoff', public.activity_log_cutoff(m.months),
               'count',  (select count(*)
                            from public.activity_log a
                           where (a.occurred_at at time zone 'Asia/Karachi')::date
                                 < public.activity_log_cutoff(m.months))
             ) as o
        from unnest(array[1, 3, 6, 12]) as m(months)
    ) t;

  return jsonb_build_object(
    'total',   v_total,
    'oldest',  v_oldest,
    'newest',  v_newest,
    'options', v_options
  );
end;
$$;

comment on function public.activity_log_trim_counts() is
  'How many activity_log lines each retention period would remove, plus the span of the log. Owner only.';

-- ---------------------------------------------------------------------------
-- The guard, with the new exception.
--
-- Restated in full rather than diffed against 035: `create or replace` has to
-- carry the whole body, and a reader should not have to hold two migrations in
-- their head to know what the trigger does.
--
-- UPDATE is still refused outright, for everyone, always. That is the half of
-- append-only that matters - a line may leave, but no line may ever change its
-- story.
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The one way a line may be deleted: clear_activity_log() is running and has
  -- named its cutoff in a transaction-local setting, and this row is genuinely
  -- older than that cutoff. Both halves are checked - the setting alone does
  -- not open the table, it only opens the far end of it.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.trimming_activity', true), '') <> ''
     and (old.occurred_at at time zone 'Asia/Karachi')::date
         < current_setting('app.trimming_activity')::date
  then
    return old;
  end if;

  raise exception 'The activity log is append-only. It records what happened; it is not edited.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_activity_log_append_only() is
  'Blocks UPDATE on activity_log always, and DELETE except while '
  'app.trimming_activity names a cutoff the row predates - which only '
  'clear_activity_log() ever sets.';

-- ---------------------------------------------------------------------------
-- The trim itself.
--
-- Whole periods only, and the last month is never on offer. The owner is
-- clearing history he has finished with, not editing this week.
-- ---------------------------------------------------------------------------
create or replace function public.clear_activity_log(p_keep_months int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff   date;
  v_deleted  bigint;
  v_actor_id uuid;
  v_actor    text;
  v_summary  text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may clear the activity log' using errcode = '42501';
  end if;

  if p_keep_months is null or p_keep_months not in (1, 3, 6, 12) then
    raise exception
      'Choose how much of the log to keep: the last month, three months, six months or year.'
      using errcode = '23514';
  end if;

  v_cutoff := public.activity_log_cutoff(p_keep_months);

  select count(*) into v_deleted
    from public.activity_log a
   where (a.occurred_at at time zone 'Asia/Karachi')::date < v_cutoff;

  -- Nothing to do. Said rather than pretended: a trim that removed nothing
  -- should not write a line claiming a clear-out happened.
  if v_deleted = 0 then
    return jsonb_build_object('deleted', 0, 'cutoff', v_cutoff, 'kept_months', p_keep_months);
  end if;

  select a.actor_id, a.actor_name into v_actor_id, v_actor from public.activity_actor() a;

  -- Name the cutoff so the append-only guard will let these particular rows
  -- go, and no others. is_local = true scopes it to this transaction, so it is
  -- gone the moment this returns.
  perform set_config('app.trimming_activity', v_cutoff::text, true);

  delete from public.activity_log a
   where (a.occurred_at at time zone 'Asia/Karachi')::date < v_cutoff;

  perform set_config('app.trimming_activity', '', true);

  -- The trail records its own trim. Written directly rather than by trigger -
  -- activity_log has never had the logging trigger on it, and putting one there
  -- would make every line about a line.
  v_summary := 'Cleared ' || v_deleted || ' older ' ||
               case when v_deleted = 1 then 'entry' else 'entries' end ||
               ' — everything before ' || to_char(v_cutoff, 'DD Mon YYYY');

  insert into public.activity_log
    (actor_id, actor_name, action, entity, entity_label, summary, details)
  values
    (v_actor_id, v_actor, 'deleted', 'activity_log', 'Activity log', v_summary,
     jsonb_build_object(
       'deleted', v_deleted,
       'cutoff', v_cutoff,
       'kept_months', p_keep_months
     ));

  return jsonb_build_object(
    'deleted', v_deleted,
    'cutoff', v_cutoff,
    'kept_months', p_keep_months
  );
end;
$$;

comment on function public.clear_activity_log(int) is
  'Deletes activity_log entries older than a whole retention period (1, 3, 6 or '
  '12 months kept), and logs the trim itself. Owner only; the recent end is '
  'never touched.';

revoke execute on function public.activity_log_cutoff(int)      from public, anon;
revoke execute on function public.activity_log_trim_counts()    from public, anon;
revoke execute on function public.clear_activity_log(int)       from public, anon;
grant  execute on function public.activity_log_cutoff(int)      to authenticated;
grant  execute on function public.activity_log_trim_counts()    to authenticated;
grant  execute on function public.clear_activity_log(int)       to authenticated;

