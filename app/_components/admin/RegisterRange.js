'use client';

import { useState } from 'react';

import Button from '@/app/_components/ui/Button';

/**
 * Month, then the days within it - the register's range picker.
 *
 * WHY THIS IS A FROM/TO PAIR WHEN `<TrendWindow>` DELIBERATELY IS NOT.
 * docs/UI_CONVENTIONS.md says chart filtering uses fixed windows rather than a
 * date range, and the reasons given there are real: two pickers, four taps, and
 * a range that can be entered backwards or empty. They do not apply here, and
 * the difference is worth stating rather than looking like a lapse.
 *
 * The Dashboard's charts answer "how are we doing lately", where the end of
 * the window is always today and "last 30 days" is the whole question. This
 * page answers "reconcile these particular days" - the owner counts the pump
 * against a run of days he chooses, most often the month so far, sometimes the
 * ten days since a delivery, sometimes one week he is suspicious about. A
 * fixed window cannot express any of those, and the cumulative columns are
 * only meaningful over a period somebody picked on purpose.
 *
 * What it borrows from `<TrendWindow>` is everything else:
 *
 *   - THE RANGE CANNOT BE ENTERED BACKWARDS. Days are two `<select>`s of
 *     1..(days in month), not free text, and picking a first day past the last
 *     one drags the last one with it (and the reverse). So the invalid state
 *     is unreachable rather than validated after the fact. The server checks
 *     again anyway - a query string is not a control.
 *   - IT CANNOT BE EMPTY. Both selects always hold a value, and changing the
 *     month resets them to the whole month rather than leaving day 31 selected
 *     in February.
 *   - IT IS A PLAIN `method="GET"` FORM, like the month box on Reports and
 *     Expenses. No Server Action, no router push: the browser submits it, the
 *     URL carries the range, and a link to a particular run of days can be
 *     sent to somebody or bookmarked.
 *
 * The app's own inputs, not Material UI's `TextField`, since the page moved to
 * the new look: the MUI outline with its label cut into the border was the one
 * form on the site drawn differently from every other. Each box keeps a label
 * over it in words, because "1" and "26" alone do not say which is which. The
 * month box stays a native `type="month"` - the browser's own month picker is
 * one tap on a tablet and needs no calendar of ours.
 */

/** Day zero of the next month is the last day of this one - same trick as monthRange(). */
function daysInMonth(monthValue) {
  const [year, month] = String(monthValue).split('-').map(Number);
  if (!year || !month) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default function RegisterRange({ month, fromDay, toDay }) {
  const [monthValue, setMonthValue] = useState(month);
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);

  const lastDay = daysInMonth(monthValue);
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  // A new month gets the whole of itself. Carrying 1-11 across to a month the
  // pump has not traded yet would show eleven empty rows and read as a fault.
  function changeMonth(next) {
    setMonthValue(next);
    setFrom(1);
    setTo(daysInMonth(next));
  }

  // Either end pushes the other rather than being refused - dragging the first
  // day past the last is how somebody asks for a later window, not a mistake
  // to be told off for.
  function changeFrom(next) {
    setFrom(next);
    if (next > to) setTo(next);
  }

  function changeTo(next) {
    setTo(next);
    if (next < from) setFrom(next);
  }

  return (
    <form
      method="GET"
      action="/admin/reports/register"
      className="flex flex-wrap items-end gap-x-2 gap-y-3"
    >
      <div>
        <label className="caption mb-1 block" htmlFor="register_month">
          Month
        </label>
        <input
          id="register_month"
          type="month"
          name="month"
          value={monthValue}
          onChange={(event) => changeMonth(event.target.value)}
          className="input w-auto py-2"
        />
      </div>
      {/* The two days stay together, so on a phone the month takes one line
          and "From day, To day, Show" the next, rather than "To day" breaking
          away from its pair. */}
      <div className="flex items-end gap-2">
        <div>
          <label className="caption mb-1 block" htmlFor="register_from">
            From day
          </label>
          <select
            id="register_from"
            name="from"
            value={from}
            onChange={(event) => changeFrom(Number(event.target.value))}
            className="input w-auto py-2"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="caption mb-1 block" htmlFor="register_to">
            To day
          </label>
          <select
            id="register_to"
            name="to"
            value={to}
            onChange={(event) => changeTo(Number(event.target.value))}
            className="input w-auto py-2"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button variant="secondary" type="submit">
        Show
      </Button>
    </form>
  );
}
