/**
 * The one place petrol, diesel and lubricant are given a colour.
 *
 * Every badge, card band, chart series and progress bar reads from here, so the
 * pump's two fuels look the same on the Dashboard, the Readings sheet, the
 * Stock page, Purchases, the ledger and the reports. Before this existed the
 * colours were retyped in six files and had already drifted - the charts used
 * `#0284c7`/`#ca8a04` while the badges used the sky/amber 100s, so the same
 * fuel was one colour in a chart and another in the table under it.
 *
 * ---------------------------------------------------------------------------
 * BLUE AGAINST ORANGE, AND DARK AGAINST LIGHT.
 * ---------------------------------------------------------------------------
 *
 * The owner asked for a pair his father cannot mix up, because the mistake
 * this prevents is a real one: a reading typed into the wrong nozzle's box.
 * So petrol is BLUE AND DARK, diesel is ORANGE AND LIGHT, and they differ on
 * both axes at once.
 *
 * The hues were his originally - #54A2B3 petrol, #FCFC62 diesel - and the
 * pair worked, but only just: teal and yellow sit 2.67x apart in luminance,
 * and the yellow was close enough to lubricant's gold to blur a purchase
 * list. Blue against orange is the strongest pair available here. They are
 * opposite on the colour wheel, and - unlike red against green - the
 * difference survives the common colour-vision deficiencies, which red-green
 * would not.
 *
 * WHAT THE CODE HAS TO PROTECT IS THE SEPARATION, and it was learned the hard
 * way. Petrol and diesel were once two colours of the same weight - a dark
 * navy and a dark amber - and the owner's verdict was immediate: "they both
 * look the same, both are dark." A later pair of his, #FFD865 and #FFBF00,
 * sat 1.22x apart, which is no gap either.
 *
 * Lightness is the cue the eye reads first and the one that survives poor
 * light, a cheap tablet and any colour-vision deficiency; hue is the weaker
 * signal. This set is 4.48x apart in luminance - a wider gap than the 2.67x
 * of the pair it replaced - AND on opposite sides of the wheel. Keep both. If
 * a change would leave the two fuels the same weight, it is wrong however
 * good the hues look.
 *
 * WHICH ONE IS DARK IS NOT ARBITRARY EITHER. Petrol takes the dark blue and
 * wears WHITE text; diesel takes the light orange and wears DARK text. So the
 * two badges differ in the colour of their letters as well as their fill,
 * which is a third cue on top of hue and weight, and the one that still works
 * in a photocopy or a failing screen.
 *
 * A LIGHT COLOUR CANNOT DO EVERY JOB. Diesel's #FDBA74 is 10.6:1 behind dark
 * text and excellent as a filled band, but far too pale to be a 4px rule on a
 * white card or to be read as text. So each fuel also carries a darker
 * relative of the SAME HUE for rules, borders, chart marks and text on white.
 * The identity is the hue; the lightness is chosen per job.
 *
 * Lubricant keeps its gold. It is not part of the pair that gets confused -
 * nobody enters a lubricant reading into a nozzle - and the owner settled on
 * that colour after violet ("girlish", his word), rust and navy. Diesel
 * moving from yellow to orange takes it further from the gold than it was,
 * not closer.
 *
 * COLOUR IS NEVER THE ONLY CUE. Every surface that uses these also names the
 * fuel in words - the badge carries its label, the cards carry a heading, the
 * charts carry a legend. A screen that only works in colour does not work.
 *
 * A plain data module, not an export of a `'use client'` component, because
 * server-rendered pages and client charts both read it - same reason
 * `asset-categories.js` is separate from `CompanyAssetForm`.
 */
export const FUEL_COLORS = {
  petrol: {
    label: 'Petrol',
    /** THE DARK ONE, filled, with WHITE text - 7.6:1. Petrol being the dark
        half of the pair is the point: see the header. */
    solid: 'bg-[#075985] text-white',
    /** Muted text on that band - captions, capacities. */
    solidMuted: 'text-sky-100',
    /** A QUIET filled band - the pale tint of the hue behind its own dark
        relative, 6.6:1. For a header that should say which fuel without
        shouting. */
    soft: 'bg-sky-100 text-[#075985]',
    /** JUST THE BACKGROUND, no text colour with it - the fuel's tint under
        content that keeps its own ink. `soft` cannot do this job: it carries a
        text colour so the whole subtree inherits the fuel's dark relative,
        which is right for a header band and wrong for a card full of money
        figures that must stay near-black. Used by the Readings nozzle card to
        show, in the fuel's own colour, that a nozzle has been entered. */
    tint: 'bg-sky-100',
    /** THE SAME BAND, EMPHASISED - the dark relative filled, white text,
        7.6:1. `soft` and `strong` are a pair: same hue, one quiet and one
        loud, so a surface can use lightness to say something of its own
        (done/not done, say) while hue keeps saying which fuel. */
    strong: 'bg-[#075985] text-white',
    /** Same fill and the same white text as the band. The badge does not need
        a different treatment here the way it did when petrol was a mid teal:
        the fill is already dark enough for white letters. */
    badge: 'bg-[#075985] text-white',
    /** Outline round a filled band, and the rules and rails on white. A step
        LIGHTER than the band on purpose: at #075985 an 8px rail reads as
        near-black before it reads as blue, and the rail's whole job is hue.
        Still 5.9:1 on white, which is far more than a rule needs. Text uses
        `onWhite` instead, where the extra darkness earns its keep. */
    border: 'border-[#0369A1]',
    accent: 'border-t-[#0369A1]',
    /** A chosen option inside a form on this fuel's card. */
    selected: 'border-[#075985] bg-[#0EA5E9]/15 text-[#075985]',
    /** As text on white - 7.6:1. */
    onWhite: 'text-[#075985]',
    /** Charts and progress bars - marks that sit on white or pale grey. A step
        lighter than the band so a 2px chart line still reads as blue rather
        than as near-black, and still 5.9:1 on white. */
    hex: '#0369A1',
    /** A filled swatch that carries its own ring for an edge, so it can be the
        vivid hue without needing contrast of its own. */
    raw: '#0EA5E9',
  },
  diesel: {
    label: 'Diesel',
    /** THE LIGHT ONE, filled, with DARK text - 10.6:1. The mirror of petrol on
        every axis: lighter fill, darker letters. */
    solid: 'bg-[#FDBA74] text-ink-900',
    solidMuted: 'text-ink-800',
    /** 6.4:1. */
    soft: 'bg-orange-100 text-[#9A3412]',
    /** JUST THE BACKGROUND, no text colour with it - the fuel's tint under
        content that keeps its own ink. `soft` cannot do this job: it carries a
        text colour so the whole subtree inherits the fuel's dark relative,
        which is right for a header band and wrong for a card full of money
        figures that must stay near-black. Used by the Readings nozzle card to
        show, in the fuel's own colour, that a nozzle has been entered. */
    tint: 'bg-orange-100',
    /** 7.3:1. NOT `solid` - diesel's band is the light one, so the emphasised
        version has to come from the dark relative instead, or a "loud" header
        would be paler than the quiet one. */
    strong: 'bg-[#9A3412] text-white',
    /** The light fill and dark text again, so the two fuels' badges differ in
        the colour of their letters as well as their fill. */
    badge: 'bg-[#FDBA74] text-ink-900',
    /** The dark relative, because #FDBA74 as a rule on a white card is 1.6:1
        and all but invisible. #C2410C rather than the darker #9A3412 for the
        same reason petrol's rule is lighter than its band: at #9A3412 an 8px
        rail reads brown, close enough to the app's red to look like a
        warning, where this reads unmistakably orange. 5.2:1 on white. */
    border: 'border-[#C2410C]',
    accent: 'border-t-[#C2410C]',
    /** A chosen option inside a form on this fuel's card. */
    selected: 'border-[#9A3412] bg-[#FB923C]/20 text-[#9A3412]',
    /** As text on white - 7.3:1. */
    onWhite: 'text-[#9A3412]',
    /** Charts and progress bars - 5.2:1 on white, and unmistakably orange
        against petrol's blue in a two-line chart. */
    hex: '#C2410C',
    /** The vivid hue, for a swatch with its own ring. */
    raw: '#FB923C',
  },
  lubricant: {
    label: 'Lubricant',
    solid: 'bg-[#D4AF37] text-ink-900',
    solidMuted: 'text-ink-800',
    /** 6.5:1. */
    soft: 'bg-[#D4AF37]/20 text-[#655216]',
    /** JUST THE BACKGROUND, no text colour with it - the fuel's tint under
        content that keeps its own ink. `soft` cannot do this job: it carries a
        text colour so the whole subtree inherits the fuel's dark relative,
        which is right for a header band and wrong for a card full of money
        figures that must stay near-black. Used by the Readings nozzle card to
        show, in the fuel's own colour, that a nozzle has been entered. */
    tint: 'bg-[#D4AF37]/20',
    /** 7.6:1. */
    strong: 'bg-[#655216] text-white',
    /** Dark relative behind white text, 7.6:1 - a badge is small and bold and
        wants the unambiguous version. */
    badge: 'bg-[#655216] text-white',
    border: 'border-[#977B20]',
    accent: 'border-t-[#977B20]',
    /** A chosen option inside a form on this fuel's card. */
    selected: 'border-[#977B20] bg-[#D4AF37]/20 text-[#655216]',
    onWhite: 'text-[#655216]',
    /** The same darkest gold as `onWhite`, as a bare hex for a chart fill.
        Charts take colours, not classes, and a chart that retypes a hex is a
        chart that drifts out of step with the badge. Used by
        LubricantTrendChart to put packed oil as far from loose as the family
        allows while both stay unmistakably gold. */
    deepHex: '#655216',
    hex: '#977B20',
    raw: '#D4AF37',
  },
};
/** Anything unrecognised falls back to neutral rather than to a fuel's colour. */
export const NEUTRAL_FUEL = {
  label: '',
  solid: 'bg-ink-700 text-white',
  solidMuted: 'text-ink-100',
  /** What a MIXED unit wears - one dispenser plumbed to two different tanks.
      Neutral rather than either fuel's colour, because picking one would
      label the whole unit as a fuel only half of it sells. */
  soft: 'bg-ink-100 text-ink-700',
  tint: 'bg-ink-100',
  strong: 'bg-ink-700 text-white',
  badge: 'bg-ink-700 text-white',
  border: 'border-ink-300',
  accent: 'border-t-ink-400',
  selected: 'border-ink-600 bg-ink-100 text-ink-900',
  onWhite: 'text-ink-900',
  hex: '#475569',
  raw: '#475569',
};

export function fuelColor(fuelType) {
  return FUEL_COLORS[fuelType] ?? NEUTRAL_FUEL;
}

/**
 * The order the fuels are shown in, left to right, wherever they appear as a
 * pair or a list.
 *
 * DIESEL FIRST. Not alphabetical and not the database's order - the `fuel_type`
 * enum was declared petrol-first in migration 001, so anything ordered by it
 * comes back that way. This matches the pump's own layout instead, which is
 * what the person reading the screen is holding in his head. Sorting here
 * rather than re-declaring the enum keeps a display choice out of the schema.
 */
export const FUEL_ORDER = ['diesel', 'petrol', 'lubricant'];

/** Comparator for anything with a `fuel_type`. Unknown types sort last. */
export function byFuelOrder(a, b) {
  const rank = (t) => {
    const i = FUEL_ORDER.indexOf(t);
    return i === -1 ? FUEL_ORDER.length : i;
  };
  return rank(a?.fuel_type) - rank(b?.fuel_type);
}
