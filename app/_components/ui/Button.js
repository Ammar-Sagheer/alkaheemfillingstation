'use client';

import NextLink from 'next/link';
import MuiButton from '@mui/material/Button';

import PendingLink from '@/app/_components/ui/PendingLink';

/**
 * The app's buttons, rendered by Material UI at the owner's request.
 *
 * WHAT THIS REPLACED, AND WHAT THAT COSTS. The app used three CSS classes
 * (`.btn-primary` / `.btn-secondary` / `.btn-danger`) sized at `py-3`, giving
 * a tap target around 50px. That number was deliberate - this app is used on
 * a cheap tablet in a pump office, pressed with a thumb, sometimes in a hurry
 * - and MUI's default medium Button is around 36px. The owner asked for MUI's
 * default look as-is, so that is what this renders: MUI's own sizing, its
 * uppercase label, its palette and its elevation. If the smaller target ever
 * becomes a problem in the yard, `size="large"` here is the one-line fix, and
 * it is worth trying before anything more elaborate.
 *
 * THE THREE VARIANTS map onto MUI's own, so a call site names an intent
 * rather than a Material recipe:
 *
 *   primary    the one confirming action on a view   contained
 *   secondary  everything else                       outlined
 *   danger     destructive, or sign-out              outlined + error
 *
 * The rule about WHICH to use has not changed and still lives in
 * docs/UI_CONVENTIONS.md - one primary per view, `danger` for anything
 * destructive rather than a hand-rolled red.
 *
 * RENDERING AS A LINK. Several of these are navigation, not actions ("Back
 * to customers", the date arrows, the pager). Pass `href` and this renders a
 * real `<a>` through Next's `Link`, so middle-click and open-in-new-tab keep
 * working - which they do not on a button with an onClick router push. Pass
 * `pending` as well to route it through `<PendingLink>`, which swaps the
 * label for a spinner while the navigation is in flight.
 *
 * WHY `href` AND `pending` RATHER THAN `component={Link}`. Most callers here
 * are SERVER components, and a function cannot cross the server/client
 * boundary - passing the Link component itself as a prop throws
 * *"Functions cannot be passed directly to Client Components"* at runtime.
 * `href` is a string and `pending` is a boolean, so both serialise; the
 * component they resolve to is chosen in here, on the client side of the
 * boundary. `component` is still accepted and wins when given, for the few
 * client-side callers and for `component="a"` (a string, so it serialises)
 * where a plain anchor is wanted - the Excel download, which must not be
 * client-routed.
 */
const VARIANTS = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'outlined', color: 'inherit' },
  danger: { variant: 'outlined', color: 'error' },
};

export default function Button({ variant = 'secondary', sx, component, href, pending, ...props }) {
  const mui = VARIANTS[variant] ?? VARIANTS.secondary;

  const linkComponent =
    component ?? (href === undefined ? undefined : pending ? PendingLink : NextLink);

  const linkProps = linkComponent ? { component: linkComponent, href } : {};

  /*
   * The gap is the one thing added on top of MUI's defaults, and it is
   * fixing a regression rather than restyling. Several buttons put a glyph
   * or an <Icon> beside their label as ordinary children ("+ Add an asset",
   * the guide's language switch). MUI only spaces its own `startIcon` /
   * `endIcon` props, so inline children render flush against the text -
   * "+Add an asset". The old `.btn` class carried `gap-2`; this is that,
   * and a caller passing `sx` can still override it.
   */
  return <MuiButton {...mui} {...linkProps} sx={{ gap: 1, ...sx }} {...props} />;
}
