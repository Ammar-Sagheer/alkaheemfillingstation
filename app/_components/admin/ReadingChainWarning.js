'use client';

/**
 * Tells you when a nozzle's readings do not join up.
 *
 * A meter is continuous, so each reading's opening should equal the previous
 * reading's closing. Two things break that, and both quietly double-count:
 *
 *   BACK-FILLING - you missed the 3rd, entered the 4th, and are now going back.
 *   The 4th was saved with the 2nd's closing as its opening, so it already
 *   covers the 3rd's litres. Saving here counts them twice.
 *
 *   A GAP - the last reading for this nozzle is older than yesterday, so this
 *   entry silently covers several days rather than one.
 *
 * Warnings only. Meters really do get replaced or reset, and blocking the save
 * would trap someone with no way forward. The point is that it is never a
 * surprise afterwards.
 */
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
/*
 * Meter readings always carry two decimals; litres sold do not.
 *
 * A pump meter is a physical dial with a tenths digit, so 1,987,128.80 and
 * 1,987,279.95 are the same shape of number. Formatted with a bare
 * maximumFractionDigits the first lost its trailing zero and rendered as
 * 1,987,128.8 - a digit shorter than the figure directly beside it, in a
 * tabular font whose whole job is to keep the columns aligned. On a screen
 * read in a hurry against cash in a drawer, that is how a digit gets misread.
 */
const meterFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});


function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = String(fromISO).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = String(toISO).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function pretty(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

export default function ReadingChainWarning({ row, date, openingUsed }) {
  const previousClosing =
    row.previous_closing === null || row.previous_closing === undefined
      ? null
      : Number(row.previous_closing);
  const laterOpening =
    row.later_opening === null || row.later_opening === undefined
      ? null
      : Number(row.later_opening);

  const messages = [];

  /*
   * Back-filling into a gap that a later reading already swallowed.
   *
   * Only when the chain actually breaks. A later reading that opens exactly
   * where this day closes is the chain working normally - saying so on every
   * past day, on every nozzle, is how a warning stops being read.
   */
  const closing =
    row.closing_reading === null || row.closing_reading === undefined
      ? null
      : Number(row.closing_reading);
  const nextContinuesFromHere = closing !== null && laterOpening !== null && laterOpening === closing;

  if (row.later_date && !nextContinuesFromHere) {
    /*
     * The same clash, described two ways, because the reader is in two
     * different situations.
     *
     * On a day not yet entered this is a prediction - "saving will count them
     * twice" - and it is what stops the mistake being made. On a day already
     * saved, the same sentence reads as a warning about something that has not
     * happened yet, when in fact it already has. That is worse than unhelpful:
     * it invites someone to look for a save button that is not there and
     * conclude the message is stale. So a saved day is told what IS true, and
     * what to do about it.
     */
    const isSaved = Boolean(row.reading_id);
    const overlaps = laterOpening !== null && closing !== null && laterOpening < closing;
    const laterSpansThisDay =
      previousClosing !== null && laterOpening !== null && laterOpening === previousClosing;

    if (isSaved) {
      messages.push({
        tone: overlaps ? 'danger' : 'warn',
        text: overlaps
          ? `This day and ${pretty(row.later_date)} both cover the same ` +
            `${litreFormat.format(Number(closing) - laterOpening)} litres: ` +
            `${pretty(row.later_date)} opens at ${meterFormat.format(laterOpening)}, before this ` +
            `day closes at ${meterFormat.format(Number(closing))}. One of the two has to be ` +
            `cleared: whichever date the meter was not read on.`
          : `${pretty(row.later_date)} opens at ${meterFormat.format(laterOpening)} but this day ` +
            `closes at ${meterFormat.format(Number(closing))}. The two do not join up, so ` +
            `${litreFormat.format(laterOpening - Number(closing))} litres are on neither day.`,
      });
    } else {
      messages.push({
        tone: laterSpansThisDay ? 'danger' : 'warn',
        text: laterSpansThisDay
          ? `The reading already saved for ${pretty(row.later_date)} opens at ` +
            `${meterFormat.format(laterOpening)}, the same place this day starts, so it already ` +
            `includes these litres. Saving here would count them twice, and will be refused. ` +
            `Clear ${pretty(row.later_date)} first.`
          : `A reading already exists for ${pretty(row.later_date)}, opening at ` +
            `${meterFormat.format(laterOpening)}. Close this day at or below that figure, or the ` +
            `two will overlap and the save will be refused.`,
      });
    }
  }

  // A gap behind us: this entry covers more than one day.
  if (row.previous_date) {
    const gap = daysBetween(row.previous_date, date);
    if (gap > 1) {
      messages.push({
        tone: 'warn',
        text: `The last reading for this nozzle was ${pretty(row.previous_date)}, ${gap} days ` +
              `back. This entry therefore covers ${gap} days of sales, not one.`,
      });
    }
  }

  // The opening does not continue from the previous closing.
  if (
    previousClosing !== null &&
    openingUsed !== null &&
    openingUsed !== undefined &&
    Number(openingUsed) !== previousClosing
  ) {
    messages.push({
      tone: 'danger',
      text: `This reading opens at ${meterFormat.format(Number(openingUsed))} but the previous ` +
            `reading (${pretty(row.previous_date)}) closed at ` +
            `${meterFormat.format(previousClosing)}. The meter cannot jump: these two rows ` +
            `overlap or leave a hole.`,
    });
  }

  // First ever reading on this nozzle - worth saying, not worth alarming over.
  if (previousClosing === null && !row.reading_id) {
    messages.push({
      tone: 'info',
      text: 'First reading for this nozzle, so it opens at 0. Every later day will carry on from ' +
            'wherever you close it.',
    });
  }

  if (messages.length === 0) return null;

  const styles = {
    danger: 'border-red-300 bg-red-50 text-red-800',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    info: 'border-ink-200 bg-ink-50 text-ink-700',
  };

  return (
    <div className="space-y-2">
      {messages.map((message, index) => (
        <p
          key={index}
          // 14px, not the 12px it was: these are sentences someone has to READ
          // before saving - the caption floor is for captions.
          className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium ${styles[message.tone]}`}
        >
          {message.text}
        </p>
      ))}
    </div>
  );
}
