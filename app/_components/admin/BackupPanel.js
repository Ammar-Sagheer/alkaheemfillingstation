'use client';

import { useState } from 'react';

import Button from '@/app/_components/ui/Button';
import DownloadNotice from '@/app/_components/ui/DownloadNotice';

/**
 * The backup download, on Settings.
 *
 * UNDER ITS OWN HEADING THERE, not on Reports. It was on Reports first, beside the Excel
 * download, on the reasoning that both are files to take away. That was the
 * wrong grouping: Reports is where the owner goes to READ a figure, and a
 * control about losing the entire database does not belong under the month's
 * profit. Settings is where the things that are set up once and then left alone
 * live - the rates, the tanks, the nozzle wiring, the reset panel - and a
 * backup is one of those.
 *
 * WHY IT IS A PANEL WITH SENTENCES rather than a button on its own. The one
 * thing that must be understood about this file is that it is the only copy of
 * the books that is not inside Supabase - and a button marked "Back up" says
 * none of that. So the panel says what the file is for, says plainly that it is
 * not the Excel workbook, and says what restoring it involves. The same
 * reasoning as the reset panel below it: a control whose consequences are not
 * obvious explains itself where it stands, rather than in documentation nobody
 * has open.
 *
 * A plain link, and deliberately NO `download` attribute - the same trap the
 * Excel route hit. `download` saves whatever the URL returns, including the
 * redirect a failure produces, so an error would land in Downloads as a junk
 * file. The route's Content-Disposition downloads the file on its own and lets
 * a failure navigate back here.
 *
 * A CLIENT COMPONENT for one reason: the failure message has to be able to go
 * away. A download that works does not re-render the page, so a reason left in
 * the query string outlives the problem it describes - see `<DownloadNotice>`.
 * Pressing the button again clears it, because the answer to the old failure is
 * the attempt now in flight; if that fails too, the route sends back a fresh
 * one.
 */
export default function BackupPanel({ error }) {
  const [notice, setNotice] = useState(error ?? null);

  return (
    <section data-card className="panel p-5">
      {notice ? (
        <DownloadNotice param="backup_error" className="mb-4">
          The backup did not download: {notice}
        </DownloadNotice>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink-900">Back up all your records</h3>
          <p className="mt-1 max-w-[65ch] text-base text-ink-700">
            Downloads a copy of all your records: readings, credit, payments, deliveries,
            expenses, bank and safe. Save it on a USB drive or email it to yourself. If the
            system is ever lost, everything can be put back from this file.
          </p>
        </div>
        <Button
          component="a"
          variant="secondary"
          href="/admin/settings/backup"
          onClick={() => setNotice(null)}
          className="shrink-0 whitespace-nowrap"
        >
          Download backup
        </Button>
      </div>

      <p className="callout mt-4">
        <span className="font-semibold text-ink-900">This is not the Excel report.</span> The
        report is for reading a month; this file is for restoring your records. Restoring is done
        by your developer. Logins are not in the file.
      </p>
    </section>
  );
}
