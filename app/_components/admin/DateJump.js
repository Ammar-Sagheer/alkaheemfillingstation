'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import Spinner from '@/app/_components/ui/Spinner';
import Button from '@/app/_components/ui/Button';

/**
 * The date box out of DateNav, which goes to the day as soon as one is picked.
 *
 * There used to be a Go button beside it. Nobody expects to pick a date and
 * then have to press something else - the natural reading of a date field is
 * that choosing a date IS the instruction, so the button was a step people
 * either forgot or resented.
 *
 * WHY THE GUARD BELOW. A native date box fires `change` as soon as its three
 * segments hold something, not when the person has finished. Type the year
 * digit by digit and Chrome reports 0006-08-06 on the way to 2026-08-06, so
 * navigating on every change would jump the page to the year 6 mid-keystroke
 * and take the half-typed date with it. Only a plausible, complete date moves.
 *
 * `scroll` defaults to TRUE, which is the behaviour every caller had before it
 * existed and is right where picking a day changes the whole page - Readings,
 * the Dashboard. Pass `scroll={false}` where the box sits at the BOTTOM of a
 * page and only the block above it changes, as on Treasury: there, jumping to
 * a day and being thrown to the top means scrolling back down to the thing you
 * asked for. Same rule as <TrendRange>, which reached it first.
 *
 * The form around it is still a real GET form, so the noscript button below
 * keeps this usable with JavaScript switched off. Note that is not the same as
 * "before the page has hydrated" - in that window picking a date does nothing
 * and has to be picked again, which is the one thing lost by dropping Go.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNavigable(value) {
  if (!ISO_DATE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export default function DateJump({
  date,
  basePath,
  paramName = 'date',
  extraParams,
  scroll = true,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Carried through the jump for the reason DateNav gives on the arrows: a
  // filter set on this page has to survive changing the day on it.
  const carried = new URLSearchParams(extraParams ?? {}).toString();

  return (
    <form method="GET" action={basePath} className="flex items-center gap-2">
      <label className="sr-only" htmlFor="date-nav">
        Date
      </label>

      {/* Keyed by the date for the reason DateNav documents: the box is
          uncontrolled, so without this it carries on showing the old day after
          the arrows have moved the page underneath it. */}
      <input
        key={date}
        id="date-nav"
        type="date"
        name={paramName}
        defaultValue={date}
        aria-busy={isPending}
        // The calendar normally only opens from the small icon at the right
        // edge, which is a fiddly target on a tablet - tapping the numbers just
        // put a cursor in them. showPicker() opens it from anywhere on the box.
        // Guarded because it throws if the browser has no picker to show.
        onClick={(event) => {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            /* No picker on this browser - typing into the box still works. */
          }
        }}
        onChange={(event) => {
          const next = event.target.value;
          if (!isNavigable(next) || next === date) return;
          startTransition(() => {
            router.push(`${basePath}?${paramName}=${next}${carried ? `&${carried}` : ''}`, {
              scroll,
            });
          });
        }}
        className="input py-2"
      />

      {/* Takes the place the Go button had, so the row does not resize as it
          appears - and answers "did that do anything?" on a slow connection,
          the same job the arrows' spinners already do. */}
      {isPending ? <Spinner className="text-ink-500" /> : null}

      {/* The GET form posts only its own fields, so anything carried has to
          be a field too or the no-JavaScript path loses the filter. */}
      {Object.entries(extraParams ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}

      <noscript>
        <Button variant="secondary" type="submit">
          Go
        </Button>
      </noscript>
    </form>
  );
}
