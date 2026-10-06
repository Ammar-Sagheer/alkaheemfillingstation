-- =============================================================================
-- 066_a_backdated_price_reprices_its_days.sql
--
-- A price set for a day that already has readings now re-prices those readings.
--
-- THE BUG, AS THE OWNER FOUND IT. Readings, 27 Sep 2026, Unit 1 Nozzle A:
-- 236.20 L, and Settings says diesel was Rs 412.25 that day. 236.20 x 412.25 is
-- Rs 97,373.45; the nozzle said Rs 98,221. The difference is the RATE: the
-- reading was saved at 09:16 with Rs 415.84, the rate in force since 25 Sep,
-- and the 412.25 for 26 and 27 Sep was added at 10:01, forty-five minutes
-- later. Every reading carries a copy of its rate (`rate_per_litre`), so the new
-- price never reached it. Both days, both fuels: twelve readings, Rs 3,560.41
-- short on the books.
--
-- NOT A ONE-OFF. The same order of events - readings first, the morning's new
-- price second - had already happened on 14 Aug, 25 Aug and 12 Sep. The
-- owner enters the day's price when he gets to it, and nothing on either screen
-- said the two had crossed.
--
-- WHY THE COPY EXISTS, AND WHY IT STAYS. A rate on the reading row is what
-- stops a price change quietly rewriting last week's takings: a new price set
-- from TODAY must not touch anything already sold. That is still true, and
-- still how it works - a price effective from today, or from any date with no
-- readings yet, changes nothing here.
--
-- WHAT CHANGES. A price effective from a PAST date is the owner saying, in so
-- many words, "from that day, this was the price." Readings already saved in
-- the span that price now governs were sold at it. So setting it re-prices
-- them, and says so in the answer it gives back ("4 readings on 26-27 Sep
-- re-priced from Rs 415.84"). Not quietly: the Settings form says it before
-- saving, and the result says what moved.
--
-- THE SPAN IS BOUNDED. A price covers [its effective_from, the next price's
-- effective_from). Only readings of that fuel inside that span, whose rate is
-- not already the rate now in force for their day, are touched. A reading on a
-- later day belongs to a later price and is left alone - including the older
-- days (14 Aug, 25 Aug, 12 Sep) that disagree with the price table today:
-- putting those right is the owner's call, day by day, not a side effect of
-- setting an unrelated price.
--
-- REMOVING A PRICE is the same thing the other way. The days that price
-- covered fall back to the price before it, so their readings are re-priced to
-- that - or, if no earlier price exists, left alone and reported, because a
-- reading needs some rate and inventing one is not this function's job.
--
-- WHAT A RE-PRICE WRITES. `rate_per_litre` and `cash_amount`, in one UPDATE.
-- `sale_amount` is generated; credit is the slips' total and does not move; the
-- cash is derived exactly the way 052 derives it on insert, so the split
-- constraint (cash + credit = litres x rate) holds by construction. If the
-- slips come to more than the re-priced sale, that is refused with a sentence
-- naming the day and the nozzle, and nothing is saved - price included.
--
-- AUDIT. Each re-priced reading is an UPDATE, so `trg_write_activity` logs it
-- with the before and after values. Nothing is re-priced that the log does not
-- see.
--
-- Owner only (is_super_admin), security definer like clear_day (014), because
-- a price change is the owner's and the readings it re-prices may have been
-- entered by staff.
--
-- Nothing here adds a column, so the backup (051) needs nothing new.
-- =============================================================================

create or replace function public.reprice_readings_for_span(
  p_fuel_type public.fuel_type,
  p_from      date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until        date;
  v_count        int;
  v_first        date;
  v_last         date;
  v_old_rates    text;
  v_new_rate     numeric;
  v_before       numeric(14, 2);
  v_after        numeric(14, 2);
  v_short        record;
  v_unpriced     int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a fuel price' using errcode = '42501';
  end if;

  -- The span this date's price governs: up to, not including, the next price.
  select min(fp.effective_from) into v_until
    from public.fuel_prices fp
   where fp.fuel_type = p_fuel_type and fp.effective_from > p_from;

  -- Readings in the span with no price at all to fall back to (a price removed
  -- with nothing before it). Left as they are and counted.
  select count(*) into v_unpriced
    from public.nozzle_readings r
    join public.nozzles n on n.id = r.nozzle_id
    join public.tanks t on t.id = n.tank_id
   where t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is null;

  -- The re-price would leave a nozzle's credit slips larger than its sale.
  -- Refused here, with a sentence, rather than by the check constraint.
  select r.reading_date, n.unit_number, n.nozzle_label, r.credit_amount,
         round((r.closing_reading - r.opening_reading)
               * public.current_fuel_rate(p_fuel_type, r.reading_date), 2) as new_sale
    into v_short
    from public.nozzle_readings r
    join public.nozzles n on n.id = r.nozzle_id
    join public.tanks t on t.id = n.tank_id
   where t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is not null
     and r.rate_per_litre <> public.current_fuel_rate(p_fuel_type, r.reading_date)
     and r.credit_amount > round((r.closing_reading - r.opening_reading)
                                 * public.current_fuel_rate(p_fuel_type, r.reading_date), 2)
   order by r.reading_date
   limit 1;

  if found then
    raise exception
      'At the new rate, Unit % Nozzle % on % sold Rs %, but its credit slips come to Rs %. '
      'Correct the slips on that day first, then set the rate again.',
      v_short.unit_number, v_short.nozzle_label, to_char(v_short.reading_date, 'DD Mon YYYY'),
      to_char(v_short.new_sale, 'FM999,999,999,990.00'),
      to_char(v_short.credit_amount, 'FM999,999,999,990.00')
      using errcode = '23514';
  end if;

  -- What is about to move, for the answer. Read before the update.
  select count(*), min(r.reading_date), max(r.reading_date),
         string_agg(distinct to_char(r.rate_per_litre, 'FM999,990.00'), ', '),
         sum(r.sale_amount),
         sum(round((r.closing_reading - r.opening_reading)
                   * public.current_fuel_rate(p_fuel_type, r.reading_date), 2))
    into v_count, v_first, v_last, v_old_rates, v_before, v_after
    from public.nozzle_readings r
    join public.nozzles n on n.id = r.nozzle_id
    join public.tanks t on t.id = n.tank_id
   where t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is not null
     and r.rate_per_litre <> public.current_fuel_rate(p_fuel_type, r.reading_date);

  v_new_rate := public.current_fuel_rate(p_fuel_type, p_from);

  -- The same derivation as create_nozzle_reading (052): the sale is exactly
  -- the generated column's expression, the cash is exactly sale - credit.
  update public.nozzle_readings r
     set rate_per_litre = public.current_fuel_rate(p_fuel_type, r.reading_date),
         cash_amount    = round((r.closing_reading - r.opening_reading)
                                * public.current_fuel_rate(p_fuel_type, r.reading_date), 2)
                          - r.credit_amount
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
   where n.id = r.nozzle_id
     and t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is not null
     and r.rate_per_litre <> public.current_fuel_rate(p_fuel_type, r.reading_date);

  return jsonb_build_object(
    'fuel_type',  p_fuel_type,
    'repriced',   coalesce(v_count, 0),
    'first_day',  v_first,
    'last_day',   v_last,
    'old_rates',  v_old_rates,
    'new_rate',   v_new_rate,
    'before',     coalesce(v_before, 0),
    'after',      coalesce(v_after, 0),
    'unpriced',   v_unpriced
  );
end;
$$;

comment on function public.reprice_readings_for_span(public.fuel_type, date) is
  'Brings the readings of one fuel, in the span the price dated p_from governs, '
  'onto the rate now in force for each day. Owner only. See 066.';

revoke execute on function public.reprice_readings_for_span(public.fuel_type, date) from public, anon;
grant execute on function public.reprice_readings_for_span(public.fuel_type, date) to authenticated;


-- Setting a price and re-pricing its span, as ONE transaction: if the re-price
-- is refused, the price is not left behind half-applied.
create or replace function public.set_fuel_price(
  p_fuel_type      public.fuel_type,
  p_rate           numeric,
  p_effective_from date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a fuel price' using errcode = '42501';
  end if;

  insert into public.fuel_prices (fuel_type, rate, effective_from, created_by)
  values (p_fuel_type, p_rate, p_effective_from, auth.uid());

  v_result := public.reprice_readings_for_span(p_fuel_type, p_effective_from);
  return v_result;
end;
$$;

comment on function public.set_fuel_price(public.fuel_type, numeric, date) is
  'Saves a price and re-prices any readings already saved in the span it '
  'governs, in one transaction. Owner only. See 066.';

revoke execute on function public.set_fuel_price(public.fuel_type, numeric, date) from public, anon;
grant execute on function public.set_fuel_price(public.fuel_type, numeric, date) to authenticated;


-- Removing a price, and re-pricing the days it covered onto the price before
-- it, as one transaction.
create or replace function public.remove_fuel_price(p_price_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fuel public.fuel_type;
  v_from date;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a fuel price' using errcode = '42501';
  end if;

  delete from public.fuel_prices
   where id = p_price_id
  returning fuel_type, effective_from into v_fuel, v_from;

  if not found then
    raise exception 'That rate is no longer there. Reload the page.' using errcode = 'P0002';
  end if;

  return public.reprice_readings_for_span(v_fuel, v_from);
end;
$$;

comment on function public.remove_fuel_price(uuid) is
  'Removes a price and re-prices the readings it covered onto the price before '
  'it, in one transaction. Owner only. See 066.';

revoke execute on function public.remove_fuel_price(uuid) from public, anon;
grant execute on function public.remove_fuel_price(uuid) to authenticated;
