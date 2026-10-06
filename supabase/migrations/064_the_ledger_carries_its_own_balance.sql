-- =============================================================================
-- 064_the_ledger_carries_its_own_balance.sql
--
-- Every ledger row learns what was owed immediately after it, so that the screen
-- and the printed statement can both show it and cannot disagree.
--
-- Two functions, one window. `get_ledger_entries_page` is the customer page's
-- paged table; `get_ledger_entries_for_statement` is the whole account, for the
-- statement of account, which since this round lists every fill and every payment
-- with the balance standing after each one rather than only the unpaid fills.
--
-- The first half of the story is a bug the pager introduced.
--
-- The Balance column on the customer page was counting from zero on every page.
--
-- WHAT WENT WRONG. `CustomerLedgerTable` was written when the customer page
-- listed the WHOLE ledger: it sorted the rows oldest first, ran a total through
-- them starting at zero, and printed it against each row - "what was owed
-- immediately after this entry", which is how a paper khata reads and was
-- exactly right at the time. Then the ledger got a pager (25 rows a page), and
-- the same loop kept running - now over a page. Starting at zero is only true
-- for the first entry the customer ever had, and that row is on the LAST page.
--
-- So every figure in the column was out by the net of everything older than the
-- page, and page 1 - the page anybody actually looks at - was out by the most.
-- A real customer owing Rs 97,515 had Rs -59,728 printed against his newest
-- entry: not merely the wrong number, the wrong SIGN, a page saying the pump
-- owed HIM sixty thousand rupees. He was also carrying a run of big payments
-- inside the newest 25 rows, which is what made the page-local total negative;
-- a customer whose recent page is mostly fills gets a figure that is merely too
-- small, which is worse, because nothing about it looks wrong.
--
-- The balance card above the table and the printed statement were both right
-- throughout - they are summed in Postgres over every row (`customer_balance`,
-- and the allocation in customer-statement.js, which reads the whole ledger on
-- purpose). Only the column you would use to CHECK them was wrong, which is the
-- particular kind of bug this app cannot afford: the owner reads the statement,
-- turns to the history to see where a figure came from, and the history
-- disagrees with it. After that he does not trust either one.
--
-- WHY THE FIX IS A WINDOW FUNCTION AND NOT A BIGGER FETCH. The obvious repair -
-- fetch the whole ledger again and slice it in JavaScript - throws away the
-- reason the table is paged and puts a money figure back in a double. A running
-- balance is a money figure: it is `customer_balance()` stopped part way, and
-- the two must agree to the paisa on the last row or the column is lying again
-- in a quieter way. Postgres already sums this exactly, in `numeric`, so it sums
-- it here too and the page carries the answer with it.
--
--   sum(...) over (order by entry_date, created_at, id)
--
-- is computed over EVERY row for the customer and the page is taken after, so
-- the figure against a row is the same whichever page that row happens to fall
-- on - which is the property the old code could not have.
--
-- THE ORDER IS THE SAME TRIPLE THE STATEMENT USES - `entry_date`, then
-- `created_at`, then `id`. The date is the business day and is what the customer
-- recognises; `created_at` breaks a tie within a day in the order the rows were
-- written; `id` is there because a correction (063) writes its reversal and its
-- replacement in ONE statement, so both carry the identical `created_at` and
-- date-plus-time alone is not a total order. Without a final tiebreak Postgres
-- may hand back those two rows in either order on either query, so the running
-- total and the list could be walking the ledger in different orders - and the
-- column would disagree with itself between one page load and the next. The
-- pair nets to zero either way; what matters is that it is decided, and decided
-- the same way `oldestFirst` in customer-statement.js decides it.
--
-- ONE ROUND TRIP, THREE ANSWERS. The rows, the count for the pager, and the ids
-- of the entries that have been cancelled - which the table needs for the whole
-- customer, not just the page, because `corrects_entry_id` points FORWARD and an
-- August mistake corrected in September has its two halves on different pages.
-- That was already a second query; it is now part of the same one.
-- =============================================================================

create or replace function public.get_ledger_entries_page(
  p_customer_id uuid,
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
  -- A hand-typed page size cannot ask for the whole book, and cannot ask for
  -- nothing either; the pager only ever sends 25.
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  -- Same gate as get_customer_statement: staff need one customer's ledger to
  -- record a payment against it. It exposes one customer, never the whole book.
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  with running as (
    select le.*,
           sum(case when le.entry_type = 'debit' then le.amount else -le.amount end)
             over (order by le.entry_date, le.created_at, le.id
                   rows between unbounded preceding and current row) as balance_after
      from public.ledger_entries le
     where le.customer_id = p_customer_id
  ),
  page as (
    select r.*
      from running r
     order by r.entry_date desc, r.created_at desc, r.id desc
     limit v_limit offset v_offset
  )
  select jsonb_build_object(
    -- Newest first, the way the table reads, and ordered inside the aggregate
    -- so the array arrives in that order rather than in whatever order the
    -- rows came out of the subquery.
    'rows', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.entry_date desc, p.created_at desc, p.id desc)
         from page p),
      '[]'::jsonb),
    'total', (select count(*) from running),
    'corrected_ids', coalesce(
      (select jsonb_agg(r.corrects_entry_id)
         from running r
        where r.corrects_entry_id is not null),
      '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_ledger_entries_page(uuid, integer, integer) is
  'One page of a customer''s ledger, newest first, each row carrying the balance after it - summed in Postgres over the WHOLE ledger, so the figure does not depend on which page the row falls on. Also returns the row count for the pager and the ids of every cancelled entry.';

revoke execute on function public.get_ledger_entries_page(uuid, integer, integer) from public, anon;
grant  execute on function public.get_ledger_entries_page(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The whole account, oldest first, for the statement.
--
-- THE DELIBERATE OPPOSITE OF THE PAGED FUNCTION ABOVE, and for a reason worth
-- writing down: that one pages because the screen only ever LISTS rows. The
-- statement IS the account - every fill, every payment, the balance after each -
-- so a page of 25 would print a document that stops in the middle of August with
-- no line saying it had.
--
-- ONE JSON VALUE RATHER THAN A ROW SET, which also settles a limit the app used
-- to work around in JavaScript: PostgREST caps a table read at 1,000 rows by
-- default and hands back the first 1,000 without complaining, so the fetch this
-- replaces looped in batches to be sure it had them all. A regular haulier runs
-- to a few hundred entries a year, so the cap was years away and not never - and
-- the failure it produces is a statement that looks entirely normal and asks for
-- the wrong money. A jsonb return has no such cap.
--
-- No `limit` here on purpose. The caller wants the account or it wants nothing;
-- a truncated statement is the one outcome worse than a slow one.
-- ---------------------------------------------------------------------------

create or replace function public.get_ledger_entries_for_statement(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.entry_date, r.created_at, r.id), '[]'::jsonb)
    into v_result
    from (
      select le.*,
             sum(case when le.entry_type = 'debit' then le.amount else -le.amount end)
               over (order by le.entry_date, le.created_at, le.id
                     rows between unbounded preceding and current row) as balance_after
        from public.ledger_entries le
       where le.customer_id = p_customer_id
    ) r;

  return v_result;
end;
$$;

comment on function public.get_ledger_entries_for_statement(uuid) is
  'A customer''s whole ledger, oldest first, each row carrying the balance after it. For the printed statement of account, which lists every movement rather than a page of them.';

revoke execute on function public.get_ledger_entries_for_statement(uuid) from public, anon;
grant  execute on function public.get_ledger_entries_for_statement(uuid) to authenticated;
