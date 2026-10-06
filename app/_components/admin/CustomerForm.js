'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createCustomer } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import NumberInput from '@/app/_components/ui/NumberInput';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import Button from '@/app/_components/ui/Button';

const moneyFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});
const showMoney = (n) => `Rs ${moneyFormat.format(n || 0)}`;

/**
 * Adding a customer.
 *
 * A DIALOG ON THE LIST, not a page of its own. Adding a customer is a rare
 * setup act done from the list and finished by looking at the list - the same
 * argument as BankAccountForm and PurchaseForm, see UI_CONVENTIONS. Sending
 * someone to /admin/customers/new and then to the new customer's detail page
 * meant two navigations, each paying the round trip, to end up somewhere that
 * showed nothing except what had just been typed.
 *
 * SIZED TO FIT WITHOUT SCROLLING, and that took the wide dialog plus two
 * columns. A form that arrives already scrolled hides its own Save button.
 * Stacked in the default 32rem width it ran 195px past a 1024x768 laptop once
 * an opening balance was being entered - the three choice cards are tall, and
 * shrinking them would have undone the readability they were added for. Side
 * by side the same content is about 300px, well inside the 90dvh cap.
 *
 * On a phone the dialog is a full-screen sheet and the columns stack, where
 * scrolling a form is ordinary and expected.
 *
 * Almost nobody typed in here is a NEW customer - they came out of a paper
 * register and plenty already owe money, which is why the opening balance is
 * asked for here rather than left to a second trip. The default is "nothing
 * owed", so the ordinary case stays one tap.
 */
export default function CustomerForm() {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createCustomer, null);

  const [direction, setDirection] = useState('');
  const [amount, setAmount] = useState('');

  const typed = Number(amount);
  const hasAmount = Number.isFinite(typed) && typed > 0;
  const opening = hasAmount ? Math.round(typed) : 0;

  function reset() {
    formRef.current?.reset();
    setDirection('');
    setAmount('');
  }

  // Close on success and hand the confirmation to a Toast - the new name is
  // already on the list behind, so the dialog would only be there to dismiss.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      reset();
    }
  }, [state]);

  return (
    <>
      <Button variant="primary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        New customer
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="New customer"
        subtitle={
          <span className="text-sm text-ink-600">
            Someone who takes fuel on credit and settles up later.
          </span>
        }
        size="lg"
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-3 p-5"
        >
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  autoFocus
                  className="input"
                  placeholder="e.g. Bashir Sahib"
                />
              </div>

              {/* Both optional and both short - a row each was two rows of mostly
              empty space in a dialog that needs the height. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="vehicle_number">
                    Vehicle <span className="font-normal text-ink-600">(optional)</span>
                  </label>
                  <input
                    id="vehicle_number"
                    name="vehicle_number"
                    type="text"
                    className="input"
                    placeholder="e.g. LEA-1234"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="phone">
                    Phone <span className="font-normal text-ink-600">(optional)</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    className="input"
                    placeholder="03xx-xxxxxxx"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="credit_limit">
                  Credit limit <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <NumberInput
                  id="credit_limit"
                  name="credit_limit"
                  step="1"
                  min="0"
                  className="input-number"
                  placeholder="0"
                />
                <p className="mt-1 text-sm text-ink-600">
                  Blank for no limit. Going over it flags them on the list, it does not block a
                  sale.
                </p>
              </div>
            </div>

            <fieldset className="border-t border-ink-200 pt-3 sm:border-0 sm:pt-0">
              <legend className="label">Do they already owe anything?</legend>

              <BalanceDirection
                name="opening_direction"
                value={direction}
                onChange={(next) => {
                  setDirection(next);
                  if (next === '') setAmount('');
                }}
                options={[
                  {
                    value: '',
                    title: 'Nothing owed, starting fresh',
                    // "New account" - the blank page a register starts on.
                    urdu: 'نیا کھاتہ',
                    detail: 'The account begins at zero',
                  },
                  {
                    value: 'owes',
                    title: 'They owe the pump',
                    // banam - what the register has always called a debit.
                    urdu: 'بنام',
                    detail: 'A balance carried over from the old register',
                  },
                  {
                    value: 'in_credit',
                    title: 'They have paid ahead',
                    // jama - money of theirs the pump is holding.
                    urdu: 'جمع',
                    detail: 'The pump is holding money of theirs',
                  },
                ]}
              />

              {direction !== '' ? (
                <div className="mt-3">
                  <label className="label" htmlFor="opening_amount">
                    How much
                  </label>
                  <NumberInput
                    id="opening_amount"
                    name="opening_amount"
                    step="1"
                    min="1"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="input-number"
                    placeholder="0"
                  />
                  {/* The same check the manual adjustment makes: state the
                    result, so a misread label is caught by the figure. */}
                  {hasAmount ? (
                    <p className="callout mt-2">
                      {direction === 'owes' ? (
                        <>
                          Starts out owing{' '}
                          <span className="whitespace-nowrap font-bold text-ink-900">
                            {showMoney(opening)}
                          </span>
                          .
                        </>
                      ) : (
                        <>
                          The pump starts out owing them{' '}
                          <span className="whitespace-nowrap font-bold text-ink-900">
                            {showMoney(opening)}
                          </span>
                          .
                        </>
                      )}{' '}
                      <span className="text-ink-600">
                        Goes on their ledger as an opening balance, and like every ledger entry it
                        is permanent.
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-3">
            <SubmitButton className="flex-1"  pendingLabel="Saving…">
              Create customer
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
