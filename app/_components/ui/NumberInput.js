'use client';

import { forwardRef } from 'react';

/**
 * A number field that cannot be changed by accident.
 *
 * Every number in this app is money, litres or a meter reading, so a value that
 * changes without anyone typing is a real problem, not a nuisance.
 *
 * Two ways that happens with a plain <input type="number">:
 *
 *   1. THE SCROLL WHEEL. A focused number input increments or decrements when
 *      you scroll over it. Someone types 500, scrolls down to reach the Save
 *      button, and saves 499.99 - with nothing on screen to suggest anything
 *      moved. This is the one that actually bites, and it is silent.
 *   2. ARROW KEYS. Up and down nudge the value too. Harmless while typing a
 *      number, but easy to hit when someone means to scroll the page.
 *
 * Both are blocked here. The field still accepts typed digits, still shows the
 * number keypad on a phone, and still validates against step/min/max.
 *
 * Use this instead of <input type="number"> everywhere.
 */
const NumberInput = forwardRef(function NumberInput(
  { className = 'input-number', onWheel, onKeyDown, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      className={className}
      onWheel={(event) => {
        // Dropping focus is what actually stops the change - preventDefault on
        // a passive wheel listener would not - and it lets the page keep
        // scrolling normally underneath.
        event.currentTarget.blur();
        onWheel?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
      {...props}
    />
  );
});

export default NumberInput;
