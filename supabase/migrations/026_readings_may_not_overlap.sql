-- A nozzle's readings may not overlap each other.
--
-- WHY THIS EXISTS. On 07 Aug 2026 a day's six readings were entered at 13:15
-- dated the 7th, and the same meter figures were entered again at 17:35 dated
-- the 6th. Nothing removed the first set, so one movement of the meters was
-- recorded as two days: about 1,678 litres and Rs 577,000 of fuel counted
-- twice, on every nozzle.
--
-- The app did warn, in the entry dialog, and the warning was correct. It was
-- also ignorable, and it was sitting under six red "Check" badges that were
-- firing on every row of every past day. A warning that can be clicked past is
-- the wrong tool for the one mistake that silently doubles money, so this is
-- now a rule in the database, where no amount of application code can get
-- around it.
--
-- WHAT IS BLOCKED, PRECISELY. A meter only ever moves forwards, so two
-- readings for the same nozzle describe two separate spans of it. They overlap
-- - and therefore double-count - when a later reading starts before an earlier
-- one finished:
--
--     06 Aug   1,987,128.80 -> 1,987,279.95
--     07 Aug   1,987,128.80 -> 1,987,279.95     <- starts where the 6th started
--
-- A GAP IS STILL ALLOWED. If a later reading starts *after* an earlier one
-- finished, litres are missing rather than duplicated - which is what a
-- skipped day or a replaced meter looks like, and blocking it would trap
-- someone with no way forward. Those stay warnings in the dialog, as they
-- were. Only overlap, which cannot be honest, is refused.

create or replace function public.check_reading_does_not_overlap()
returns trigger
language plpgsql
as $$
declare
  v_next   record;
  v_prev   record;
begin
  -- The reading immediately after this one, if any.
  select reading_date, opening_reading
    into v_next
    from public.nozzle_readings
   where nozzle_id = new.nozzle_id
     and reading_date > new.reading_date
   order by reading_date asc
   limit 1;

  if found and v_next.opening_reading < new.closing_reading then
    raise exception
      'This day would overlap the reading already saved for %. That one starts at %, before this day closes at %, so the same % litres would be counted on both days. Clear % on Readings first, then enter this day again.',
      to_char(v_next.reading_date, 'DD Mon YYYY'),
      trim(to_char(v_next.opening_reading, 'FM9999999990.00')),
      trim(to_char(new.closing_reading,    'FM9999999990.00')),
      trim(to_char(new.closing_reading - v_next.opening_reading, 'FM9999999990.00')),
      to_char(v_next.reading_date, 'DD Mon YYYY')
      using errcode = '23514';
  end if;

  -- The reading immediately before this one, if any.
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

drop trigger if exists reading_must_not_overlap on public.nozzle_readings;

create trigger reading_must_not_overlap
  before insert or update on public.nozzle_readings
  for each row
  execute function public.check_reading_does_not_overlap();
