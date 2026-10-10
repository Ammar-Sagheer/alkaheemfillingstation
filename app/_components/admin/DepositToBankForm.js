'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { depositToBank } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import NumberInput from '@/app/_components/ui/NumberInput';
import PendingLink from '@/app/_components/ui/PendingLink';
import { todayISO } from '@/app/_lib/date-helpers';

/**
 * Taking cash from the safe to a bank account, as one entry (805).
 *
 * Asked for by Al Hakeem: the safe (Treasury) and the bank were two separate
 * books, so a trip to the bank was two entries and forgetting one left them
 * disagreeing. This writes both (the safe loses it, the account gains it) in
 * the database, together or not at all, and links them so deleting either
 * deletes the other. The safe will not pay out cash it does not hold, and says
 * so in its own words.
 *
 * Offered wherever cash is being handled: Treasury, Expenses, the day's
 * Readings and the Dashboard's Quick entry. `defaultDate` is the day on screen
 * (the Readings page can be on yesterday, after midnight), else today.
 * `accounts` are the bank accounts; with none, the button leads to Banking to
 * add one instead of opening a dialog with nothing to choose.
 */
export default function DepositToBankForm({
  accounts = [],
  defaultDate,
  variant = 'secondary',
  idPrefix = 'deposit',
}) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const start = (accounts.find((account) => account.is_main) ?? accounts[0])?.id ?? '';
  const [accountId, setAccountId] = useState(start);
  useEffect(() => setAccountId(start), [start]);

  const [state, formAction] = useActionState(depositToBank, null);
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setAccountId(start);
    }
  }, [state, start]);

  if (accounts.length === 0) {
    return (
      <Button variant="secondary" href="/admin/banking" pending>
        <Icon name="banking" className="h-4 w-4" />
        Add a bank account
      </Button>
    );
  }

  return (
    <>
      <Button variant={variant} type="button" onClick={() => setIsOpen(true)}>
        <Icon name="banking" className="h-4 w-4" />
        Deposit to bank
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Deposit to bank"
        subtitle={
          <span className="text-sm text-ink-600">
            Cash from the safe into a bank account. One entry: it comes out of the safe and goes into
            the account.
          </span>
        }
      >
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <div>
            <label className="label" htmlFor={`${idPrefix}_account`}>
              Into which account
            </label>
            <select
              id={`${idPrefix}_account`}
              name="account_id"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="input"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_label} · {account.bank_name}
                  {account.is_main ? ' (main)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="@container">
            <div className="grid gap-4 @[26rem]:grid-cols-2">
              <div>
                <label className="label" htmlFor={`${idPrefix}_amount`}>
                  Amount
                </label>
                <NumberInput
                  id={`${idPrefix}_amount`}
                  name="amount"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  className="input-number"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label" htmlFor={`${idPrefix}_date`}>
                  Date
                </label>
                <input
                  id={`${idPrefix}_date`}
                  name="deposit_date"
                  type="date"
                  required
                  defaultValue={defaultDate ?? todayISO()}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="label" htmlFor={`${idPrefix}_note`}>
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={`${idPrefix}_note`}
              name="note"
              type="text"
              autoComplete="off"
              className="input"
              placeholder="e.g. slip number"
            />
          </div>

          <p className="callout">
            Appears in{' '}
            <PendingLink href="/admin/treasury" className="font-semibold underline">
              Treasury
            </PendingLink>{' '}
            as cash out and in{' '}
            <PendingLink href="/admin/banking" className="font-semibold underline">
              Banking
            </PendingLink>{' '}
            as money in. Removing either one removes the other.
          </p>

          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              Record the deposit
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
