'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { setMainBankAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Toast from '@/app/_components/ui/Toast';

/**
 * "Make this the main account", on each Banking account that is not the main
 * one already (migration 065). The main account is the one the money in /
 * money out form starts on.
 *
 * One tap, no confirmation: nothing is lost by it, and the previous choice is
 * one tap away on the other account. The result is a toast; a failure (the
 * migration not applied yet, most likely) stays under the button until the
 * next try.
 */
export default function MakeMainAccountButton({ accountId, label }) {
  const [state, formAction] = useActionState(setMainBankAccount, null);
  const [notice, setNotice] = useState(null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) setNotice({ message: state.message });
  }, [state]);

  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="account_id" value={accountId} />
        <SubmitButton
          variant="secondary"
          pendingLabel="Saving…"
          aria-label={`Make ${label} the main account`}
        >
          Make this the main account
        </SubmitButton>
        {state?.ok === false ? <p className="callout-danger mt-3">{state.message}</p> : null}
      </form>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
