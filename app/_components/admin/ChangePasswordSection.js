'use client';

import { useState } from 'react';

import ChangePasswordForm from '@/app/_components/admin/ChangePasswordForm';
import Icon from '@/app/_components/ui/Icon';

/**
 * The password form, collapsed behind a click.
 *
 * Changing your password is a once-in-a-while thing, and three password boxes
 * sitting open on the account page look like a task waiting to be done rather
 * than an option that is there if wanted. Closed by default, and the form
 * itself decides when to reappear as anything other than empty - it stays open
 * after a successful change so the confirmation is there to read, rather than
 * being auto-collapsed the moment it appears.
 *
 * Animated with a CSS grid-rows trick (0fr -> 1fr) rather than measuring the
 * form's height in JS: it collapses to a real zero, transitions smoothly in
 * both directions, and needs no ResizeObserver to stay correct if the content
 * inside ever changes height.
 */
export default function ChangePasswordSection() {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="panel flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-ink-50"
      >
        <span>
          <span className="block text-base font-semibold text-ink-900">Change password</span>
          <span className="block text-sm text-ink-700">
            {open ? 'Hide this' : 'Pick a new password only you know'}
          </span>
        </span>
        <Icon
          name="chevronRight"
          className={`h-5 w-5 shrink-0 text-ink-600 transition-transform duration-200 ${
            open ? '-rotate-90' : 'rotate-90'
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        {/* `inert` while closed: collapsed to nothing and transparent, the
            three boxes and the button were still reachable with Tab, so the
            keyboard went somewhere nobody could see. */}
        <div className="overflow-hidden" inert={!open}>
          <ChangePasswordForm />
        </div>
      </div>
    </section>
  );
}
