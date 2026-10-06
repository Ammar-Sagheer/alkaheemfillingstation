-- =============================================================================
-- 007_reading_sheet_rpc.sql
--
-- Everything the daily reading screen needs, for all 6 nozzles, in one query.
--
-- This is what makes the daily entry fast. For each nozzle it returns:
--   * the opening reading, already filled in from yesterday's closing so staff
--     never retype it
--   * the rate in force for that fuel on that date
--   * whatever has already been entered for that date, so the screen shows
--     progress and nobody enters the same nozzle twice
-- =============================================================================

create or replace function public.get_reading_sheet(p_date date default current_date)
returns table (
  nozzle_id       uuid,
  unit_number     smallint,
  nozzle_label    text,
  tank_id         uuid,
  fuel_type       public.fuel_type,
  rate            numeric,
  opening_reading numeric,
  reading_id      uuid,
  closing_reading numeric,
  cash_amount     numeric,
  credit_amount   numeric,
  litres_sold     numeric,
  sale_amount     numeric
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
  select n.id,
         n.unit_number,
         n.nozzle_label,
         t.id,
         t.fuel_type,
         -- An already-saved reading keeps the rate it was sold at; a new one
         -- picks up today's price.
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         -- Opening = yesterday's closing. Falls back to 0 on a brand new pump.
         coalesce(existing.opening_reading, prev.closing_reading, 0)::numeric,
         existing.id,
         existing.closing_reading,
         existing.cash_amount,
         existing.credit_amount,
         existing.litres_sold,
         existing.sale_amount
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.*
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date = p_date
       limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date < p_date
       order by nr.reading_date desc
       limit 1
    ) prev on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;
