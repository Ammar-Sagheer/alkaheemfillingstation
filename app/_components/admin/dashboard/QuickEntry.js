'use client';

import { useState } from 'react';

import Button from '@/app/_components/ui/Button';
import Dialog from '@/app/_components/ui/Dialog';
import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import ExpenseForm from '@/app/_components/admin/ExpenseForm';
import BankTransactionForm from '@/app/_components/admin/BankTransactionForm';

/**
 * Quick entry on the Dashboard (Al Hakeem asked): an expense and a bank
 * deposit or withdrawal without leaving the page he opens every day. The very
 * same forms as on Expenses and Banking, in dialogs, so the rules, the
 * wording and what the database refuses are the same in both places. The
 * links beside them are for when he wants the list, not just the entry.
 */
export default function QuickEntry({ accounts = [], usedCategories = [] }) {
  const [bankOpen, setBankOpen] = useState(false);

  return (
    <section aria-label="Quick entry" data-card className="panel @container mt-4 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-base font-semibold text-ink-800">Quick entry</p>

        {/* Full width, one above the other, on a phone (side by side they wrapped
            "Add expense" onto two lines); half each from 26rem; their own widths beside the
            label from 40rem. `[&>button]` reaches only each wrapper's own
            button, not the ones inside the dialogs. */}
        <div className="grid w-full grid-cols-1 gap-2 @[26rem]:grid-cols-2 @[40rem]:flex @[40rem]:w-auto @[40rem]:flex-wrap @[40rem]:items-center [&>div>button]:w-full @[40rem]:[&>div>button]:w-auto [&>a]:w-full @[40rem]:[&>a]:w-auto">
          <div>
            <ExpenseForm used={usedCategories} />
          </div>

          {accounts.length > 0 ? (
            <div>
            <Button variant="secondary" type="button" onClick={() => setBankOpen(true)}>
              <Icon name="banking" className="h-4 w-4" />
              Bank entry
            </Button>
            </div>
          ) : (
            <Button variant="secondary" href="/admin/banking" pending>
              <Icon name="banking" className="h-4 w-4" />
              Add a bank account
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold @[40rem]:ml-auto">
          <PendingLink href="/admin/expenses" className="text-brand-700 underline-offset-2 hover:underline">
            All expenses
          </PendingLink>
          <PendingLink href="/admin/banking" className="text-brand-700 underline-offset-2 hover:underline">
            Banking
          </PendingLink>
        </div>
      </div>

      {accounts.length > 0 ? (
        <Dialog
          open={bankOpen}
          onClose={() => setBankOpen(false)}
          title="Bank entry"
          subtitle={<span className="text-sm text-ink-600">Money into or out of a bank account</span>}
        >
          <BankTransactionForm accounts={accounts} bare onSaved={() => setBankOpen(false)} />
        </Dialog>
      ) : null}
    </section>
  );
}
