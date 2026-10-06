/**
 * The avatar beside a customer's name on the Customers list: a soft circle
 * carrying the customer's initials.
 *
 * TWO LETTERS, NOT ONE, AND NOT AN ICON. This has now been all three. A single
 * initial first, then a person/vehicle icon at the owner's request, then this
 * - and the round trip is worth recording because the icon version lost
 * something the owner noticed immediately: a column of forty identical
 * circles tells you nothing about which row you are on. Initials are the
 * strongest cue available here because they are DIFFERENT PER CUSTOMER, which
 * neither a colour nor an icon can manage across a long list. Two letters
 * separate "Ahmad Ali" from "Ahmad Iqbal", where one does not.
 *
 * THE TINT IS PICKED FROM THE CUSTOMER'S ID, not `Math.random()` - a row that
 * changed colour on every reload would look like a bug rather than a feature.
 * Deterministic per id is the "random" that is actually wanted: assigned once,
 * stable forever after.
 *
 * SIX HUES, AND NONE OF THEM IS A FUEL'S. The reference the owner supplied
 * uses lavender, pink, blue, peach and mint. Blue and peach are the two this
 * app cannot spend: petrol is `#075985` and diesel `#FDBA74`, and
 * docs/UI_CONVENTIONS.md -> "Two palettes, and they never overlap" is a safety
 * rule - the owner's father reads the fuel colours to know which nozzle he is
 * entering. Violet, fuchsia, teal, rose, green and slate give the same soft,
 * varied look with nothing borrowed from the fuels.
 *
 * The colour is never carrying identification on its own - the initials do
 * that, and the full name is beside them - so a reader who cannot tell teal
 * from green loses nothing.
 */
const COLORS = [
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-brand-100', text: 'text-brand-800' },
  { bg: 'bg-ink-200', text: 'text-ink-700' },
];

function hashOf(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * THE FIRST TWO WORDS. "Abdul Ghaffar 13 Solang 561" -> AG.
 *
 * This was first-word-and-LAST-word, on the reasoning that a trading name's
 * last word is what distinguishes it ("Bilal Sons Goods Carrier" vs "Bilal
 * Sons Filling Station"). That reasoning is fine and it was wrong here,
 * because it was never checked against this pump's actual customer list -
 * where names carry a ledger number on the end. "Abdul Ghaffar 13 Solang 561"
 * came out as "A5", "Al Jadeed poultry Farm Khizer 748" as "A7", and a column
 * of A5/A4/A7/A6 is worse than no bubble at all: it looks like a code the
 * reader is supposed to recognise.
 *
 * The first two words are the person. Everything after them is filing.
 *
 * WORDS THAT START WITH A DIGIT ARE SKIPPED for the same reason - "Akram 447
 * Saudi" should be AS, not A4. If nothing but digits remains there is nothing
 * better to show, so the digits stand.
 *
 * A single usable word gives its first two letters, so "Zubair" is ZU rather
 * than a lonely Z with a gap beside it. `toUpperCase` throughout; Urdu and
 * Arabic names return their own characters, since there is no transliteration
 * here and there should not be. A name with no letters at all falls back to
 * "?" rather than an empty circle, which reads as a broken image.
 */
export function customerInitials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return '?';

  const wordy = words.filter((word) => !/^\d/.test(word));
  const usable = wordy.length > 0 ? wordy : words;

  if (usable.length === 1) return usable[0].slice(0, 2).toUpperCase();
  return (usable[0][0] + usable[1][0]).toUpperCase();
}

/** Kept for anything still asking for a single letter. */
export function customerInitial(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

export function customerAvatarColor(seed) {
  return COLORS[hashOf(seed) % COLORS.length];
}

/** Everything the avatar needs in one call: the initials and the two tints. */
export function customerAvatar(customer) {
  return {
    ...customerAvatarColor(customer?.customer_id),
    initials: customerInitials(customer?.name),
  };
}
