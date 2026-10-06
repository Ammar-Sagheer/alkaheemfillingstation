import FuelBadge from '@/app/_components/ui/FuelBadge';
import DeleteFuelPriceButton from '@/app/_components/admin/DeleteFuelPriceButton';
import { formatRate } from '@/app/_lib/format-helpers';
import { formatDate } from '@/app/_lib/date-helpers';

/**
 * The rate history as a table, shared by the panel on Settings and the full
 * history page.
 *
 * One component rather than two copies: the rows carry a delete button whose
 * confirmation text has to name the rate and the date exactly, and that
 * sentence drifting between the two places is how someone ends up removing a
 * rate they meant to keep.
 */
export default function FuelPriceTable({ prices }) {
  /*
   * `max-h-none` cancels table-scroll's 70vh height cap, deliberately. Both
   * callers are short by construction - Settings previews five or six rows,
   * the history pages eight - so the cap could only ever fire on a short
   * window, and when it did the card grew a scrollbar of its own inside a page
   * that already scrolls. The sticky heading goes with it and is no loss:
   * nothing scrolls underneath a heading you can see all of.
   *
   * The overflow itself stays, because it is what lets the table run past the
   * screen sideways on a phone instead of squeezing the rate column. In the new
   * look it sits in a `.panel` of its own with 20px edges.
   */
  return (
    <div data-card className="panel overflow-hidden">
      <div className="table-scroll mx-0 max-h-none px-0">
        <table className="w-full min-w-[26rem]">
          <thead>
            <tr>
              <th className="th pl-5">Fuel</th>
              <th className="th">In force from</th>
              <th className="th text-right">Rate</th>
              <th className="th pr-5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {prices.map((price) => (
              <tr key={price.id}>
                <td className="td pl-5">
                  <FuelBadge fuelType={price.fuel_type} />
                </td>
                <td className="td whitespace-nowrap">{formatDate(price.effective_from)}</td>
                <td className="td-num font-semibold text-ink-900">{formatRate(price.rate)}</td>
                <td className="td pr-5 text-right">
                  <DeleteFuelPriceButton
                    priceId={price.id}
                    summary={`the ${price.fuel_type} rate of ${formatRate(price.rate)} from ${formatDate(price.effective_from)}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
