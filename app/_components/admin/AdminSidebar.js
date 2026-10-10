'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import PendingLink from '@/app/_components/ui/PendingLink';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Icon from '@/app/_components/ui/Icon';
import BrandMark from '@/app/_components/ui/BrandMark';
import { signOut } from '@/app/_lib/actions';
import { BUSINESS_NAME } from '@/app/_lib/brand';

/**
 * The app's navigation: a column down the left on a laptop, a drawer behind a
 * burger on a phone.
 *
 * WHY A COLUMN RATHER THAN A ROW OF TABS. There are ten sections, and with an
 * icon and a readable label each they need about 1350px laid out sideways -
 * more than the page has. As a top bar they either scrolled, hiding Reports and
 * Settings off the right-hand edge of every laptop, or wrapped onto a second
 * row that ate the top of every screen. Vertically there is no such squeeze:
 * ten items fit down the side of even a short window with room left over, all
 * visible at once, which is what someone still learning where things live
 * needs. It also gives each one a full-width band to hit rather than a word.
 *
 * WHY IT COSTS SOMETHING. 240px off the left means the widest table in the app
 * - Purchases, eight columns - scrolls inside its own card at 1024px, where
 * before it just fitted. That is the trade: a nav that is always visible
 * against one table that scrolls at one width. It scrolls inside the card, not
 * the page, so nothing else moves.
 *
 * The links a data_entry user cannot open are not rendered. This is
 * presentation only - typing the URL still hits requirePageRole(), and RLS
 * would refuse the data even then.
 *
 * Account and Sign out sit at the bottom, apart from the sections: they are
 * "about you", not a part of the app someone works in. Reports and Settings
 * come last among the sections for the same reason, being looked at
 * occasionally rather than worked in all day.
 */
const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard', roles: ['super_admin'] },
  {
    href: '/admin/readings',
    label: 'Readings',
    icon: 'readings',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/lubricants',
    label: 'Lubricants',
    icon: 'lubricants',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/purchases',
    label: 'Purchases',
    icon: 'purchases',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/stock-checks',
    label: 'Stock',
    icon: 'stock',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/customers',
    label: 'Customers',
    icon: 'customers',
    roles: ['super_admin', 'data_entry'],
  },
  // The other side of Customers: the companies the pump owes, rather than the
  // people who owe the pump. Owner only, like Banking and Treasury, because a
  // payment here takes money out of one of those two (067).
  { href: '/admin/suppliers', label: 'Suppliers', icon: 'suppliers', roles: ['super_admin'] },
  { href: '/admin/banking', label: 'Banking', icon: 'banking', roles: ['super_admin'] },
  // Directly under Banking, because the two are the same question asked of two
  // different places money sits - what is in the account, what is in the safe -
  // and the owner moves between them in one sitting when he banks the day's
  // cash. Its own entry rather than a tab on Banking: none of this money is in
  // the banking system, and burying it inside the page about accounts is how
  // it would get read as one.
  { href: '/admin/treasury', label: 'Treasury', icon: 'treasury', roles: ['super_admin'] },
  { href: '/admin/expenses', label: 'Expenses', icon: 'expenses', roles: ['super_admin'] },
  // Staff attendance and pay (802). One page, two names: the owner sees the
  // pay on it, staff only the register, so each is told what it is for them.
  { href: '/admin/salaries', label: 'Staff', icon: 'staff', roles: ['super_admin'] },
  { href: '/admin/salaries', label: 'Attendance', icon: 'staff', roles: ['data_entry'] },
  // Property the pump has bought and kept, not spending or takings - its own
  // entry beside Expenses and Banking rather than a tab on either, because it
  // answers a different question ("what do we own") from both.
  {
    href: '/admin/company-assets',
    label: 'Assets',
    icon: 'assets',
    roles: ['super_admin'],
  },
  { href: '/admin/reports', label: 'Reports', icon: 'reports', roles: ['super_admin'] },
  { href: '/admin/settings', label: 'Settings', icon: 'settings', roles: ['super_admin'] },
  // Last, and open to both roles - the person most likely to need it is a new
  // member of staff on their first evening, not the owner.
  //
  // `prefetch` is set on this one alone. Measured on a production build, it
  // takes the navigation from 874ms with a loading skeleton to 70ms with none
  // at all - and the guide is the only section where it is free of any
  // consequence, because its content is a compile-time constant in
  // guide-content.js. There is no query to run early and nothing that can go
  // stale between the prefetch and the click.
  //
  // NOT DONE FOR THE OTHER TEN, and the reason is cost rather than staleness.
  // App Router prefetches when a link enters the viewport, and the whole
  // sidebar is in the viewport on a laptop - so prefetching all of them would
  // run ten full page renders, with their queries, on every single admin page
  // view. On a cheap tablet over mobile data those ten requests compete with
  // the page the reader is actually waiting for, which is the opposite of the
  // intent.
  {
    href: '/admin/guide',
    label: 'Guide',
    icon: 'guide',
    roles: ['super_admin', 'data_entry'],
    prefetch: true,
  },
  // Below the Guide and owner-only, which is the whole point of where it sits:
  // it is the one section that is about the people using the app rather than
  // about the pump, and a staff member should not be watching it any more than
  // they should be reading Reports. Hiding the link is cosmetic - the page
  // calls requirePageRole() and the row-level policy on activity_log refuses
  // the data to anyone but the owner regardless.
  { href: '/admin/activity', label: 'Activity', icon: 'activity', roles: ['super_admin'] },
];

export default function AdminSidebar({ profile }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef(null);

  const visibleLinks = LINKS.filter((link) => link.roles.includes(profile.role));

  function isActive(href) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  /*
   * The drawer is a real <dialog> opened with showModal(), so focus trapping,
   * Escape and an inert page behind it all come from the browser already
   * correct - the same reasoning as ui/Dialog.js.
   */
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    if (isOpen && !drawer.open) drawer.showModal();
    else if (!isOpen && drawer.open) drawer.close();
  }, [isOpen]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    const handleClose = () => setIsOpen(false);
    drawer.addEventListener('close', handleClose);
    return () => drawer.removeEventListener('close', handleClose);
  }, []);

  /*
   * Close once the navigation has actually landed. Closing on the click
   * instead would pull the drawer away while the new page is still loading,
   * leaving a blank screen and no sign anything is happening - the pending
   * spinner on the link someone just pressed is the only feedback there is.
   *
   * This is the OVERLAY drawer only. A pinned column is not affected by it and
   * must not be: the whole point of pinning is that the menu is still there on
   * the next page.
   */
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  /*
   * THE READER'S CHOICE, WRITTEN WHERE THE SERVER CAN SEE IT.
   *
   * Two writes, on purpose. The dataset attribute changes the layout in this
   * instant - CSS is already keyed to it, so the column appears without a
   * re-render and without waiting for a round trip. The cookie is so the NEXT
   * page, rendered on the server, already knows: `app/layout.js` reads it and
   * stamps the same attribute into the HTML, which is what stops the page
   * painting one layout and jumping to the other on every navigation.
   *
   * A year, because this is a preference about a person's own screen and not
   * something they should have to set again next month. `samesite=lax` because
   * it is read on ordinary navigations; there is nothing in it worth
   * protecting beyond that - it says "open" or "closed".
   */
  function setNav(value) {
    document.documentElement.dataset.nav = value;
    document.cookie = `nav=${value}; path=/; max-age=31536000; samesite=lax`;
  }

  /*
   * ONE BUTTON, TWO MEANINGS, DECIDED BY WHETHER THERE IS ROOM TO PIN.
   *
   * On anything but a phone the burger PINS the column open - it stays across
   * navigations until it is put away, which is what was asked for. Below
   * 1024px it opens the overlay instead, because a 240px column pinned over a
   * 400px screen leaves nothing to pin it beside; there the menu is a thing
   * you visit and dismiss.
   *
   * Read at click time rather than held in state: a window can be resized
   * between renders, and this way the answer is never stale.
   */
  function openMenu() {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setNav('open');
    } else {
      setIsOpen(true);
    }
  }

  const roleLabel = profile.role === 'super_admin' ? 'Owner' : 'Data entry';

  /*
   * Two shapes for the same information, because the space is different.
   *
   * In a 240px column, "Mubeen Petroleum Service" beside a logo does not fit
   * on one line - laid out like the top bar it truncated to "Mubeen Petr...",
   * which is the pump's own name, on its own screen, cut in half. Sat beside
   * the logo it wrapped one word to a line. So down the side everything
   * stacks and centres over the column's full width: the logo, then the name,
   * then the person and their role.
   *
   * Across the top of a phone there is room for one line each, and wrapping
   * there would push the day's work further down, so that one keeps the
   * truncating layout it always had.
   */
  const identityStacked = (
    <div className="min-w-0 text-center">
      <BrandMark className="mx-auto h-10" />
      <p className="mt-1.5 text-sm font-bold leading-tight text-ink-900">{BUSINESS_NAME}</p>
      <p className="mt-0.5 text-xs text-ink-600">
        {profile.full_name}
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        {roleLabel}
      </p>
    </div>
  );

  /*
   * Below 400px the logo steps down to 32px, the gaps to 10px and the name to
   * 15px set tight: at 360px - the commonest Android width - "Mubeen Petroleum
   * Service" needed 243px and was given 213, and truncated. It fits from 360
   * up now; at 320 it still truncates, the one width where the name gives way
   * rather than the day's work being pushed down the screen.
   */
  const identityInline = (
    <div className="flex min-w-0 items-center gap-2.5 min-[400px]:gap-3">
      <BrandMark className="h-8 min-[400px]:h-10" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold tracking-tight text-ink-900 min-[400px]:text-base min-[400px]:tracking-normal">
          {BUSINESS_NAME}
        </p>
        <p className="truncate text-sm text-ink-600">
          {profile.full_name}
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          {roleLabel}
        </p>
      </div>
    </div>
  );

  function sectionLink(link) {
    const active = isActive(link.href);

    return (
      <li key={link.href}>
        <PendingLink
          href={link.href}
          prefetch={link.prefetch ?? undefined}
          aria-current={active ? 'page' : undefined}
          className={rowClass(active)}
        >
          <NavTile icon={link.icon} active={active} />
          {link.label}
          {active ? <ActiveMark /> : null}
        </PendingLink>
      </li>
    );
  }

  const accountBlock = (
    <div className="space-y-0.5 border-t border-ink-200 pt-2">
      <PendingLink
        href="/admin/account"
        aria-current={isActive('/admin/account') ? 'page' : undefined}
        className={rowClass(isActive('/admin/account'))}
      >
        <NavTile icon="account" active={isActive('/admin/account')} />
        Account
        {isActive('/admin/account') ? <ActiveMark /> : null}
      </PendingLink>

      {/* The `danger` button docs/UI_CONVENTIONS.md -> "Buttons" names for
          sign-out. It was a SubmitButton with its variant left at the
          default, so the red text styles written on it lost to MUI's own
          and it drew as a filled GREEN button: the loudest thing in the
          column, in the colour that means "go ahead", on the one control
          that ends the session. */}
      <form action={signOut} className="pt-2">
        <SubmitButton variant="danger" fullWidth pendingLabel="Signing out…" sx={SIGN_OUT_SX}>
          <Icon name="signOut" className="h-5 w-5" />
          Sign out
        </SubmitButton>
      </form>
    </div>
  );

  return (
    <>
      {/* ---------- a fixed column, when it is standing ----------
           `.nav-column` decides whether it is: at >=1620px by default, at
           >=1024px if the reader pinned it open, never if they put it away.
           See the block on `data-nav` in globals.css. */}
      <aside
        aria-label="Sections"
        className="nav-column fixed inset-y-0 left-0 z-30 w-60 flex-col border-r border-ink-200
                   bg-white"
      >
        {/* NO RIGHT PADDING RESERVED FOR THE BUTTON, deliberately. `pr-12`
            was the obvious first guess and it broke the thing the stacked
            identity exists to protect - it pushed "Muhammad Sagheer · Owner"
            onto two lines, which is the same squeeze the drawer's own comment
            describes. The block is centred and the logo row leaves the
            top-right corner empty, so the button sits over nothing. */}
        <div className="relative border-b border-ink-200 px-4 py-3">
          {identityStacked}
          {/* THE OTHER HALF OF THE TOGGLE. The burger opens it; this puts it
              away, and the choice sticks. Placed absolutely for the same
              reason the drawer's close button is - a 40px button in the same
              row as "Mubeen Petroleum Service" pushes the name onto three
              lines in a 240px column. */}
          <button
            type="button"
            onClick={() => setNav('closed')}
            aria-label="Hide the menu"
            title="Hide the menu"
            className="absolute right-1 top-2 flex h-10 w-10 items-center justify-center
                       rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {/* Scrolls on its own if the window is short, so Settings is always
            reachable without the page moving. */}
        <nav className="nav-scroll flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-0.5">{visibleLinks.map(sectionLink)}</ul>
        </nav>

        <div className="px-3 pb-3">{accountBlock}</div>
      </aside>

      {/* ---------- the bar with the burger, when the column is away ----------
           `.nav-when-burger` is the exact complement of `.nav-column`, so
           precisely one of the two is on screen at any width and in any
           state. */}
      <header
        className="nav-when-burger sticky top-0 z-30 flex h-16 items-center gap-2
                   border-b border-ink-200 bg-white px-4 min-[400px]:gap-3"
      >
        <button
          type="button"
          onClick={openMenu}
          aria-label="Open the menu"
          aria-expanded={isOpen}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg
                     text-ink-700 transition hover:bg-ink-100
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Icon name="menu" className="h-6 w-6" />
        </button>

        {identityInline}
      </header>

      <dialog
        ref={drawerRef}
        aria-label="Sections"
        onClick={(event) => {
          // The backdrop is the dialog element itself, so this only fires when
          // the click missed the panel inside it.
          if (event.target === drawerRef.current) drawerRef.current.close();
        }}
        className="m-0 mr-auto h-dvh max-h-none w-[19rem] max-w-none bg-transparent p-0
                   backdrop:bg-ink-900/60 backdrop:backdrop-blur-sm nav-when-burger"
      >
        <div className="flex h-full flex-col bg-white">
          {/* The close button is taken out of the flow rather than sitting
              beside the name: in a panel this narrow, a 40px button in the
              same row squeezed "Mubeen Petroleum Service" onto three lines. */}
          <div className="relative border-b border-ink-200 px-4 py-4 pr-14">
            {identityStacked}
            <button
              type="button"
              onClick={() => drawerRef.current?.close()}
              aria-label="Close the menu"
              className="absolute right-2 top-3 flex h-10 w-10 items-center justify-center
                         rounded-lg text-ink-600 transition hover:bg-ink-100"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>

          <nav className="nav-scroll flex-1 overflow-y-auto px-3 py-2">
            <ul className="space-y-0.5">{visibleLinks.map(sectionLink)}</ul>
          </nav>

          <div className="px-3 pb-4">{accountBlock}</div>
        </div>
      </dialog>
    </>
  );
}

/*
 * One row of the column. 44px tall - the 32px tile plus 6px above and below -
 * the same height the rows had with a bare 20px glyph, so the column still
 * fits a short window without scrolling.
 */
function rowClass(active) {
  return [
    'group flex items-center gap-3 rounded-xl px-2 py-1.5 text-base font-medium transition',
    active ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
  ].join(' ');
}

/*
 * THE SECTION'S GLYPH IN AN ICON TILE - the new look's shape for "a picture of
 * the thing" - and a FOURTH mark for the open section: its tile is filled in
 * the primary green with a white glyph, where every other tile is pale slate.
 * The same move `.seg-item-active` makes: which one is on is told by fill and
 * weight, not by a tint, and a filled tile survives the daylight that washes
 * the brand-50 band out.
 *
 * Slate, not a hue per section. Thirteen sections in thirteen colours would
 * spend the fuels' blue, orange and gold on chrome, which the palette rules
 * forbid; and a colour that meant "Banking" would stop meaning anything else.
 */
function NavTile({ icon, active }) {
  return (
    <span
      className={`icon-tile h-8 w-8 rounded-lg transition ${
        active ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 group-hover:bg-ink-200'
      }`}
    >
      <Icon name={icon} className="h-5 w-5" />
    </span>
  );
}

/*
 * The new look's control shape over MUI's own button (the same laying-over
 * DayHeader does for its arrows): 12px corners and a 44px target, the height
 * of a nav row. The variant, the colour and the uppercase label stay MUI's.
 */
const SIGN_OUT_SX = { borderRadius: '12px', minHeight: 44 };

/**
 * The dark bar at the right-hand end of whichever section is open.
 *
 * The tinted band and the greener label already said "you are here", but both
 * are soft: on a cheap tablet in daylight the brand-50 fill washes out to the
 * same white as the rest of the column, and then nothing on the screen says
 * which of thirteen sections is showing. A short hard line at the end of the
 * row survives that - it is the darkest thing in the nav, and it is somewhere
 * no other row has ink at all, so it reads as a marker rather than as one more
 * pale wash.
 *
 * `ml-auto` puts it against the far edge whatever the label's length, so the
 * markers line up down the column instead of trailing after each word. Purely
 * decorative: aria-current on the link is what a screen reader is told.
 */
function ActiveMark() {
  return (
    <span
      aria-hidden="true"
      className="ml-auto h-6 w-1 shrink-0 rounded-full bg-brand-800"
    />
  );
}
