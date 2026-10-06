'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { recordSupplierPayment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import NumberInput from '@/app/_components/ui/NumberInput';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import { todayISO } from '@/app/_lib/date-helpers';

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
// A no-break space, so "Rs" can never end a line with its figure on the next:
// a figure split from its unit reads for a moment as two figures.
const rs = (value) => `Rs\u00a0${moneyFormat.format(Number(value) || 0)}`;

/**
 * Paying a supplier: how much, when, and where the money came from.
 *
 * WHERE FROM IS THE QUESTION THAT MATTERS, because the answer moves money on
 * another page. Cash comes out of the safe (a Treasury entry under "supplier");
 * a transfer comes out of a bank account (a payment on Banking). The database
 * does both halves in one transaction (067), so this form never has to be
 * followed by the same payment typed a second time somewhere else.
 *
 * Two cards rather than a dropdown, the app's pattern for "a choice that
 * decides what happens" (BalanceDirection), and each one says what it holds:
 * the safe's cash, each account's balance. A payment larger than either is
 * refused by the database in words; showing the figure first saves the trip.
 */
export default function SupplierPaymentForm({ supplierId, balance, bankAccounts = [], safeBalance }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [paidFrom, setPaidFrom] = useState('cash');
  const [state, formAction] = useActionState(recordSupplierPayment, null);
  const mainAccount = bankAccounts.find((account) => account.is_main) ?? bankAccounts[0];
  const [accountId, setAccountId] = useState(mainAccount?.id ?? '');
  const chosenAccount = bankAccounts.find((account) => account.id === accountId);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      formRef.current?.reset();
      setPaidFrom('cash');
      setAccountId(mainAccount?.id ?? '');
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state, mainAccount?.id]);

  const owed = Number(balance) > 0 ? Number(balance) : 0;

  return (
    <>
      <Button
        variant="primary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        Record a payment
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Pay this supplier"
        subtitle={
          <span className="text-sm text-ink-600">
            {owed > 0 ? (
              <>
                Settling in full would be{' '}
                <span className="tabular whitespace-nowrap font-semibold text-ink-800">{rs(owed)}</span>
              </>
            ) : (
              'Nothing is owed to this supplier right now'
            )}
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
          <input type="hidden" name="supplier_id" value={supplierId} />

          <div>
            <span className="label">Paid from</span>
            <BalanceDirection
              name="paid_from"
              value={paidFrom}
              onChange={setPaidFrom}
              options={[
                {
                  value: 'cash',
                  title: 'Cash from the safe',
                  urdu: 'نقد',
                  detail:
                    safeBalance === null || safeBalance === undefined
                      ? 'Taken out of the safe on Treasury.'
                      : `The safe holds ${rs(safeBalance)}. Taken out on Treasury.`,
                },
                {
                  value: 'bank',
                  title: 'Bank transfer',
                  urdu: 'بینک',
                  detail:
                    bankAccounts.length === 0
                      ? 'No bank account is set up yet. Add one under Banking first.'
                      : 'Taken off the account you choose, on Banking.',
                },
              ]}
            />
          </div>

          {paidFrom === 'bank' && bankAccounts.length > 0 ? (
            <div>
              <label className="label" htmlFor={`bank-${supplierId}`}>
                Bank account
              </label>
              {/* The balance is UNDER the select, not in each option: at a
                  phone's width a native select cuts its text off, and it cut
                  the balance to "holds Rs 1,740," - a figure with its end
                  missing. Under it, it is whole. */}
              <select
                id={`bank-${supplierId}`}
                name="bank_account_id"
                required
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="input"
              >
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bank_name}
                    {account.account_label ? ` · ${account.account_label}` : ''}
                  </option>
                ))}
              </select>
              {chosenAccount ? (
                <p className="mt-1.5 text-base text-ink-700">
                  Holds{' '}
                  <span className="tabular whitespace-nowrap font-semibold text-ink-900">
                    {rs(chosenAccount.balance)}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor={`amount-${supplierId}`}>
              Amount paid
            </label>
            <NumberInput
              id={`amount-${supplierId}`}
              name="amount"
              step="0.01"
              min="0.01"
              required
              className="input-number"
              placeholder="0"
            />
          </div>

          <div>
            <label className="label" htmlFor={`date-${supplierId}`}>
              Date
            </label>
            <input
              id={`date-${supplierId}`}
              name="entry_date"
              type="date"
              required
              defaultValue={todayISO()}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor={`note-${supplierId}`}>
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={`note-${supplierId}`}
              name="note"
              type="text"
              className="input"
              placeholder={paidFrom === 'bank' ? 'e.g. cheque 4471, or the IBFT reference' : 'e.g. given to the driver'}
            />
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Recording…">
              Record payment
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
