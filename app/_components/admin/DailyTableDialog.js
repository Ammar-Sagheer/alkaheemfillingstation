'use client';

import { useState } from 'react';

import Button from '@/app/_components/ui/Button';
import Dialog from '@/app/_components/ui/Dialog';

/**
 * The month's days as a table, in a modal, opened by a button beside the
 * heading the charts sit under.
 *
 * WHAT IT REPLACED, AND WHY THAT WAS WORSE. This was a `<details>` block under
 * the charts: a full-width card whose whole visible state was the words "Show
 * these days as a table" with a disclosure triangle. Two problems. It read as a
 * strip of furniture rather than a control - the one thing on the page with no
 * button and no border around anything clickable - and opening it pushed a
 * nine-column table into the flow of a page that already has two charts and a
 * stat strip, so the figure someone wanted was below the fold and the page
 * jumped as it appeared. A modal costs nothing on the way past and gives the
 * table the whole screen when it is wanted.
 *
 * The button sits ABOVE the charts, in the heading row, because that is where
 * the reader is when they decide the chart is not answering their question -
 * not at the bottom of it, which is where the old block was and which meant
 * scrolling past the very thing you had given up on to find the alternative.
 *
 * `size="xl"` because the table is nine columns and 46rem wide at its narrowest
 * - it scrolls sideways inside anything smaller, and a table you must scroll to
 * read is the reason this exists rather than the chart.
 *
 * The children are rendered on the SERVER and passed in. `<DailySalesTable>`
 * formats money through helpers.js, which reads request cookies for the role
 * checks and cannot be pulled into a client bundle. Passing a finished tree as
 * `children` is how a client shell wraps a server component; importing it here
 * would break the build.
 */
export default function DailyTableDialog({ label, title, subtitle, children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        type="button"
        onClick={() => setIsOpen(true)}
        className="shrink-0 whitespace-nowrap"
      >
        {label}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        subtitle={subtitle}
        size="xl"
      >
        <div className="space-y-3 p-5">{children}</div>
      </Dialog>
    </>
  );
}
