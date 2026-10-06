'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { setStaffRole, setStaffActive, deleteStaffAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import IconButton from '@/app/_components/ui/IconButton';

/**
 * The people who can sign in, split into owners and data entry.
 *
 * WHY IT IS NOT A TABLE ANY MORE. A table implies you scan down a column to
 * compare values. There is nothing here to compare - it is a short list of
 * people, and the one thing that matters about each is what they are allowed to
 * do. Grouping under two headings answers that at a glance, where a "Role"
 * column made you read every row to work out who the owners were.
 *
 * The dropdown is gone with it. Picking a role from a select and then pressing
 * Save is two steps and a guess about whether the guess took effect; the row now
 * carries one button that says what it will do - "Make owner", "Make data
 * entry" - and the person moves between the two groups when it works, which is
 * the confirmation.
 *
 * You cannot change your own role, switch yourself off, or delete yourself. All
 * three are enforced in the actions; here those controls are simply absent.
 *
 * In the new look (docs/UI_CONVENTIONS.md -> "The new look"): each group is a
 * `.panel`, names and buttons are body-sized, and the delete is the trash
 * button every other delete in the app uses (it was the word "Delete" at 12px).
 */
export default function StaffList({ staff, currentProfileId }) {
  const owners = staff.filter((person) => person.role === 'super_admin');
  const dataEntry = staff.filter((person) => person.role !== 'super_admin');

  return (
    <div className="space-y-4">
      <StaffGroup
        title="Owners"
        caption="Full access, including money reports and settings."
        people={owners}
        currentProfileId={currentProfileId}
        emptyText="No owners."
        tone="owner"
      />
      <StaffGroup
        title="Data entry"
        caption="Daily figures only. Cannot see profit or manage accounts."
        people={dataEntry}
        currentProfileId={currentProfileId}
        emptyText="Nobody yet. Create a login with the button at the top of the page."
        tone="staff"
      />
    </div>
  );
}

function StaffGroup({ title, caption, people, currentProfileId, emptyText, tone }) {
  return (
    <section data-card className="panel @container overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink-200 bg-ink-50 px-5 py-3">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        <span className="badge bg-white text-ink-700 ring-1 ring-inset ring-ink-200">
          {people.length}
        </span>
        <p className="w-full text-sm text-ink-700 @[34rem]:w-auto @[34rem]:flex-1">{caption}</p>
      </header>

      {people.length === 0 ? (
        <p className="px-5 py-6 text-center text-base text-ink-700">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isSelf={person.id === currentProfileId}
              tone={tone}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonRow({ person, isSelf, tone }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-3 px-5 py-3.5">
      <Avatar name={person.full_name} tone={tone} dimmed={!person.is_active} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          {/* Wraps rather than truncates: a name cut short is somebody
              else's name. */}
          <span
            className={`text-base font-semibold [overflow-wrap:anywhere] ${
              person.is_active ? 'text-ink-900' : 'text-ink-600'
            }`}
          >
            {person.full_name}
          </span>
          {isSelf ? <span className="badge bg-brand-100 text-brand-800">You</span> : null}
        </p>
        <p className="mt-0.5 text-sm text-ink-700">
          {person.is_active ? 'Can sign in' : 'Cannot sign in'}
        </p>
      </div>

      {/* Takes its own line in a narrow group, sits on the right in a wide
          one: measured against the group, not the window. */}
      <div className="flex w-full flex-wrap items-center justify-end gap-2 @[34rem]:w-auto">
        {isSelf ? (
          <span className="text-sm text-ink-600">Your own details are under You</span>
        ) : (
          <>
            <RoleButton person={person} />
            <ActiveToggle person={person} />
            <DeleteAccount person={person} />
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Initials rather than a photo: there are no photos, and a coloured disc gives
 * each row an anchor for the eye so the list scans as people, not records.
 */
function Avatar({ name, tone, dimmed }) {
  const initials = String(name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        dimmed
          ? 'bg-ink-100 text-ink-600'
          : tone === 'owner'
            ? 'bg-brand-100 text-brand-800'
            : 'bg-ink-200 text-ink-700'
      }`}
    >
      {initials || '?'}
    </span>
  );
}

/** One button that says what it will do, instead of a select plus Save. */
function RoleButton({ person }) {
  const [state, formAction] = useActionState(setStaffRole, null);
  const isOwner = person.role === 'super_admin';
  const nextRole = isOwner ? 'data_entry' : 'super_admin';

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="profile_id" value={person.id} />
      <input type="hidden" name="role" value={nextRole} />
      <SubmitButton
        variant="secondary"
        className="whitespace-nowrap"
        pendingLabel="Moving…"
        title={
          isOwner
            ? 'Drop this person down to data entry'
            : 'Give this person full owner access'
        }
      >
        {isOwner ? 'Make data entry' : 'Make owner'}
      </SubmitButton>
      {state?.ok === false ? (
        <span className="w-full text-right text-sm text-red-700">{state.message}</span>
      ) : null}
    </form>
  );
}

/**
 * The status pill is the switch. min-w keeps it the same size while it says
 * "…", so the row does not jump under the pointer mid-click.
 */
function ActiveToggle({ person }) {
  const [state, formAction] = useActionState(setStaffActive, null);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="profile_id" value={person.id} />
      <input type="hidden" name="is_active" value={person.is_active ? 'false' : 'true'} />
      <StatusPill active={person.is_active} />
      {state?.ok === false ? (
        <span className="w-full text-right text-sm text-red-700">{state.message}</span>
      ) : null}
    </form>
  );
}

/*
 * A native button, NOT `<SubmitButton>`. That one is a Material UI button whose
 * default is the filled primary green, and the fill won over the pill's own
 * colours: "Active" and "Disabled" both came out as solid green buttons, so a
 * login that could not sign in looked like the good state. The pill keeps its
 * own colours - green for active, grey for disabled, with the word in both -
 * and `useFormStatus` gives it the same pending guard SubmitButton has.
 */
function StatusPill({ active }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={active ? 'Stop this person signing in' : 'Let this person sign in again'}
      className={`badge min-h-10 min-w-[6rem] justify-center px-3.5 transition disabled:cursor-wait disabled:opacity-60 ${
        active
          ? 'bg-brand-100 text-brand-800 hover:bg-brand-200'
          : 'bg-ink-200 text-ink-800 hover:bg-ink-300'
      }`}
    >
      {pending ? '…' : active ? 'Active' : 'Disabled'}
    </button>
  );
}

/**
 * Deleting needs more room than a row allows, and it needs the owner to stop
 * and read - so it opens a dialog rather than an inline "are you sure?".
 */
function DeleteAccount({ person }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(deleteStaffAccount, null);

  return (
    <>
      <IconButton
        name="trash"
        label={`Delete ${person.full_name}`}
        tone="danger"
        onClick={() => setIsOpen(true)}
      />

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Delete ${person.full_name}?`}
        subtitle={<span className="text-sm text-ink-600">This cannot be undone</span>}
      >
        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="profile_id" value={person.id} />

          <p className="text-base text-ink-700">
            The login is removed for good. Everything {person.full_name} recorded (readings,
            deliveries, expenses, ledger entries) is <span className="font-semibold">kept</span>,
            but will no longer show their name against it.
          </p>

          <p className="callout-warn">
            If you only want to stop them signing in, close this and use the{' '}
            <span className="font-semibold">Active</span> switch instead. That can be undone.
          </p>

          <div>
            <label className="label" htmlFor={`owner-password-${person.id}`}>
              Your own password
            </label>
            <input
              id={`owner-password-${person.id}`}
              name="owner_password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
            <p className="mt-1 text-sm text-ink-600">
              Asked for so that nobody who finds this screen open can delete a login.
            </p>
          </div>

          {state?.ok === false ? <p className="callout-danger">{state.message}</p> : null}

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton variant="danger" className="flex-1" pendingLabel="Deleting…">
              Delete this login
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
