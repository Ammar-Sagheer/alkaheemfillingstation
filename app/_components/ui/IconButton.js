'use client';

import Icon from '@/app/_components/ui/Icon';

/**
 * A square, icon-only button for a row action.
 *
 * WHY THIS BREAKS THE "ICONS NEVER CARRY MEANING ALONE" RULE, DELIBERATELY.
 * That rule exists because a status told apart only by colour and shape fails
 * in a dim pump office and fails for a red-green colourblind reader. It is
 * about icons that CARRY INFORMATION - a nozzle's Entered/Enter badge, a fuel
 * type.
 *
 * This is not information, it is a control, and the situation is the opposite:
 * the word was repeated down every row of a table, which is noise rather than
 * clarity, and a column of red "Remove" text reads as a list of links rather
 * than a set of buttons. The row already names what the action applies to, and
 * a bin is understood without reading.
 *
 * Two conditions keep it honest, and both are required:
 *   - `label` is mandatory, and becomes both aria-label and the hover title,
 *     so it is announced to a screen reader and discoverable with a mouse.
 *   - the action it triggers must confirm IN WORDS before anything happens.
 *     Nothing here should destroy something on the first click.
 *
 * A 44px target, which is a finger on a tablet rather than a mouse on a
 * laptop - the icon is 20px and the rest is padding.
 */
export default function IconButton({
  name,
  label,
  onClick,
  tone = 'default',
  type = 'button',
  ...props
}) {
  const tones = {
    default: 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
    danger: 'text-red-700 hover:bg-red-50 hover:text-red-800',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        tones[tone] ?? tones.default,
      ].join(' ')}
      {...props}
    >
      <Icon name={name} className="h-5 w-5" />
    </button>
  );
}
