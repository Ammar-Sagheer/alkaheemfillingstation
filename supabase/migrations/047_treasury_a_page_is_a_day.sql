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
