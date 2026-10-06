'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { recordSupplierEntry } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import NumberInput from '@/app/_components/ui/NumberInput';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import { todayISO } from '@/app/_lib/date-helpers';

/**
 * A discount, or an adjustment, on a supplier's account.
 *
 * A DISCOUNT always means the pump owes less, so it asks for no direction: the
 * supplier took something off an invoice, gave a rate difference back, or
 * forgave a balance. It moves no money anywhere else; it is a change in what
 * is owed.
 *
 * AN ADJUSTMENT goes either way and must say why. Its most common use is the
 * first one: what the pump already owed this supplier on the day it started
 * using the app, which is an adjustment saying "the pump owes more".
 */
export default function SupplierEntryForm({ supplierId, kind }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [direction, setDirection] = useState('owe_more');
  const [state, formAction] = useActionState(recordSupplierEntry, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      formRef.current?.reset();
      setDirection('owe_more');
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  const isDiscount = kind === 'discount';
  const idFor = (field) => `${kind}-${field}-${supplierId}`;

  return (
    <>
      <Button
        variant="secondary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        {isDiscount ? 'Record a discount' : 'Make an adjustment'}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={isDiscount ? 'Record a discount' : 'Adjust this account'}
        subtitle={
          <span className="text-sm text-ink-600">
            {isDiscount
              ? 'What the supplier took off. The pump owes this much less.'
              : 'An opening balance, or anything the other entries do not cover.'}
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
          <input type="hidden" name="kind" value={kind} />

          {isDiscount ? null : (
            <div>
              <span className="label">This means the pump</span>
              <BalanceDirection
                name="direction"
                value={direction}
                onChange={setDirection}
                options={[
                  {
                    value: 'owe_more',
                    title: 'Owes the supplier more',
                    // The register's words, turned round from the customer
                    // forms: in a supplier's khata what they supplied is جمع
                    // and what was paid them is بنام.
                    urdu: 'جمع',
                    detail: 'An opening balance from the old register, or a charge not on a delivery.',
                  },
                  {
                    value: 'owe_less',
                    title: 'Owes the supplier less',
                    urdu: 'بنام',
                    detail: 'Something settled outside the app, or a charge taken back.',
                  },
                ]}
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor={idFor('amount')}>
              Amount
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
              name="entry_date"
              type="date"
              required
              defaultValue={todayISO()}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor={idFor('note')}>
              {isDiscount ? (
                <>
                  What it was for <span className="font-normal text-ink-600">(optional)</span>
                </>
              ) : (
                'What this is for'
              )}
            </label>
            <input
              id={idFor('note')}
              name="note"
              type="text"
              required={!isDiscount}
              className="input"
              placeholder={
                isDiscount ? 'e.g. rate difference on invoice 7781' : 'e.g. opening balance from the old register'
              }
            />
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              {isDiscount ? 'Record discount' : 'Save adjustment'}
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
