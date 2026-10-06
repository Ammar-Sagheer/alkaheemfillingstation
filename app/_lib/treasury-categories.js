/**
 * What cash moving in or out of the safe can be, in the owner's own words.
 *
 * These nine values are the same nine the database's
 * `treasury_entries_category_fits_direction` check constraint allows
 * (migration 044). The two lists must stay in step: adding one here without
 * adding it there gets the entry refused at save time, which is the safe way
 * round for them to drift but still a bug.
 *
 * THE LABELS COME OFF THE SHEET, not out of a thesaurus. "Entry" is not a
 * word anyone would invent for "cash carried into the office during the day",
 * but it is the word written against three quarters of the cash-in lines in
 * the owner's Excel file, and a page that renames it teaches him a second
 * vocabulary for something he already has a word for. Same reasoning for
 * "Cash of shift closing", which is longer than it needs to be and is what he
 * writes.
 *
 * A plain data module rather than an export of the form component, for the
 * reason asset-categories.js gives: every export of a `'use client'` file
 * becomes a client reference at the boundary, so a Server Component importing
 * an array from one gets a reference object and `.map` fails at build time.
 * The form needs this list and so does the server-rendered table.
 */

/** Cash arriving in the safe. */
export const TREASURY_IN_CATEGORIES = [
  {
    value: 'shift_closing',
    label: 'Cash of shift closing',
    hint: 'The day’s takings, brought in off the shift.',
  },
  {
    value: 'entry',
    label: 'Entry',
    hint: 'Cash carried into the office during the day.',
  },
  {
    value: 'returned',
    label: 'Money returned',
    hint: 'Cash coming back from someone it was given to.',
  },
  {
    value: 'opening',
    label: 'Already in the safe',
    hint: 'What the safe held before it was ever written down. Recorded once.',
  },
  { value: 'other', label: 'Other', hint: 'Anything else. Say what in the details.' },
];

/** Cash leaving the safe. */
export const TREASURY_OUT_CATEGORIES = [
  {
    value: 'given',
    label: 'Given to someone',
    hint: 'Handed to a person: lent, advanced, or taken for their own use.',
  },
  {
    value: 'bank_deposit',
    label: 'Deposited in a bank',
    hint: 'Taken to the bank and paid into an account.',
  },
  {
    value: 'supplier',
    label: 'Fuel or code transfer',
    hint: 'Paid to a supplier, or transferred against a purchase code.',
  },
  {
    value: 'expense',
    label: 'Pump expense',
    hint: 'Spent on running the pump, out of the safe rather than the bank.',
  },
  { value: 'other', label: 'Other', hint: 'Anything else. Say what in the details.' },
];

/**
 * The label for one stored value.
 *
 * Takes the direction as well as the value because 'other' is legal in both
 * directions and is a different row in each list. Falls back to the raw value
 * rather than to "Other", so a category that somehow reaches the screen
 * without a label here is visible as itself instead of being quietly
 * relabelled into something it is not.
 */
export function treasuryCategoryLabel(direction, value) {
  const list = direction === 'in' ? TREASURY_IN_CATEGORIES : TREASURY_OUT_CATEGORIES;
  return list.find((category) => category.value === value)?.label ?? value;
}
