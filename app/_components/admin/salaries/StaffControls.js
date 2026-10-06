'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  addStaffMember,
  cancelSalaryPayment,
  paySalary,
  removeStaffMember,
  restoreStaffMember,
  setStaffRate,
} from '@/app/_lib/actions';
import Button from '@/app/_components/ui/Button';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import Dialog from '@/app/_components/ui/Dialog';
import FormMessage from '@/app/_components/ui/FormMessage';
import Icon from '@/app/_components/ui/Icon';
import NumberInput from '@/app/_components/ui/NumberInput';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Toast from '@/app/_components/ui/Toast';
import { formatDate, todayISO } from '@/app/_lib/date-helpers';

/**
 * The owner's buttons on the Salaries page (802): adding a person, changing a
 * daily rate, removing and bringing back, paying a month and cancelling a
 * payment. Each is a dialog or a confirm, the app's usual shapes; every figure
 * in them (what was earned) arrives from Postgres already summed.
 */

/** A dialog form that closes and toasts on success, keeps the error on failure. */
function useDialogAction(action) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [state, formAction] = useActionState(action, null);
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

  return { formRef, isOpen, setIsOpen, notice, setNotice, state, formAction };
}

function Actions({ label, pending, onCancel }) {
  return (
    <div className="flex gap-2 border-t border-ink-200 pt-4">
      <SubmitButton className="flex-1" pendingLabel={pending}>
        {label}
      </SubmitButton>
      <Button variant="secondary" type="button" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export function AddStaffButton() {
  const d = useDialogAction(addStaffMember);

  return (
    <>
      <Button variant="primary" type="button" onClick={() => d.setIsOpen(true)}>
        <span aria-hidden="true">+</span> Add staff
      </Button>
      <Dialog
        open={d.isOpen}
        onClose={() => d.setIsOpen(false)}
        title="Add a member of staff"
        subtitle={
          <span className="text-sm text-ink-600">
            Anyone the pump pays by the day. This is not a login.
          </span>
        }
      >
        <form ref={d.formRef} action={d.formAction} className="space-y-4 p-5">
          <div>
            <label className="label" htmlFor="staff_name">
              Name
            </label>
            <input id="staff_name" name="name" type="text" required autoFocus autoComplete="off" className="input" />
          </div>
          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor="staff_job">
                  Job <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id="staff_job"
                  name="job"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. Pump attendant"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="staff_phone">
                  Phone <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input id="staff_phone" name="phone" type="tel" autoComplete="off" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="staff_rate">
                  Daily rate (Rs)
                </label>
                <NumberInput
                  id="staff_rate"
                  name="daily_rate"
                  step="1"
                  min="1"
                  required
                  className="input-number"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label" htmlFor="staff_from">
                  Started on
                </label>
                <input
                  id="staff_from"
                  name="effective_from"
                  type="date"
                  required
                  defaultValue={todayISO()}
                  className="input"
                />
              </div>
            </div>
          </div>
          <p className="callout">
            A full day is paid this rate and a half day half of it. A raise later is a new rate from a
            date, so the days before it keep the old one.
          </p>
          <FormMessage state={d.state?.ok === false ? d.state : null} />
          <Actions label="Add to the staff list" pending="Adding…" onCancel={() => d.setIsOpen(false)} />
        </form>
      </Dialog>
      <Toast notice={d.notice} onDismiss={() => d.setNotice(null)} />
    </>
  );
}

export function ChangeRateButton({ person, rateLabel }) {
  const d = useDialogAction(setStaffRate);

  return (
    <>
      <Button variant="secondary" type="button" size="small" onClick={() => d.setIsOpen(true)}>
        Change rate
      </Button>
      <Dialog
        open={d.isOpen}
        onClose={() => d.setIsOpen(false)}
        title={`New daily rate for ${person.name}`}
        subtitle={<span className="text-sm text-ink-600">Now {rateLabel} a day</span>}
      >
        <form ref={d.formRef} action={d.formAction} className="space-y-4 p-5">
          <input type="hidden" name="staff_id" value={person.id} />
          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor={`rate_${person.id}`}>
                  New daily rate (Rs)
                </label>
                <NumberInput
                  id={`rate_${person.id}`}
                  name="daily_rate"
                  step="1"
                  min="1"
                  required
                  autoFocus
                  className="input-number"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label" htmlFor={`from_${person.id}`}>
                  From
                </label>
                <input
                  id={`from_${person.id}`}
                  name="effective_from"
                  type="date"
                  required
                  defaultValue={todayISO()}
                  className="input"
                />
              </div>
            </div>
          </div>
          <p className="callout">
            Days from this date on are paid the new rate; days before it keep the old one. A month
            already paid cannot be repriced.
          </p>
          <FormMessage state={d.state?.ok === false ? d.state : null} />
          <Actions label="Save the new rate" pending="Saving…" onCancel={() => d.setIsOpen(false)} />
        </form>
      </Dialog>
      <Toast notice={d.notice} onDismiss={() => d.setNotice(null)} />
    </>
  );
}

export function RemoveStaffButton({ person }) {
  const [state, formAction] = useActionState(removeStaffMember, null);
  return (
    <ConfirmAction
      triggerLabel={`Remove ${person.name}`}
      title={`Remove ${person.name}?`}
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ staff_id: person.id }}
    >
      <p>
        If they never had a day marked, they are simply deleted. Otherwise they leave the register
        and the list, and their attendance and pay stay on record. They can be brought back.
      </p>
    </ConfirmAction>
  );
}

export function RestoreStaffButton({ person }) {
  const [state, formAction] = useActionState(restoreStaffMember, null);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="staff_id" value={person.id} />
      <SubmitButton variant="secondary" size="small" pendingLabel="Bringing back…">
        Bring back
      </SubmitButton>
      {state?.ok === false ? <span className="text-sm text-red-700">{state.message}</span> : null}
    </form>
  );
}

/**
 * Paying one person for one month. The amount starts at what the register
 * earned (from Postgres) and can be changed, for an advance taken off or a
 * bonus; the note says why. The expense lands in the month worked.
 */
export function PaySalaryButton({ row, monthStart, monthEnd, monthLabel, earnedLabel, daysLabel }) {
  const d = useDialogAction(paySalary);
  const today = todayISO();
  const [paidOn, setPaidOn] = useState(today);
  const expenseDate = paidOn && paidOn < monthEnd ? paidOn : monthEnd;

  return (
    <>
      <Button variant="primary" type="button" size="small" onClick={() => d.setIsOpen(true)}>
        <Icon name="salary" className="h-4 w-4" />
        Pay
      </Button>
      <Dialog
        open={d.isOpen}
        onClose={() => d.setIsOpen(false)}
        title={`Pay ${row.name} for ${monthLabel}`}
        subtitle={<span className="text-sm text-ink-600">{daysLabel}</span>}
      >
        <form ref={d.formRef} action={d.formAction} className="space-y-4 p-5">
          <input type="hidden" name="staff_id" value={row.staff_id} />
          <input type="hidden" name="salary_month" value={monthStart} />
          <div className="figure-box">
            <p className="caption">Earned from the register</p>
            <p className="tabular text-2xl font-bold whitespace-nowrap text-ink-900">{earnedLabel}</p>
          </div>
          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor={`pay_${row.staff_id}`}>
                  Amount paid (Rs)
                </label>
                <NumberInput
                  id={`pay_${row.staff_id}`}
                  name="amount"
                  step="1"
                  min="1"
                  required
                  defaultValue={String(Math.round(Number(row.earned)))}
                  className="input-number"
                />
              </div>
              <div>
                <label className="label" htmlFor={`paid_on_${row.staff_id}`}>
                  Date paid
                </label>
                <input
                  id={`paid_on_${row.staff_id}`}
                  name="paid_on"
                  type="date"
                  required
                  min={monthStart}
                  value={paidOn}
                  onChange={(event) => setPaidOn(event.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`pay_note_${row.staff_id}`}>
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={`pay_note_${row.staff_id}`}
              name="note"
              type="text"
              autoComplete="off"
              placeholder="e.g. Advance of Rs 2,000 taken off"
              className="input"
            />
          </div>
          <p className="callout">
            Goes into Expenses as Salaries, dated {formatDate(expenseDate)}, so it comes off{' '}
            {monthLabel}&apos;s profit. The month&apos;s attendance is then closed until the payment is
            cancelled.
          </p>
          <FormMessage state={d.state?.ok === false ? d.state : null} />
          <Actions label="Record the salary" pending="Saving…" onCancel={() => d.setIsOpen(false)} />
        </form>
      </Dialog>
      <Toast notice={d.notice} onDismiss={() => d.setNotice(null)} />
    </>
  );
}

export function CancelPaymentButton({ payment, name, amountLabel }) {
  const [state, formAction] = useActionState(cancelSalaryPayment, null);
  return (
    <ConfirmAction
      triggerIcon="close"
      triggerLabel={`Cancel ${name}'s payment`}
      title="Cancel this salary payment?"
      confirmLabel="Yes, cancel it"
      pendingLabel="Cancelling…"
      action={formAction}
      state={state}
      hidden={{ payment_id: payment.id }}
    >
      <p>
        {amountLabel} to {name} comes out of Expenses, and the month&apos;s attendance can be changed
        again. Pay it again once it is right.
      </p>
    </ConfirmAction>
  );
}
