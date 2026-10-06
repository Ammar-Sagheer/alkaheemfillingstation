import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import SpeedOutlined from '@mui/icons-material/SpeedOutlined';
import WaterDropOutlined from '@mui/icons-material/WaterDropOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import PropaneTankOutlined from '@mui/icons-material/PropaneTankOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import WarehouseOutlined from '@mui/icons-material/WarehouseOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';

/**
 * A strongbox: the one icon in this set that is drawn here rather than
 * imported, because Material UI does not have it.
 *
 * The Treasury page is about cash locked in a safe ON SITE, and the whole
 * point of it is that this money is NOT in the banking system. Every money
 * glyph MUI offers says the opposite or says nothing: `Savings` is a piggy
 * bank (childlike, and the owner's verdict on it was immediate), `Lock` is a
 * padlock that says "security settings" in a list of nav items, `Payments` is
 * a stack of notes that would sit one row under `AccountBalance` saying much
 * the same thing, and `Shield`, `Toll` and `PointOfSale` are none of it.
 *
 * So: a box on feet, with a combination dial and a handle. It is a SHAPE
 * first - a squat rectangle among a column of round and pointed glyphs -
 * which is what has to survive at 20px in a dim office, and it is the shape of
 * the thing itself.
 *
 * FOUR MARKS, NOT SIX, and that was measured rather than guessed. The first
 * draft drew the door as a second rectangle inside the body with a small dial
 * on it, and rendered at 16px the two nested rectangles closed up and read as
 * a little screen or a banknote - which is exactly the confusion the icon
 * exists to avoid, sitting one row under Banking. Dropping the inner
 * rectangle and making the dial big enough to be seen as a dial is what makes
 * it legible small: body, dial, handle, feet.
 *
 * Drawn as strokes rather than MUI's filled outlines because at this size a
 * dial drawn as a fill is a dot. `vectorEffect` is deliberately NOT set: the
 * icon is only ever rendered at 16-24px, so the stroke does not need to resist
 * scaling, and leaving it off keeps the weight matched to the imported set at
 * the sizes actually used.
 *
 * It takes the same props MUI's icons take, so `Icon` treats it identically -
 * that is the contract COMPONENTS below depends on.
 */
function TreasurySafeOutlined(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* The body. */}
      <rect x="3" y="4" width="18" height="15" rx="2" />
      {/* The combination dial, and the handle beside it. */}
      <circle cx="10.5" cy="11.5" r="3" />
      <path d="M15 11.5h2.5" />
      {/* Feet, so it reads as standing on the floor rather than hanging. */}
      <path d="M6.5 19v1.5M17.5 19v1.5" />
    </svg>
  );
}
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import WorkOutlineOutlined from '@mui/icons-material/WorkOutlineOutlined';
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import DesktopWindowsOutlined from '@mui/icons-material/DesktopWindowsOutlined';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import PersonOutlineOutlined from '@mui/icons-material/PersonOutlineOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import LocalGasStationOutlined from '@mui/icons-material/LocalGasStationOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import LocalAtmOutlined from '@mui/icons-material/LocalAtmOutlined';
import CreditCardOutlined from '@mui/icons-material/CreditCardOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import CallReceivedOutlined from '@mui/icons-material/CallReceivedOutlined';
import CallMadeOutlined from '@mui/icons-material/CallMadeOutlined';

/**
 * The app's icons, backed by Material UI (`@mui/icons-material`, Outlined
 * variant throughout) at the owner's request. This file is still the single
 * place that decides what a name means - every call site in the app writes
 * `<Icon name="tank" className="h-5 w-5" />` exactly as it did with the old
 * hand-drawn set, so swapping the icon package cost this file only. Adding a
 * name means adding an import and a line in `COMPONENTS` below.
 *
 * WHY ICONS AT ALL. The app was entirely text: ten identically-shaped nav
 * tabs, and statuses told apart by two letters and a colour. That asks the
 * reader to parse a word every time, and it leans on colour alone for the
 * difference between a nozzle that is done and one that is not - which is
 * exactly what fades in a dim pump office and what a red-green colourblind
 * reader cannot see. An icon beside the word gives a second, redundant cue:
 * shape.
 *
 * They are decoration, never the only carrier of meaning - every icon here
 * sits next to its own label, and is `aria-hidden` so a screen reader is not
 * made to announce it twice. The single exception is `trash` inside an
 * IconButton, which carries its label in `aria-label` and `title` instead;
 * the reasoning is written up there.
 *
 * SIZING. `Icon` renders a fixed-size wrapper `<span>` (sized by the
 * `className` utility, e.g. `h-5 w-5`) with the MUI icon stretched to fill it
 * via an inline style. MUI's own `SvgIcon` sizes itself in `em` off the
 * ambient font-size through its own (Emotion-generated) CSS class, which can
 * land after Tailwind's utility classes in the stylesheet and win the
 * cascade - so trusting Tailwind's `h-5 w-5` on the icon directly was not
 * reliable. An inline style on the icon itself always wins, so the wrapper
 * is what carries the actual size and the icon just fills it. Colour is
 * untouched - no `color` prop is passed, so it keeps inheriting
 * `currentColor` from whatever text the icon sits beside, same as before.
 */
const COMPONENTS = {
  // Dashboard.
  dashboard: DashboardOutlined,
  // Readings: a dial with a needle - the pump meter.
  readings: SpeedOutlined,
  // Fuel: a pump. Shared by anything counting litres sold, not just Readings.
  fuelPump: LocalGasStationOutlined,
  // Lubricants: a drop of oil.
  lubricants: WaterDropOutlined,
  // Purchases: a delivery truck.
  purchases: LocalShippingOutlined,
  // Stock: a storage tank - also used for "the drum" on Lubricants.
  stock: PropaneTankOutlined,
  // Customers: the people who take fuel on credit.
  customers: GroupOutlined,
  // Who the pump buys from (067). A warehouse, not the delivery truck:
  // the truck is already Purchases, one line above it in the sidebar.
  suppliers: WarehouseOutlined,
  // Banking: the pillared front of a bank.
  banking: AccountBalanceOutlined,
  // Treasury: a strongbox. Hand-drawn above - see the note there for why this
  // one is not a Material UI import.
  treasury: TreasurySafeOutlined,
  // Expenses: a wallet - money going out.
  expenses: AccountBalanceWalletOutlined,
  // Reports: a bar chart.
  reports: BarChartOutlined,
  // Settings: sliders, not a cog - a cog at 18px is mush.
  settings: TuneOutlined,
  // Company assets: a briefcase - property the business holds, not stock it
  // sells through.
  assets: WorkOutlineOutlined,
  // Vehicle: a car, for the delivery bike or the owner's own runabout.
  vehicle: DirectionsCarOutlined,
  // Machinery: a wrench, not a cog - the same reasoning settings gives.
  machinery: BuildOutlined,
  // Property: a small building, distinct from the roof-only dashboard mark.
  property: ApartmentOutlined,
  // Electronics: a monitor.
  electronics: DesktopWindowsOutlined,
  // Other: a tag, for anything the five categories don't quite name.
  other: LabelOutlined,
  // Done. Paired with a word, never on its own.
  check: CheckOutlined,
  // Still to do.
  pencil: EditOutlined,
  // Trash: the one icon here allowed to stand without a word beside it -
  // see IconButton for why.
  trash: DeleteOutlineOutlined,
  // Guide: an open book.
  guide: MenuBookOutlined,
  // Activity: a history clock - the section is a log, not a list.
  activity: HistoryOutlined,
  chevronRight: ChevronRightOutlined,
  menu: MenuOutlined,
  close: CloseOutlined,
  account: PersonOutlineOutlined,
  signOut: LogoutOutlined,
  warning: WarningAmberOutlined,
  // Info: something worth knowing that is neither a warning nor a result -
  // the neutral Notice.
  info: InfoOutlined,
  // List: a running total of many records (invoices, customers), not any
  // one figure.
  list: DescriptionOutlined,
  // Sales: a price tag.
  sales: SellOutlined,
  // Cash: coins/notes in hand.
  cash: LocalAtmOutlined,
  // Credit: a card, for money not yet collected.
  credit: CreditCardOutlined,
  // Inventory: boxed stock, e.g. packed lubricants on the shelf.
  inventory: Inventory2Outlined,
  // Profit: the trend line going up.
  profit: TrendingUpOutlined,
  // Date: a calendar day, for "most recent" figures.
  date: EventOutlined,
  // Money in / money out. An arrow coming toward you and one going away -
  // the shape that tells the two directions apart when the colour alone
  // (green against amber) cannot, in a dim office or for a colourblind
  // reader.
  moneyIn: CallReceivedOutlined,
  moneyOut: CallMadeOutlined,
  // Staff and salaries (802): a name badge for the people, a ticked calendar
  // for the register, notes for the pay.
  staff: BadgeOutlined,
  attendance: EventAvailableOutlined,
  salary: PaymentsOutlined,
};

/**
 * @param {object} props
 * @param {keyof typeof COMPONENTS} props.name
 * @param {string} [props.className] - size it with height and width utilities;
 *   colour is inherited from the surrounding text.
 */
export default function Icon({ name, className = 'h-5 w-5' }) {
  const Component = COMPONENTS[name];
  if (!Component) return null;

  return (
    <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true">
      <Component style={{ width: '100%', height: '100%' }} />
    </span>
  );
}
