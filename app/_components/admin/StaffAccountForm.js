'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createStaffAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';

/**
 * Creates a login, behind a dialog.
 *
 * There is no public signup, so this is the only way a login comes into
 * existence - but it happens rarely, while the staff list below it is read
 * every time this page is opened. A permanent four-field form standing open
 * above that list had the same problem a bank account form did sitting open
 * above its own list: the rare job was crowding out the one worth glancing at.
 */
export default function StaffAccountForm() {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  // A result belongs to the submission that produced it; opening the dialog
  // again starts clean rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createStaffAccount, null);

  // Close once it has gone through, and carry the confirmation out with it -
  // the new login is already on the list behind the dialog by then.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <>
      <Button variant="secondary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Add login
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Create a login"
        subtitle={
          <span className="text-sm text-ink-600">
            There is no public signup; this is the only way in
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
          <div>
            <label className="label" htmlFor="full_name">
              Name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              autoFocus
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="staff_email">
              Email
            </label>
            <input
              id="staff_email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="staff_password">
              Password
            </label>
            <input
              id="staff_password"
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              placeholder="At least 8 characters"
            />
            <p className="mt-1 text-sm text-ink-600">
              Shown as you type so you can pass it on. Ask them to change it under Account once
              they have signed in.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="staff_role">
              Role
            </label>
            <select id="staff_role" name="role" required defaultValue="data_entry" className="input">
              <option value="data_entry">Data entry: records daily figures only</option>
              <option value="super_admin">Owner: full access, including money reports</option>
            </select>
          </div>

          {/* A failure stays put until it is dealt with; a success has already
              closed the dialog by the time there is anything to show. */}
          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Creating…">
              Create login
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
