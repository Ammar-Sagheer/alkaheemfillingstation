'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { addNozzle, addTank, removeNozzle, removeTank } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Toast from '@/app/_components/ui/Toast';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * The owner sets up his own forecourt (Al Hakeem only - migration 800): add a
 * tank, add a nozzle, and remove either while it has never been used. The
 * database does every check; these forms only ask in the order a person
 * thinks of it, and say what comes next.
 *
 * Same shape as TankForm: a button opens a dialog, a save closes it with a
 * toast. The form remounts after each save (formKey), so the next tank or
 * nozzle starts from blank rather than from the last one's figures.
 */

function useSaved(state, onSaved) {
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) onSaved(state);
  }, [state, onSaved]);
}

export function AddTankButton({ today, label = 'Add a tank', variant = 'primary' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState(addTank, null);

  useSaved(state, (saved) => {
    setIsOpen(false);
    setNotice({ message: saved.message });
    setFormKey((key) => key + 1);
  });

  return (
    <>
      <Button variant={variant} type="button" onClick={() => setIsOpen(true)}>
        {label}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add a tank"
        subtitle={<span className="text-sm text-ink-600">One for each tank in the ground</span>}
      >
        <form key={formKey} action={formAction} className="space-y-4 p-5">
          <div>
            <label className="label" htmlFor="new-tank-name">
              Name
            </label>
            <input
              id="new-tank-name"
              name="name"
              type="text"
              required
              autoFocus
              autoComplete="off"
              placeholder="e.g. Diesel Tank 2"
              className="input"
            />
          </div>

          <fieldset>
            <legend className="label">Fuel</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['petrol', 'Petrol'],
                ['diesel', 'Diesel'],
              ].map(([value, text]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-300 px-3.5 py-2.5 text-base font-semibold text-ink-900 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                >
                  <input type="radio" name="fuel_type" value={value} required className="h-4 w-4" />
                  {text}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="new-tank-capacity">
              Size (litres it holds)
            </label>
            <NumberInput
              id="new-tank-capacity"
              name="capacity_litres"
              step="0.01"
              min="1"
              required
              className="input-number"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-tank-opening">
                Fuel in it now (litres)
              </label>
              <NumberInput
                id="new-tank-opening"
                name="opening_stock_litres"
                step="0.01"
                min="0"
                defaultValue="0"
                className="input-number"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-tank-date">
                As of
              </label>
              <input
                id="new-tank-date"
                name="opening_stock_date"
                type="date"
                required
                defaultValue={today}
                className="input"
              />
            </div>
          </div>
          <p className="text-sm text-ink-700">
            The fuel in it now is your dip, turned into litres with the tank chart. Every gain and
            loss is measured from this figure.
          </p>

          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Adding…">
              Add tank
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

export function AddNozzleButton({
  tanks,
  nextUnit = 1,
  trading = false,
  today,
  label = 'Add a nozzle',
  variant = 'primary',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState(addNozzle, null);

  useSaved(state, (saved) => {
    setIsOpen(false);
    setNotice({ message: saved.message });
    setFormKey((key) => key + 1);
  });

  const noTanks = tanks.length === 0;

  return (
    <>
      <Button variant={variant} type="button" onClick={() => setIsOpen(true)}>
        {label}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add a nozzle"
        subtitle={<span className="text-sm text-ink-600">One for each nozzle on the forecourt</span>}
      >
        {noTanks ? (
          <div className="space-y-4 p-5">
            <p className="callout">
              Add a tank first. Every nozzle draws from a tank, so there has to be one to choose.
            </p>
            <div className="flex justify-end border-t border-ink-200 pt-4">
              <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form key={formKey} action={formAction} className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="new-nozzle-unit">
                  Unit (dispenser)
                </label>
                <NumberInput
                  id="new-nozzle-unit"
                  name="unit_number"
                  step="1"
                  min="1"
                  required
                  autoFocus
                  defaultValue={String(nextUnit)}
                  className="input-number"
                />
              </div>
              <div>
                <label className="label" htmlFor="new-nozzle-label">
                  Nozzle name
                </label>
                <input
                  id="new-nozzle-label"
                  name="nozzle_label"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="e.g. 1 or A"
                  className="input"
                />
              </div>
            </div>
            <p className="text-sm text-ink-700">
              Two nozzles on one dispenser share a unit number. Readings show them as
              &ldquo;Unit 1 · Nozzle A&rdquo;.
            </p>

            <div>
              <label className="label" htmlFor="new-nozzle-tank">
                Draws from
              </label>
              <select id="new-nozzle-tank" name="tank_id" required defaultValue="" className="input">
                <option value="" disabled>
                  Choose a tank
                </option>
                {tanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.name} ({tank.fuel_type === 'petrol' ? 'Petrol' : 'Diesel'})
                  </option>
                ))}
              </select>
            </div>

            <div className={trading ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className="label" htmlFor="new-nozzle-meter">
                  Meter reading now
                </label>
                <NumberInput
                  id="new-nozzle-meter"
                  name="starting_reading"
                  step="0.01"
                  min="0"
                  required
                  className="input-number"
                />
              </div>
              {trading ? (
                <div>
                  <label className="label" htmlFor="new-nozzle-first-day">
                    First day in use
                  </label>
                  <input
                    id="new-nozzle-first-day"
                    name="first_day"
                    type="date"
                    required
                    defaultValue={today}
                    className="input"
                  />
                </div>
              ) : null}
            </div>
            <p className="text-sm text-ink-700">
              Read the meter off the machine. It is the opening figure for this nozzle&rsquo;s first
              day of readings.
            </p>

            <FormMessage state={state?.ok === false ? state : null} />

            <div className="flex gap-2 border-t border-ink-200 pt-4">
              <SubmitButton className="flex-1" pendingLabel="Adding…">
                Add nozzle
              </SubmitButton>
              <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

export function RemoveTankButton({ tank }) {
  const [state, formAction] = useActionState(removeTank, null);
  return (
    <ConfirmAction
      triggerLabel={`Remove ${tank.name}`}
      title={`Remove ${tank.name}?`}
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ tank_id: tank.id }}
    >
      <p>
        <span className="font-semibold text-ink-900">{tank.name}</span> has never had a delivery, a
        dip or a nozzle, so it can go. Once it has been used it stays in the books for good.
      </p>
    </ConfirmAction>
  );
}

export function RemoveNozzleButton({ nozzle }) {
  const [state, formAction] = useActionState(removeNozzle, null);
  const name = `Unit ${nozzle.unit_number}, nozzle ${nozzle.nozzle_label}`;
  return (
    <ConfirmAction
      triggerLabel={`Remove ${name}`}
      title={`Remove ${name}?`}
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ nozzle_id: nozzle.id }}
    >
      <p>
        <span className="font-semibold text-ink-900">{name}</span> has no readings yet, so it can go.
        Once a day has been entered against it, it stays: a nozzle no longer used is replaced with
        its unit instead.
      </p>
    </ConfirmAction>
  );
}
