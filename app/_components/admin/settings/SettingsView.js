import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import FuelPriceForm from '@/app/_components/admin/FuelPriceForm';
import TankForm from '@/app/_components/admin/TankForm';
import NozzleSettingsButton from '@/app/_components/admin/NozzleSettingsButton';
import ReplaceUnitButton from '@/app/_components/admin/ReplaceUnitButton';
import FullResetPanel from '@/app/_components/admin/FullResetPanel';
import BackupPanel from '@/app/_components/admin/BackupPanel';
import FuelPriceTable from '@/app/_components/admin/FuelPriceTable';
import {
  AddNozzleButton,
  AddTankButton,
  RemoveNozzleButton,
  RemoveTankButton,
} from '@/app/_components/admin/ForecourtSetup';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';

import { fuelColor, FUEL_COLORS, FUEL_ORDER } from '@/app/_lib/fuel-colors';
import { formatDate } from '@/app/_lib/date-helpers';
import { formatLitres, formatRate } from '@/app/_lib/format-helpers';

/**
 * Settings, drawn - in the new look (docs/UI_CONVENTIONS.md -> "The new look"):
 * the rates, the tanks, the pumps on the forecourt and the backup, each under
 * a `SectionHeader`, with the nozzle wiring in the page header.
 *
 * Takes the page's query results as they come back, so a devcheck route can
 * render it from fixtures. `lastDips` is one entry per tank, in the same order,
 * already formatted on the server (TankForm is a client component).
 */
export default function SettingsView({
  tanks,
  nozzles,
  prices,
  rates,
  lastDips,
  backupError,
  showBackup,
  showReset,
  tankUsage = {},
  today,
}) {
  /*
   * THE UNIT, NOT THE NOZZLE, IS WHAT THE OWNER REPLACES. A dispenser is one
   * object standing on the forecourt with two nozzles bolted to it, and it is
   * swapped as one object - so this page groups by unit the same way the
   * Readings page does.
   *
   * The group key is unit number AND commissioning date, not unit number
   * alone. Since migration 056 a unit number outlives the hardware wearing it:
   * a replaced Unit 1 and the Unit 1 that took its place share the number, and
   * grouping on that alone would draw them as one four-nozzle pump that never
   * existed.
   */
  const unitsByKey = new Map();
  for (const nozzle of nozzles) {
    const key = `${nozzle.unit_number}|${nozzle.commissioned_on ?? 'original'}`;
    if (!unitsByKey.has(key)) {
      unitsByKey.set(key, {
        key,
        unitNumber: nozzle.unit_number,
        commissionedOn: nozzle.commissioned_on,
        retiredOn: nozzle.retired_on,
        nozzles: [],
      });
    }
    unitsByKey.get(key).nozzles.push(nozzle);
  }

  const allUnits = [...unitsByKey.values()];
  const liveUnits = allUnits.filter((unit) => !unit.retiredOn);
  // Al Hakeem (migration 800): what the owner may still change about his own
  // forecourt. A nozzle with no readings may be removed; a tank with no
  // nozzle, delivery or dip may be. Once anything has traded, a new nozzle is
  // asked for the day it starts.
  const readingCount = (nozzle) => Number(nozzle.readings?.[0]?.count ?? 0);
  const trading = nozzles.some((nozzle) => readingCount(nozzle) > 0);
  const tankHasNozzle = new Set(nozzles.map((nozzle) => nozzle.tank_id));
  const canRemoveTank = (tank) => !tankUsage[tank.id] && !tankHasNozzle.has(tank.id);
  const nextUnit =
    nozzles.reduce((highest, nozzle) => Math.max(highest, Number(nozzle.unit_number) || 0), 0) + 1;

  const retiredUnits = allUnits
    .filter((unit) => unit.retiredOn)
    .sort((a, b) => (a.retiredOn < b.retiredOn ? 1 : -1));

  return (
    <>
      <TitleHeader
        title="Settings"
        icon="settings"
        tone="neutral"
        description={
          showBackup
            ? 'Prices, tanks, the pumps on the forecourt, and backups. Owner access only.'
            : 'Prices, tanks and the pumps on the forecourt. Owner access only.'
        }
      >
        {/* Every nozzle, replaced ones included. A replaced pump still holds
            its old position for the days it worked, so nothing can be moved
            into that position while it is not on the list to be moved out of
            it - see 058. Its tank and meter are still frozen; the dialog
            renders those two read-only rather than leaving the row out. */}
        <NozzleSettingsButton nozzles={nozzles} tanks={tanks} />
      </TitleHeader>

      {/* ================= fuel prices ================= */}
      <section aria-labelledby="prices-heading" className="@container mt-10">
        <SectionHeader
          id="prices-heading"
          icon="fuelPump"
          tone="money"
          title="Fuel prices"
          description="Your selling price per litre. Each day's sales use the price that was set for that day, so a new price never changes earlier days."
        >
          {/* Behind a dialog rather than standing open beside the cards - see
              FuelPriceForm. Freeing the width is also what lets the cards be
              the headline rather than a caption next to a form. */}
          <FuelPriceForm currentRates={rates} />
        </SectionHeader>

        {/* Diesel first, petrol second - the pump's own layout, not
            alphabetical order. See FUEL_ORDER in fuel-colors.js. */}
        <div className="grid gap-5 @[40rem]:grid-cols-2">
          {FUEL_ORDER.filter((fuelType) => fuelType in rates).map((fuelType) => (
            <RateCard key={fuelType} fuelType={fuelType} rate={rates[fuelType]} />
          ))}
        </div>

        {prices.length > 0 ? (
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold text-ink-900">The most recent changes</h3>
              <PendingLink
                href="/admin/settings/fuel-prices"
                className="inline-flex items-center gap-1 text-base font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                View all rates
                <Icon name="chevronRight" className="h-4 w-4" />
              </PendingLink>
            </div>

            <FuelPriceTable prices={prices} />
          </div>
        ) : (
          <div data-card className="panel mt-5 px-5 py-6 text-center text-base text-ink-700">
            No prices yet. Set a petrol and a diesel price to start entering readings.
          </div>
        )}
      </section>

      {/* ================= tanks ================= */}
      <section aria-labelledby="tanks-heading" className="@container mt-12">
        <SectionHeader
          id="tanks-heading"
          icon="stock"
          tone="held"
          title="Tanks"
          description="Every tank in the ground, petrol or diesel, as many as you have. Its size and opening stock are behind Edit."
        >
          <AddTankButton today={today} variant={tanks.length === 0 ? 'primary' : 'secondary'} />
        </SectionHeader>
        {tanks.length === 0 ? (
          <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
            No tanks yet. Add each tank you have, with its size and the fuel in it now.
          </div>
        ) : (
          /* One height per row (the grid's own stretch), with each card's last
             line pinned to its bottom, so the "Last dipped" lines sit level. */
          <div className="grid gap-5 @[40rem]:grid-cols-2">
            {tanks.map((tank, index) => (
              <div key={tank.id} className="flex flex-col">
                <TankForm tank={tank} lastDip={lastDips[index]} />
                {canRemoveTank(tank) ? (
                  <div className="mt-1.5 flex items-center justify-end gap-1 text-sm text-ink-600">
                    Not used yet
                    <RemoveTankButton tank={tank} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ================= dispensing units ================= */}
      {/*
       * WHY THIS SECTION EXISTS AT ALL, when the nozzle wiring dialog in the
       * header already lists every nozzle. Because the dialog answers "how is
       * the place plumbed", which is a standing fact, and this answers "what is
       * standing out there now, and what used to be" - which is a history. The
       * day a unit was damaged and swapped is a real event in the books.
       */}
      <section aria-labelledby="units-heading" className="@container mt-12">
        <SectionHeader
          id="units-heading"
          icon="fuelPump"
          tone="neutral"
          title="Dispensing units"
          description="What stands on the forecourt now: add as many nozzles as you have, each drawing from the tank you choose. A pump that is damaged, moved or re-piped is replaced here, so its old readings stay under it."
        >
          <AddNozzleButton
            tanks={tanks}
            nextUnit={nextUnit}
            trading={trading}
            today={today}
            variant={liveUnits.length === 0 ? 'primary' : 'secondary'}
          />
        </SectionHeader>

        {liveUnits.length === 0 ? (
          <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
            No nozzles yet.{' '}
            {tanks.length === 0
              ? 'Add your tanks first, then each nozzle and the tank it draws from.'
              : 'Add each nozzle, the unit it is on and the tank it draws from.'}
          </div>
        ) : null}

        {/* One height per row: a unit with four nozzles beside one with two
            left the shorter card stopping short. The Replace button is pinned
            to each card's bottom, so the buttons sit level. */}
        <div className="grid gap-5 @[40rem]:grid-cols-2">
          {liveUnits.map((unit) => (
            <UnitCard key={unit.key} unit={unit} tanks={tanks} today={today} readingCount={readingCount} />
          ))}
        </div>

        {retiredUnits.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-3 text-lg font-semibold text-ink-900">Replaced units</h3>
            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 max-h-none px-0">
                <table className="w-full min-w-[30rem]">
                  <thead>
                    <tr>
                      <th className="th pl-5">Unit</th>
                      <th className="th">Nozzles</th>
                      <th className="th">Drew from</th>
                      <th className="th pr-5">Last day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {retiredUnits.map((unit) => (
                      <tr key={unit.key}>
                        <td className="td pl-5 font-semibold text-ink-900">
                          Unit {unit.unitNumber}
                        </td>
                        <td className="td">
                          {unit.nozzles.map((nozzle) => nozzle.nozzle_label).join(', ')}
                        </td>
                        <td className="td">
                          {[
                            ...new Set(unit.nozzles.map((nozzle) => nozzle.tank?.name ?? 'No tank')),
                          ].join(', ')}
                        </td>
                        <td className="td tabular whitespace-nowrap pr-5">
                          {formatDate(unit.retiredOn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Said once, here, rather than as a warning on every row: the
                reason these rows are read-only is not obvious, and it is the
                whole reason they are still in the database at all. */}
            <p className="mt-3 max-w-[80ch] text-sm text-ink-700">
              Kept, and not editable. Every reading these nozzles ever took is still in the books
              and still drawing on the tank they were plumbed to, so their days can be opened and
              corrected on Readings exactly as before.
            </p>
          </div>
        ) : null}
      </section>

      {/* ================= backup ================= */}
      {/* Here rather than on Reports, where it was first put. A backup is not a
          report: it is not read, it is filed, and it belongs with the other
          things that are set up once and then left alone. */}
      {showBackup ? (
        <section aria-labelledby="backup-heading" className="@container mt-12">
          <SectionHeader
            id="backup-heading"
            icon="inventory"
            tone="neutral"
            title="Backup"
            description="A copy of all your records, to keep safe outside this system."
          />
          <BackupPanel error={backupError} />
        </section>
      ) : null}

      {/* Testing scaffolding. Gone the moment ALLOW_FULL_RESET is removed from
          the server, with no code change - see fullResetAllowed(). */}
      {showReset ? (
        <section aria-labelledby="reset-heading" className="@container mt-12">
          <SectionHeader
            id="reset-heading"
            icon="warning"
            tone="alert"
            title="While testing"
            description="Only here because the server allows a full reset. It goes when that setting does."
          />
          <FullResetPanel />
        </section>
      ) : null}
    </>
  );
}

/**
 * THE PRICE ON THE BOARD OUTSIDE, IN THE APP. The one figure on the page a
 * tired attendant reads at a glance before typing a reading, so it keeps the
 * loudest treatment `fuel-colors.js` has: `solid` filled edge to edge with the
 * `.fuel-band` sheen, and the figure at 4xl to 5xl, bigger than anything else
 * here. A panel now, and its words in sentence case, where they were small
 * capitals.
 *
 * Filling the WHOLE card rather than only a header band is a deliberate
 * departure from "the colour is on the header and border only", and not a
 * contradiction of its reasoning: that rule protects figures being TYPED into a
 * card; there is no typing here, and `solid`'s pairs are the ones measured at
 * 7.6:1 and 10.6:1 for exactly this text on this fill. ONE ELEMENT, rounded and
 * coloured together, because a coloured child clipped inside a rounded parent
 * let a hairline of white show at the corners.
 *
 * A card missing its rate is deliberately NOT fuel-coloured - filling it anyway
 * would show confidence in a number that is not there. It stays dashed and
 * amber, the app's "needs attention" language.
 */
function RateCard({ fuelType, rate }) {
  const label = FUEL_COLORS[fuelType]?.label ?? fuelType;

  if (rate === null) {
    return (
      <div
        data-card
        className="panel flex flex-col justify-center gap-2 border-2 border-dashed border-amber-300 bg-amber-50 px-6 py-5"
      >
        <div className="flex items-center gap-2.5 text-amber-900">
          <Icon name="warning" className="h-5 w-5" />
          <h3 className="text-lg font-bold">{label}</h3>
        </div>
        <p className="text-xl font-semibold text-amber-900">No price set</p>
        <p className="text-base text-amber-900">
          Press <span className="font-semibold">Set a new rate</span> above to add the{' '}
          {`${label.toLowerCase()} price. ${label} readings can't be saved until you do.`}
        </p>
      </div>
    );
  }

  const color = fuelColor(fuelType);

  return (
    <div
      data-card
      className={`panel fuel-band @container flex flex-col gap-3 px-5 py-5 @[24rem]:px-6 ${color.solid}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/25 ring-1 ring-inset ring-black/10"
          aria-hidden="true"
        >
          <Icon name="fuelPump" className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-bold">{label}</h3>
        <span className={`ml-auto text-sm font-semibold ${color.solidMuted}`}>Current rate</span>
      </div>

      {/* Three steps by the card's own width, measured: at 48px from 16rem,
          as it first was, "Rs 283.45 / L" ran out of a 360px phone's card. */}
      <p className="tabular whitespace-nowrap text-3xl font-extrabold @[20rem]:text-4xl @[28rem]:text-5xl">
        {formatRate(rate)}
        <span className={`ml-2 text-lg font-semibold ${color.solidMuted}`}>/ L</span>
      </p>
    </div>
  );
}

/**
 * One dispensing unit as it stands today: its nozzles, the tank each draws
 * from, where each meter started, and the way to record its replacement.
 *
 * Headed by its fuel's QUIET band, as the Dashboard's fuel card is: the unit is
 * only being read here. A unit plumbed to two tanks has no honest single fuel
 * colour, so it wears neutral - the same fallback the Readings unit header
 * makes.
 */
function UnitCard({ unit, tanks, today, readingCount }) {
  const fuels = new Set(unit.nozzles.map((nozzle) => nozzle.tank?.fuel_type));
  const color = fuels.size === 1 ? fuelColor([...fuels][0]) : null;
  const headingId = `unit-${unit.key.replace(/[^a-z0-9]/gi, '-')}`;

  return (
    <article data-card aria-labelledby={headingId} className="panel flex flex-col overflow-hidden">
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 ${
          color ? color.soft : 'bg-ink-100 text-ink-900'
        }`}
      >
        <h3 id={headingId} className="flex items-center gap-2.5 text-lg font-bold">
          {color ? (
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
              style={{ backgroundColor: color.raw }}
              aria-hidden="true"
            />
          ) : null}
          Unit {unit.unitNumber}
        </h3>
        <span className="ml-auto text-base font-semibold">
          {unit.nozzles.length} {unit.nozzles.length === 1 ? 'nozzle' : 'nozzles'}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        <ul className="space-y-1.5">
          {unit.nozzles.map((nozzle) => (
            <li key={nozzle.id} className="text-base text-ink-700">
              <span className="font-semibold text-ink-900">Nozzle {nozzle.nozzle_label}</span>:{' '}
              {nozzle.tank?.name ?? 'no tank'}, meter started at{' '}
              {/* nowrap, because at a phone width this line wraps and the
                  default break put "1,487,293.55" on one line and its "L" on
                  the next - a figure split from its unit. The sentence may
                  wrap; the number may not. */}
              <span className="tabular whitespace-nowrap">
                {formatLitres(nozzle.starting_reading)}
              </span>
              {readingCount(nozzle) === 0 ? (
                <span className="ml-1 inline-flex align-middle">
                  <RemoveNozzleButton nozzle={nozzle} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="caption mt-3">
          {unit.commissionedOn
            ? `Fitted ${formatDate(unit.commissionedOn)}`
            : 'Here since the pump went onto the system'}
        </p>

        <div className="mt-auto pt-4">
          <ReplaceUnitButton unit={unit} tanks={tanks} today={today} />
        </div>
      </div>
    </article>
  );
}
