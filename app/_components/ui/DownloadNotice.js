'use client';

import { useEffect, useState } from 'react';

/**
 * A failure reported by a download route, which cleans up after itself.
 *
 * WHY THIS EXISTS. A download is a plain link, not a form: when it works the
 * browser saves the file and the page never re-renders. When it fails the route
 * redirects back with the reason in the query string. Put those two together and
 * the reason STAYS - the URL still carries `?backup_error=...` after a later
 * download has succeeded, so the page keeps announcing a failure that has been
 * fixed. That is exactly what happened with the backup: the migration was
 * applied, the file downloaded, and the red line was still sitting there.
 *
 * The same reasoning as `<Toast>`, arrived at from the other end. A message has
 * to stop describing something once it is no longer true. Errors are not put in
 * a toast, because an error has to survive long enough to be read and acted on -
 * so this one survives, and goes when the reader is done with it:
 *
 *   * the query parameter is stripped from the URL as soon as it has been read,
 *     so a refresh, a back button or a bookmarked link does not resurrect it;
 *   * `onDismiss` on the panel that owns it clears the message when a fresh
 *     attempt is started, because a new download supersedes the last failure;
 *   * and there is a Dismiss button, for the reader who has simply finished
 *     with it.
 *
 * history.replaceState rather than router.replace: this changes nothing the
 * server rendered, and a router navigation would re-fetch the whole Reports
 * page - its charts, its month, its RPCs - to remove one query parameter.
 */
export default function DownloadNotice({ param, children, className = '' }) {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;

    url.searchParams.delete(param);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [param]);

  if (!shown) return null;

  return (
    <p
      role="alert"
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-2xl
                 border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900 ${className}`}
    >
      <span className="min-w-0">{children}</span>
      <button
        type="button"
        onClick={() => setShown(false)}
        className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      >
        Dismiss
      </button>
    </p>
  );
}
