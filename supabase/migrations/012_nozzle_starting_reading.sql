-- =============================================================================
-- 012_nozzle_starting_reading.sql
--
-- Where each nozzle's meter stood on the day the pump started using this app.
--
-- THE PROBLEM. get_reading_sheet worked out the opening figure as
--
--   coalesce(this day's saved opening, the previous day's closing, 0)
--
-- That 0 is only right for a brand new pump. A pump that has been trading for
-- years has meters reading, say, 482,910 litres on the day it switches over -
-- and the very first entry would open at 0, so that first day would record the
-- entire lifetime of the meter as one day's sales. Every figure downstream
-- (sales, cash, tank stock, profit) would be wrong, and the tank would be drawn
-- down by hundreds of thousands of litres it never held.
--
-- THE FIX. Each nozzle carries its own starting reading, set once in Settings,
-- and that is what the chain falls back to instead of 0. It is only ever used
-- until the nozzle has its first saved reading; after that the previous day's
-- closing takes over, exactly as before.
-- =============================================================================

alter table public.nozzles
  add column if not exists starting_reading numeric(12,2) not null default 0;

alter table public.nozzles
  drop constraint if exists nozzles_starting_reading_not_negative;

alter table public.nozzles
  add constraint nozzles_starting_reading_not_negative
  check (starting_reading >= 0);

comment on column public.nozzles.starting_reading is
  'Meter reading on the day this pump began using the app. Used as the opening '
  'figure until the nozzle has its first saved reading, then the previous '
  'day''s closing takes over.';

-- Recreated only to change the final fallback in the opening figure, from a
-- hard-coded 0 to the nozzle''s own starting reading. Everything else is
-- unchanged from migration 009.
create or replace function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id uuid, unit_number smallint, nozzle_label text, tank_id uuid,
  fuel_type public.fuel_type, rate numeric, opening_reading numeric,
  reading_id uuid, closing_reading numeric, cash_amount numeric,
  credit_amount numeric, litres_sold numeric, sale_amount numeric,
  previous_date date, previous_closing numeric,
  later_date date, later_opening numeric
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
  select n.id, n.unit_number, n.nozzle_label, t.id, t.fuel_type,
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         coalesce(existing.opening_reading, prev.closing_reading,
                  n.starting_reading)::numeric,
         existing.id, existing.closing_reading, existing.cash_amount,
         existing.credit_amount, existing.litres_sold, existing.sale_amount,
         prev.reading_date, prev.closing_reading,
         later.reading_date, later.opening_reading
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.* from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date = p_date limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading, nr.reading_date from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date < p_date
       order by nr.reading_date desc limit 1
    ) prev on true
    left join lateral (
      select nr.reading_date, nr.opening_reading from public.nozzle_readings nr
       where nr.nozzle_id = n.id and nr.reading_date > p_date
       order by nr.reading_date asc limit 1
    ) later on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

revoke execute on function public.get_reading_sheet(date) from public, anon;
grant  execute on function public.get_reading_sheet(date) to authenticated;
