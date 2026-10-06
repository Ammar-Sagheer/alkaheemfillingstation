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
