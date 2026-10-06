'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * The search box over the Customers table.
 *
 * IT WRITES TO THE QUERY STRING, like every other filter in this app
 * (docs/UI_CONVENTIONS.md -> "Filters are query strings"). A searched list is
 * a linkable, reloadable, Back-button-able state; component state alone would
 * lose the search on every navigation and could not be shared or bookmarked.
 *
 * DEBOUNCED, AND `replace` RATHER THAN `push`. Typing "Muhammad" is eight
 * keystrokes, and one router entry per keystroke would mean eight presses of
 * Back to leave the page. `replace` keeps the whole search as a single history
 * step. 250ms is long enough to swallow a fast typist's gaps and short enough
 * that the list feels like it is keeping up.
 *
 * `scroll: false` for the same reason the chip rows use it - the table is
 * below the box, and a router navigation that jumps to the top of the page
 * every time a letter is typed puts the results out of view.
 *
 * THE INPUT IS UNCONTROLLED BY THE URL. It seeds from the query string once
 * and then owns its own value; binding it to the URL round-trip makes the
 * cursor jump and drops characters typed during the debounce.
 */
export default function CustomerSearch({ placeholder = 'Search name, vehicle or phone' }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      const trimmed = value.trim();

      if (trimmed) next.set('q', trimmed);
      else next.delete('q');

      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;

      // Nothing to do if the URL already says this - otherwise every render
      // that re-runs this effect fires a navigation.
      if (`${pathname}?${params.toString()}`.replace(/\?$/, '') === href) return;

      router.replace(href, { scroll: false });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <div className="relative w-full sm:w-64">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <path
            d="M9 3a6 6 0 1 0 3.5 10.9l3.3 3.3 1.4-1.4-3.3-3.3A6 6 0 0 0 9 3Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search customers"
        className="w-full rounded-xl border border-ink-300 bg-white py-2 pl-9 pr-3 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
    </div>
  );
}
