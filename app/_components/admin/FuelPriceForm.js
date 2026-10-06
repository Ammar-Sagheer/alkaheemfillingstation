'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { setFuelPrice } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import { todayISO } from '@/app/_lib/date-helpers';
import { formatRate } from '@/app/_lib/format-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

/**
 * Sets a new rate, behind a dialog.
 *
 * Used to stand open beside the two rate cards - a permanent three-field form
 * for something changed at most once or twice a day. Same trade
 * `BankAccountForm` and `ExpenseForm` already made: one button until it is
 * wanted, and the cards it used to crowd get the width back, which is what
 * lets them read as the headline rather than a caption beside a form.
 */
export default function FuelPriceForm({ currentRates }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const [state, formAction] = useActionState(setFuelPrice, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
    }
  }, [state]);

  const today = todayISO();

  return (
    <>
      <Button variant="primary" type="button" onClick={() => setIsOpen(true)}>
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Set a new rate
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Set a new rate"
        subtitle={
          <span className="text-sm text-ink-600">
            A rate dated back to a day already entered re-prices that day
          </span>
        }
      >
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <div>
            <label className="label" htmlFor="fuel_type">
              Fuel
            </label>
            <select id="fuel_type" name="fuel_type" required autoFocus defaultValue="" className="input">
              <option value="" disabled>
                Choose…
              </option>
              {/* Diesel first, as everywhere (FUEL_ORDER), and each current
                  rate to the paisa: "Rs 283.4" read as a different price. */}
              <option value="diesel">
                Diesel {currentRates.diesel ? `(now ${formatRate(currentRates.diesel)})` : ''}
              </option>
              <option value="petrol">
                Petrol {currentRates.petrol ? `(now ${formatRate(currentRates.petrol)})` : ''}
              </option>
            </select>
          </div>

          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor="rate">
                  Rate per litre
                </label>
                <NumberInput
                  id="rate"
                  name="rate"
                  step="0.01"
                  min="0.01"
                  required
                  className="input-number"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="label" htmlFor="effective_from">
                  In force from
                </label>
                <input
                  id="effective_from"
                  name="effective_from"
                  type="date"
                  required
                  defaultValue={today}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Says BEFORE saving what a backdated rate does, since it now
              changes figures already in the books (migration 066). The answer
              after saving names the days and the amounts. */}
          <p className="callout">
            Sales from the date above use this price. If readings are already saved from that
            date, until the next rate you have set, they are re-priced to it, and you are told
            which days changed.
          </p>

          {/* A failure stays where it happened, until it is dealt with. A
              success leaves as a toast with the dialog. */}
          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              Save rate
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
