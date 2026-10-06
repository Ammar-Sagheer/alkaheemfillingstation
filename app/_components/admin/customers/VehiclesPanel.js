'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  addCustomerVehicle,
  removeCustomerVehicle,
  restoreCustomerVehicle,
} from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const rupeeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * A customer's vehicles (801, Al Hakeem first): one account, many vehicles,
 * one balance. The list, with what each vehicle has taken on credit, a box to
 * add one, and the owner's remove / bring back.
 *
 * `totals` come from get_customer_vehicle_totals(), formatted here because
 * this is a client component; every figure in them was summed in Postgres.
 * A line with no vehicle_id is "slips that named no vehicle".
 */
export default function VehiclesPanel({ customerId, vehicles, totals, isOwner }) {
  const [addState, addAction] = useActionState(addCustomerVehicle, null);
  const [notice, setNotice] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const handled = useRef(addState);

  useEffect(() => {
    if (addState === handled.current) return;
    handled.current = addState;
    if (addState?.ok) {
      setNotice({ message: addState.message });
      setFormKey((key) => key + 1);
    }
  }, [addState]);

  const byId = Object.fromEntries((totals ?? []).map((row) => [row.vehicle_id ?? 'none', row]));
  const active = vehicles.filter((vehicle) => vehicle.is_active);
  const retired = vehicles.filter((vehicle) => !vehicle.is_active);
  const unnamed = byId.none;

  return (
    <div data-card className="panel overflow-hidden">
      <form key={formKey} action={addAction} className="flex flex-wrap items-end gap-2 border-b border-ink-200 p-4">
        <input type="hidden" name="customer_id" value={customerId} />
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="new-vehicle-number">
            Add a vehicle
          </label>
          <input
            id="new-vehicle-number"
            name="vehicle_number"
            type="text"
            required
            autoComplete="off"
            placeholder="e.g. LES-4471"
            className="input"
          />
        </div>
        <SubmitButton pendingLabel="Adding…">Add vehicle</SubmitButton>
        <div className="basis-full">
          <FormMessage state={addState?.ok === false ? addState : null} />
        </div>
      </form>

      {vehicles.length === 0 && !unnamed ? (
        <p className="p-5 text-base text-ink-700">
          No vehicles yet. Add each one this customer fills up, and every slip can say which vehicle
          took the fuel. The account stays one account, with one balance.
        </p>
      ) : (
        <div className="table-scroll mx-0 max-h-none px-0">
          <table className="w-full min-w-[30rem]">
            <thead>
              <tr>
                <th className="th pl-5">Vehicle</th>
                <th className="th text-right">Slips</th>
                <th className="th text-right">Fuel</th>
                <th className="th text-right">Fuel Rs</th>
                <th className={`th text-right ${isOwner ? '' : 'pr-5'}`}>Oil Rs</th>
                {isOwner ? <th className="th pr-5"><span className="sr-only">Remove</span></th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {[...active, ...retired].map((vehicle) => (
                <VehicleRow
                  key={vehicle.id}
                  vehicle={vehicle}
                  total={byId[vehicle.id]}
                  customerId={customerId}
                  isOwner={isOwner}
                />
              ))}
              {unnamed ? (
                <tr className="text-ink-700">
                  <td className="td pl-5 italic">No vehicle named</td>
                  <Figures total={unnamed} isOwner={isOwner} />
                  {isOwner ? <td className="td pr-5" /> : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <p className="caption border-t border-ink-200 px-5 py-3">
        All time, from the credit slips and oil sold on credit. Payments come off the account as a
        whole.
      </p>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

function Figures({ total, isOwner }) {
  return (
    <>
      <td className="td tabular text-right">{total ? total.slips : 0}</td>
      <td className="td tabular whitespace-nowrap text-right">
        {litreFormat.format(Number(total?.fuel_litres ?? 0))} L
      </td>
      <td className="td tabular whitespace-nowrap text-right">
        {rupeeFormat.format(Number(total?.fuel_amount ?? 0))}
      </td>
      <td className={`td tabular whitespace-nowrap text-right ${isOwner ? '' : 'pr-5'}`}>
        {rupeeFormat.format(Number(total?.lubricant_amount ?? 0))}
      </td>
    </>
  );
}

function VehicleRow({ vehicle, total, customerId, isOwner }) {
  const [removeState, removeAction] = useActionState(removeCustomerVehicle, null);
  const [restoreState, restoreAction] = useActionState(restoreCustomerVehicle, null);
  const used = Number(total?.slips ?? 0) > 0;

  return (
    <tr className={vehicle.is_active ? undefined : 'bg-ink-50/60 text-ink-600'}>
      <td className="td whitespace-nowrap pl-5 font-semibold text-ink-900">
        {vehicle.vehicle_number}
        {vehicle.is_active ? null : (
          <span className="badge ml-2 bg-ink-100 font-normal text-ink-700">Removed</span>
        )}
      </td>
      <Figures total={total} isOwner={isOwner} />
      {isOwner ? (
        <td className="td whitespace-nowrap pr-5 text-right">
          {vehicle.is_active ? (
            <ConfirmAction
              triggerLabel={`Remove ${vehicle.vehicle_number}`}
              title={`Remove ${vehicle.vehicle_number}?`}
              confirmLabel="Yes, remove"
              pendingLabel="Removing…"
              action={removeAction}
              state={removeState}
              hidden={{ vehicle_id: vehicle.id, customer_id: customerId }}
            >
              <p>
                {used
                  ? `Its ${total.slips} old ${total.slips === 1 ? 'slip stays' : 'slips stay'} on the ledger under its number; it takes no new ones. It can be brought back.`
                  : 'It has no slips, so it is simply taken off the list.'}
              </p>
            </ConfirmAction>
          ) : (
            <form action={restoreAction} className="inline">
              <input type="hidden" name="vehicle_id" value={vehicle.id} />
              <input type="hidden" name="customer_id" value={customerId} />
              <SubmitButton variant="secondary" size="small" pendingLabel="Bringing back…">
                Bring back
              </SubmitButton>
              {restoreState?.ok === false ? (
                <span className="ml-2 text-sm text-red-700">{restoreState.message}</span>
              ) : null}
            </form>
          )}
        </td>
      ) : null}
    </tr>
  );
}
