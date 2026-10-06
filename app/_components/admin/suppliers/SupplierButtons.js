'use client';

import { useActionState, useEffect, useState } from 'react';

import { cancelSupplierEntry, setSupplierActive } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import { formatPKR } from '@/app/_lib/format-helpers';

const WHAT = { payment: 'payment', discount: 'discount', adjustment: 'adjustment' };

/**
 * Cancelling one entry on a supplier's account. The confirmation says what
 * else moves, because for a payment that is the part that would otherwise be
 * guessed at: the money goes back into the safe or the bank account it came
 * out of.
 */
export function CancelSupplierEntryButton({ entry, supplierId }) {
  const [state, formAction] = useActionState(cancelSupplierEntry, null);
  const what = WHAT[entry.kind] ?? 'entry';

  return (
    <ConfirmAction
      triggerIcon="close"
      triggerLabel={`Cancel this ${what}`}
      title={`Cancel this ${what}?`}
      confirmLabel={`Yes, cancel the ${what}`}
      pendingLabel="Cancelling…"
      action={formAction}
      state={state}
      hidden={{ entry_id: entry.id, supplier_id: supplierId }}
    >
      <p>
        A {what} of <span className="whitespace-nowrap font-semibold text-ink-900">{formatPKR(entry.amount)}</span>. It
        stays on the account, struck through, with a correction beside it.
      </p>
      {entry.kind === 'payment' ? (
        <p className="callout-warn">
          {entry.paid_from === 'bank'
            ? 'The transfer is taken off Banking, so the account holds this much again.'
            : 'The cash goes back into the safe on Treasury.'}
        </p>
      ) : null}
    </ConfirmAction>
  );
}

/**
 * Retiring a supplier: off the purchase forms, account and history kept. Or
 * bringing one back.
 *
 * A TEXT BUTTON, NOT ConfirmAction's red icon. It was the red cross on each row
 * of the supplier list, and a red cross beside a company's name reads as
 * "delete" - which this never is. Retiring is rare, reversible and loses
 * nothing, so it lives at the foot of the supplier's own page, in words.
 */
export function SupplierActiveButton({ supplier }) {
  const [state, formAction] = useActionState(setSupplierActive, null);
  const [open, setOpen] = useState(false);
  const retiring = supplier.is_active;
  const balance = Number(supplier.balance ?? 0);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="secondary" type="button" onClick={() => setOpen(true)}>
        {retiring ? 'Retire this supplier' : 'Bring this supplier back'}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={retiring ? `Retire ${supplier.name}?` : `Bring back ${supplier.name}?`}
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="supplier_id" value={supplier.id} />
          <input type="hidden" name="active" value={retiring ? 'false' : 'true'} />
          <p className="text-base text-ink-700">
            {retiring
              ? 'It comes off the purchase forms, so no new delivery can be recorded against it. Its account and every entry on it are kept, and it can be brought back.'
              : 'It goes back on the purchase forms, with its account as it was.'}
          </p>
          {retiring && balance !== 0 ? (
            <p className="callout-warn">
              The account is not at zero:{' '}
              <span className="whitespace-nowrap font-semibold">{formatPKR(Math.abs(balance))}</span>{' '}
              {balance > 0 ? 'is still owed to this supplier' : 'is in the pump’s favour'}.
            </p>
          ) : null}
          <FormMessage state={state?.ok === false ? state : null} />
          <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              {retiring ? 'Yes, retire' : 'Yes, bring back'}
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
