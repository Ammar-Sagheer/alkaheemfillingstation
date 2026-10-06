'use client';

import { useActionState, useRef } from 'react';

import { changePassword } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';

/**
 * Changing your own password.
 *
 * The fields are real password inputs, unlike the one on the create-login form:
 * that one is shown as you type because the owner has to read it out to a staff
 * member. Here nobody needs to read it, so it stays hidden.
 *
 * autoComplete tells the browser's password manager what each box is, which is
 * what makes it offer to update a saved password afterwards.
 */
export default function ChangePasswordForm() {
  const formRef = useRef(null);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await changePassword(prevState, formData);
    // Clear the boxes on success - leaving the new password sitting on screen
    // is exactly the sort of thing that gets read over a shoulder.
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  return (
    <form ref={formRef} action={formAction} data-card className="panel space-y-4 p-5">
      <div>
        <label className="label" htmlFor="current_password">
          Current password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="new_password">
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
        <p className="mt-1 text-sm text-ink-600">At least 8 characters.</p>
      </div>

      <div>
        <label className="label" htmlFor="confirm_password">
          New password again
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>

      <FormMessage state={state} />

      <SubmitButton fullWidth >Change password</SubmitButton>
    </form>
  );
}
