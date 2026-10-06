/**
 * Builds the monthly Excel report, charts and all.
 *
 * The awkward bit: no JavaScript library writes native Excel charts. ExcelJS
 * has no chart support at all, and Vercel cannot run Python, so the charts
 * cannot be authored at request time.
 *
 * So they are authored once, offline, by scripts/build-report-template.py, and
 * committed as report-template.xlsx. Here we open that file as the zip it
 * really is, replace the XML of the DATA sheets only, and zip it back up. The
 * chart parts are never opened, so they come through untouched - and the result
 * is a real Excel chart, not a picture of one: the owner can restyle it, and it
 * redraws if he edits the numbers.
 *
 * The rule that keeps this working: charts point at FIXED ranges (Daily rows
 * 2-32). A short month just leaves blank rows, which Excel skips. Never let a
 * chart range depend on how many rows the data happened to produce.
 */
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import { BUSINESS_NAME } from './brand';
import { ASSET_CATEGORIES } from './asset-categories';

const TEMPLATE_PATH = path.join(process.cwd(), 'app', '_lib', 'report-template.xlsx');

/**
 * Sheet order comes from the template. `Charts` (sheet3) is deliberately absent:
 * it holds the drawing relationship that anchors the charts, and rewriting it
 * would drop them.
 */
const SHEET_FILES = {
  Summary: 'xl/worksheets/sheet1.xml',
  Daily: 'xl/worksheets/sheet2.xml',
  Purchases: 'xl/worksheets/sheet4.xml',
  Expenses: 'xl/worksheets/sheet5.xml',
  Customers: 'xl/worksheets/sheet6.xml',
  Readings: 'xl/worksheets/sheet7.xml',
  Bank: 'xl/worksheets/sheet8.xml',
  Lubricants: 'xl/worksheets/sheet9.xml',
  Assets: 'xl/worksheets/sheet10.xml',
};

/*
 * Category comes out of Postgres as its enum value (`vehicle`), and the app
 * shows the label (`Vehicle`). The workbook has to say what the screen says or
 * the owner is reading two different vocabularies for one field, so this maps
 * through the SAME list the picker and the page use rather than capitalising
 * the string by hand.
 */
const ASSET_CATEGORY_LABEL = Object.fromEntries(
  ASSET_CATEGORIES.map((category) => [category.value, category.label]),
);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnLetter(index) {
  let letter = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * Style ids for a row, read off the template's prototype row.
 *
 * Cheaper and far less brittle than re-deriving indexes from styles.xml: the
 * template already contains a styled empty row with the right number formats,
 * so we simply reuse whatever style each of its cells points at.
 */
function readPrototypeStyles(sheetXml, rowNumber) {
  const rowMatch = new RegExp(`<row[^>]*r="${rowNumber}"[^>]*>([\\s\\S]*?)</row>`).exec(sheetXml);
  const styles = {};
  if (!rowMatch) return styles;

  const cellPattern = /<c\s+r="([A-Z]+)\d+"([^>]*)>/g;
  let cell;
  while ((cell = cellPattern.exec(rowMatch[1]))) {
    const style = /s="(\d+)"/.exec(cell[2]);
    if (style) styles[cell[1]] = style[1];
  }
  return styles;
}

/** One <c> element. Numbers stay numeric so Excel can chart and total them. */
function buildCell(reference, value, styleId) {
  const style = styleId ? ` s="${styleId}"` : '';

  if (value === null || value === undefined || value === '') {
    return `<c r="${reference}"${style}/>`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  // Inline strings avoid having to maintain a shared-strings table.
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/**
 * Rewrites a sheet's rows, keeping its header row, column widths and frozen
 * panes exactly as the template defined them.
 */
function writeSheet(sheetXml, rows, { keepRows = 1 } = {}) {
  const prototypeStyles = readPrototypeStyles(sheetXml, keepRows + 1);

  const sheetDataMatch = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(sheetXml);
  if (!sheetDataMatch) throw new Error('Template sheet has no <sheetData>');

  // Keep the styled header rows verbatim.
  const keptRows = [];
  const rowPattern = /<row[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>|<row[^>]*r="(\d+)"[^>]*\/>/g;
  let row;
  while ((row = rowPattern.exec(sheetDataMatch[1]))) {
    const rowNumber = Number(row[1] ?? row[2]);
    if (rowNumber <= keepRows) keptRows.push(row[0]);
  }

  const newRows = rows.map((values, rowIndex) => {
    const rowNumber = keepRows + 1 + rowIndex;
    const cells = values
      .map((value, columnIndex) => {
        const letter = columnLetter(columnIndex + 1);
        return buildCell(`${letter}${rowNumber}`, value, prototypeStyles[letter]);
      })
      .join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  });

  const widestRow = rows.reduce((widest, values) => Math.max(widest, values.length), 1);
  const lastRow = keepRows + rows.length;
  const dimension = `A1:${columnLetter(Math.max(widestRow, 1))}${Math.max(lastRow, 1)}`;

  return sheetXml
    .replace(/<dimension[^>]*\/>/, `<dimension ref="${dimension}"/>`)
    .replace(
      /<sheetData>[\s\S]*?<\/sheetData>/,
      `<sheetData>${keptRows.join('')}${newRows.join('')}</sheetData>`,
    );
}

/**
 * An ISO date as an Excel serial number.
 *
 * Excel counts days from 1899-12-30. Written as a number (with a date format
 * from the template) rather than as text, so the chart's category axis reads
 * them as dates and the column sorts as dates rather than alphabetically.
 */
function toExcelDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  return days;
}

const num = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const FUEL_LABELS = { petrol: 'Petrol', diesel: 'Diesel', lubricant: 'Lubricant' };

const fuelLabel = (fuel) => FUEL_LABELS[fuel] ?? fuel ?? '';

/**
 * @param {object} data  the payload from the get_month_export RPC
 * @returns {Promise<Buffer>} a complete .xlsx
 */
export async function buildMonthlyWorkbook(data, { generatedOn } = {}) {
  const zip = await JSZip.loadAsync(await readFile(TEMPLATE_PATH));

  const sales = data.sales ?? {};
  const purchases = data.purchases ?? {};
  const lubricantSales = data.lubricant_sales ?? {};
  const lubricantPurchases = data.lubricant_purchases ?? {};
  const bankMonth = data.bank_month ?? {};
  const assets = data.assets ?? {};
  const [year, month] = String(data.from).slice(0, 10).split('-').map(Number);

  // ---- Summary: label / value pairs, written as plain rows ----
  const summaryRows = [
    [BUSINESS_NAME, ''],
    ['Monthly Report', ''],
    ['Period', `${MONTHS[month - 1]} ${year}`],
    ['Generated', generatedOn ?? ''],
    ['', ''],
    ['FUEL SALES', ''],
    ['Litres sold', num(sales.litres_sold)],
    ['Sales', num(sales.sale_amount)],
    ['Cash taken', num(sales.cash_amount)],
    ['Given on credit', num(sales.credit_amount)],
    ['', ''],
    ['LUBRICANT SALES', ''],
    ['Litres sold', num(lubricantSales.litres)],
    ['Sales', num(lubricantSales.amount)],
    ['Cash taken', num(lubricantSales.cash_amount)],
    ['Given on credit', num(lubricantSales.credit_amount)],
    // The drum on its own line. It is most of the sale COUNT and a small part
    // of the money, so folded into the figures above it flatters neither.
    ['  of which loose oil', num(lubricantSales.loose_amount)],
    ['  loose oil sales', num(lubricantSales.loose_count)],
    ['  loose oil litres', num(lubricantSales.loose_litres)],
    ['', ''],
    ['ALL SALES', num(data.total_sales)],
    ['', ''],
    ['COSTS', ''],
    ['Fuel bought (litres)', num(purchases.quantity_litres)],
    ['Fuel bought (cost)', num(purchases.total_cost)],
    ['Lubricants bought (litres)', num(lubricantPurchases.quantity_litres)],
    ['Lubricants bought (cost)', num(lubricantPurchases.total_cost)],
    ['  of which loose oil (litres)', num(lubricantPurchases.loose_litres)],
    ['  of which loose oil (cost)', num(lubricantPurchases.loose_cost)],
    [
      'Still owed to suppliers',
      num(purchases.pending_amount) + num(lubricantPurchases.pending_amount),
    ],
    ['Expenses', num(data.expenses_total)],
    ['', ''],
    ['Cost of stock SOLD', num(data.cost_of_goods_sold)],
    ['', ''],
    ['PROFIT (all sales - cost of stock sold - expenses)', num(data.profit)],
    ['', ''],
    ['OPENING STOCK (value, start of month)', num(data.opening_stock_value)],
    ['CLOSING STOCK (value, end of month)', num(data.closing_stock_value)],
    ['', ''],
    ['CLOSING STOCK (quantities)', ''],
    ...(data.closing_inventory ?? []).map((tank) => [
      `  ${tank.name}`,
      num(tank.closing_litres),
    ]),
    ...(data.lubricant_stock ?? []).map((product) => [
      `  ${product.name}`,
      num(product.closing_litres),
    ]),
    ['', ''],
    // Bank movements sit apart from profit on purpose: paying cash into the
    // bank is not income and transferring it out is not a cost - the sale and
    // the expense were already counted above when they happened. Putting these
    // under COSTS would count the same money twice.
    ['BANK', ''],
    ['Paid into the bank this month', num(bankMonth.deposits)],
    ['Paid out of the bank this month', num(bankMonth.payments)],
    ...(data.bank_accounts ?? []).map((account) => [
      `  ${account.account} balance`,
      num(account.balance),
    ]),
    ['', ''],
    // Assets sit apart from profit for the same reason the bank block does,
    // and the note says so out loud. Money spent on a delivery bike is not a
    // cost of trading the way a fuel delivery is - the pump still has the
    // bike. The app has never counted it in profit, and a figure on this
    // sheet without that sentence is one somebody subtracts by hand.
    ['COMPANY ASSETS', ''],
    ['Bought this month (count)', assets.month_count ?? 0],
    ['Bought this month (value)', num(assets.month_value)],
    ['Owned in total (count)', assets.count ?? 0],
    ['Owned in total (value)', num(assets.total_value)],
    ['', 'Not counted in profit above - see the Assets sheet.'],
    ['', ''],
    ['Note', 'Profit counts the stock actually SOLD - fuel and lubricants alike:'],
    ['', 'opening stock + everything bought - closing stock. A delivery still'],
    ['', 'in the tank on the last of the month is NOT charged against that'],
    ['', 'month; it is carried in closing stock and charged when it sells.'],
    ['', ''],
    ['', 'Stock on hand is valued at the weighted average cost of the'],
    ['', 'deliveries it is actually made of - for a tank, the last few loads.'],
  ];

  // Summary has no header row to preserve - it is all generated.
  const summaryXml = await zip.file(SHEET_FILES.Summary).async('string');
  zip.file(SHEET_FILES.Summary, writeSheet(summaryXml, summaryRows, { keepRows: 0 }));

  // ---- Daily: what the three charts read ----
  //
  // The two lubricant columns sit after everything the charts point at, so the
  // fixed ranges in the template keep meaning what they meant. Never insert a
  // column before column G here.
  const dailyRows = (data.daily ?? []).map((day) => [
    toExcelDate(day.day),
    num(day.litres_sold),
    num(day.petrol_litres),
    num(day.diesel_litres),
    num(day.sale_amount),
    num(day.cash_amount),
    num(day.credit_amount),
    num(day.lubricant_litres),
    num(day.lubricant_amount),
  ]);
  const dailyXml = await zip.file(SHEET_FILES.Daily).async('string');
  zip.file(SHEET_FILES.Daily, writeSheet(dailyXml, dailyRows));

  // ---- detail listings ----
  const purchaseRows = (data.purchase_rows ?? []).map((row) => [
    toExcelDate(row.date),
    row.tank ?? '',
    fuelLabel(row.fuel_type),
    row.supplier ?? '',
    row.invoice ?? '',
    num(row.litres),
    num(row.rate),
    num(row.cost),
    row.payment_status === 'paid' ? 'Paid' : 'Pending',
  ]);
  const purchasesXml = await zip.file(SHEET_FILES.Purchases).async('string');
  zip.file(SHEET_FILES.Purchases, writeSheet(purchasesXml, purchaseRows));

  const expenseRows = (data.expense_rows ?? []).map((row) => [
    toExcelDate(row.date),
    row.category ?? '',
    row.note ?? '',
    num(row.amount),
  ]);
  const expensesXml = await zip.file(SHEET_FILES.Expenses).async('string');
  zip.file(SHEET_FILES.Expenses, writeSheet(expensesXml, expenseRows));

  const customerRows = (data.customer_rows ?? []).map((row) => [
    row.name ?? '',
    row.vehicle_number ?? '',
    row.credit_limit === null || row.credit_limit === undefined ? '' : num(row.credit_limit),
    num(row.balance),
  ]);
  const customersXml = await zip.file(SHEET_FILES.Customers).async('string');
  zip.file(SHEET_FILES.Customers, writeSheet(customersXml, customerRows));

  const readingRows = (data.reading_rows ?? []).map((row) => [
    toExcelDate(row.date),
    num(row.unit),
    row.nozzle ?? '',
    fuelLabel(row.fuel_type),
    num(row.opening),
    num(row.closing),
    num(row.litres),
    num(row.rate),
    num(row.sale_amount),
    num(row.cash_amount),
    num(row.credit_amount),
  ]);
  const readingsXml = await zip.file(SHEET_FILES.Readings).async('string');
  zip.file(SHEET_FILES.Readings, writeSheet(readingsXml, readingRows));

  // ---- Bank ----
  //
  // Until migration 070 the Banking page kept only the last 60 transactions per
  // account, and this workbook was the only itemised record of the rest. Every
  // entry is kept now; the sheet is still the month's bank record on paper. In
  // and Out are separate columns for
  // the same reason they are on screen: a signed number read in a hurry is how
  // a payment gets taken for a deposit.
  const bankRows = (data.bank_rows ?? []).map((row) => {
    const isDeposit = row.direction === 'deposit';
    return [
      toExcelDate(row.date),
      row.account ?? '',
      row.bank ?? '',
      isDeposit ? num(row.amount) : '',
      isDeposit ? '' : num(row.amount),
      row.category ?? (isDeposit ? 'Cash paid in' : ''),
      row.note ?? '',
    ];
  });
  const bankXml = await zip.file(SHEET_FILES.Bank).async('string');
  zip.file(SHEET_FILES.Bank, writeSheet(bankXml, bankRows));

  // ---- Lubricants ----
  //
  // Every counter sale in the month, one row each. Cash and credit are separate
  // columns for the same reason they are on the Bank sheet: the split is the
  // thing being checked, and a single total hides it.
  const lubricantRows = (data.lubricant_rows ?? []).map((row) => [
    toExcelDate(row.date),
    row.name ?? '',
    num(row.litres),
    num(row.rate),
    num(row.amount),
    num(row.cash_amount),
    num(row.credit_amount),
    row.customer ?? '',
    row.note ?? '',
    // Which side of the business the row is. The name usually says so too, but
    // a word in its own column is what makes the sheet filterable - the owner
    // wanting "just the drum for August" should not have to trust a spelling.
    row.sold_loose ? 'Loose' : 'Packed',
  ]);
  const lubricantsXml = await zip.file(SHEET_FILES.Lubricants).async('string');
  zip.file(SHEET_FILES.Lubricants, writeSheet(lubricantsXml, lubricantRows));

  // ---- Assets ----
  //
  // THE WHOLE REGISTER, not just what was bought this month, which is why this
  // sheet is the one that ignores the report's date range. An asset register
  // answers "what does the business own", and most months the pump buys
  // nothing at all - a month-scoped sheet would be empty in those months and
  // read as a bug rather than as a fact. "Bought this month" is a column
  // instead, so the sheet still filters down to the month when that is the
  // question. `bank_accounts` on the Summary sheet takes the same line: a
  // standing balance beside the month's movements.
  const assetRows = (data.asset_rows ?? []).map((row) => [
    toExcelDate(row.date),
    row.name ?? '',
    ASSET_CATEGORY_LABEL[row.category] ?? row.category ?? '',
    num(row.value),
    // A word, not a tick: a blank cell against a boolean column is ambiguous
    // between "no" and "nothing was written here", and this column is the one
    // the owner will filter on.
    row.in_month ? 'Yes' : 'No',
    row.note ?? '',
  ]);
  // A TOTAL AT THE FOOT, because the question this sheet is opened to answer
  // is "what is all of it worth" and a column of twelve figures does not
  // answer it without the reader reaching for a calculator. It comes from the
  // `assets` summary rather than adding the rows up here, so the sheet and the
  // Summary block cannot disagree - they are then the same figure from the
  // same query rather than two counts that happen to match today.
  if (assetRows.length > 0) {
    assetRows.push(['', '', '', '', '', '']);
    assetRows.push([
      '',
      `Total owned: ${assets.count ?? assetRows.length} asset${(assets.count ?? 0) === 1 ? '' : 's'}`,
      '',
      num(assets.total_value),
      '',
      '',
    ]);
  }

  const assetsXml = await zip.file(SHEET_FILES.Assets).async('string');
  zip.file(SHEET_FILES.Assets, writeSheet(assetsXml, assetRows));

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/** e.g. "pump-report-2026-08.xlsx" */
export function workbookFilename(data) {
  return `pump-report-${String(data.from).slice(0, 7)}.xlsx`;
}
