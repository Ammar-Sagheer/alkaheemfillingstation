import Icon from '@/app/_components/ui/Icon';

/**
 * A block with nothing in it yet, said in words: what is missing, and what to
 * do about it.
 *
 * In the new look (docs/UI_CONVENTIONS.md -> "The new look"): a `.panel`, an
 * optional icon tile naming the kind of thing that is missing, the title at
 * 18px and the sentence at the 16px body size - it was 14px, under the floor,
 * on the one line that says what to do next.
 */
export default function EmptyState({ title, description, icon, children }) {
  return (
    <div data-card className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon ? (
        <span className="icon-tile mb-1 h-12 w-12 bg-ink-100 text-ink-600">
          <Icon name={icon} className="h-6 w-6" />
        </span>
      ) : null}
      <p className="text-lg font-semibold text-ink-900">{title}</p>
      {description ? <p className="max-w-md text-base text-ink-700">{description}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
