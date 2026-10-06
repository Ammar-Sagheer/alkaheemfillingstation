'use client';

import Link, { useLinkStatus } from 'next/link';

import Spinner from '@/app/_components/ui/Spinner';

/**
 * A link that says it is working.
 *
 * Every admin page fetches on the server, so stepping to another day takes a
 * round trip. Without any feedback the screen simply sits there for a second or
 * two and looks frozen - and the natural reaction is to tap again, which queues
 * a second navigation and makes it slower still.
 *
 * useLinkStatus reports the pending state of the enclosing Link, so the
 * indicator has to live in a child component - that is the hook's contract.
 */

/** Swaps the label for a spinner while the navigation is in flight. */
function LinkBody({ children, spinnerOnly }) {
  const { pending } = useLinkStatus();

  if (!pending) return children;
  if (spinnerOnly) return <Spinner />;

  return (
    <>
      <Spinner />
      {children}
    </>
  );
}

/**
 * `spinnerOnly` replaces the label entirely - right for an arrow, where a
 * spinner beside a chevron would change the button's width mid-click.
 */
export default function PendingLink({ href, children, spinnerOnly = false, ...props }) {
  return (
    <Link href={href} {...props}>
      <LinkBody spinnerOnly={spinnerOnly}>{children}</LinkBody>
    </Link>
  );
}
