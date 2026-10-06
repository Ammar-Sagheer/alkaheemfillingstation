'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { deleteBankAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import IconButton from '@/app/_components/ui/IconButton';

/**
 * Removes an account and its transactions.
 *
 * Behind a dialog rather than an inline confirm, because the thing worth
 * reading is not "are you sure" - it is that the transactions go too, and that
 * nothing here can bring them back. The count is named so the sentence is about
 * this account rather than accounts in general.
 */
export default function DeleteBankAccountButton({ accountId, label, transactionCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(deleteBankAccount, null);
  const [showResult, setShowResult] = useState(false);

  // The row disappears on success, so there is nothing left to close - but if
  // the delete fails the dialog has to stay up carrying the reason.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) setIsOpen(false);
  }, [state]);

  return (
    <>
      {/* The trash button every other delete in the app uses, confirming in
          words in the dialog below. It was the word "Delete" at 12px in
          ink-500, under both the size and the contrast floor. */}
      <IconButton
        name="trash"
        tone="danger"
        label={`Delete ${label}`}
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      />

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Delete ${label}?`}
        subtitle={<span className="text-sm text-ink-600">There is no undo</span>}
      >
        <form
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="account_id" value={accountId} />

          <p className="text-sm text-ink-700">
            The account goes, and so do the{' '}
            <span className="font-semibold text-ink-900">
              {transactionCount} transaction{transactionCount === 1 ? '' : 's'}
            </span>{' '}
            recorded against it. Its balance stops being counted anywhere on this page.
          </p>

          <p className="callout">
            If the account is simply closed and you want to keep the record, download this
            month’s report first: the transactions are in it.
          </p>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2">
            <SubmitButton variant="danger" className="flex-1"  pendingLabel="Deleting…">
              Delete account
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
