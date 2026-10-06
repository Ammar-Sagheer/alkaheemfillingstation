import {
  requirePageRole,
  ROLES,
  formatDate,
  fullResetAllowed,
  backupAllowed,
  todayISO,
} from '@/app/_lib/helpers';
import {
  getTanks,
  getNozzles,
  getRecentFuelPrices,
  getCurrentRates,
  getLastStockCheck,
  getTankUsage,
} from '@/app/_lib/data-service';
import { withoutDashes } from '@/app/_lib/format-helpers';
import SettingsView from '@/app/_components/admin/settings/SettingsView';

export const metadata = { title: 'Settings' };

/* Five changes on this page, the rest behind "View all". The rate moves most
   days, so left unbounded this table grew by two rows a day and turned the
   pricing panel into a wall nobody read. Seven whole days was the first cut at
   that and still ran to fourteen rows and a scrollbar; five rows is a glance.
   getRecentFuelPrices() rounds up to the end of a date rather than splitting a
   day's petrol and diesel, so this can show six. */
const RECENT_ROWS = 5;

/**
 * Settings: the role check and the queries. `SettingsView` draws it, in the new
 * look, and groups the nozzles into the units that stand on the forecourt.
 */
export default async function SettingsPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  // Set by the backup route when the download could not be produced. Trimmed,
  // because it goes on screen and arrives from the query string.
  const params = await searchParams;
  const backupError =
    typeof params?.backup_error === 'string'
      ? withoutDashes(params.backup_error.slice(0, 300))
      : null;

  const [tanks, nozzles, prices, rates, tankUsage] = await Promise.all([
    getTanks(),
    getNozzles(),
    getRecentFuelPrices(RECENT_ROWS),
    getCurrentRates(),
    getTankUsage(),
  ]);

  // One tank per call - see getLastStockCheck for why this is not a single
  // unbounded query filtered in JS. The date is formatted HERE, on the
  // server, because TankForm is a client component and formatDate lives in
  // helpers.js, which reaches into request cookies and can never enter a
  // browser bundle - same reason Sparkline's tips are pre-formatted by their
  // caller rather than inside the client component itself.
  const lastDips = await Promise.all(
    tanks.map(async (tank) => {
      const dip = await getLastStockCheck(tank.id);
      return dip ? { label: formatDate(dip.books_date), gainLoss: Number(dip.gain_loss) } : null;
    }),
  );

  return (
    <SettingsView
      tanks={tanks}
      nozzles={nozzles}
      prices={prices}
      rates={rates}
      lastDips={lastDips}
      backupError={backupError}
      showBackup={backupAllowed()}
      showReset={fullResetAllowed()}
      tankUsage={tankUsage}
      today={todayISO()}
    />
  );
}
