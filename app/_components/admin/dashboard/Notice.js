import Icon from '@/app/_components/ui/Icon';

/*
 * The four kinds of thing a page says in a box of its own. The words carry
 * each one; the colour and the glyph are the second and third cue, so none of
 * them is told by colour alone.
 *
 *   danger  it will cost money if it is ignored (a skipped day)      red
 *   warn    it stops or bends the work (no rate set)                 amber
 *   info    worth knowing, neither good nor bad                      slate
 *   ok      a result that went through                               green
 */
const TONES = {
  danger: {
    box: 'border-red-200 bg-red-50 text-red-900',
    tile: 'bg-red-100 text-red-700',
    icon: 'warning',
  },
  warn: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    tile: 'bg-amber-100 text-amber-800',
    icon: 'warning',
  },
  info: {
    box: 'border-ink-200 bg-white text-ink-800',
    tile: 'bg-ink-100 text-ink-700',
    icon: 'info',
  },
  ok: {
    box: 'border-brand-200 bg-brand-50 text-brand-900',
    tile: 'bg-brand-100 text-brand-700',
    icon: 'check',
  },
};

/**
 * A page-level message in the new look: an icon tile, then the sentence, with
 * an optional bold first line.
 *
 * Lifted out of the Readings page, where it was first drawn, so every page
 * that has something to say about itself says it in the same shape.
 *
 * `role="status"` for danger and warn, which are about the state of the page;
 * info and ok are part of the page's reading order and are announced with it.
 */
export default function Notice({ tone = 'info', icon, title, children, className = '' }) {
  const style = TONES[tone] ?? TONES.info;

  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'status' : undefined}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${style.box} ${className}`}
    >
      <span className={`icon-tile h-9 w-9 ${style.tile}`}>
        <Icon name={icon ?? style.icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 max-w-[80ch] pt-1.5 text-base">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}
