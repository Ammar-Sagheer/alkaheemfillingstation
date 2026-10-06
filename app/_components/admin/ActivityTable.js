// A Server Component, so formatPKR can come from helpers.js - that file reads
// request cookies for the role checks and would break a client bundle.
import { formatDateTime, formatDate, isoDateAtPump } from '@/app/_lib/date-helpers';
import { formatPKR } from '@/app/_lib/helpers';
import { withoutDashes } from '@/app/_lib/format-helpers';

/**
 * The activity trail: when, who, what happened.
 *
 * EVERY LINE WAS WRITTEN AS A FINISHED SENTENCE by the trigger in migration
 * 035, at the moment the change happened, and this component only lays it out.
 * That is the constraint the whole design follows from: about half of these
 * rows describe something that no longer exists - a deleted reading, a removed
 * customer - so there is nothing left to look up and nothing to link to.
 *
 * WHAT AND WHEN ARE TWO DIFFERENT DATES, and both are shown. `occurred_at` is
 * when somebody pressed the button; `entry_date` is the business day the entry
 * was filed against. A payment typed on the 9th against the 3rd is the shape of
 * both an honest correction and a dishonest one, and a log that showed only one
 * of the two dates could not tell you it had happened at all.
 *
 * WHY THIS IS NOT A <table>, WHICH EVERY OTHER LIST IN THIS APP IS.
 *
 * It was one first, and on a phone it was unreadable in a way no measurement
 * caught: `hasScroll: false`, nothing clipped, and a screen showing two narrow
 * columns of timestamps beside acres of white space, because the row heights
 * were being set by a 700px-wide sentence sitting off the right-hand edge. The
 * app's usual answer - let the table scroll sideways inside its card - works
 * for Purchases because every cell there is a short number. Here the one
 * column that matters is a paragraph, and scrolling right to find out what
 * happened defeats the page.
 *
 * So this is a container-query grid instead: four columns once there is room
 * for them, and stacked below that, with the event first and the who/when/how
 * much folded onto one quiet line under it. `@[54rem]:contents` is what lets
 * one piece of markup do both - on a narrow screen that wrapper is a flex row,
 * and on a wide one it dissolves so its three children become grid cells in
 * their own columns.
 *
 * IN THE NEW LOOK (docs/UI_CONVENTIONS.md -> "The new look"): a `.panel` with
 * 20px edges, the headings in sentence case like every other table's, and the
 * action badge in words with a capital. THE SENTENCES LOSE THEIR EM DASHES
 * HERE: the trigger writes a spaced em dash between a name and its figure, and every
 * line already stored carries one, so they are read through `withoutDashes`
 * with the app's own middle dot in their place.
 */
export default function ActivityTable({ rows }) {
  return (
    <div className="@container">
      <div data-card className="panel divide-y divide-ink-100 overflow-hidden">
        {/* The headings only exist when the thing below them is columns. */}
        <div
          className="hidden bg-ink-50 px-5 py-2.5 text-sm font-semibold text-ink-700
                     @[54rem]:grid @[54rem]:grid-cols-[12rem_12rem_1fr_8rem] @[54rem]:gap-x-3"
        >
          <span>When</span>
          <span>Who</span>
          <span>What</span>
          <span className="text-right">Amount</span>
        </div>

        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-x-3 gap-y-1.5 px-5 py-3
                       @[54rem]:grid-cols-[12rem_12rem_1fr_8rem] @[54rem]:items-baseline"
          >
            {/* First on a phone, third in the columns: what actually happened
                is the reason anyone opened this page. */}
            <div className="order-1 @[54rem]:order-none @[54rem]:col-start-3 @[54rem]:row-start-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <ActionBadge action={row.action} />
                <span className="font-semibold text-ink-900">
                  {withoutDashes(row.entity_label, ' · ')}
                </span>
                <span className="text-ink-700">{withoutDashes(row.summary, ' · ')}</span>
              </span>

              {/* The business day, only when it differs from the day the entry
                  was typed. Shown always, it would be noise on the nine rows in
                  ten that were entered the same evening. */}
              {row.entry_date && row.entry_date !== isoDateAtPump(row.occurred_at) ? (
                <span className="mt-1 block text-sm font-medium text-amber-800">
                  filed against {formatDate(row.entry_date)}
                </span>
              ) : null}

              <Changes changes={row.details?.changes} />
            </div>

            <div
              className="order-2 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-600
                         @[54rem]:contents"
            >
              <span
                className="@[54rem]:col-start-1 @[54rem]:row-start-1 @[54rem]:whitespace-nowrap
                           @[54rem]:text-base"
              >
                {formatDateTime(row.occurred_at)}
              </span>

              <span
                /* No nowrap here, unlike the two beside it. A name that
                   outgrows its column should wrap onto a second line; a
                   timestamp or a figure that does the same is a defect. */
                className="font-semibold text-ink-800
                           @[54rem]:col-start-2 @[54rem]:row-start-1 @[54rem]:text-base
                           @[54rem]:text-ink-900"
              >
                {row.actor_name}
              </span>

              {/* Right-aligned and tabular once it has a column of its own, so
                  the eye can run down it for the big figure. */}
              <span
                className="tabular whitespace-nowrap font-semibold text-ink-900
                           @[54rem]:col-start-4 @[54rem]:row-start-1 @[54rem]:text-right
                           @[54rem]:text-base"
              >
                {/* Nothing at all when there is no amount: the grid cell holds
                    its column empty, and stacked, a mark on a line of its own
                    was a thing to decipher. */}
                {row.amount === null || row.amount === undefined ? null : formatPKR(row.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Created / changed / deleted, coloured - and with the word, always.
 *
 * Three states told apart by colour alone is exactly the failure the icon rule
 * in docs/UI_CONVENTIONS.md exists to prevent, and this is a red-and-green pair
 * on a screen read in poor light. The colour is the second cue, not the first.
 */
function ActionBadge({ action }) {
  const tones = {
    created: 'bg-brand-100 text-brand-800',
    changed: 'bg-amber-100 text-amber-900',
    deleted: 'bg-red-100 text-red-800',
  };

  // "Created", not "created": the word opens the line, so it takes the capital.
  const word = String(action ?? '');

  return (
    <span className={`badge ${tones[action] ?? 'bg-ink-200 text-ink-800'}`}>
      {word.charAt(0).toUpperCase() + word.slice(1)}
    </span>
  );
}

/**
 * What actually changed on an edit, field by field.
 *
 * This is the part of an audit trail that answers the question people really
 * have - not "the rate was changed" but "changed from what to what". Capped at
 * four fields so one wide edit cannot push a page of rows off the screen; the
 * rest are counted rather than dropped silently.
 *
 * The values are printed exactly as stored, unformatted. Every other number in
 * this app goes through a helper, and this is the one place that would be
 * wrong: the column could be rupees, litres, a meter reading or a phone
 * number, and guessing at it would eventually print a meter as money.
 */
function Changes({ changes }) {
  if (!Array.isArray(changes) || changes.length === 0) return null;

  const shown = changes.slice(0, 4);
  const rest = changes.length - shown.length;

  return (
    <ul className="mt-1 space-y-0.5 text-sm text-ink-600">
      {shown.map((change) => (
        <li key={change.field}>
          <span className="font-medium text-ink-700">{humanField(change.field)}</span>{' '}
          <span className="tabular">{display(change.from)}</span>
          {' → '}
          <span className="tabular font-semibold text-ink-900">{display(change.to)}</span>
        </li>
      ))}
      {rest > 0 ? <li>and {rest} more</li> : null}
    </ul>
  );
}

/** `vehicle_number` -> "Vehicle number". Column names are not English. */
function humanField(field) {
  const words = String(field).replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A jsonb value as something readable. `null` becomes the word "empty" rather
 * than a blank, because "changed to blank" and "changed" look identical
 * otherwise, and clearing a field is a real edit worth seeing.
 */
function display(value) {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}
