#!/usr/bin/env node
/**
 * Loads a backup file into a fresh Supabase project.
 *
 * This is the other half of the Download backup button. A backup nobody has
 * ever restored is a guess, not a backup - so this script exists, and the
 * README says to try it once into a throwaway project rather than first meeting
 * it on the day it is needed.
 *
 *   node scripts/restore-backup.mjs --file pump-backup-2026-08-23.json \
 *     --url https://<new-ref>.supabase.co --key <service-role-key>
 *
 * URL and key may come from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY instead.
 *
 * BEFORE RUNNING IT the new project needs: every migration in
 * supabase/migrations/ applied in order, and the logins made again by hand
 * (Authentication -> Users, then the app's own Settings page for the profile
 * row, or however you made them the first time). Names matter - this script
 * matches the old authors to the new logins BY NAME, so "Mubeen Ahmad" typed
 * the same way lands his entries back under him.
 *
 * WHAT IT DOES NOT DO. It does not merge, and it does not overwrite: the
 * database function refuses a project that already holds trading data, and
 * says which tables. That refusal is deliberate - "restore over the top of what
 * is there" is how a stale backup quietly destroys a good database.
 *
 * The loading itself all happens inside restore_everything() in migration 051,
 * in one transaction with the triggers off. This script's own job is the three
 * things around it: work out the author mapping, ask before it starts, and
 * CHECK AFTERWARDS - row counts and money totals recomputed from the live
 * database and compared against the file. A restore that reports success
 * without counting what landed is not worth much.
 */
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { map: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') args.file = argv[++i];
    else if (arg === '--url') args.url = argv[++i];
    else if (arg === '--key') args.key = argv[++i];
    else if (arg === '--map') args.map.push(argv[++i]);
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const USAGE = `
Restore a pump backup into an empty Supabase project.

  node scripts/restore-backup.mjs --file <backup.json> [options]

  --file <path>    the backup downloaded from Reports (required)
  --url <url>      https://<ref>.supabase.co        (or SUPABASE_URL)
  --key <key>      the service-role key             (or SUPABASE_SERVICE_ROLE_KEY)
  --map "Name=<uuid>"   force one old author onto a login, instead of matching
                        by name. May be given more than once.
  --yes            do not ask before loading
`;

// ---------------------------------------------------------------------------
// Talking to PostgREST
// ---------------------------------------------------------------------------
function api(url, key) {
  const base = url.replace(/\/+$/, '');

  async function request(path, options = {}) {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} — ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    request,
    rpc: (name, body) =>
      request(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    /**
     * Every row of a table, a page at a time. PostgREST caps a response at
     * 1,000 rows and says nothing about it, which is exactly the kind of
     * silent truncation that would make the check below pass while missing
     * half the ledger.
     */
    async all(table, select) {
      const rows = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const page = await request(`${table}?select=${select}&order=id`, {
          headers: { Range: `${from}-${from + size - 1}` },
        });
        rows.push(...page);
        if (page.length < size) return rows;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Checking what came back
// ---------------------------------------------------------------------------

/** Sums one numeric column of an array of rows, to two decimals. */
function sum(rows, column) {
  return Math.round(rows.reduce((total, row) => total + Number(row[column] ?? 0), 0) * 100) / 100;
}

/**
 * The figures worth recomputing from the live database after a load.
 *
 * Row counts alone would not catch a column that arrived null, or numbers that
 * were loaded as text and silently coerced. These are the totals the owner
 * would notice were wrong: what was sold, what customers owe either way, what
 * moved through the bank, what is in the safe.
 */
const MONEY_CHECKS = [
  { table: 'nozzle_readings', column: 'sale_amount', label: 'fuel sold' },
  { table: 'ledger_entries', column: 'amount', label: 'ledger movements' },
  { table: 'credit_sales', column: 'amount', label: 'credit slips' },
  { table: 'lubricant_sales', column: 'amount', label: 'lubricant sales' },
  { table: 'fuel_purchases', column: 'total_cost', label: 'fuel deliveries' },
  { table: 'expenses', column: 'amount', label: 'expenses' },
  { table: 'bank_transactions', column: 'amount', label: 'bank movements' },
  { table: 'treasury_entries', column: 'amount', label: 'safe movements' },
];

function money(value) {
  return value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.file) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const url = args.url ?? process.env.SUPABASE_URL;
  const key = args.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Need --url and --key (or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  const payload = JSON.parse(await readFile(args.file, 'utf8'));

  if (payload.schema_version !== 1) {
    throw new Error(
      `That file says schema_version ${payload.schema_version}; this script writes version 1.`,
    );
  }
  if (!payload.tables) throw new Error('That file has no tables in it.');

  // The file carries its own counts. Disagreeing with the rows beside them
  // means a truncated or edited download, and is worth catching here rather
  // than after a partial load.
  for (const [table, expected] of Object.entries(payload.counts ?? {})) {
    const actual = (payload.tables[table] ?? []).length;
    if (actual !== expected) {
      throw new Error(
        `That file is damaged: its header says ${expected} rows for ${table}, and it holds ${actual}.`,
      );
    }
  }

  const db = api(url, key);

  // ---- who wrote what -----------------------------------------------------
  const oldProfiles = payload.profiles ?? [];
  const newProfiles = await db.request('profiles?select=id,full_name,role');

  if (newProfiles.length === 0) {
    throw new Error(
      'The new project has no logins yet. Make them first — entries are matched to their author by name.',
    );
  }

  const forced = new Map(
    args.map.map((pair) => {
      const at = pair.lastIndexOf('=');
      if (at < 1) throw new Error(`--map wants "Name=<uuid>", got: ${pair}`);
      return [pair.slice(0, at).trim().toLowerCase(), pair.slice(at + 1).trim()];
    }),
  );

  const byName = new Map(
    newProfiles.map((profile) => [profile.full_name.trim().toLowerCase(), profile.id]),
  );

  const profileMap = {};
  const unmatched = [];

  for (const profile of oldProfiles) {
    const name = profile.full_name.trim().toLowerCase();
    const target = forced.get(name) ?? byName.get(name);
    if (target) profileMap[profile.id] = target;
    else unmatched.push(profile.full_name);
  }

  // ---- say what is about to happen ---------------------------------------
  const totalRows = Object.values(payload.counts ?? {}).reduce((a, b) => a + b, 0);

  console.log(`\nBackup taken ${payload.generated_at} (pump date ${payload.pump_date})`);
  console.log(`${totalRows} rows across ${Object.keys(payload.tables).length} tables`);
  console.log(`Target: ${url}`);
  console.log(
    `\nAuthors matched by name: ${Object.keys(profileMap).length} of ${oldProfiles.length}`,
  );
  for (const profile of oldProfiles) {
    const target = profileMap[profile.id];
    console.log(`  ${target ? '✓' : '·'} ${profile.full_name} (${profile.role})${
      target ? ` → ${target}` : ' — no login of that name here'
    }`);
  }
  if (unmatched.length > 0) {
    console.log(
      `\n  Entries written by ${unmatched.join(', ')} will be restored with no name against them.`,
    );
    console.log('  Use --map "Name=<uuid>" to point them at a login instead.');
  }

  if (!args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('\nLoad this into the project above? [y/N] ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Nothing was loaded.');
      process.exit(0);
    }
  }

  // ---- load ---------------------------------------------------------------
  console.log('\nLoading…');
  const result = await db.rpc('restore_everything', {
    p_payload: payload,
    p_profile_map: profileMap,
    p_confirm: 'RESTORE',
  });

  /*
   * A refusal from the database arrives as an error and is thrown above. This
   * is the other shape: a 200 carrying nothing useful, which a proxy or a
   * misconfigured endpoint can produce. Without this the run went on to the
   * checks and reported every table as a mismatch - seventeen alarming lines,
   * and the word "loaded" in the summary, for a load that never started. Say
   * the true thing instead.
   */
  if (!result || typeof result.loaded !== 'object') {
    throw new Error(
      'The restore returned nothing. Nothing has been loaded — check the URL and the key.',
    );
  }

  // ---- and check it ------------------------------------------------------
  console.log('\nChecking what landed, against the file:\n');

  let bad = 0;
  const pad = (text, width) => String(text).padEnd(width);

  for (const [table, expected] of Object.entries(payload.counts ?? {})) {
    const loaded = Number(result?.loaded?.[table] ?? 0);
    const ok = loaded === expected;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${pad(table, 22)} ${pad(loaded, 7)} of ${expected} rows`);
  }

  console.log('');

  for (const check of MONEY_CHECKS) {
    const fileRows = payload.tables[check.table] ?? [];
    const liveRows = await db.all(check.table, `id,${check.column}`);
    const fromFile = sum(fileRows, check.column);
    const fromDatabase = sum(liveRows, check.column);
    const ok = fromFile === fromDatabase;
    if (!ok) bad += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ${pad(check.label, 22)} ${pad(money(fromDatabase), 16)}${
        ok ? '' : ` — the file says ${money(fromFile)}`
      }`,
    );
  }

  if (result?.unmapped_authors > 0) {
    console.log(
      `\n  ${result.unmapped_authors} author(s) had no login here; those entries carry no name.`,
    );
  }

  if (bad > 0) {
    console.error(
      `\n${bad} check(s) failed. The data is loaded but does not match the file — do not start ` +
        'using this project until you know why.',
    );
    process.exit(1);
  }

  console.log('\nEverything matches the file.');
  console.log('Left to do by hand: the logins and their passwords, and check the app opens.');
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
