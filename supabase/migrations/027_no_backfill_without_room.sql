-- A day with no room left in it cannot be entered at all.
--
-- Migration 026 refused readings that OVERLAP the next one. This closes the
-- gap it left: when the next reading opens exactly where this day starts, the
-- later day has already swallowed this one whole, and the only closing figure
-- 026 would still accept is the opening itself - a nought-litre day.
--
-- That is a lie in the books rather than a duplicate. On 06 Aug 2026 the
-- nozzles really did sell 1,678 litres; saving 06 Aug at nought would have
-- recorded "nothing sold" for a day that traded, with the litres left sitting
-- on 07 Aug. The day reads as entered, the total is wrong, and nothing flags
-- it afterwards.
--
-- WHY NOT SIMPLY BAN BACK-FILLING. Because the honest repair looks almost the
-- same and is needed: Unit 2 - Nozzle B has no reading for 04 Aug 2026, and
-- 05 Aug opens 85.35 litres above where 03 Aug closed. Entering 04 Aug there
-- is exactly right - it fills a real hole. The difference is not whether a
-- later reading exists, it is whether that later reading LEFT ROOM:
--
--     room = next reading's opening - this reading's opening
--
--     room > 0   a genuine gap; this day may be entered, up to that figure
--     room <= 0  the next day already covers this one; nothing to record
--
-- So the rule is about room, not about direction of travel.

create or replace function public.check_reading_does_not_overlap()
returns trigger
language plpgsql
as $$
declare
  v_next record;
  v_prev record;
begin
  select reading_date, opening_reading
    into v_next
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date > new.reading_date
   order by reading_date asc
   limit 1;

  if found then
    -- No room at all: the later reading starts at or before this day does.
    if v_next.opening_reading <= new.opening_reading then
      raise exception
        'The reading for % already covers this whole day - it opens at %, where this day starts, so there are no litres left to record here. Clear % on Readings first, then enter this day, then enter % again.',
        to_char(v_next.reading_date, 'DD Mon YYYY'),
        trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
        to_char(v_next.reading_date, 'DD Mon YYYY'),
        to_char(v_next.reading_date, 'DD Mon YYYY')
        using errcode = '23514';
    end if;

    -- Some room, but this day is claiming more of it than there is.
    if v_next.opening_reading < new.closing_reading then
      raise exception
        'This day would overlap the reading already saved for %. That one starts at %, before this day closes at %, so the same % litres would be counted on both days. Close this day at % or below, or clear % first.',
        to_char(v_next.reading_date, 'DD Mon YYYY'),
        trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
        trim(to_char(new.closing_reading,    'FM9999999990.00')),
        trim(to_char(new.closing_reading - v_next.opening_reading, 'FM9999999990.00')),
        trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
        to_char(v_next.reading_date, 'DD Mon YYYY')
        using errcode = '23514';
    end if;
  end if;

  select reading_date, closing_reading
    into v_prev
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date < new.reading_date
   order by reading_date desc
   limit 1;

  if found and new.opening_reading < v_prev.closing_reading then
    raise exception
      'This day starts at % but % already closed at %, so the same % litres would be counted on both days. Check which of the two dates the meter was actually read on.',
      trim(to_char(new.opening_reading,  'FM9999999990.00')),
      to_char(v_prev.reading_date, 'DD Mon YYYY'),
      trim(to_char(v_prev.closing_reading, 'FM9999999990.00')),
      trim(to_char(v_prev.closing_reading - new.opening_reading, 'FM9999999990.00'))
      using errcode = '23514';
  end if;

  return new;
end;
$$;
