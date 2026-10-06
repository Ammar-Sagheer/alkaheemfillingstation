'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createBankAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';

/**
 * Adds a bank account, behind a dialog.
 *
 * It used to sit open on the page under the transaction form, which got the
 * emphasis backwards: accounts are added twice and then never again, while
 * money in and out is recorded every week. A permanent four-field form for the
 * rare job crowded out the daily one and made the page look like data entry
 * rather than a summary.
 *
 * As a dialog it is one button until it is wanted, and when it is wanted it has
 * the screen to itself - which also gives the opening balance room to explain
 * itself, the field most likely to be got wrong.
 *
 * The opening balance is the one that matters: an account added here has
 * usually been open for years, so starting its running balance at zero would
 * make every figure on the page wrong by whatever was already in it.
 */
export default function BankAccountForm({ trigger = 'header' }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  // A result belongs to the submission that produced it; opening the dialog
  // again starts clean rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createBankAccount, null);

  // Close once it has gone through, and carry the confirmation out with it.
  // Leaving the dialog up would make the owner dismiss a box that is only
  // telling him it worked, with the new account already on the page behind.
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

  const isHeader = trigger === 'header';

  return (
    <>
      <Button
        variant={isHeader ? 'secondary' : 'primary'}
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Add account
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add a bank account"
        subtitle={
          <span className="text-sm text-ink-600">
            One of the accounts the pump&rsquo;s money passes through
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="bank_name">
                Bank
              </label>
              <input
                id="bank_name"
                name="bank_name"
                type="text"
                required
                autoFocus
                className="input"
                placeholder="e.g. Meezan Bank"
              />
            </div>

            <div>
              <label className="label" htmlFor="account_label">
                Short name
              </label>
              <input
                id="account_label"
                name="account_label"
                type="text"
                required
                className="input"
                placeholder="e.g. Main account"
              />
            </div>
          </div>
          <p className="-mt-2 text-sm text-ink-600">
            The short name is what you call it, so two accounts at the same bank stay apart. It is
            what shows on the cards and in the month&rsquo;s report.
          </p>

          <div>
            <label className="label" htmlFor="account_number">
              Account number <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id="account_number"
              name="account_number"
              type="text"
              className="input"
              placeholder="Last few digits are enough"
            />
          </div>

          {/* Set apart, because it is the field that decides whether every
              balance on the page is right. */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <label className="label" htmlFor="opening_balance">
              What is in it right now
            </label>
            <NumberInput
              id="opening_balance"
              name="opening_balance"
              step="0.01"
              defaultValue="0"
              className="input-number"
            />
            <p className="mt-2 text-sm text-amber-900">
              The balance <span className="font-semibold">before</span> anything is recorded here.
              Everything entered from now on moves up or down from this figure. Leave it at 0 on
              an account that already holds money, and every total on this page is short by that
              much.
            </p>
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Adding…">
              Add account
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
