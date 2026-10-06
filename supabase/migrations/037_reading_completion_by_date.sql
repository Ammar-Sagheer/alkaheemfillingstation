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
