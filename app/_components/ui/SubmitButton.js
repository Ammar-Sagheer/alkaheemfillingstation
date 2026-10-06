'use client';

import { useFormStatus } from 'react-dom';

import Button from '@/app/_components/ui/Button';

/**
 * A submit button that disables itself while the action is running.
 *
 * This matters more than it looks: without it, an impatient double-tap on a
 * slow connection can post the same reading twice.
 *
 * Renders through `<Button>`, so it is a Material UI button like every other
 * one in the app - `variant` here is the app's own intent name (primary /
 * secondary / danger), not MUI's.
 */
export default function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  variant = 'primary',
  disabled = false,
  ...props
}) {
  const { pending } = useFormStatus();

  return (
    // `disabled` is pulled out of props and combined rather than spread, so a
    // caller passing disabled={false} cannot cancel out the pending guard.
    <Button type="submit" variant={variant} disabled={pending || disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
