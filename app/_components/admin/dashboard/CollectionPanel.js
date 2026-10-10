import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import { TILE } from '@/app/_components/admin/dashboard/tones';
import { formatPKR } from '@/app/_lib/format-helpers';
import { formatDate } from '@/app/_lib/date-helpers';

/**
 * What the staff still owe the owner for the day on screen (806): the one thing
 * Al Hakeem said the Dashboard must show.
 *
 *   cash from the nozzles  -  the day's expenses  =  TO COLLECT
 *   TO COLLECT  -  handed in to the safe          =  STILL TO COLLECT
 *
 * Every figure arrives from Postgres (`get_day_collection`); this page adds
 * nothing up, it only says them in the order the owner works them out. The
 * credit part of the day's fuel is not in it, since it was never cash, and
 * what the staff hand in is what Treasury records as "Cash of shift closing"
 * or "Entry" on the same day.
 *
 * THE LAST FIGURE CAN BE NEGATIVE, and says so: more was handed in than the
 * day's cash accounts for (usually the cash of the day before, brought in
 * after midnight), which is a thing to look at, not a zero.
 */
export default function CollectionPanel({ collection, date }) {
  if (!collection) return null;

  const n = (value) => Number(value ?? 0);
  const still = n(collection.still_to_collect);
  const noReadings = n(collection.readings) === 0;

  const state =
    still > 0.005
      ? { tone: 'text-red-700', tile: TILE.alert, label: 'Still to collect', note: 'Not yet in the safe' }
      : still < -0.005
        ? { tone: 'text-amber-800', tile: TILE.neutral, label: 'Handed in more than the day’s cash', note: 'Check Treasury for the day' }
        : { tone: 'text-brand-700', tile: TILE.money, label: 'Everything collected', note: 'The safe has it all' };

  return (
    <section
      aria-labelledby="collect-heading"
      data-card
      className="panel @container mt-4 overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-ink-200 px-5 py-3.5">
        <h2 id="collect-heading" className="flex items-center gap-3 text-base font-semibold text-ink-800">
          <span className={`icon-tile h-9 w-9 ${state.tile}`}>
            <Icon name="cash" className="h-5 w-5" />
          </span>
          To collect from the staff, {formatDate(date)}
        </h2>
        <PendingLink
          href="/admin/treasury"
          className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          Treasury
        </PendingLink>
      </div>

      {noReadings ? (
        <p className="px-5 py-5 text-base text-ink-700">
          No readings are saved for this day yet, so there is nothing to collect. Enter the day&apos;s
          readings first.
        </p>
      ) : (
        <div className="grid gap-px bg-ink-200 @[44rem]:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]">
          <Step label="Cash from the nozzles" value={formatPKR(collection.fuel_cash)} sub={
            n(collection.fuel_credit) > 0
              ? `${formatPKR(collection.fuel_sales)} sold, less ${formatPKR(collection.fuel_credit)} on credit`
              : 'No credit sales'
          } />
          <Step label="Less expenses" value={formatPKR(collection.expenses)} sub="Paid out today" sign="−" />
          <Step label="To collect" value={formatPKR(collection.to_collect)} strong />
          <Step label="Less handed in" value={formatPKR(collection.handed_in)} sub="Into the safe today" sign="−" />
          <div className="bg-white px-5 py-4">
            <p className="caption">{state.label}</p>
            <p className={`tabular whitespace-nowrap text-3xl font-bold tracking-tight ${state.tone}`}>
              {formatPKR(Math.abs(still))}
            </p>
            <p className="text-sm text-ink-600">{state.note}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Step({ label, value, sub, sign, strong = false }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="caption">
        {sign ? <span aria-hidden="true">{sign} </span> : null}
        {label}
      </p>
      <p className={`tabular whitespace-nowrap text-xl font-bold ${strong ? 'text-ink-900' : 'text-ink-800'}`}>{value}</p>
      {sub ? <p className="text-sm text-ink-600">{sub}</p> : null}
    </div>
  );
}
