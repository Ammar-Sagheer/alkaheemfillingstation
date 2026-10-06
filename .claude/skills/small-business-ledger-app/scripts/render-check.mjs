#!/usr/bin/env node
/**
 * Screenshot a page at several widths and report anything the layout clips.
 *
 *   node render-check.mjs <url> [outDir] [--widths 1440,1152,1024,400]
 *
 * Two jobs, because either alone misses bugs:
 *
 *   1. Screenshots, so you can SEE cramped or ugly output. A DOM measurement
 *      cannot tell you a card looks wrong.
 *   2. A clipping report, so you catch what the eye slides over - a truncated
 *      figure, a column cut off, a label ending in an ellipsis. On a money
 *      screen a silently shortened number is the expensive kind of bug.
 *
 * Widths: 1440 and 1152 are ordinary laptops, 1024 is a tablet in landscape
 * and the width where sidebars start to squeeze tables, 400 is a phone. ADD
 * 360 AND 320 whenever money figures are on screen - seven-digit sums fit at
 * 400 and overflow below it, which is where the cheap phones live.
 *
 * Reading the clipping report: entries are elements whose content is wider
 * than their own box. Some are intentional - a `truncate` class on a business
 * name, a table wrapper that scrolls on purpose, an `sr-only` heading. The
 * report prints the element's classes so you can tell which. What you are
 * hunting is a NUMBER in the list.
 *
 * Requires playwright-core and a Chromium on disk. If the project has no
 * playwright, `npm install --no-save playwright-core` is enough - this only
 * drives an existing browser binary.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const url = args[0];
const outDir = args[1] && !args[1].startsWith('--') ? args[1] : './shots';

if (!url) {
  console.error('usage: node render-check.mjs <url> [outDir] [--widths 1440,400]');
  process.exit(1);
}

const widthArg = args.indexOf('--widths');
const widths =
  widthArg !== -1 && args[widthArg + 1]
    ? args[widthArg + 1].split(',').map((w) => Number(w.trim()))
    : [1440, 1152, 1024, 400];

/** Chromium ships in a versioned folder; the unversioned path often is not real. */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return null;

  const dirs = readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidate = join(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const executablePath = findChromium();
if (!executablePath) {
  console.error(
    'No Chromium found. Set CHROMIUM_PATH, or PLAYWRIGHT_BROWSERS_PATH to the folder\n' +
      'holding chromium-<version>/. Do not run "playwright install" in a sandbox that\n' +
      'already ships a browser.',
  );
  process.exit(1);
}

/*
 * playwright-core lives in the PROJECT's node_modules, not next to this script
 * - the skill is installed somewhere else entirely, so a bare import resolves
 * relative to this file and fails. Resolve from the working directory first,
 * then from the script's own location for a global install.
 */
function loadPlaywright() {
  const roots = [process.cwd(), import.meta.dirname];

  for (const root of roots) {
    try {
      // require(), not import(): playwright-core is CommonJS, and importing its
      // entry by path yields a namespace whose named exports may be missing.
      const require = createRequire(join(root, 'noop.js'));
      const mod = require('playwright-core');
      const pw = mod?.chromium ? mod : mod?.default;
      if (pw?.chromium) return pw;
    } catch {
      /* try the next root */
    }
  }

  throw new Error('playwright-core not resolvable');
}

let chromium;
try {
  ({ chromium } = loadPlaywright());
} catch {
  console.error(
    'playwright-core not found. From the project root:\n' +
      '  npm install --no-save playwright-core\n' +
      'It only drives a browser already on disk - do NOT run "playwright install".',
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
let anyProblem = false;

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (error) {
    console.error(`${width}px  could not load: ${error.message}`);
    await page.close();
    anyProblem = true;
    continue;
  }

  // Let fonts settle; a measurement taken mid-swap reports the wrong widths.
  await page.waitForTimeout(400);

  const report = await page.evaluate(() => {
    const doc = document.documentElement;

    const clipped = [...document.querySelectorAll('body *')]
      .filter((el) => {
        if (el.clientWidth === 0) return false;
        if (el.scrollWidth <= el.clientWidth + 1) return false;
        // Deliberate scrollers are not bugs; they are the fix for wide tables.
        const overflowX = getComputedStyle(el).overflowX;
        return overflowX !== 'auto' && overflowX !== 'scroll';
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 48),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
      }));

    /*
     * ESCAPES: children that sit outside their CONTAINER's padding box.
     *
     * The `clipped` pass above asks whether an element overflows ITSELF, and
     * that is not the same question. A figure or a chart can sit entirely
     * inside its own box while hanging out through the side of the card
     * holding it - `scrollWidth` reports clean and the page still looks
     * broken. This was found for real: a sparkline carrying `width={72}` as
     * an SVG attribute stayed 72px however narrow its tile got and pushed
     * straight out through the card's right edge, past a check that said
     * nothing was wrong.
     *
     * Containers are whatever the app calls a card; adjust the selector to
     * match. Half a pixel of tolerance, because subpixel layout puts a child
     * a hair past its parent all the time without anything being wrong.
     */
    const containers = document.querySelectorAll('.card, [data-card]');
    const escaped = [];
    containers.forEach((card) => {
      const cs = getComputedStyle(card);
      const box = card.getBoundingClientRect();
      const padLeft = box.left + parseFloat(cs.paddingLeft || 0);
      const padRight = box.right - parseFloat(cs.paddingRight || 0);

      card.querySelectorAll('p, svg, span, dd, td, img').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        const overRight = r.right - padRight;
        const overLeft = padLeft - r.left;
        if (overRight <= 0.5 && overLeft <= 0.5) return;
        escaped.push({
          tag: el.tagName.toLowerCase(),
          by: `${Math.max(overRight, overLeft).toFixed(1)}px`,
          text: (el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 44),
        });
      });
    });

    return {
      pageOverflows: doc.scrollWidth > doc.clientWidth,
      clipped,
      escaped,
    };
  });

  if (report.escaped?.length) {
    anyProblem = true;
    console.log(`  ESCAPED its card (${report.escaped.length}):`);
    for (const e of report.escaped.slice(0, 8)) {
      console.log(`    ${e.tag} by ${e.by} - ${e.text}`);
    }
  }

  const file = join(outDir, `w${width}.png`);
  await page.screenshot({ path: file, fullPage: true });

  const flags = [];
  if (report.pageOverflows) flags.push('PAGE SCROLLS SIDEWAYS');
  if (report.clipped.length) flags.push(`${report.clipped.length} clipped`);

  console.log(`${String(width).padStart(5)}px  ${file}  ${flags.join(' | ') || 'clean'}`);

  for (const item of report.clipped) {
    console.log(`          ${item.tag}.${item.cls}  "${item.text}"`);
  }

  if (report.pageOverflows || report.clipped.length) anyProblem = true;
  await page.close();
}

await browser.close();

console.log(
  anyProblem
    ? '\nLook at the screenshots. Check each clipped entry: intentional (truncate,\n' +
        'sr-only, a scrolling table wrapper) or a real loss? A clipped NUMBER is never fine.'
    : '\nNothing clipped and no sideways scroll. Still open the screenshots - this\n' +
        'check cannot see cramped, ugly, or misaligned.',
);
