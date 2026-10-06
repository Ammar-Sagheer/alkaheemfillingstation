/**
 * The statement of account, as a PDF, drawn with pdf-lib.
 *
 * A PDF and not a print stylesheet, because of what happens to this page after
 * it leaves the app. It goes on WhatsApp to a haulier who is not going to come
 * to the office, it gets kept in a folder against the day someone disputes a
 * figure, and only sometimes does it go on paper. A browser print dialog gives
 * you the last of those three reliably and the first two only if the person
 * holding the tablet knows where "Save as PDF" hides.
 *
 * WHY A4 AND WHY HELVETICA. A4 is the paper in every shop in Pakistan that will
 * print this. Helvetica is one of the fourteen fonts every PDF reader has built
 * in, so no font is embedded and none has to be: the drawing itself is a few KB,
 * and it opens the same on a cheap Android phone as on a laptop. Embedding a
 * font to gain a nicer `a` would multiply the size of a file that is mostly sent
 * over patchy mobile data.
 *
 * The file lands around 145KB all the same, and effectively all of it is
 * public/logo.png going in at its full resolution to be drawn 38pt tall. That is
 * one small photo's worth over WhatsApp and not worth a build step to fix - but
 * it is worth knowing where the weight is before anyone goes looking for it in
 * the layout. Drop the logo and the same statement is about 8KB.
 *
 * EVERYTHING IS ASCII, and that is a constraint rather than a preference. The
 * standard fonts are WinAnsi-encoded, and pdf-lib THROWS on a character outside
 * it rather than dropping it - so one en-dash pasted into a customer's name, or
 * a rupee sign, and the download fails instead of looking slightly wrong. The
 * app writes "Rs" everywhere anyway (see formatPKR), and `ascii()` below scrubs
 * the punctuation that a phone keyboard produces without anyone meaning to.
 *
 * THE TYPE IS BIGGER THAN A DESKTOP DOCUMENT'S. Same reason the screens are:
 * this is read in a pump office in poor light, and now also by a customer
 * squinting at a phone. Body text is 9.5pt where a dense financial document
 * would use 7.5, and the figure that matters - what is owed - is 26pt.
 */
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { BUSINESS_NAME } from './brand';
import { formatPKR, formatDate, formatDateLong, formatLitres } from './helpers';

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT = A4.width - MARGIN * 2;

/*
 * Pulled from globals.css rather than picked afresh, so a statement in a folder
 * and the screen it came from are recognisably the same document. `brand` is the
 * green on the primary buttons, `ink` the body grey, `due` the red the ledger
 * already uses for money owed.
 */
const COLOR = {
  ink: rgb(0.09, 0.11, 0.13),
  muted: rgb(0.42, 0.45, 0.5),
  faint: rgb(0.62, 0.65, 0.69),
  rule: rgb(0.85, 0.87, 0.89),
  band: rgb(0.96, 0.97, 0.975),
  brand: rgb(0.02, 0.37, 0.24),
  brandTint: rgb(0.93, 0.96, 0.94),
  due: rgb(0.7, 0.11, 0.11),
  dueTint: rgb(0.99, 0.95, 0.95),
};

/**
 * The five columns, and the reason there are only five.
 *
 * Date, what it was, what was taken, what was paid, what was owed afterwards.
 * That is a page of a khata, and it is the same five the transaction history on
 * the customer page shows - so the owner can hold the printed statement beside
 * the screen and read across. Every extra column narrows Detail, and Detail is
 * the one a customer reads to recognise a fill: "Petrol 68.63 L" is what jogs his
 * memory, not the row number.
 */
const COLUMNS = [
  // 76 and not 62, which was measured off "Date" rather than off a date: every
  // row on the first draft read "11 Aug 2..." because the year - the one part of
  // a date that settles an argument about an old fill - was what got cut.
  { key: 'date', label: 'Date', width: 76, align: 'left' },
  { key: 'detail', label: 'Detail', width: 185, align: 'left' },
  { key: 'debit', label: 'Fuel taken', width: 84, align: 'right' },
  { key: 'credit', label: 'Paid', width: 84, align: 'right' },
  { key: 'balance', label: 'Balance', width: 86, align: 'right' },
];

/** Where a column starts, measured from the left margin. */
function columnX(key) {
  let x = MARGIN;
  for (const column of COLUMNS) {
    if (column.key === key) return x;
    x += column.width;
  }
  return x;
}

/**
 * What period the page covers, in one line, with either end able to be open.
 *
 * Four shapes rather than two, because the owner picks two dates now and can
 * leave either blank. "1 Aug 2026 onwards" and "everything up to 31 Aug 2026" are
 * both things he asks for - the first when a customer started trading mid-year,
 * the second when settling an old account up to a date and no further.
 */
function coveringLine({ from, to }) {
  if (from && to) return `Covering  ${formatDate(from)} to ${formatDate(to)}`;
  if (from) return `Covering  ${formatDate(from)} onwards`;
  if (to) return `Covering  everything up to ${formatDate(to)}`;
  return 'Covering  the whole account';
}

/**
 * What the big figure is called, which is NOT always "total now due".
 *
 * A statement whose period ends in the past closes with the balance as it stood
 * at that date; entries since are real and are not on the page. Calling that
 * "total now due" would be asking for the wrong money in the largest type on the
 * sheet. `isCurrent` says which of the two this is - see accountFromParts.
 */
function totalLabel({ isCurrent, settled, inCredit, asAt }) {
  if (!isCurrent) return `Balance as at ${formatDate(asAt)}`;
  if (inCredit) return 'In credit';
  if (settled) return 'Nothing outstanding';
  return 'Total now due';
}

/**
 * Scrub to WinAnsi, because pdf-lib throws on anything else.
 *
 * The curly quotes and dashes are what a phone keyboard inserts silently when
 * someone types a customer's name or a note; the final replace is the backstop
 * for everything else, including Urdu, which cannot be drawn in Helvetica at
 * all. A name that comes through as "?" is a poor statement; a download that
 * fails with a stack trace is no statement.
 */
function ascii(value) {
  return String(value ?? '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E]/g, '');
}

/** Cut a string to fit `width`, with an ellipsis, measuring in the real font. */
function fit(text, font, size, width) {
  const clean = ascii(text);
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;

  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${clean.slice(0, mid)}...`, size) <= width) low = mid;
    else high = mid - 1;
  }
  return `${clean.slice(0, low)}...`;
}

// ---------------------------------------------------------------------------
// A tiny drawing surface, so the layout below reads as layout
// ---------------------------------------------------------------------------

/**
 * A cursor that walks DOWN the page and starts a new one when it runs out.
 *
 * pdf-lib measures from the bottom-left, which is correct for PostScript and
 * backwards for anyone laying out a document. `y` here is distance from the top
 * and `at()` does the flip once, in one place, so no call site has to.
 */
class Sheet {
  constructor(doc, fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.pages = [];
    this.onNewPage = null;
    /** True only while table rows are being drawn - see onNewPage below. */
    this.inTable = false;
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = MARGIN;
    if (this.onNewPage) this.onNewPage(this);
    return this.page;
  }

  /** Distance from the top -> pdf-lib's distance from the bottom. */
  at(y = this.y) {
    return A4.height - y;
  }

  /** How much room is left before the footer's reserved strip. */
  get room() {
    return A4.height - MARGIN - 22 - this.y;
  }

  /** Break to a new page unless `height` still fits. */
  ensure(height) {
    if (this.room < height) this.newPage();
  }

  text(value, { x = MARGIN, size = 9.5, font = 'regular', color = COLOR.ink, width, align } = {}) {
    const typeface = this.fonts[font];
    const string = width ? fit(value, typeface, size, width) : ascii(value);

    let left = x;
    if (align === 'right') left = x + width - typeface.widthOfTextAtSize(string, size);
    else if (align === 'center') {
      left = x + (width - typeface.widthOfTextAtSize(string, size)) / 2;
    }

    this.page.drawText(string, { x: left, y: this.at() - size, size, font: typeface, color });
    return this;
  }

  box(x, width, height, color, { y = this.y } = {}) {
    this.page.drawRectangle({
      x,
      y: A4.height - y - height,
      width,
      height,
      color,
    });
    return this;
  }

  rule({ y = this.y, color = COLOR.rule, thickness = 0.75, x = MARGIN, width = CONTENT } = {}) {
    this.page.drawLine({
      start: { x, y: A4.height - y },
      end: { x: x + width, y: A4.height - y },
      thickness,
      color,
    });
    return this;
  }

  down(amount) {
    this.y += amount;
    return this;
  }
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** The logo, or null. A missing file must never fail a download. */
async function loadLogo(doc) {
  try {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'logo.png'));
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

/**
 * The letterhead - logo BESIDE the name, not above it.
 *
 * It was stacked, and that cost about 26pt at the very top of the page, which
 * does not sound like much until you follow it down: an ordinary ten-fill
 * account then pushed its closing note and signature strip onto a second page
 * that held nothing else. A page of white paper with two ruled lines on it is
 * what someone hands over by mistake, and the copy that matters gets left in the
 * printer. Side by side, the same account finishes on one page.
 */
function drawLetterhead(sheet, logo) {
  const top = sheet.y;
  let textX = MARGIN;

  if (logo) {
    // Fixed HEIGHT, width follows the aspect ratio - a logo swapped for a wider
    // one then keeps its proportions instead of being squashed to a box.
    const height = 38;
    const width = Math.min((logo.width / logo.height) * height, 110);
    sheet.page.drawImage(logo, { x: MARGIN, y: sheet.at(top) - height, width, height });
    textX = MARGIN + width + 14;
  }

  sheet.y = top + 6;
  sheet.text(BUSINESS_NAME, {
    x: textX,
    width: CONTENT - (textX - MARGIN),
    size: 16,
    font: 'bold',
    color: COLOR.brand,
  });
  sheet.down(19);
  sheet.text('Statement of account', {
    x: textX,
    width: CONTENT - (textX - MARGIN),
    size: 11.5,
    font: 'bold',
    color: COLOR.ink,
  });

  sheet.y = top + (logo ? 42 : 32);
}

/**
 * Who it is for and what it comes to - the two things read first, side by side.
 *
 * The amount goes on the right at 26pt because on a statement that is the whole
 * message; everything below it is the working. The panel behind it is red when
 * money is owed and green when it is not, so the answer is legible from across
 * a desk before a single figure has been read.
 */
function drawCustomerAndTotal(sheet, { customer, statement }) {
  const panelWidth = 196;
  const panelX = MARGIN + CONTENT - panelWidth;
  const top = sheet.y;

  // ---- the customer ----
  sheet.text('BILLED TO', { size: 7.5, font: 'bold', color: COLOR.faint });
  sheet.down(12);
  sheet.text(customer.name, { size: 14, font: 'bold', width: CONTENT - panelWidth - 16 });
  sheet.down(15);

  for (const line of [customer.vehicle_number, customer.phone].filter(Boolean)) {
    sheet.text(line, { size: 9.5, color: COLOR.muted, width: CONTENT - panelWidth - 16 });
    sheet.down(12);
  }

  sheet.down(2);
  sheet.text(`Statement date  ${formatDateLong(statement.asOf)}`, {
    size: 9,
    color: COLOR.muted,
  });
  sheet.down(12);
  sheet.text(coveringLine(statement), {
    size: 9,
    color: COLOR.muted,
    width: CONTENT - panelWidth - 16,
  });

  const textBottom = sheet.y + 12;

  // ---- the figure ----
  const settled = statement.settled;
  const panelHeight = 78;
  sheet.box(panelX, panelWidth, panelHeight, settled ? COLOR.brandTint : COLOR.dueTint, {
    y: top,
  });

  sheet.y = top + 14;
  sheet.text(totalLabel(statement).toUpperCase(), {
    x: panelX,
    width: panelWidth - 14,
    align: 'right',
    size: 7.5,
    font: 'bold',
    color: settled ? COLOR.brand : COLOR.due,
  });
  sheet.down(14);
  sheet.text(formatPKR(statement.inCredit ? -statement.totalDue : statement.totalDue), {
    x: panelX,
    width: panelWidth - 14,
    align: 'right',
    size: 26,
    font: 'bold',
    color: settled ? COLOR.brand : COLOR.due,
  });
  sheet.down(32);
  /*
   * The last payment, and not an age worked out from an allocation. "Oldest
   * unpaid fill is 13 days old" stood here, and it was only meaningful while the
   * statement decided which fills were unpaid by spreading payments over them
   * oldest-first - a convention, not a fact. This is a row of the ledger, and
   * "you last paid on 31 August" is in any case the sentence that starts the
   * conversation the sheet is carried into.
   */
  sheet.text(
    statement.lastPayment
      ? `Last payment ${formatPKR(statement.lastPayment.amount)} on ${formatDate(statement.lastPayment.date)}`
      : 'No payment recorded yet',
    {
      x: panelX,
      width: panelWidth - 14,
      align: 'right',
      size: 8.5,
      color: COLOR.muted,
    },
  );

  sheet.y = Math.max(textBottom, top + panelHeight) + 14;
}

function drawTableHead(sheet) {
  const top = sheet.y;
  sheet.box(MARGIN, CONTENT, 20, COLOR.band, { y: top });
  sheet.y = top + 6;

  let x = MARGIN;
  for (const column of COLUMNS) {
    sheet.text(column.label, {
      x: x + 6,
      width: column.width - 12,
      align: column.align,
      size: 7.5,
      font: 'bold',
      color: COLOR.muted,
    });
    x += column.width;
  }

  sheet.y = top + 20;
}

/*
 * Row heights. A fill carries a second line for its fuel and litres; a hand-typed
 * entry ("opening balance from old register") does not. 25 rather than the 28
 * this started at, which is the single biggest saving available on a page that
 * is mostly table - ten fills give back 21pt, and the second line still clears
 * the first comfortably at 8pt.
 */
const ROW_TALL = 25;
const ROW_SHORT = 19;

/**
 * One movement on the account. Returns the height so the caller can page-break.
 *
 * A CORRECTION IS DRAWN GREY AND SAYS SO. It has to be on the page - the balance
 * column would otherwise step by an amount with no line against it - but it is
 * not money taken or money paid, and a customer running his finger down the Paid
 * column must not count a reversal as a payment he made. That mistake has been
 * made here for real: a deleted reading put a Rs 5,001 credit on a ledger and the
 * old statement listed it under PAYMENTS RECEIVED, which is a receipt for money
 * nobody handed over. The word is drawn as well as the grey, because the grey
 * does not survive a photocopier.
 */
function drawEntryRow(sheet, row) {
  const hasSecondLine = Boolean(row.litres || row.fuelType || row.vehicle || row.kind === 'correction');
  const height = hasSecondLine ? ROW_TALL : ROW_SHORT;
  const top = sheet.y;
  const faded = row.kind === 'correction';

  const cells = {
    date: formatDate(row.date),
    detail: row.detail,
    debit: row.debit ? formatPKR(row.debit) : '-',
    credit: row.credit ? formatPKR(row.credit) : '-',
    balance: row.balance === null ? '-' : formatPKR(row.balance),
  };

  let x = MARGIN;
  sheet.y = top + 5;
  for (const column of COLUMNS) {
    let color = COLOR.ink;
    if (faded) color = COLOR.faint;
    else if (column.key === 'date') color = COLOR.muted;
    else if (column.key === 'debit' && row.debit) color = COLOR.due;
    else if (column.key === 'credit' && row.credit) color = COLOR.brand;

    sheet.text(cells[column.key], {
      x: x + 6,
      width: column.width - 12,
      align: column.align,
      size: 9.5,
      font: column.key === 'balance' ? 'bold' : 'regular',
      color,
    });
    x += column.width;
  }

  if (hasSecondLine) {
    sheet.y = top + 16;
    /*
     * PLAIN WORDS. This page is read by the customer, standing at a counter,
     * often on a phone. "Cancelled" and "Cancels the entry above" say what the
     * two rows of a correction are; anything longer is an explanation, and an
     * explanation on a bill is something to argue with rather than something to
     * read.
     */
    const parts = [
      row.cancelled ? 'Cancelled' : null,
      row.reversal ? 'Cancels the entry above' : null,
      row.fuelType ? row.fuelType.charAt(0).toUpperCase() + row.fuelType.slice(1) : null,
      row.litres ? formatLitres(row.litres) : null,
      row.vehicle ? `Vehicle ${ascii(row.vehicle)}` : null,
    ].filter(Boolean);
    sheet.text(parts.join('  '), {
      x: columnX('detail') + 6,
      width: COLUMNS[1].width + COLUMNS[2].width - 12,
      size: 8,
      color: COLOR.faint,
    });
  }

  sheet.y = top + height;
  sheet.rule({ color: rgb(0.93, 0.94, 0.95), thickness: 0.5 });
  return height;
}

/**
 * The opening balance, when a day range was asked for.
 *
 * This is the line that keeps a shortened statement honest. Without it, "last 30
 * days" prints a column of movements that cannot reach the total at the foot, and
 * the first customer to add it up has a grievance. It says how many entries are
 * behind it and how far back they start, so the page never conceals the shape of
 * what it is summarising.
 *
 * The figure is READ OFF the last row before the window rather than added up from
 * the rows behind it - it is a Postgres balance like every other one here.
 */
function drawOpeningBalance(sheet, statement) {
  const top = sheet.y;
  sheet.box(MARGIN, CONTENT, 26, COLOR.band, { y: top });

  sheet.y = top + 6;
  sheet.text(formatDate(statement.from), {
    x: MARGIN + 6,
    width: COLUMNS[0].width - 12,
    size: 9.5,
    color: COLOR.muted,
  });
  sheet.text('Balance brought forward', {
    x: columnX('detail') + 6,
    width: COLUMNS[1].width + COLUMNS[2].width - 12,
    size: 9.5,
    font: 'bold',
  });
  sheet.text(formatPKR(statement.opening), {
    x: columnX('balance') + 6,
    width: COLUMNS[4].width - 12,
    align: 'right',
    size: 9.5,
    font: 'bold',
  });

  sheet.y = top + 16;
  sheet.text(
    `${statement.openingCount} earlier ${
      statement.openingCount === 1 ? 'entry' : 'entries'
    }, from ${formatDate(statement.openingFrom)}`,
    {
      x: columnX('detail') + 6,
      width: COLUMNS[1].width + COLUMNS[2].width - 12,
      size: 8,
      color: COLOR.muted,
    },
  );

  sheet.y = top + 26;
  sheet.rule({ color: rgb(0.93, 0.94, 0.95), thickness: 0.5 });
}

/**
 * The foot of the table: what the period did to the balance, then the total.
 *
 * THE SUBTOTAL LINE IS THE ONE THAT GETS CHECKED. A customer with the sheet in
 * his hand does not add up thirty rows - he reads "fuel taken 55,000, paid
 * 40,000" and compares those two against his own book, and only then goes
 * looking at the rows if they disagree. The two columns are drawn under the
 * columns they total, which is the whole reason to have kept the table to five.
 */
function drawTotals(sheet, statement) {
  sheet.ensure(74);

  // ---- what moved in the period ----
  let top = sheet.y;
  sheet.box(MARGIN, CONTENT, 22, COLOR.band, { y: top });
  sheet.y = top + 7;
  sheet.text(statement.from || statement.to ? 'In this period' : 'In total', {
    x: MARGIN + 6,
    width: COLUMNS[0].width + COLUMNS[1].width - 12,
    size: 9,
    font: 'bold',
  });
  sheet.text(formatPKR(statement.fuelTaken), {
    x: columnX('debit') + 6,
    width: COLUMNS[2].width - 12,
    align: 'right',
    size: 9.5,
    font: 'bold',
    color: COLOR.due,
  });
  sheet.text(formatPKR(statement.paid), {
    x: columnX('credit') + 6,
    width: COLUMNS[3].width - 12,
    align: 'right',
    size: 9.5,
    font: 'bold',
    color: COLOR.brand,
  });
  sheet.y = top + 22;

  /*
   * Corrections net to zero whenever both halves of a pair are inside the window,
   * which is nearly always; the line appears when a reversal's partner is older
   * than the period, so the column still reaches the total rather than seeming to
   * lose a figure.
   */
  if (Math.abs(statement.corrections) >= 0.5) {
    top = sheet.y;
    sheet.y = top + 4;
    sheet.text('Corrections', {
      x: MARGIN + 6,
      width: COLUMNS[0].width + COLUMNS[1].width - 12,
      size: 9,
      color: COLOR.muted,
    });
    sheet.text(formatPKR(statement.corrections), {
      x: columnX('balance') + 6,
      width: COLUMNS[4].width - 12,
      align: 'right',
      size: 9,
      font: 'bold',
      color: COLOR.muted,
    });
    sheet.y = top + 18;
  }

  /*
   * THE LINES MUST REACH THE TOTAL, and if they do not the page says so instead
   * of hoping nobody adds up the column. `discrepancy` is zero on every statement
   * this can currently produce - it exists because it was once not zero and
   * nothing on the page admitted it. Drawn immediately above the total, where
   * someone checking the arithmetic is already looking.
   */
  if (statement.discrepancy) {
    top = sheet.y;
    sheet.y = top + 4;
    sheet.text('Other movements on the account', {
      x: MARGIN + 6,
      width: COLUMNS[0].width + COLUMNS[1].width - 12,
      size: 9,
      color: COLOR.muted,
    });
    sheet.text(formatPKR(statement.discrepancy), {
      x: columnX('balance') + 6,
      width: COLUMNS[4].width - 12,
      align: 'right',
      size: 9,
      font: 'bold',
      color: COLOR.muted,
    });
    sheet.y = top + 18;
  }

  // ---- the answer ----
  top = sheet.y + 4;
  const settled = statement.settled;

  sheet.box(MARGIN, CONTENT, 30, settled ? COLOR.brandTint : COLOR.dueTint, { y: top });
  sheet.y = top + 9;

  sheet.text(totalLabel(statement).toUpperCase(), {
    x: MARGIN + 10,
    width: 220,
    size: 9.5,
    font: 'bold',
    color: settled ? COLOR.brand : COLOR.due,
  });
  sheet.text(formatPKR(statement.inCredit ? -statement.totalDue : statement.totalDue), {
    x: MARGIN,
    width: CONTENT - 10,
    align: 'right',
    size: 13,
    font: 'bold',
    color: settled ? COLOR.brand : COLOR.due,
  });

  sheet.y = top + 30 + 14;
}

/** The page when there is nothing to chase. */
function drawAllClear(sheet, statement) {
  const top = sheet.y;
  sheet.box(MARGIN, CONTENT, 76, COLOR.brandTint, { y: top });

  sheet.y = top + 16;
  sheet.text('All dues cleared', {
    x: MARGIN + 16,
    width: CONTENT - 32,
    size: 15,
    font: 'bold',
    color: COLOR.brand,
  });
  sheet.down(22);
  sheet.text(
    `There is nothing outstanding on this account as at ${formatDateLong(statement.asAt)}.`,
    { x: MARGIN + 16, width: CONTENT - 32, size: 10, color: COLOR.ink },
  );
  sheet.down(15);
  sheet.text(
    statement.inCredit
      ? `${formatPKR(-statement.totalDue)} is held in credit against the next fill.`
      : 'Thank you. Every fill taken on credit has been paid for.',
    { x: MARGIN + 16, width: CONTENT - 32, size: 10, color: COLOR.muted },
  );

  sheet.y = top + 76 + 20;
}

/**
 * The few short lines at the foot, and the receipt strip.
 *
 * WRITTEN FOR THE PERSON BEING ASKED TO PAY, who is not an accountant and is
 * probably reading this on a phone. Short sentences, ordinary words, and nothing
 * that explains the document to itself. The statement this replaced needed a
 * footnote here to make its "paid off" column mean anything, and a figure that
 * needs a footnote to survive being read is the wrong figure - that is why the
 * page now simply lists what happened.
 *
 * The signature strip stays, because in practice this sheet goes out with
 * someone collecting cash and comes back as the record that it was collected,
 * which it can only be if there is somewhere to sign.
 */
function drawClosing(sheet, statement) {
  sheet.ensure(84);
  sheet.down(4);

  if (!statement.settled) {
    /*
     * ONE SHORT LINE EACH. `fit()` truncates rather than wraps - it draws into a
     * fixed width - so a sentence that runs past CONTENT at 8.5pt loses its tail
     * to an ellipsis. A first draft ran long and ended "...is in the balance
     * brought fo...", which reads as a broken document on a page you are asking
     * someone to pay from.
     */
    sheet.text('Every fill and every payment is listed above.', {
      size: 8.5,
      color: COLOR.muted,
      width: CONTENT,
    });
    sheet.down(11);

    if (statement.from) {
      sheet.text('Anything older is included in the balance brought forward at the top.', {
        size: 8.5,
        color: COLOR.muted,
        width: CONTENT,
      });
      sheet.down(11);
    }
  }

  sheet.text(
    `Figures are as at ${formatDateLong(statement.asAt)}. Anything paid after that is not on this page.`,
    { size: 8.5, color: COLOR.muted, width: CONTENT },
  );
  sheet.down(11);
  sheet.text('Please check this against your own record and tell us if anything is different.', {
    size: 8.5,
    color: COLOR.muted,
    width: CONTENT,
  });

  if (statement.settled) return;

  sheet.down(26);
  const lineWidth = (CONTENT - 40) / 2;
  sheet.rule({ width: lineWidth, color: COLOR.faint });
  sheet.rule({ x: MARGIN + lineWidth + 40, width: lineWidth, color: COLOR.faint });
  sheet.down(7);
  sheet.text('Amount received, and signature', { size: 8, color: COLOR.muted });
  sheet.text('Customer signature', { x: MARGIN + lineWidth + 40, size: 8, color: COLOR.muted });
}

/** Page numbers, written last, when the count is finally known. */
function stampFooters(sheet, customer) {
  sheet.pages.forEach((page, index) => {
    const label = `${ascii(customer.name)}  -  page ${index + 1} of ${sheet.pages.length}`;
    const size = 7.5;
    page.drawText(label, {
      x: MARGIN,
      y: MARGIN - 12,
      size,
      font: sheet.fonts.regular,
      color: COLOR.faint,
    });
    const right = `${ascii(BUSINESS_NAME)}`;
    page.drawText(right, {
      x: MARGIN + CONTENT - sheet.fonts.regular.widthOfTextAtSize(right, size),
      y: MARGIN - 12,
      size,
      font: sheet.fonts.regular,
      color: COLOR.faint,
    });
  });
}

// ---------------------------------------------------------------------------

/**
 * Build the statement. Returns a Uint8Array ready to write to the response.
 *
 * `statement` is what buildAccountStatement() in customer-statement.js produced;
 * this file does no arithmetic of its own at all - every figure on the page, the
 * balance beside each row included, arrives already worked out.
 */
export async function buildStatementPdf({ customer, statement }) {
  const doc = await PDFDocument.create();

  doc.setTitle(`Statement of account - ${ascii(customer.name)}`);
  doc.setAuthor(BUSINESS_NAME);
  doc.setSubject(`Account as at ${statement.asAt}`);
  doc.setProducer(BUSINESS_NAME);
  doc.setCreator(BUSINESS_NAME);

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const logo = await loadLogo(doc);
  const sheet = new Sheet(doc, fonts);

  /*
   * Page two onward gets a thin repeat of the letterhead and the column heads.
   * A long-standing account can run past one page, and a loose sheet of figures
   * with no name on it is unusable in a folder.
   */
  sheet.onNewPage = (self) => {
    if (self.pages.length === 1) return;
    self.text(`${BUSINESS_NAME}  -  statement for ${customer.name}`, {
      size: 8.5,
      font: 'bold',
      color: COLOR.muted,
      width: CONTENT,
    });
    self.down(14);
    self.rule();
    self.down(12);

    /*
     * The column heads repeat ONLY while the table is the thing that broke.
     * Unconditionally, they were drawn on a continuation page carrying nothing
     * but the closing note - a header for a table with no rows under it, which
     * reads as a page whose contents failed to print.
     */
    if (self.inTable) drawTableHead(self);
  };

  drawLetterhead(sheet, logo);
  sheet.rule();
  sheet.down(16);
  drawCustomerAndTotal(sheet, { customer, statement });

  // Nothing has ever been put on this account - no table to draw, and a page of
  // column heads with nothing under them reads as a failed print.
  if (statement.empty) {
    drawAllClear(sheet, statement);
    drawClosing(sheet, statement);
    stampFooters(sheet, customer);
    return doc.save();
  }

  // The account is settled, and the panel says so before the working - but the
  // working is still printed: "you paid it all off" is worth more with the fills
  // and the payments under it than on its own.
  if (statement.settled) drawAllClear(sheet, statement);

  sheet.ensure(80);
  sheet.text(
    statement.from || statement.to ? 'THE ACCOUNT IN THIS PERIOD' : 'THE ACCOUNT IN FULL',
    { size: 7.5, font: 'bold', color: COLOR.faint },
  );
  sheet.down(13);
  sheet.inTable = true;
  drawTableHead(sheet);

  if (statement.openingCount > 0) drawOpeningBalance(sheet, statement);

  for (const row of statement.rows) {
    sheet.ensure(row.litres || row.fuelType || row.vehicle || row.kind === 'correction' ? ROW_TALL : ROW_SHORT);
    drawEntryRow(sheet, row);
  }
  sheet.inTable = false;

  /*
   * Nothing moved inside the window, but the balance did not go away with it.
   * Silence here would read as "nothing owed" directly above a total that says
   * otherwise.
   */
  if (statement.rows.length === 0) {
    sheet.down(8);
    sheet.text(
      `Nothing was taken and nothing was paid in this period. The whole amount is from earlier.`,
      { size: 9, color: COLOR.muted, width: CONTENT, x: MARGIN + 6 },
    );
    sheet.down(16);
  }

  drawTotals(sheet, statement);
  drawClosing(sheet, statement);
  stampFooters(sheet, customer);

  return doc.save();
}

/**
 * A filename someone can find again six months later.
 *
 * Name first because that is what the folder is sorted by when the owner is
 * looking for one customer, date second so successive statements for the same
 * customer sit in order under it.
 */
export function statementFilename(customer, asOf) {
  const name = ascii(customer.name)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `Statement-${name || 'customer'}-${asOf}.pdf`;
}
