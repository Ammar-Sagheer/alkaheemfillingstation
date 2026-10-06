-- =============================================================================
-- 009_reading_chain_context.sql
--
-- A nozzle's meter is continuous, so its readings should form an unbroken
-- chain: every reading's opening ought to equal the previous reading's closing.
-- Nothing checked that, and two ways of breaking it both went unnoticed:
--
--   1. BACK-FILLING. Miss the 3rd, enter the 4th, then go back. The 4th was
--      entered with the 2nd's closing as its opening, so it already covers two
--      days. Adding the 3rd counts those litres a second time.
--   2. ENTERING OUT OF ORDER. Enter the 3rd first (no earlier reading, so it
--      opens at 0), then enter the 2nd. The two rows now overlap.
--
-- Either way sales are inflated and tank stock is drawn down twice, so the
-- stock loss someone then investigates is fictional.
--
-- The reading sheet now also returns the neighbouring readings, so the form can
-- say what is wrong before anything is saved. This is context only - it does
-- not block a save, because meters really do get replaced and reset.
-- =============================================================================

drop function if exists public.get_reading_sheet(date);

create or replace function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id        uuid,
  unit_number      smallint,
  nozzle_label     text,
  tank_id          uuid,
  fuel_type        public.fuel_type,
  rate             numeric,
  opening_reading  numeric,
  reading_id       uuid,
  closing_reading  numeric,
  cash_amount      numeric,
  credit_amount    numeric,
  litres_sold      numeric,
  sale_amount      numeric,
  -- the nearest reading BEFORE this date, for the chain check
  previous_date    date,
  previous_closing numeric,
  -- the nearest reading AFTER this date; if one exists we are back-filling
  later_date       date,
  later_opening    numeric
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
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         coalesce(existing.opening_reading, prev.closing_reading, 0)::numeric,
         existing.id,
         existing.closing_reading,
         existing.cash_amount,
         existing.credit_amount,
         existing.litres_sold,
         existing.sale_amount,
         prev.reading_date,
         prev.closing_reading,
         later.reading_date,
         later.opening_reading
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
      select nr.closing_reading, nr.reading_date
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date < p_date
       order by nr.reading_date desc
       limit 1
    ) prev on true
    left join lateral (
      select nr.reading_date, nr.opening_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date > p_date
       order by nr.reading_date asc
       limit 1
    ) later on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;
