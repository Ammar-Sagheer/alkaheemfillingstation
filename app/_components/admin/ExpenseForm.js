'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createExpense } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

/*
 * The starting suggestions, for a pump that has not recorded anything yet.
 * Once it has, `used` (the categories actually typed, most-used first) goes in
 * front of these - see getExpenseCategories.
 */
const COMMON_CATEGORIES = [
  'Salaries',
  'Electricity',
  'Rent',
  'Maintenance',
  'Transport',
  'Tax',
  'Other',
];

/**
 * One button, one dialog, one kind of row.
 *
 * This used to be a single form with a Paid out/Recovered toggle inside it -
 * one button, a switch to flip before typing the amount. Two buttons instead:
 * `kind` is fixed for the lifetime of one dialog, so there is nothing to
 * switch and nothing that can be typed against the wrong choice and caught
 * only at submit. `Add expense` and `Add recovery` are two small, identical
 * forms rather than one form with a mode.
 *
 * Rendered twice from the page, once per `kind` - see app/admin/expenses/page.js.
 * `kind="recovered"` is the reimbursement pattern from
 * 053_expense_recovery_rows.sql: a bill the pump already paid, coming back a
 * little at a time, stored as a negative amount in the same table and same
 * category. The amount typed is always a positive magnitude - this never asks
 * anyone to type a minus sign, which a tablet's on-screen keypad usually has
 * no key for - and the sign is applied once, right before `createExpense`
 * runs.
 */
export default function ExpenseForm({ used = [], kind, defaultDate }) {
  const isRecovered = kind === 'recovered';

  /*
   * Own categories first, then the stock ones that have not been used yet.
   * A free-text box with no memory is how this pump ended up with most of its
   * spending under "Other" and one category reading "salary of haseeb and pump
   * tea and lunch" - every entry invented its own wording, and the breakdown
   * that reads them was worth correspondingly little.
   */
  const suggestions = [
    ...used,
    ...COMMON_CATEGORIES.filter(
      (category) => !used.some((u) => u.toLowerCase() === category.toLowerCase()),
    ),
  ];

  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const [state, formAction] = useActionState(async (prevState, formData) => {
    if (isRecovered) {
      const typed = Number(formData.get('amount'));
      if (Number.isFinite(typed) && typed > 0) formData.set('amount', String(-typed));
    }

    return createExpense(prevState, formData);
  }, null);

  /*
   * Close on success and carry the confirmation out as a toast - leaving the
   * dialog up would make the owner dismiss a box whose only news is that it
   * worked, with the new row already on the page behind it. `handled` is
   * what makes this fire once: useActionState hands back the same state
   * object until the next submission, so an unrelated re-render must not
   * re-close a dialog just reopened.
   */
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

  // The day on screen where there is one (the Readings page can be on yesterday).
  const today = defaultDate ?? todayISO();
  // Two instances of this form are mounted on the page at once (one per
  // kind), so every id needs to stay unique between them.
  const idFor = (field) => `${kind}_${field}`;

  return (
    <>
      <Button
        variant={isRecovered ? 'secondary' : 'primary'}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Icon name={isRecovered ? 'moneyIn' : 'moneyOut'} className="h-4 w-4" />
        {isRecovered ? 'Add recovery' : 'Add expense'}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={isRecovered ? 'Add a recovery' : 'Add an expense'}
        subtitle={
          <span className="text-sm text-ink-600">
            {isRecovered
              ? 'Money paid back against a bill already recorded, such as a neighbour repaying his share of the electricity'
              : 'Money the pump paid out: salaries, electricity, rent, repairs'}
          </span>
        }
      >
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <div>
            <label className="label" htmlFor={idFor('category')}>
              Category
            </label>
            <input
              id={idFor('category')}
              name="category"
              type="text"
              required
              autoFocus
              list={idFor('categories')}
              className="input"
              placeholder="e.g. Salaries"
              autoComplete="off"
            />
            <datalist id={idFor('categories')}>
              {suggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {isRecovered ? (
              <p className="mt-1 text-sm text-ink-600">
                The same category the original bill was recorded under (“Electricity”, say), so it
                nets against it in the breakdown.
              </p>
            ) : null}
          </div>

          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor={idFor('amount')}>
                  {isRecovered ? 'Amount recovered' : 'Amount'}
                </label>
                <NumberInput
                  id={idFor('amount')}
                  name="amount"
                  step="0.01"
                  min="0.01"
                  required
                  className="input-number"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="label" htmlFor={idFor('date')}>
                  Date
                </label>
                <input
                  id={idFor('date')}
                  name="expense_date"
                  type="date"
                  required
                  defaultValue={today}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="label" htmlFor={idFor('note')}>
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={idFor('note')}
              name="note"
              type="text"
              className="input"
              placeholder={isRecovered ? 'e.g. Ali (neighbour), his share' : ''}
            />
          </div>

          {/* A failure stays where it happened, until it is dealt with. A
              success leaves as a toast with the dialog. */}
          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              Save {isRecovered ? 'recovery' : 'expense'}
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
