'use client';

/**
 * The two directions a customer's balance can move, in words rather than in
 * bookkeeping.
 *
 * "Increases what they owe" and "Reduces what they owe" were the original
 * labels and the owner could not tell them apart at a glance - they differ by
 * one word in the middle of a sentence, and both start with the same shape.
 * Debit and credit would have been worse.
 *
 * What is used instead, everywhere a balance is moved by hand:
 *
 *   owes       the customer owes the pump MORE   (a debit)
 *   in_credit  the customer owes the pump LESS   (a credit)
 *
 * Shared between the new-customer form and the manual adjustment so the same
 * two ideas are never described in two different vocabularies - which is how
 * the confusion started.
 *
 * The labels do half the work. The other half is the caller showing the
 * RESULTING BALANCE underneath, so the choice can be checked by its effect
 * rather than by reading carefully. See both callers.
 *
 * THE URDU WORD IN BRACKETS IS THE PRIMARY LABEL FOR THE PERSON USING THIS,
 * not a translation of the English one. بنام and جمع are the words a Pakistani
 * shopkeeper's register has used for a debit and a credit for a century; the
 * owner has been writing them by hand for years. The English beside them is
 * the gloss, and it stays because the staff logins may not share the habit.
 *
 * It is wrapped in <bdi> deliberately. Urdu is right-to-left, and an unmarked
 * run of it inside an English sentence lets the bidi algorithm drag the
 * brackets around it - "(بنام" with the closing paren stranded on the far side
 * of the line. <bdi> isolates the run so the brackets stay put whatever is
 * inside them.
 */
export default function BalanceDirection({ name, value, onChange, options, activeClass }) {
  // Green by default, because on the ledger a chosen direction is just "the
  // selected one". On a card that already wears a colour - the Stock page's
  // tank cards - the caller passes that colour instead, so the control belongs
  // to the card rather than looking like a stray third hue dropped into it.
  const active = activeClass ?? 'border-brand-600 bg-brand-50 text-brand-900';
  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={[
              'rounded-lg border px-3 py-2.5 text-left transition',
              isActive ? active : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
            ].join(' ')}
          >
            <span className="block text-sm font-semibold">
              {option.title}
              {option.urdu ? (
                <>
                  {' '}
                  <span className="whitespace-nowrap font-bold">
                    (
                    <bdi lang="ur" dir="rtl" className="text-base">
                      {option.urdu}
                    </bdi>
                    )
                  </span>
                </>
              ) : null}
            </span>
            <span className={`block text-xs ${isActive ? '' : 'text-ink-600'}`}>
              {option.detail}
            </span>
          </button>
        );
      })}
      {/* The real value the form posts. A hidden input rather than a select, so
          the visible control can be a pair of readable cards. */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
