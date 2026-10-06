import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import DateJump from '@/app/_components/admin/DateJump';
import { todayISO, shiftISODate, formatDate, formatDateLong } from '@/app/_lib/date-helpers';

/*
 * How the header wears each kind of day. The words carry it - "Today",
 * "Yesterday", "Past day", "Future date" - and the wash behind them is the
 * second cue, so being somewhere other than today is NOTICED rather than read
 * for: white with a green edge for today, a slate wash for any past day, amber
 * for a day that has not happened yet.
 *
 * Every wash is one wide gradient, measured in hundreds of pixels. Nothing here
 * is fine enough to shimmer on a cheap screen - see "Texture: nothing smaller
 * than the thing it sits on" in docs/UI_CONVENTIONS.md.
 */
const DAY_TONES = {
  today: {
    label: 'Today',
    wash: 'linear-gradient(115deg, #d1fae5 0%, #ecfdf5 22%, #ffffff 58%)',
    pill: 'bg-brand-100 text-brand-800',
    dot: 'bg-brand-600',
  },
  /* A WHITE pill on the slate wash: a slate pill on slate disappeared into it
     at the first render, and the label is the part that has to be read. */
  yesterday: {
    label: 'Yesterday',
    wash: 'linear-gradient(115deg, #cbd5e1 0%, #e2e8f0 26%, #f8fafc 64%)',
    pill: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-300',
    dot: 'bg-ink-500',
  },
  past: {
    label: 'Past day',
    wash: 'linear-gradient(115deg, #cbd5e1 0%, #e2e8f0 26%, #f8fafc 64%)',
    pill: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-300',
    dot: 'bg-ink-500',
  },
  future: {
    label: 'Future date',
    wash: 'linear-gradient(115deg, #fde68a 0%, #fef3c7 26%, #fffbeb 64%)',
    pill: 'bg-amber-200 text-amber-900',
    dot: 'bg-amber-600',
  },
};

/*
 * The date controls are still `<Button>` - Material UI, the one button system -
 * with the new look's shape laid over it through `sx`: a 12px radius and a 42px
 * height to match the date box they flank, and a hairline instead of MUI's
 * near-black outline, which beside the softened box read as a different kit.
 * Only shape and edge change; the variants, the uppercase label on "Back to
 * today" and the green primary are MUI's own, as the owner asked.
 */
const ARROW_SX = {
  bgcolor: '#ffffff',
  color: '#1e293b',
  borderColor: 'rgb(15 23 42 / 0.18)',
  borderRadius: '12px',
  minWidth: 44,
  height: 42,
  px: 1.5,
  boxShadow: '0 1px 2px rgb(15 23 42 / 0.06)',
  '&:hover': { bgcolor: '#f8fafc', borderColor: 'rgb(15 23 42 / 0.34)' },
};

const PRIMARY_SX = { borderRadius: '12px', height: 42, px: 2.5 };

/**
 * The top of the new Dashboard: where you are, WHICH DAY, and the way to
 * another one.
 *
 * The same job as `<DateNav>`, in the new look, and bound by every rule that
 * component learned the hard way (docs/UI_CONVENTIONS.md -> "The day on screen
 * is stated once, and loudly"):
 *
 *   - the day is said ONCE, as the largest text in the block, with the weekday
 *     - "Saturday" is checkable against the day the reader actually lived;
 *   - there is ALWAYS a relative label, including "Past day", because a day
 *     with no label looks exactly like today at a glance;
 *   - the native date box is only a way to jump. It is drawn in the browser's
 *     locale - 09/26/2026 on an en-US laptop - so it is never the statement of
 *     which day is showing;
 *   - `extraParams` rides through the arrows, the box and "Back to today", or
 *     stepping a day would silently throw away the chart window.
 *
 * It replaced `<DateNav>` on every dated page (Dashboard, Readings, Stock,
 * Lubricants), and DateNav is deleted: the relative-day logic lives here
 * alone now, where for a while it existed twice.
 *
 * `title` / `icon` name the page on the small line above the date (Dashboard,
 * Daily readings); `children` join the end of the control row.
 *
 * The h1 is the date. The page name is the small line above it - the sidebar
 * already marks the section, and on this page the day is the headline.
 */
export default function DayHeader({
  date,
  basePath,
  extraParams,
  title = 'Dashboard',
  icon = 'dashboard',
  children,
}) {
  const carried = new URLSearchParams(extraParams ?? {}).toString();
  const dateHref = (value) => `${basePath}?date=${value}${carried ? `&${carried}` : ''}`;
  const todayHref = carried ? `${basePath}?${carried}` : basePath;

  const today = todayISO();
  const which =
    date === today
      ? 'today'
      : date === shiftISODate(today, -1)
        ? 'yesterday'
        : date > today
          ? 'future'
          : 'past';
  const tone = DAY_TONES[which];

  const previousDate = shiftISODate(date, -1);
  const nextDate = shiftISODate(date, 1);

  return (
    <section
      aria-label="The day on screen"
      data-card
      className="panel @container overflow-hidden"
      style={{ backgroundImage: tone.wash }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-5 @[40rem]:px-7 @[40rem]:py-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-ink-700">
            <Icon name={icon} className="h-5 w-5 text-brand-700" />
            {title}
          </p>
          <h1 className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="sr-only">{title} for </span>
            <span className="text-2xl font-bold tracking-tight text-ink-900 @[34rem]:text-3xl">
              {formatDateLong(date)}
            </span>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${tone.pill}`}
            >
              <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
              {tone.label}
            </span>
          </h1>
        </div>

        {/* White-filled, so they read as buttons against any of the three
            washes rather than as outlines drawn on the tint. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            href={dateHref(previousDate)}
            pending
            spinnerOnly
            aria-label={`Go to ${formatDate(previousDate)}`}
            sx={ARROW_SX}
          >
            <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
          </Button>

          <DateJump date={date} basePath={basePath} extraParams={extraParams} />

          <Button
            variant="secondary"
            href={dateHref(nextDate)}
            pending
            spinnerOnly
            aria-label={`Go to ${formatDate(nextDate)}`}
            sx={ARROW_SX}
          >
            <Icon name="chevronRight" className="h-5 w-5" />
          </Button>

          {/* Only worth showing when it would actually do something. */}
          {which !== 'today' ? (
            <Button variant="primary" href={todayHref} pending sx={PRIMARY_SX}>
              Back to today
            </Button>
          ) : null}

          {/* A page action for the day on screen - Clear this day on
              Readings - joins the same row, sharing its height and baseline,
              as DateNav's `children` always have. */}
          {children}
        </div>
      </div>
    </section>
  );
}
