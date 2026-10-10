'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createTreasuryEntry } from '@/app/_lib/actions';
import {
  TREASURY_IN_CATEGORIES,
  TREASURY_OUT_CATEGORIES,
} from '@/app/_lib/treasury-categories';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import Icon from '@/app/_components/ui/Icon';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import { todayISO } from '@/app/_lib/date-helpers';

// helpers.js reaches into request cookies, so a client component cannot import
// its formatter. Same approach as BankTransactionForm and ReadingForm.
const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const money = (value) => {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : ''}Rs ${moneyFormat.format(Math.abs(n))}`;
};

/**
 * One line of the safe's sheet: cash in, or cash out.
 *
 * BEHIND A DIALOG, AND IT WAS BUILT AS A STANDING FORM FIRST. The case for a
 * standing form is good and it lost to a measurement. This is the thing the
 * page exists for and it is used five or six times a day, so a tap in front of
 * every entry is a real cost - but the sheet has six columns (date, reason,
 * in, out, balance, remove), three of them money that must not wrap, and it
 * needs about 736px. Beside a 22rem form column at the 1152px cap the page
 * carried at the time, the table got 504px, and rendered that way THE BALANCE
 * COLUMN WAS OFF THE RIGHT-HAND EDGE, inside the table's own scroller - the one
 * column this page exists to show, and the DOM check reported no clipping while
 * it happened.
 *
 * The cap has since moved to 1360px for the 1600x900 laptop this is read on,
 * which would leave the table 952px and clear the 736px it needs. The dialog
 * stays anyway: the page still has to work below 1360, where the original
 * measurement is unchanged, and the answer should not depend on how wide the
 * window happens to be.
 * See "Layout: form beside a table" in docs/UI_CONVENTIONS.md, which says
 * exactly this: when the table does not fit the 1fr track, put the form behind
 * a dialog rather than fight the split.
 *
 * It is also the answer Readings arrived at on the app's busiest entry screen,
 * after inline was tried and reverted - so a dialog here is the app's settled
 * pattern rather than a consolation.
 *
 * THE CATEGORY IS A `<select>`, NOT THE ICON TILES Company Assets uses, and
 * that is the convention rather than an exception to it: tiles are right when
 * every option has an obvious symbol, and "Cash of shift closing", "Entry" and
 * "Money returned" have none. Drawn as tiles they would be five identical
 * boxes with a generic glyph in each. The hint line under the select does the
 * work an icon would have done.
 *
 * WHAT THE SAFE HOLDS IS ON SCREEN WHILE THE AMOUNT IS TYPED, and the form
 * says so before the database has to. A cash-out larger than the safe holds is
 * refused by a trigger in Postgres with a message naming the line it breaks on
 * (migration 044) - that is the rule. This is the courtesy: the owner should
 * find out he is about to type Rs 50,000 out of a safe holding Rs 8,364 while
 * he is looking at the amount box, not after pressing Save.
 */
export default function TreasuryEntryForm({ balance, trigger = 'header', linkDeposits = false }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('in');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(TREASURY_IN_CATEGORIES[1].value);

  const [notice, setNotice] = useState(null);
  const [state, formAction] = useActionState(createTreasuryEntry, null);

  /*
   * Close on success and carry the confirmation out as a toast, the same as
   * BankAccountForm - leaving the dialog up makes the owner dismiss a box
   * whose only news is that it worked, with the new line already on the page
   * behind it. A failure keeps the dialog open with what was typed still in
   * it, which is the whole reason this is not a fire-and-forget submit.
   *
   * `handled` is what makes this fire once: useActionState hands back the same
   * state object until the next submission, so an unrelated re-render would
   * otherwise re-close a dialog the owner had just reopened.
   */
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setDirection('in');
      setAmount('');
      setCategory(TREASURY_IN_CATEGORIES[1].value);
    }
  }, [state]);

  const isIn = direction === 'in';
  // With a bank account on file, cash going to the bank is the Deposit to bank
  // action (805), which also puts it into the account, so it is not offered
  // here as a hand-typed entry with no bank half.
  const categories = isIn
    ? TREASURY_IN_CATEGORIES
    : TREASURY_OUT_CATEGORIES.filter((item) => !(linkDeposits && item.value === 'bank_deposit'));
  const chosen = categories.find((item) => item.value === category) ?? categories[0];

  const held = Number(balance ?? 0);
  const amountNumber = Number(amount);
  const hasAmount = amount !== '' && Number.isFinite(amountNumber) && amountNumber > 0;
  const short = !isIn && hasAmount ? amountNumber - held : 0;
  const blocked = short > 0;

  /*
   * Switching direction changes which list the category comes from, so the one
   * that was chosen may not exist any more - 'shift_closing' is not something
   * cash can leave by. Reset to the direction's most common reason rather than
   * to its first: "Entry" for money in (three quarters of the sheet's cash-in
   * lines), "Given to someone" for money out.
   */
  function switchDirection(next) {
    setDirection(next);
    setCategory(
      next === 'in' ? TREASURY_IN_CATEGORIES[1].value : TREASURY_OUT_CATEGORIES[0].value,
    );
  }

  return (
    <>
      <Button
        variant={trigger === 'header' ? 'primary' : 'secondary'}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Icon name="treasury" className="h-5 w-5" />
        Record cash
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Record cash"
        subtitle={
          <span className="text-sm text-ink-600">
            One line of the safe&rsquo;s sheet: money in, or money out
          </span>
        }
      >
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="direction" value={direction} />

          {/* Two big targets rather than a dropdown: this is the choice that
              matters most and the one a thumb on a tablet gets wrong most
              easily. Same control, same reasoning, as the Banking form. */}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
            <button
              type="button"
              onClick={() => switchDirection('in')}
              aria-pressed={isIn}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3
                          text-base font-semibold transition ${
                            isIn
                              ? 'border-brand-600 bg-brand-50 text-brand-800'
                              : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
                          }`}
            >
              <Icon name="moneyIn" className="h-5 w-5" />
              Cash in
            </button>
            <button
              type="button"
              onClick={() => switchDirection('out')}
              aria-pressed={!isIn}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3
                          text-base font-semibold transition ${
                            !isIn
                              ? 'border-amber-500 bg-amber-50 text-amber-900'
                              : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
                          }`}
            >
              <Icon name="moneyOut" className="h-5 w-5" />
              Cash out
            </button>
          </div>

          <p className="text-sm text-ink-600">
            {isIn
              ? 'Notes going into the safe.'
              : 'Notes coming out of the safe: given, banked, or spent.'}
          </p>

          {/* The dialog has room the 22rem column did not, so the amount and
              the date share a line above 32rem rather than stacking. Measured
              against the dialog with @container, not the window: this sheet is
              full-screen on a phone and 32rem on a laptop, and neither number
              is the viewport's. */}
          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor="treasury_amount">
                  Amount
                </label>
                <NumberInput
                  id="treasury_amount"
                  name="amount"
                  step="1"
                  min="1"
                  required
                  autoFocus
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={blocked}
                  className={`input-number ${
                    blocked ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                  }`}
                  placeholder="0"
                />
                {/* What the safe holds, always - not only once something is
                    wrong. It is the figure the amount is being judged against,
                    so it belongs beside the box rather than only in a tile at
                    the top of the page behind the dialog. */}
                <p className="mt-1 text-sm text-ink-600">
                  The safe holds{' '}
                  <span className="tabular whitespace-nowrap font-semibold text-ink-800">
                    {money(held)}
                  </span>
                </p>
              </div>

              <div>
                <label className="label" htmlFor="treasury_date">
                  Date
                </label>
                <input
                  id="treasury_date"
                  name="entry_date"
                  type="date"
                  required
                  defaultValue={todayISO()}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Only once the amount is actually more than there is. Warning
              before then would be a warning about a problem nobody has. */}
          {blocked ? (
            <p className="callout-danger">
              <span className="font-semibold">{money(short)} more than the safe has.</span> Cash
              cannot be paid out of a safe that does not have it. Record the money that came in
              first, or lower the amount.
            </p>
          ) : null}

          <div>
            <label className="label" htmlFor="treasury_category">
              What for
            </label>
            <select
              id="treasury_category"
              name="category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="input"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            {/* The sentence a tile's icon would have carried. It changes with
                the choice, so the reader can check they picked the one they
                meant without knowing the list by heart. */}
            <p className="mt-1 text-sm text-ink-600">{chosen?.hint}</p>
            {!isIn && linkDeposits ? (
              <p className="mt-1 text-sm text-ink-600">
                Taking cash to the bank? Use <span className="font-semibold">Deposit to bank</span>{' '}
                instead, so it goes into the account as well.
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="treasury_details">
              Details <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id="treasury_details"
              name="details"
              type="text"
              className="input"
              placeholder={isIn ? 'e.g. brought by the manager' : 'e.g. paid to the supplier by the manager'}
            />
            <p className="mt-1 text-sm text-ink-600">
              Whatever you would write in the sheet: who took it, which account, which code.
            </p>
          </div>

          {/* A failure stays where it happened, until it is dealt with. A
              success leaves as a toast with the dialog. */}
          <FormMessage state={state?.ok === false ? state : null} />

          <SubmitButton
            disabled={blocked}
            fullWidth
            variant={blocked ? 'danger' : isIn ? 'primary' : 'secondary'}
          >
            {blocked ? `${money(short)} short` : isIn ? 'Record cash in' : 'Record cash out'}
          </SubmitButton>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
