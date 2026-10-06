'use client';

import { useActionState } from 'react';

import { deleteCompanyAsset } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Owner-only. Removing an asset that was sold, scrapped, or entered by
 * mistake.
 *
 * A DIALOG, NOT AN INLINE CONFIRM - see `ConfirmAction` for why: expanding in
 * place inside a card grid would resize the one card being confirmed and shove
 * every card after it to a new position, the same failure this app already
 * fixed once on the delete guards elsewhere.
 *
 * Nothing else in the books depends on this row - an asset feeds no sale, no
 * expense, no profit figure - so there is no consequence to spell out beyond
 * the obvious one, and the confirmation is a single line.
 */
export default function DeleteCompanyAssetButton({ assetId, name }) {
  const [state, formAction] = useActionState(deleteCompanyAsset, null);

  return (
    <ConfirmAction
      triggerLabel={`Remove ${name}`}
      title="Remove this asset?"
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ asset_id: assetId }}
    >
      <p>
        Remove <span className="font-semibold text-ink-900">{name}</span> from the list? This does
        not affect sales, expenses or profit: it is only a record of what the pump owns.
      </p>
    </ConfirmAction>
  );
}
