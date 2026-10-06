-- =============================================================================
-- 052_the_database_works_out_the_cash.sql
--
-- A reading would not save, and the arithmetic was right on both sides.
--
-- THE BUG. Unit 1 Nozzle A, 23 Aug 2026: opening 1,990,670.61, closing
-- 1,990,868.36, diesel at Rs 371.90. That is 197.75 litres, and
--
--     197.75 x 371.90 = 73,543.2250 exactly
--
-- a half-paisa, sitting precisely on the rounding boundary. Postgres computes
-- it in `numeric` and rounds half away from zero: Rs 73,543.23. JavaScript
-- computes it in a binary double, where the product is 73,543.224999999991,
-- and rounds to Rs 73,543.22. The app sent .22 as the cash figure;
-- `sale_amount` is a GENERATED column so the database had .23; and
-- `nozzle_readings_split_matches_sale` refused the row because cash + credit
-- did not equal the amount sold.
--
-- One paisa. The owner saw "Cash plus credit does not equal the amount sold.
-- Check the figures and try again" on a reading where every figure was correct,
-- and no amount of re-typing could have fixed it.
--
-- WHY IT LOOKED INTERMITTENT. It only happens when litres x rate lands exactly
-- on a half-paisa AND the float falls short of it. Whole litres cannot do it at
-- all - a whole number times a two-decimal rate has at most two decimals - which
-- is why entering the reading "without points" worked. Measured against the 25
-- rates this pump has actually charged: 13 of them can produce it, and at the
-- diesel rate in force that day it refuses about one litre figure in 26.
--
-- THE FIX. Not "round more carefully in JavaScript" - that is the same bet
-- again, made by whoever next writes a figure the database also computes. The
-- app should not be sending this number at all.
--
-- `p_cash` was the last figure in this function the caller was trusted to work
-- out. The credit total already came from the slips rather than from the
-- browser, with the comment "so the two can't disagree"; this extends the same
-- rule to the cash, which is not an independent fact either. It is exactly
-- sale - credit, and the sale is exactly what the generated column says it is.
-- Derived here, in numeric, the app CANNOT disagree with the constraint, no
-- matter what its floats do.
--
-- `p_cash` stays in the signature and is ignored. Dropping it would break every
-- deployed copy of the app the moment this lands, and PostgREST resolves the
-- overload by argument names - so an older client keeps working, and simply
-- stops being listened to about the cash.
-- =============================================================================

create or replace function public.create_nozzle_reading(
  p_nozzle_id    uuid,
  p_reading_date date,
  p_opening      numeric,
  p_closing      numeric,
  p_rate         numeric,
  p_cash         numeric,
  p_credit_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reading_id   uuid;
  v_credit_total numeric(14, 2);
  v_sale         numeric(14, 2);
  v_cash         numeric(14, 2);
  v_line         jsonb;
begin
  -- The reading's credit_amount is derived from the slips, never typed, so the
  -- two can't disagree.
  select coalesce(sum((l ->> 'amount')::numeric), 0)
    into v_credit_total
    from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb)) l;

  -- And now the cash, for the same reason. This is the identical expression to
  -- the one in the sale_amount generated column and in the check constraint, so
  -- all three agree by construction rather than by luck. p_cash is ignored -
  -- see the header for why it is still accepted.
  v_sale := round((p_closing - p_opening) * p_rate, 2);
  v_cash := v_sale - v_credit_total;

  -- The slips coming to more than the nozzle sold is a real mistake and has to
  -- be refused - but it is refused HERE, with a sentence about slips, rather
  -- than by the check constraint underneath, which would report it as the
  -- figures not adding up and send the reader looking at the meter.
  if v_cash < 0 then
    raise exception
      'The credit slips come to Rs %, which is more than the Rs % sold on this nozzle. '
      'Check the slips.',
      to_char(v_credit_total, 'FM999,999,999,990.00'),
      to_char(v_sale, 'FM999,999,999,990.00')
      using errcode = '23514';
  end if;

  insert into public.nozzle_readings (
    nozzle_id, reading_date, opening_reading, closing_reading,
    rate_per_litre, cash_amount, credit_amount, created_by
  )
  values (
    p_nozzle_id, p_reading_date, p_opening, p_closing,
    p_rate, v_cash, v_credit_total, auth.uid()
  )
  returning id into v_reading_id;

  for v_line in
    select value from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb))
  loop
    insert into public.credit_sales (reading_id, customer_id, litres, amount)
    values (
      v_reading_id,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'litres')::numeric,
      (v_line ->> 'amount')::numeric
    );
  end loop;

  return v_reading_id;
end;
$$;

comment on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb) is
  'Saves a reading and its credit slips. Cash and credit are both DERIVED here '
  'in numeric - p_cash is accepted for compatibility and ignored. See 052.';

-- The grants a `create or replace` keeps, restated so this file can be read on
-- its own: replacing a function does not drop its ACL, but 006 is a long way
-- back and "did that survive?" is not a question to answer from memory.
revoke execute on function
  public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb)
  from public, anon;
grant execute on function
  public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb)
  to authenticated;
