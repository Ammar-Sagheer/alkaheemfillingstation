# UI conventions

The design system this app has settled into, built up over many rounds of
work rather than decided up front. Follow these instead of reinventing them.
See `docs/CHANGELOG.md` for the reasoning behind specific choices below —
several look simplifiable and were already tried that way once.

> **Every page wears the new look (September 2026).** It began on the Dashboard
> and the rest of the site was moved over to it the same month: read "The new
> look" at the end of this file before changing how any page looks. The
> building blocks listed immediately below are still in use; where an older
> section says "the tile", "the card" or `.section-heading`, it describes the
> old look, whose pieces (`StatTile`, `.card`, `PageHeader`, `DateNav`) are
> deleted.
>
> **The offline (Electron) build copies this design.** Its components are this
> repo's, file for file, so a design change here is a change it has to take. The
> list of what it has not taken yet is "Syncing the offline (Electron) build" at
> the bottom of `docs/CHANGELOG.md`, section 2.
>
> **No em dashes in anything a person reads**, at the owner's request: a
> colon, a comma, brackets or a full stop instead, and in Urdu the Urdu comma
> or brackets. See "Text the database wrote goes through `withoutDashes()`".

## The shared building blocks, at a glance

Everything in `app/_components/ui/` is generic and has no idea what a pump is.
Reach for one of these before writing markup; each has its own section below or
a comment at the top of the file saying why it exists.

| Component                                                                                            | What it is for                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `<Dialog>`                                                                                           | Native `<dialog>` + `showModal()`. Full-screen sheet on a phone, centred panel above `sm`. `size` is `md` (32rem), `lg` (48rem) or `xl` (64rem, for a wide table). No click-outside-to-close, deliberately. |
| `<ConfirmAction>`                                                                                    | Every "are you sure?": trash icon → dialog. Replaced seven inline confirms that shifted the page.                                   |
| `<Pager>`                                                                                            | The row under a paged table — "Showing 1 to 8 of 26" plus Previous/Next. `pageFrom(searchParams)` reads and clamps `?page=`.        |
| `<Button>`                                                                                           | Every button in the app. Material UI, with the three intents as `variant` (`primary` / `secondary` / `danger`).                     |
| `<SubmitButton>`                                                                                     | A submit that disables itself and shows a pending label. Renders a `<Button>`. Mandatory on anything destructive.                   |
| `<PendingLink>`                                                                                      | A link that shows a spinner while the navigation is in flight. Every server-rendered page needs one round trip.                     |
| `<IconButton>`                                                                                       | Square 44px icon-only row action. The one place an icon may stand without a word.                                                   |
| `<NumberInput>`                                                                                      | Blocks scroll-wheel and arrow-key changes that silently corrupt a typed figure. Use instead of bare `type="number"`.                |
| `<DownloadNotice>`                                                                                   | A failure from a download route: shows the reason, then takes its own query parameter out of the URL so a refresh cannot resurrect it.                                                            |
| `<FormMessage>`                                                                                      | Renders the `{ ok, message }` shape every Server Action returns.                                                                    |
| `<EmptyState>` / `<FuelBadge>` / `<Icon>` / `<Spinner>` / `<BrandMark>` / `<Toast>` | Small, self-explanatory; see the files. (`<PageHeader>` was deleted with the old look: a page's top is `TitleHeader` or `DayHeader`.) |
| `<DeltaBadge>` | The percent pill on a `KpiCard`. The arrow says direction, the colour says whether that is good news: pass `higherIsBetter: false` where a rise is bad. No baseline, no badge. |
| `<Sparkline>` | Decoration with a shape under a `KpiCard`, never a figure to read. Its `tips` are formatted by the caller, on the server. |

Pump-specific ones worth knowing about in `app/_components/admin/`:

> The page-level pieces of the new look (`TitleHeader`, `DayHeader`,
> `SectionHeader`, `KpiCard` / `KpiGrid`, `FigureTile`, `FuelCard`, `TankGauge`,
> `TrendWindow`, `TrendCharts`, `Notice`, `MonthEndStock`) live in
> `app/_components/admin/dashboard/` and are tabled in "The new look" -> "The
> pieces" at the end of this file. The old look's `<DateNav>`, `<StatGrid>` /
> `<StatTile>` and `<TrendRange>` are deleted; `<DateJump>` (the date box, below)
> is the part of `DateNav` that survived.

| Component                   | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<BalanceDirection>`        | Which way a customer's balance moves, in register words: بنام / جمع.                                                                                                                                                                                                                                                                                                                                                                                             |
| `<ActivityTable>`           | The audit trail. The one list that is a grid rather than a table — see why below.                                                                                                                                                                                                                                                                                                                                                                                |
| `<BackupPanel>`             | The backup download, on Settings. A panel with sentences rather than a bare button — see "A download that is not a report" below.                                                                                                                                                                                                                                                                             |
| `<DailyTableDialog>`        | The month's days as a table, in a modal opened from the heading row above the charts. A client shell holding a **server-rendered** child.                                                                                                                                                                                                                                                                    |
| `<ClearOldActivityButton>`  | The activity log's whole-period trim — see "Clearing history" below.                                                                                                                                                                                                                                                                                                                                        |
| `<GuideFlow>`               | The bilingual guide's stages, steps, section map and roles table.                                                                                                                                                                                                                                                                                                                                                                                                |
| `<PrintStatementButton>`    | A customer's statement of account. Opens the statement ON SCREEN with a day-range picker above it; the PDF is downloaded from there. See "Show the document before you produce it" below.                                                                                                                                                                                     |
| `<StatementPreview>`        | The statement itself, rendered from the same `accountFromParts()` the PDF uses. Never give a preview its own arithmetic.                                                                                                                                                                                                                        |
| `<DateJump>`                | The date box on a dated page: picking a complete date IS the instruction, no Go button. Guards against Chrome reporting a half-typed year. `scroll={false}` where the box sits at the bottom of a page (Treasury). |
| `<CategoryBreakdown>`       | A share-of-total list: name, amount, percentage in words, and an MUI bar as decoration. Takes negative rows (a category that only got money back is listed apart). |
| `<CorrectEntryButton>`      | "Correct", never "Edit", on an append-only ledger: posts a reversal plus a replacement, with the balance-after preview as the point of the dialog. See "An append-only record needs a Correct button". |
| `<ReplaceUnitButton>`       | Replacing a damaged dispensing unit: an EVENT on a date, not an edit to the wiring. The dialog says back both dates and both meter starts before saving. |
| `<MakeMainAccountButton>`   | One tap, no confirmation, on a bank account that is not the main one (065). Nothing is lost by it. |
| `<SupplierSelect>`          | Who a delivery came from, chosen from the active suppliers, never typed: a typed name cannot hold an account. An empty list says where to add one. |
| `suppliers/*`               | The supplier list and account (067): balances said as "Payable" / "Advance", a ledger with a supplier statement's columns, cancel-with-reversal. See "Suppliers" in "The pages, as each was moved over" and "A ledger the other way round says so in its column names". |

## Design tokens (`app/_styles/globals.css`)

- **Colors**: `brand-*` (green, `#059669` family) for the primary/positive
  action and success states; `ink-*` (slate) for text and neutral chrome;
  `petrol` / `diesel` for fuel-type accents; plain Tailwind `red-*` /
  `amber-*` for danger and warning, not custom tokens.
- Built for a cheap tablet in poor light: high contrast, large tap targets,
  `font-variant-numeric: tabular-nums` on every number so columns line up
  and a mistyped digit stands out (`.tabular`, `.input-number`, `.td-num`
  all set this).
- Tailwind v4's `@apply` cannot reference another custom class, so component
  classes in `globals.css` are each written out in full rather than composed
  from one another — mildly repetitive on purpose, so any one class works
  standalone in markup.

## Buttons

**Every button is Material UI**, through `<Button>`
(`app/_components/ui/Button.js`). The old `.btn-primary` / `.btn-secondary` /
`.btn-danger` CSS classes are gone from `globals.css` — do not add them back,
or the app has two button systems again. `<Button>` takes the app's own
intent name and maps it onto MUI:

| `variant`   | What it is for                     | MUI                          |
| ----------- | ---------------------------------- | ---------------------------- |
| `primary`   | the one confirming action per view | `contained`                  |
| `secondary` | everything else (the default)      | `outlined`                   |
| `danger`    | destructive, or sign-out           | `outlined` + `color="error"` |

- **One `primary` per view.** _One exception, deliberate_: the Lubricants
  header carries _Record a lubricant sale_ and _Record a loose oil sale_ side
  by side, both primary. They are peers — two kinds of the same job, and the
  drum is the more frequent — so demoting either would point the reader at
  the wrong one. Two primaries are only right when neither action is
  subordinate; if one is, it is `secondary`.
- **`danger` rather than hand-rolled red styles.** Two places used to write
  their own: the Sign out button, and Clear this day — the latter because it
  wanted a _grey_ disabled state rather than a faded red, which MUI's own
  disabled state gives for free.
- **MUI's default look, at the owner's request** — its sizing, its uppercase
  labels, its palette. That means a tap target around 36px where the old
  classes gave about 50px, which was itself a deliberate number for a tablet
  pressed with a thumb (see the type-and-target floor below). If that ever
  bites in the yard, `size="large"` inside `Button.js` is the one-line fix
  and is worth trying before anything more elaborate..
- **Two pieces of shape are the theme's, since the new look**: a 12px corner on
  every button, and the secondary button white-filled with a slate hairline
  instead of MUI's near-black outline (`AppTheme.js`). Sizing, the uppercase
  label and the palette are still MUI's own.
- **Sizing and layout overrides** still go through `className`
  (`className="flex-1"` in a dialog footer) or MUI's own props — `fullWidth`
  for a full-width form submit, `size="small"` for the compact buttons inside
  a table row. The only style added on top of MUI's defaults is a `gap`, so a
  glyph or `<Icon>` passed as an ordinary child does not sit flush against
  the label.
- **A button that navigates should still be a link**: pass `href`, and add
  `pending` where a spinner during the navigation is wanted. MUI renders a
  real `<a>` through Next's `Link`, so middle-click and open-in-new-tab keep
  working, which they do not on a button with an onClick router push.
- **Never pass `component={Link}` from a server component.** `<Button>` is a
  client component, and a function cannot cross the server/client boundary -
  doing it throws _"Functions cannot be passed directly to Client
  Components"_ at render time. That is why the API is `href` (a string) and
  `pending` (a boolean): both serialise, and `Button` picks the component on
  the client side of the boundary. `component="a"` is fine, being a string -
  it is what the Excel download uses so the browser handles it rather than
  the client router.
- **This class of bug does not show up in `npm run build`.** It is a render-
  time error on an auth-gated page, so the build is green and the page is
  broken. Worse, it surfaced to the owner as _"page not found"_ rather than
  as an error: clicking a row is a client-side navigation, which fetches that
  route's RSC payload, and a payload that fails to generate lands on
  not-found. If a page 404s only when navigated to by clicking, suspect a
  serialisation error in that route before suspecting the data.
- `<SubmitButton>` (`app/_components/ui/SubmitButton.js`) wraps a submit
  button in `useFormStatus()` so it disables itself and shows a
  `pendingLabel` while a Server Action is in flight — use it for every form
  submit instead of a plain `<button type="submit">`, to stop a slow
  connection producing a double-submit.

  **This is not optional on destructive buttons, and it was missed on
  thirteen of them.** Every confirm — Yes, remove / Yes, delete / Bring back
  / Sign out — was a plain `<button type="submit">`, so pressing it did
  nothing visible until the row disappeared. The owner reported it as the UI
  freezing, which is exactly what it looks like. A button that runs a Server
  Action and does not change is indistinguishable from a button that did not
  register the tap..

  The exception is a plain GET form that navigates — the month pickers on
  Expenses and Reports — where the route change brings its own `loading.js`.

- `<IconButton>` (`app/_components/ui/IconButton.js`) — a square icon-only
  button for a row action, currently the trash on every delete. It is the one
  deliberate exception to "icons never carry meaning alone": that rule is
  about icons carrying _information_, and this is a control whose word was
  being repeated down every row of a table. `label` is mandatory and becomes
  both `aria-label` and the hover `title`, and the action behind it must
  confirm **in words** before anything happens — nothing here destroys on the
  first click.

  Text stays where the words are the distinction: _Bring back_ and _Delete
  for good_ sit side by side on the removed-customers row, and two icons
  there would be a guess.

## Confirming a destructive action: a dialog, never inline

`<ConfirmAction>` (`app/_components/ui/ConfirmAction.js`) is every "are you
sure?" in the app: a trash `IconButton` that opens a `<Dialog>` with the
question, the consequence, and a red confirm. Seven components used to expand
inline instead and all seven had the same fault. (`DeleteBankAccountButton`
was already a dialog and is the precedent the rest now follow.)

**Why inline was wrong.** Each one replaced its own 44px icon with a question,
two buttons and sometimes a paragraph - _inside a table cell_. The row grew,
its column widened, and every row beneath it jumped down the page. On the
Customers list the row you were aiming at moved while you were reading the
question, which is the worst possible instant for a page to shift.

- **The caller keeps its own `useActionState`**, so each action has its own
  pending state and its own error message. `<ConfirmAction>` owns only the
  open/closed state and the chrome, and takes `action`, `state` and a `hidden`
  object of form fields.
- **A refusal keeps the dialog open.** Most of these can be turned down by the
  database - a customer who still owes money, a delivery a later reading
  depends on - and that message is the entire point of the interaction.
  Closing on failure throws it away. `state.ok` closes it; `state.ok === false`
  renders the message in place.
- **Room for the sentence that matters.** The fuel-rate confirm can say what
  removing a rate does to readings already entered (since 066: they are
  re-priced to the rate before it) as a full warning rather than six words
  crushed into a cell. If a delete has a
  consequence people assume wrongly, the dialog is where it goes.
- **The trigger stays an icon**, per the `IconButton` rule - the row already
  names what the action applies to, and the dialog repeats it in words.
- **The exception is `PurgeCustomerButton`**, which keeps its own `<Dialog>`:
  its trigger has to be the words _Delete for good_ because it sits beside
  _Bring back_, and its body owns a text field whose value gates the submit.
  When a confirmation needs more than a yes, write the dialog out.

## Forms and Server Actions

- Every Server Action returns `{ ok: boolean, message: string }` via the
  `ok()` / `fail()` helpers in `app/_lib/actions.js`.
- `<FormMessage state={state} />` renders that shape directly: red for
  `ok: false`, brand-green for success. Put it directly above the submit
  button.
- **Money and rates are formatted by helper, never inline.** `formatPKR`
  rounds to whole rupees — right for a day's takings, wrong for anything
  per-litre. `formatRate` (`app/_lib/format-helpers.js`) always shows two
  decimals, so Rs 339.48 does not display as "Rs 339" and Rs 339.50 does not
  display as "Rs 339.5".
- **A figure on screen must be the figure that will be saved.** The cash-in-hand
  number is checked against the notes in the drawer before saving, so a form
  that computes `litres * rate` in floating point can show a total a paisa away
  from what the database stores. Use `saleAmount()` from `format-helpers.js` for
  any money the database also computes — see migration 052 and the changelog
  entry "One paisa stopped a reading being saved".
- **There is no paisa in this app's money, because there is no paisa coin in
  Pakistan.** `formatPKR` everywhere; a `formatPKRExact` that showed the ledger
  to two decimals was removed. Rates are the one exception, and only because a
  rate is a price on a board rather than something anyone hands over.

  This is a **storage** rule before it is a display one. `roundRupees` in
  `helpers.js` is applied to every write that becomes a customer debt or a
  payment — credit slips, payments, adjustments, lubricant sales — while
  `roundMoney` (2 dp) stays for the meter arithmetic, where litres × rate
  genuinely carries paisa and rounding would break reconciliation against
  stock. Rounding only the display would have been the worse half: three hidden
  0.28s make a rupee, and the running balance drifts away from the rows above
  it.

  Anything that _tests_ a balance has to round the same way, or the screen and
  the rule disagree — see `delete_customer`, which refuses removal on a
  non-zero balance and had to round too, otherwise an account reading "Rs 0"
  could not be removed and the reason quoted a figure nobody can pay.

  **Three places round a balance and they must be changed together**:
  `formatPKR` (the column), the `notSquare` check in `RemoveCustomerButton`
  (the warning), and `delete_customer` (the rule). This was got wrong once
  already — the SQL was moved to whole rupees and the browser check left on a
  `0.01` threshold, so an account displaying "Rs 0" warned that it was not
  settled and would then have been removed happily by the database.

  **Round half away from zero**, never bare `Math.round`. Postgres `round()`
  and `Intl` both send −0.5 to −1; `Math.round(-0.5)` is `-0`, so a balance the
  column printed as "Rs -1" was being treated as settled. `roundRupees` does
  `sign * Math.round(abs(n))` for exactly this reason.

  **And watch for negative zero in output.** `Intl` formats −0.28 as the string
  `"-0"`, so a customer a few paisa the wrong side of zero had an Owes column
  reading "Rs -0". `formatPKR` collapses it.

- **`format-helpers.js` exists for the same reason `date-helpers.js` does**:
  `helpers.js` reads request cookies and so cannot enter a client bundle, which
  previously left client components formatting inline and drifting. Server code
  imports both through `helpers.js`.
- `<Spinner>` (`app/_components/ui/Spinner.js`) — the shared pending
  indicator. `border-current` means it inherits the colour of whatever it
  sits in, so there is no per-context variant. Used by `PendingLink` and by
  the date box in `DateJump`.
- `<NumberInput>` (`app/_components/ui/NumberInput.js`) — use instead of a
  bare `<input type="number">` everywhere. It blocks the scroll-wheel and
  arrow-key value changes that silently corrupt a typed money/litres/meter
  figure — a real, previously-hit bug, not a hypothetical.
- Client forms follow this `useActionState` shape:
  ```jsx
  const [state, formAction] = useActionState(someAction, null);
  ```
  and reset (`formRef.current?.reset()`) on `state.ok`.

## Dialogs — the pattern for "set up once, not read constantly"

`<Dialog>` (`app/_components/ui/Dialog.js`) wraps the native `<dialog>`
element — real focus trapping, Escape-to-close, an inert background, and a
backdrop from the browser, not hand-rolled. On a phone it fills the screen
as a sheet rather than floating as a cramped centered box. Props: `open`,
`onClose`, `title`, `subtitle` (optional node), `size` (`'md'` default,
`'lg'` for content that needs more width, e.g. a table).

**It does not close on a click outside**, deliberately. A `click` event
fires on the nearest common ancestor of `mousedown` and `mouseup`, so
selecting text in a field and releasing the button a few pixels past the
panel edge produced an event targeting the `<dialog>` itself — identical to
a real backdrop click, and it threw away a half-typed form. Every dialog
here holds entry someone is part-way through, so the affordances are all
deliberate ones: Escape, the header `✕`, and the form's own Cancel. Give
every dialog form a Cancel button; it is the visible way out.

The one intentional exception is the nav drawer in `AdminSidebar.js`, which
_does_ close on its backdrop — it holds no input, and tap-outside-to-dismiss
is what people expect of a menu.

**A form that arrives already scrolled hides its own Save button**, so a
dialog form should fit a short laptop — 1024×768 is the shortest worth
checking, and the dialog caps itself at `90dvh`. `CustomerForm` did not: the
opening-balance cards are tall, and stacked in the default 32rem width it ran
195px past the bottom. Shrinking the cards would have undone the readability
they exist for, so it uses `size="lg"` with a two-column grid instead — the
contact fields on the left, the opening balance on the right. Reach for the
width before shrinking the content.

Phones are exempt: there the dialog is a full-screen sheet, the columns stack,
and scrolling a form is ordinary.

**When to put a form behind a dialog**: when the thing it creates is set up
rarely (an account, a staff login, a tank, a delivery) rather than read or
edited continuously the way a table on the same page is. A form that sits
open on the page permanently for a rare action steals space from — and
visual priority over — the content actually being worked with every day.
Concretely, that space cost showed up twice in this app's history:

- `BankAccountForm` — moved into a dialog because a four-field "add
  account" form sat open under the transaction list, when accounts are
  added twice ever and transactions are recorded every week.
- `PurchaseForm` ("Record a delivery") — moved into a dialog because the
  form's own width column left dead whitespace once the seven-column
  purchases table beside/below it needed the rest of the page.

**When to leave a form open on the page instead**: when filling it in is the
reason the page is opened at all, and the table beside it still fits the
`1fr` track (see "Layout: form beside a table"). `ExpenseForm` on
`/admin/expenses` is the reference case — an expense is recorded the day it
is paid, so putting it behind a button would add a click to the page's main
job to save space its neighbouring table does not need.

The **canonical implementation** to copy is `BankAccountForm.js`
(`app/_components/admin/BankAccountForm.js`) or `PurchaseForm.js`
(`app/_components/admin/PurchaseForm.js`, the more recent one):

```jsx
const [isOpen, setIsOpen] = useState(false);
const [notice, setNotice] = useState(null);
const [showResult, setShowResult] = useState(false);
const [state, formAction] = useActionState(someAction, null);

// Close on success and hand the confirmation to a Toast — a result belongs
// to the submission that produced it, so `handled` guards against the
// effect re-firing on an unrelated re-render.
const handled = useRef(state);
useEffect(() => {
  if (state === handled.current) return;
  handled.current = state;
  if (state?.ok) {
    setIsOpen(false);
    setNotice({ message: state.message });
    formRef.current?.reset();
  }
}, [state]);

return (
  <>
    <Button
      variant="primary"
      type="button"
      onClick={() => {
        setShowResult(false);
        setIsOpen(true);
      }}
    >
      <span aria-hidden="true">+</span> Add whatever
    </Button>

    <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Add whatever">
      <form
        ref={formRef}
        action={(formData) => {
          setShowResult(true);
          formAction(formData);
        }}
        className="space-y-4 p-4"
      >
        {/* fields */}
        <FormMessage state={showResult ? state : null} />
        <div className="flex gap-2 border-t border-ink-200 pt-4">
          <SubmitButton className="flex-1">Save</SubmitButton>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>

    <Toast notice={notice} onDismiss={() => setNotice(null)} />
  </>
);
```

`showResult` matters: it keeps a stale error/success message from a
previous open from flashing before the new submission's own state lands.

**A dialog holding a table of rows gets ONE submit, not one per row.**
`NozzleSettingsButton.js` is the example: six nozzles, one "Save wiring".
Repeated field names (`nozzle_id`, `tank_id`, `starting_reading`) serialise in
markup order, so the action pairs them up by index. One button is also one
write — `set_nozzle_wiring()` does all six rows in a single UPDATE, because
six separate statements can fail part-way and leave the rows disagreeing with
each other.

The trigger button for a dialog form usually goes in `<PageHeader>`'s
`children` slot (see below), so it sits beside the title rather than inline
in the page body.

`<Toast>` (`app/_components/ui/Toast.js`) is for **success only** — it
self-dismisses after 6s, so an error placed there could vanish before
anyone reads it. Errors always render inline via `FormMessage`, next to the
field/form that caused them, not as a toast.

## Tables

- `.table-scroll` (`-mx-4 max-h-[70vh] overflow-auto px-4 sm:mx-0 sm:px-0`)
  wraps every `<table>` on a `.card`. It lets a wide table scroll
  _inside its own card_ rather than push the whole page sideways, caps
  height so long lists don't run forever, and is what makes `.table-scroll
thead th`'s `position: sticky` headers work — the wrapper has to be the
  scrolling element for a sticky child to have something to stick to.
- `.th` / `.td` — standard cell padding. `.td-num` additionally bakes in
  `whitespace-nowrap` and right-alignment, because a wrapped number
  (`"10,000` / `L"` on two lines) reads as two separate values. Always use
  `.td-num` for money/litres/counts, never plain `.td` with a `text-right`
  utility bolted on.
- **If a table's required width won't fit the page's available space**,
  the fix is architectural (give it more room — see "Layout: form beside
  table" below), never a padding/font-size squeeze to force it to fit. That
  was tried once for the Purchases table and reverted after a screenshot
  showed the Supplier column wrapping a real name across three lines — a
  numeric "no more scrollbar" win that was actually a worse regression.
  Always verify a table fix with a screenshot using realistic (not
  short/lorem) fixture text, not just a scrollWidth measurement.

## Layout: form beside a table

The recurring two-column pattern for a page that pairs a form with a
list/table:

```jsx
<div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
  <FormComponent />
  <div>{/* table or list */}</div>
</div>
```

`[&>*]:min-w-0` is required — without it, a grid child can't shrink below
its content's natural size, which defeats `overflow-auto` on anything
inside it (a table trying to scroll internally instead ends up stretching
the grid track). Used on Settings (fuel prices), Account (staff list),
Banking.

**This only works when the table comfortably fits the `1fr` track** at the
page's `max-w-6xl` cap (~1152px page → roughly 744px of table budget once
the 22rem column and gap are subtracted). When it doesn't — Purchases'
seven-column table needed close to 850px — don't fight the split:
put the form behind a dialog instead (see "Dialogs" above) and let the
table have the full page width. A `position:relative; left:50%; ...`
"breakout" trick to widen just one page past `max-w-6xl` was tried for this
and abandoned — it worked above ~1280px viewport width but leaked a
page-level horizontal scrollbar at common laptop widths (1024–1152px); not
worth the fragility next to just removing the competing column.

## Type scale and readability

The reader is the owner, on a cheap tablet, in a pump office in the evening,
checking figures against cash in a drawer. The scale below is set for that,
not for a designer's monitor.

- **The data is bigger than the chrome.** A figure someone verifies is never
  smaller than the label describing it. Money and litres are `text-lg`
  (18px) in a row, `text-xl`/`text-2xl` in a stat tile; captions are
  `text-xs` (12px) and never smaller. Body copy is `text-base` (16px), not
  `text-sm`. This was the whole problem the readability pass fixed: nozzle
  figures were 14px under 10.4px uppercase labels, while the page heading
  that told the reader nothing was 24px.
- **`figure-label` and `figure-value`** (`globals.css`) are that pairing as
  two classes — a small uppercase caption over a tabular figure. Use them
  rather than hand-rolling the pair; every stat strip, nozzle row and dialog
  summary in the app now shares them, which is why the size is fixable in
  one place.
- **Grey has a floor of `ink-600`** for anything meant to be read. `ink-500`
  is for genuinely secondary text on white, `ink-400` only for disabled
  controls and placeholder text — it measures 2.6:1, which is below the
  accessibility minimum and unreadable in poor light.
- **A money figure never wraps and never clips.** `whitespace-nowrap` on the
  value, and the grid drops to one column below 380px rather than squeezing
  "Rs 4,386,211" into half a phone. Breaking after the "Rs" reads as two
  separate numbers for a moment, which is worse than a taller tile.
- **Buttons and tabs are `py-3` or taller**, giving a tap target around
  48px. These get pressed with a thumb, sometimes in a hurry.

## Navigation

- `<AdminSidebar>` (`app/_components/admin/AdminSidebar.js`) is the whole of
  it: a fixed 240px column from `lg` up, a drawer behind a burger below that.
  `app/admin/layout.js` keeps the content clear of it with `lg:pl-60` — those
  two numbers have to agree and are the only two places the width appears.
- **Why a column and not a row of tabs.** Ten sections with an icon and a
  readable label need about 1350px laid out sideways, against a 1152px page.
  As a top bar they either scrolled — hiding Reports and Settings off the
  right of every laptop — or wrapped onto a second row that ate the top of
  every screen. Down the side, all ten fit at once with room to spare, which
  is what someone still learning where things live needs.
- **What it costs.** 240px off the left means the widest table in the app
  (Purchases, eight columns) scrolls inside its own card at 1024px, where it
  used to just fit. Inside the card, not the page.
- **The drawer is a real `<dialog>` opened with `showModal()`**, the same
  reasoning as `ui/Dialog.js`: focus trapping, Escape and an inert background
  come from the browser already correct. It closes on the pathname changing,
  not on the click — closing on click pulls it away while the next page is
  still loading, and the pending spinner on the link is the only feedback
  there is.
- **The open section is marked three ways, and the third is the one that
  survives daylight.** A `brand-50` band, a `brand-800` semibold label, and a
  short dark bar at the right-hand end of the row (`ActiveMark`, bottom of
  `AdminSidebar.js`). The first two are soft: on a cheap tablet in poor light
  the tint washes out to the same white as the rest of the column, and then
  nothing says which of thirteen sections is showing. The bar is the darkest
  ink in the nav and sits where no other row has ink at all, so it reads as a
  marker rather than one more pale wash. `ml-auto` puts it against the far edge
  whatever the label's length, so the markers line up down the column. It is
  `aria-hidden`; `aria-current="page"` on the link is what is announced. On the
  drawer's rows and on Account too — an active-state rule that skips a surface
  is how the two drift apart.
- **A fourth mark since the new look: the open section's icon tile is filled.**
  Every section's glyph sits in a 32px tile; the tiles are pale slate, and the
  open one is filled in the primary green with a white glyph, the move
  `.seg-item-active` makes. Fill and weight survive the daylight that washes a
  tint out. The tiles stay slate rather than a hue per section: thirteen hues
  would spend the fuels' blue, orange and gold on chrome. Sign out is the
  `danger` button this file already named for it. It had been left at
  `SubmitButton`'s default variant, so the red styles written on it lost to MUI
  and it drew as a filled green button, the colour that means "go ahead", on
  the control that ends the session.

## A download that is not a report explains itself

The app has two downloads that look like neighbours and are nothing alike: the
Excel workbook (a month, laid out for reading) and the backup (every table,
shaped to be reloaded). They were briefly next to each other on Reports, and
that was the wrong grouping — **Reports is where the owner goes to read a
figure**, and a control about losing the entire database does not belong under
the month's profit. The backup panel now lives on **Settings**, with the rates,
the tanks, the nozzle wiring and the reset panel: the things set up once and
then left alone. Its failure redirects there too, because a message has to land
on the page the reader pressed the button from.

`<BackupPanel>` is a panel with sentences rather than a bare button, and that is
the rule worth keeping: **a control whose consequences are not obvious explains itself where it
stands**, in the words the reader would use, rather than in documentation nobody
has open. Beside "Download Excel", a button marked "Back up" reads as another
way to see the numbers. The same reasoning put the sentences on the reset panel
in Settings.

Two mechanical details that are easy to get wrong and are shared by both:

- **No `download` attribute on the link.** It saves whatever the URL returns,
  including the redirect a failure produces, so a failed export lands in
  Downloads as a junk file saying nothing. The route's `Content-Disposition`
  downloads the file on its own and lets a failure navigate back.
- **The failure comes back as a query parameter** and is rendered where the
  button is, trimmed before it goes on screen because it arrives from the URL.
- **And it has to be able to go away** — `<DownloadNotice>`. A download that
  works does not re-render the page, so a reason parked in the query string
  outlives the problem it describes: the backup's migration was applied, the
  file downloaded, and the red line was still sitting there. The notice strips
  its own parameter from the URL once it has been read (`history.replaceState`,
  not a router navigation — this changes nothing the server rendered, and a
  navigation would re-fetch the whole page to drop one parameter), carries a
  Dismiss button, and is cleared by the panel when the button is pressed again,
  because the answer to the old failure is the attempt now in flight. Errors
  still never go in a `<Toast>`; this is how an error that must persist stops
  persisting past its truth.

## The table behind a chart: a modal, and the way in goes ABOVE the chart

Reports' month-by-day table used to be a `<details>` block under the two charts,
and both halves of that were wrong.

- **A `<details>` strip reads as furniture, not a control.** Its whole visible
  state was a line of text and a disclosure triangle — the one thing on the page
  with no button and no border around anything clickable.
- **It was below the charts.** The table is what a reader reaches for when the
  chart is not answering their question, so putting it underneath meant scrolling
  past the thing that had just failed them to find the alternative. The button
  now sits in the heading row, on the right, above the charts — where the reader
  already is when they give up on the picture.
- **Opening it in the flow pushed the page around.** A nine-column table
  appearing mid-page moves everything below it and lands the figure someone
  wanted below the fold. `<DailyTableDialog>` opens it as a modal (`size="xl"`)
  instead: nothing moves on the way past, and the table gets the whole screen
  when it is wanted.

**A client shell around a server component.** `<DailySalesTable>` formats money
through `helpers.js`, which reads request cookies and cannot cross into a client
bundle. The dialog is a client component that takes the finished table as
`children` — rendered on the server, passed in. Importing it inside the client
component would break the build; this is the pattern to copy whenever a modal
needs to hold server-rendered content.

## Clearing history: whole periods, never a single line

The Activity page can throw away its own old end
(`<ClearOldActivityButton>`), and the shape of that dialog is the rule for any
"this list has grown too long" control over records that are meant to be
trustworthy:

- **The only choice offered is how much to KEEP**, out of a few whole periods —
  never a free date, never a picked row. Choosing a cutoff on the recent side,
  or removing one line out of a run, is what turns a trail into something that
  lies by looking complete.
- **The cutoff is computed in the database**, from `pump_today()`, so the
  browser cannot name an instant of its own and the count shown and the rows
  deleted come from the same expression.
- **Every option says how many entries it would take.** "Older than six months"
  is a tidy-up at 4 lines and a decision at 4,000, and nobody can tell which
  they are agreeing to without the number. An option with nothing old enough is
  drawn disabled, not hidden, so the choices stay in the same places.
- **The clear-out records itself** in the thing it cleared, and the dialog says
  so. Everything else follows the destructive-dialog pattern above: `danger`
  button, `<SubmitButton>` with a pending label, result carried out in a
  `<Toast>`.

## Responsive: measure the container, not the window

Since the sidebar arrived, viewport breakpoints and content width are no
longer the same number — at a 1024px window a page has about 768px to work
in. `sm:`/`lg:` on anything laid out inside the content area therefore asks
the wrong question.

- `<StatGrid>` uses `@container` and `@[24rem]`/`@[50rem]` variants so its
  column count follows its own width. Asked for four columns at the `lg`
  _viewport_ breakpoint it gave each tile 192px, and "Rs 4,386,211" at 24px
  does not fit that — the figures ran into their own dividers.
- Use the shared `<StatGrid>`/`<StatTile>` rather than hand-rolling a stat
  strip. Three pages had their own copy and all three had the same latent
  bug; they are one component now.

## The container is the group — Readings

Readings lists six nozzles that belong to three physical units. Flat and
evenly spaced they read as six unrelated pumps, and the only thing saying
otherwise was the words "Unit 1 ·" repeated on two cards — a relationship the
reader had to compare character by character to see.

Spacing was the first fix (32px between units against 12px inside one) and it
was not enough on its own: six identically-shaped full-width cards down the
page still had no rhythm, and "Unit 1" was a caption floating above two slabs
rather than the pump those nozzles are bolted to.

- **One card per unit, nozzles as rows inside it.** The card is the physical
  pump; the rows are its nozzles. Three objects to work through instead of
  six, and the rows get shorter because they no longer each carry their own
  card edge and shadow.
- **A group carries its own progress** — "1 of 2 entered" plus a bar, green
  once done — so a finished pump is skipped without reading its rows. The bar
  and the words say the same thing; the bar is the glanceable half, never the
  only carrier.
- **The unentered row is the tinted one.** This page is opened every evening
  to answer "what is left to do", and a finished nozzle used to look exactly
  as loud as one still waiting. The amber wash is the same amber the Enter
  chip already wears, so it adds no new colour language — it just puts the
  remaining work where the eye lands first.
- **Drop the repetition the grouping makes redundant.** With a "Unit 1"
  heading above them, the rows say "Nozzle A" and "Nozzle B". The _dialog_
  keeps the full "Unit 1 · Nozzle A", because it opens over the whole page
  with the heading out of sight — shorten a label only where the context that
  replaces it is on screen.
- **A left edge, not a top rule, for the fuel colour on a row inside a
  card.** Use `color.border` (the plain border colour) for this, not
  `color.accent` — `accent` is `border-t-*` and only ever paints a top rule,
  so pairing it with `border-l-4` silently gives a grey edge and no fuel
  colour at all.

## The day on screen is stated once, and loudly

`<DateNav>` opens with a tinted banner carrying the relative label, the
weekday and the written date — "Yesterday · Thursday, 06 Aug 2026" — above
the arrows and the date box.

- **The weekday is the point.** A row of digits is easy to skim past, and the
  native date box is drawn in the _browser's_ locale, so it may not even be in
  the order the reader expects. "Thursday" is checkable against the day
  someone has actually lived.
- **Tinted whenever it is not today** — grey for a past day, amber for a
  future one — so being somewhere else is noticed rather than read for.
- **There is always a label**, including "Past day". A day with no label
  looked identical to today at a glance, which is exactly the mistake the
  block exists to prevent.
- **Say it once.** The date used to appear three times on the same screen in
  three formats: the page description, the date box, and a small caption. The
  descriptions on the date-driven pages no longer repeat it — three quiet
  statements of one fact left none of them dominant, and the owner lost track
  of which day he was entering.

## A day-completion strip on Readings was tried and removed

Recorded so it is not rebuilt from scratch a third time. The idea was a strip
of recent days above the nozzle list, coloured by how many of that day's
nozzles had been entered, so a skipped day was visible at a glance. It was
built three ways and all three were removed:

1. **A band of tiles under the controls** — weekday, day number and a "3/6"
   fraction each. It measured fine and read as a second, competing set of date
   navigation, on a screen whose actual job is six nozzles. It also pushed the
   whole page down by its own height plus a margin.
2. **The same tiles inline** in the controls row — fixed the height, not the
   weight.
3. **Seven small circles** centred between the date banner and the Clear
   button, one number each, with a pulse on a day nobody had entered. Lighter
   again, and still the wrong thing on the page: _"I just needed a visual
   indication… things did not work out."_

**The lesson is about weight, not about tiles.** Every version was a
_secondary_ signal — nice to have, not the reason anyone opens the screen —
and each one competed with the primary controls for the same glance. Making it
smaller each round narrowed the gap without closing it. If something like this
is wanted again, it has to cost visibly less than the date navigation beside
it, and it should probably not be interactive at all.

**What actually prevents the mistake is still there, and is not this.** The
red banner naming the missing day, and the confirm checkbox inside the entry
dialog — see "A gap the database allows on purpose still wants a checkbox"
below. Both work off `previous_date`, which `get_reading_sheet` (migration 009) has always returned; neither needed the strip or the RPC that fed it
(`get_reading_completion`, added in 037 and dropped in 038).

## Meter readings carry two decimals

A pump meter is a physical dial with a tenths digit, so 1,987,128.80 and
1,987,279.95 are the same shape of number. Formatted with a bare
`maximumFractionDigits` the first drops its trailing zero and renders a digit
shorter than the figure beside it — in a tabular font whose whole purpose is
keeping columns aligned, on a screen read in a hurry against cash in a
drawer. `ReadingForm` and `ReadingChainWarning` use a `meterFormat` with
`minimumFractionDigits: 2` for meter figures; litres sold keep the ordinary
format, since those are quantities rather than dial positions.

## A warning tells the reader their situation, not the general case

The reading-chain messages say the same thing two ways depending on whether
the day is already saved. On an unentered day the overlap is a prediction —
"saving would count them twice, and will be refused" — and that is what stops
the mistake. On a saved day the identical sentence describes something that
has already happened as though it were still avoidable, which invites someone
to hunt for a save button that is not there and conclude the message is
stale. A saved day is told what is true and what to do: "this day and 07 Aug
both cover the same 151.15 litres — one of the two has to be cleared."

## Two languages on one page

The Guide is the app's only bilingual screen, and the shape it uses is the
one to copy if another follows.

- **The text is data, not markup.** `app/_lib/guide-content.js` holds both
  languages against the same keys; the page renders that shape once and picks
  one. Two hand-written pages would drift the first time one was corrected.
- **The language is a query string** (`?lang=ur`), like the month filters on
  Reports and Expenses. No client component, no cookie, no stored preference
  — the browser follows a plain link, the server renders one language, and
  the Urdu version can be sent to someone as a link that opens in Urdu.
- **`dir` goes on the article**, and everything inside it must be
  direction-agnostic: flex rows follow `dir` on their own, spacing uses the
  logical `ms-`/`ps-`/`border-s` utilities rather than left and right, and
  anything that genuinely points is flipped with `rtl:`. A single `ml-` or
  `left-` inside that subtree silently breaks the Urdu layout, which is why
  `GuideFlow.js` says so at the top.
- **Diagrams are boxes and borders, not images.** They stay sharp, re-flow on
  a phone, keep their text selectable and readable at any size — and the same
  markup renders in Urdu without anything being redrawn.

## A long instruction page is read by scanning, not by reading

The Guide is the one screen in this app nobody reads front to back. It is
opened by an attendant who wants one answer, and closed again. Four devices
keep it scannable; copy these before adding prose to it.

- **A location chip instead of a sentence about where to go.** A step that
  happens somewhere carries `where: { icon, path }` in `guide-content.js`, and
  `GuideSteps` renders it under the heading as a brand-tinted pill with the
  nav icon: `⛽ Lubricants → Record a lubricant sale`. It uses the _same icon
  as the sidebar tab_, so it points at something the reader can already see.
  This is not the icons-carry-no-meaning-alone exception — the path is written
  out in words beside it.
- **A rule leads with its claim, in bold, then explains.** `rules.items` is
  `{ title, body }`, not a string, so ten rules can be taken in by reading ten
  short bold lines. Ten full paragraphs behind ten identical warning triangles
  gave the eye nowhere to land — the repeated icon marked nothing.
- **What is done once folds away.** The one-time setup was a quarter of the
  page height for a reader who will never do it. It is a native `<details>`
  with a `<summary>` styled as a card row: no JavaScript, no state, still
  found by the browser's own Ctrl-F, and the chevron rotates with
  `group-open:-rotate-90`. Fold anything the _usual_ reader does not need,
  not anything that is merely long.
- **Cards are split by how often they are used, not by subject.** "Customers"
  became "Customers" (pay, add — routine) and "Fixing a customer" (edit,
  adjust, remove — rare, owner-only). A ten-line card covering six operations
  teaches worse than two four-line ones.

Both languages carry every marker or neither: after any edit, check the shape
(stages, steps, rules, role rows, and the icon on each) matches between `en`
and `ur`. Adding a chip to one language only is the easy mistake.

## Splitting a list by route, and when to take it back

The drum's sales had their own page for good reason and it was still wrong.
Both halves of that are worth keeping in mind, because the reasoning that
justified the split is the reasoning that now argues against it.

**Why it was split.** A run of rupee-priced pours — twenty rows saying "Loose
Oil · 0.034 L" — buried the four carton sales that need reading. True, and
still true.

**Why it came back.** A route split makes the reader decide _where a thing
lives_ before they can look for it, and it means a figure that is one number in
the owner's head — "what did we take on oil today" — is never on one screen.
Two pages of totals also have to be reconciled by eye every time.

**What to do instead.** One list, a marker on the rows that differ, and a
filter above it: `All oil / Packed only / Loose only` as a chip row, defaulting
to all. The busy-Saturday case that justified the split is one tap away, and
the ordinary case is right. The old route stays as a `redirect()` to the
filtered view, because bookmarks and links out in the world do not know it
moved.

The general rule: **filter a list, do not split it across routes, unless the
two halves are genuinely different work.** Readings and Lubricants are separate
pages because a day of fuel is worked out once from six meters and oil is sold
one tin at a time. Packed and loose oil are the same work with a different
container.

## The Urdu word in brackets is the label, not the translation

`<BalanceDirection>` labels its options **"They owe the pump (بنام)"** and
**"They have paid ahead (جمع)"**, and the bracketed word is the one the reader
is actually looking for. بنام and جمع are what a Pakistani shopkeeper's
register has called a debit and a credit for a century; the owner has been
writing them by hand for years, and no English phrasing of "increases what
they owe" ever competed with that. The English stays as the gloss, because the
staff logins may not share the habit.

- **Same word for the same idea, everywhere.** The New customer form and the
  manual adjustment both use بنام / جمع, so the owner is choosing between two
  terms he already knows rather than two sentences he has to parse. The blank
  third option on the New customer form is **نیا کھاتہ** — "new account".
- **Wrap it in `<bdi>`.** Urdu is right-to-left, and an unmarked run of it
  inside an English sentence lets the bidi algorithm drag the surrounding
  brackets around — the closing paren ends up on the far side of the phrase.
  `<bdi lang="ur" dir="rtl">` isolates the run so the brackets stay put.
- **A step larger than the English beside it.** Urdu script carries more
  detail per character and is unreadable at the 14px a Latin label survives, so
  the `<bdi>` is `text-base` inside a `text-sm` line.
- **Keep the pair on one line** (`whitespace-nowrap` on the bracketed group).
  An opening paren stranded at the end of one line with the word on the next is
  worse than no bracket at all.

This is not the same thing as the Guide's bilingual page, which renders one
language or the other. Here both are on screen at once because they are doing
different jobs: the Urdu names the concept, the English explains it.

## Paging: `<Pager>`, and where the slice happens

`<Pager>` (`app/_components/ui/Pager.js`) is the row under every paged table:
a "Showing 21 to 39 of 39" sentence and the Previous/Next nav. It takes
`page`, `perPage`, `total` and **`hrefFor(page)`** — a function, not a base
path, because these tables already carry a date, a month or a customer id in
the query string and a pager that rebuilt the URL would silently drop them.
`pageFrom(searchParams)` beside it reads and clamps `?page=`.

**What needs paging.** Anything that shows everything since the pump opened:
Purchases, Banking, Stock checks, a customer's ledger. A table scoped to one
day or one month is bounded by how much can happen in that time and does not
need it — with one exception, the two sales tables, where a busy day runs to
dozens of rows and pushes the stock table below them out of reach.

**Where to slice — this is the part that bites.** Two options, and the wrong
one silently corrupts a figure:

- **Page in the database** (`range()` + `count: 'exact'`) when the list is
  _only_ a list. The customer ledger is the clean case: the balance and the
  fuel breakdown come from `get_customer_statement`, which sums in Postgres
  over everything, so paging the rows changes only what is displayed.
- **Fetch it all and `slice()`** when the page derives anything from the whole
  set. Purchases totals what is still owed to suppliers; Banking counts
  transactions per account; Stock checks looks up the check belonging to the
  date on screen. A database page would turn each of those into "…of whatever
  is on this screen".

The same trap had already been laid by plain `.limit()` defaults, which is
worse because nothing on screen says a cap was applied: `getPurchases` stopped
at 100, so the hundred-and-first delivery pushed the oldest unpaid ones out of
the "still owed" total. **A cap on a list you are going to total is a cap on
the total.** Those caps were removed rather than paged around.

## Long tables get their own paged page

A table that grows without bound does not belong sitting open on a page that
is read for something else. Two of them now follow the same shape, and a
third should copy it rather than invent another:

- The page it lives on keeps a **bounded, recent slice** — five rate changes
  on Settings, the chosen month of daily sales on Reports — and links to the
  full history.
- **A preview is a glance, so size it to fit without scrolling.** The Settings
  slice was seven whole _days_ of rates, chosen so a day's petrol and diesel
  could not be split; at two fuels a day that is fourteen rows, and the panel
  came back with its own scrollbar — a small scrolling table inside a page you
  scroll, which is the worst of both. The cap is now five rows, extended
  forward to the end of whatever date the fifth row falls on (so it shows five
  or six, never half a day). Keep the pairing rule; get the height from the
  cap, not from the calendar.
- The history is its own route with a pager: `/admin/settings/fuel-prices`
  and `/admin/reports/daily`. The page number is a **query string**, so Back
  works through it and any page can be linked to or reloaded.
- **Size the page to the viewport, not to a round number.** 25 rates a page
  overran `.table-scroll`'s 70vh cap and the card grew its own scrollbar, so
  the wheel did one of two different things depending on where the pointer
  was. Eight rows clear the cap at every width this app is read at, and
  `FuelPriceTable` sets `max-h-none` to drop the cap entirely now that neither
  of its callers can reach it — the sticky heading goes with it, and is no
  loss when the whole table is on screen. Keep the page size **even** where
  the rows come in pairs, so a day's petrol and diesel do not straddle the
  fold.
- The table itself is a shared component (`FuelPriceTable`,
  `DailySalesTable`) used by both, so the columns cannot drift apart between
  the summary and the history.
- Page by whatever the data is really counted in. Rates page by row; daily
  sales page by **date window**, because `get_sales_trend` fills in every day
  between two bounds including the ones with no trade, so a page is 25 days
  rather than 25 rows and the page count falls out of the distance between
  the first trading day and today.
- A dead pager button is a `<span>`, not a link styled to look disabled — a
  disabled-looking link is still focusable and still navigates. This now lives
  inside `<Pager>`; do not hand-roll it again.

## A chart that toggles view has state, not a route

`<SalesTrendChart>` on the Dashboard and Reports switches between rupees and
litres with a small pair of buttons above the chart, not a filter chip in the
URL.

**Why this one is different from `<TrendRange>` beside it.** That control
changes the _window_, which means a different set of rows and a new query.
This one changes only how the rows already on the page are drawn — both series
come back from `get_sales_trend` in the same call. Round-tripping to the
server for a view the client can already produce would be a spinner in
exchange for nothing, so it is `useState`, not a query string.

**Why it exists at all.** In rupees, the sales chart and the cash-vs-credit
chart beside it were drawing the same picture — on a pump paid almost entirely
in cash, "total sales" and "the cash bar" are the same height every day. Litres
is the view money cannot give: a rate change does not move the bars, so a quiet
day reads as a quiet day rather than as a cheaper one.

**Split by fuel, stacked rather than side by side**, so the bar height still
answers "how big was the day" the way the rupee view does, and the petrol/diesel
mix is legible inside it. Only the top segment gets a rounded corner, or the
lower one's corner notches into the segment above it.

**The emptiness check is asked of the series being shown.** A period can hold
only-zero litres in the same rows as only-zero rupees, so in practice these
agree — but checking the wrong series would put "no sales" over a chart that
has bars in the mode actually on screen.

## Filtering a chart: fixed windows, not a date range## Filtering a chart: fixed windows, not a date range

`<TrendRange>` (`app/_components/admin/TrendRange.js`) is how the Dashboard
charts are filtered, and the shape to copy for the next set.

- **The end of the window is already chosen elsewhere.** `<DateNav>` at the top
  of the page picks the day; the filter only says how far back to reach. Asked
  as a from/to pair it would be two date pickers, four taps, and a range that
  can be entered backwards or empty — none of which can happen here.
- **Four fixed windows** (7 / 14 / 30 / 90 days), one tap each. 90 is the point
  where a daily bar stops being readable at this width; past that the answer is
  a different chart, not a longer axis.
- **The current window is a `<span>`, not a link** — the same rule as the dead
  button in `<Pager>`. A link styled to look inert still takes focus and still
  navigates, to the page you are already on.
- **Two controls on one page means each carries the other's value.**
  `<DateNav extraParams={{ days }}>` threads the window through the day arrows,
  the date box (including the `noscript` GET form's hidden fields) and "Back to
  today". Miss one and stepping a day silently resets the filter, which reads
  as the arrow being broken.
- **`scroll={false}` on the window links.** A `<Link>` resets the scroll to the
  top, which is right when the whole page changes and wrong for a filter: the
  charts are the last thing on the Dashboard, so asking for 30 days instead of
  7 threw the reader back up past the tiles and the tanks to look at a chart
  they were already looking at. The rule generalises — **a control that changes
  only what is beside it should not move the page.**
- **State the span in words under the heading.** "Last 30 days" is ambiguous
  the moment the reader has stepped back a week — these charts end on the day
  the page is showing, not on today, so the dates are spelled out beneath it.
- **Validate the query string against the allowed set**, never `Number() || 14`.
  `trendDaysFrom()` returns the default for anything not in `TREND_WINDOWS`, so
  `?days=999` cannot ask the database for three years of daily rows.

## When a list should stop being a table

Every list in this app is a `<table>` that scrolls sideways inside its card
when it runs out of room. That is right for Purchases, Readings, the ledger —
lists of short numbers, where the columns stay readable and the reader knows
what is off to the right.

`<ActivityTable>` is the exception, and the test for when to copy it is
**whether the widest column is a sentence**. The activity log was a table
first: at 400px it measured perfectly — nothing clipped, no page scroll — and
looked broken, two narrow columns of timestamps beside acres of white, because
the row heights were being set by a 700px description sitting off-screen.
Scrolling right to find out _what happened_ defeats the page.

The replacement is one piece of markup that is a grid of columns above
`@[54rem]` and a stack below it:

- **`@container` on the wrapper**, and container-query variants throughout —
  not `sm:`/`lg:`. With the 240px sidebar a 1024px window gives a page 768px,
  so viewport breakpoints answer the wrong question. See "Responsive: measure
  the container".
- **`@[54rem]:contents` is the trick that avoids two copies of the markup.**
  When/who/amount are wrapped in one div: below the threshold it is a flex row
  of small grey text under the event, and above it the wrapper dissolves so its
  three children become grid cells in their own columns.
- **DOM order is the phone order; `order-*` and `col-start-*` rearrange it for
  the columns.** What happened comes first in the markup, because that is what
  the reader came for, and moves to column three on a wide screen.
- **Size the columns to the content and prove it, then set the threshold above
  the total.** Measured: the timestamp needs 11.5rem, the longest name 11.6rem,
  a seven-figure sum 7.5rem. At a threshold of 46rem those columns cramped and
  "Rs 7,686,000" wrapped onto two lines — the exact regression the type rules
  call out. 54rem with 12/12/1fr/8rem does not.
- **`whitespace-nowrap` on the figures, not on the name.** A name that outgrows
  its column should wrap; a timestamp or an amount that does the same is a
  defect.
- **A placeholder is a column's problem, not a stack's.** The em-dash standing
  in for "no amount" is `hidden @[54rem]:inline` — in the stacked layout it
  would be a dash alone on a line, which is a thing to decipher rather than
  read.

## Picking one of a handful of categories: icon tiles, not a dropdown

`BalanceDirection` (below) is the pattern for choosing between two named
_directions_, read as sentences. `CategoryPicker`
(`app/_components/admin/CompanyAssetForm.js`, used by Company Assets) is the
pattern for choosing one of a small fixed set of _kinds of thing_ — vehicle,
machinery, property, electronics, other — and it is deliberately a different
shape: a `role="radiogroup"` of icon tiles, not a `<select>`.

The reason is what there is to read. A direction is a sentence someone has to
understand; a category is a single word most people recognise on sight, and a
picture answers "which one" faster than five words in a closed dropdown ever
will — nothing to open, nothing hidden until you click. A `<select>` is right
when the list is long, alphabetical, or has no natural icon (a bank name, a
customer); tiles are right when the list is short and every option already
has an obvious symbol.

Shape of it:

- **`role="radiogroup"` / `role="radio"` / `aria-checked`**, with a hidden
  `<input type="hidden" name="…">` carrying the actual form value — the tiles
  are buttons, not a native input, so the value has to be smuggled in
  separately for the `<form action>` to see it.
- **`@container` on the wrapper, not a viewport breakpoint** — `grid-cols-3
@[26rem]:grid-cols-5`. This picker lives inside a `Dialog`, whose width has
  nothing to do with the window; three columns on a phone's full-screen sheet,
  five once the dialog itself has room. Same reasoning as "Responsive: measure
  the container" above.
- **Active tile: `border-brand-600 bg-brand-50`, icon and label in
  brand-700/900. Inactive: `border-ink-300 bg-white hover:bg-ink-50`** — the
  same selected/unselected contrast used everywhere else a choice needs to
  read as chosen at a glance.
- **The icon set lives in `Icon.js` beside the app's other icons, not as a
  one-off inline SVG** — `vehicle`, `machinery`, `property`, `electronics`,
  `other` were added there so any future picker or badge can reuse them.
- **The category list itself (`{value, label, icon}`) is a plain data module**
  (`app/_lib/asset-categories.js`), not an export of the `'use client'` form
  file — see that file's own comment. Any list a client-side picker and a
  server-rendered page both need to read has to live outside the client
  boundary, the same reason `guide-content.js` is separate from `GuideFlow.js`.

## Moving money by hand: say which way, then show the result

Anywhere the owner moves a balance by hand — the manual adjustment, a new
customer's opening balance — two things are required, and the second matters
more than the first.

**Name the direction in yard language, not bookkeeping.** The original control
was a dropdown reading "Increases what they owe" / "Reduces what they owe", and
the owner could not tell them apart: two long phrases differing by one word in
the middle. Debit and credit would have been worse. `BalanceDirection`
(`app/_components/admin/BalanceDirection.js`) is the shared control, so the
same two ideas are never described in two vocabularies:

    owes       they owe the pump MORE   (a debit)
    in_credit  they owe the pump LESS   (a credit)

Each card carries a second line saying _when_ to use it, because the situation
is easier to recognise than the arithmetic.

**Then show the balance the choice would produce.** This is the part that
actually prevents the mistake:

    Rs -4,999 → Rs -9,998
    The pump would owe them Rs 9,998 after this.

Picking the wrong direction does not fail — it silently moves a real balance
the wrong way, and no constraint can catch it because both directions are
legal. A label can be misread; a figure going from 4,999 to 9,998 when you
meant to clear an account cannot. **Any control where both choices are valid
and only the operator knows which is right should show its consequence before
it is committed.**

## A gap the database allows on purpose still wants a checkbox

Some actions are legal every time and wrong just often enough to need a second
look — entering a day's readings when the day before it was never opened is
the example this pattern was built for. Migration 027 deliberately allows it,
because backfilling a genuine gap later looks identical on the wire to
skipping a day by mistake, and the database cannot tell those two apart. The
UI is the only place that can, because it's the only place that knows whether
a human actually meant to.

`ReadingForm`'s `EntryForm` is the shape of it: `hasDateGap` compares the
nozzle's last reading (`previous_date`, which `get_reading_sheet` already
returns) against the calendar day right before the one being entered. When
they differ, the form does two things, not one:

- **Says what is true**, in a red box: which day (or range of days) has no
  reading, and what saving now will do to it — "will jump straight over it,"
  not a vaguer "may cause a discrepancy."
- **Gates the Save button on a checkbox inside that same box** — "Yes, 09 Aug
  2026 was missed on purpose — save this day anyway" — rather than only
  colouring the button or adding more red text next to it. `canSubmit` stays
  `false` until it is ticked, same mechanism as the other disqualifying
  conditions on that form (a negative litre count, credit exceeding the sale).

**Why a checkbox and not a second dialog.** `ConfirmAction` is for a
destructive action reached by its own trigger — the dialog IS the confirmation
and nothing else is happening on the page underneath it. Here the confirmation
has to appear _inside_ a dialog that is already open and already mid-form, so
a second stacked dialog would be confirming a click already several steps into
a task, over content that would have to move out of the way for it. A checkbox
that must be ticked before the button will do anything asks the same question
with no extra layer: it cannot be dismissed with a stray Enter or a reflexive
tap the way a paragraph of warning text can be scrolled past.

**Why this and not a hard block.** A hard block would refuse the very case
027 exists to allow — the honest repair of entering a late day once the gap is
found. The checkbox is the fork between the two: it costs one tap when the
skip is deliberate, and it stops the tap that was never a decision at all,
which is what happened here.

## "Remove" means delete-or-retire, and the database decides

Two screens take something off a list — a lubricant, and a customer — and both
work the same way, so a third should copy it rather than invent a variant.

The button says **Remove**, never "Delete", because only one of the two
outcomes is actually a delete:

- **Never traded** — a typo, or an account opened and never used. Nothing to
  preserve, so the row goes.
- **Has history** — deleting would tear a hole in months already reported and
  exported. The row is _retired_: `is_active = false`, out of the working list
  and out of every dropdown, with its history left intact.

The caller cannot tell which applies from the row in front of them, so the RPC
decides and **returns which one happened** (`{ name, removed: true|false }`)
and the confirmation says so afterwards. A button that promised "Delete" would
be lying half the time.

Two things this pattern always needs:

- **A way back.** A retired row must stay findable and restorable, or "removed"
  is indistinguishable from "lost" — a _Removed_ section under the main table
  with a **Bring back** button. `LubricantManager` and the Customers page are
  the two examples.
- **A third state, when retiring is not enough.** A name added by mistake that
  picked up entries is retired for ever and sits in the Removed list looking
  like a real customer who left. `PurgeCustomerButton` is the way out: offered
  **only from the Removed list**, so getting there is two deliberate decisions,
  and confirmed by **typing the name** rather than pressing Yes. Everything
  else destructive in this app is recoverable — a retired row comes back, a
  deleted sale posts a reversal — so the one action that is not asks for
  something a mis-aimed click cannot produce. The typed name is checked in the
  database as well as the browser; the browser copy only keeps the button
  disabled so the refusal is rare rather than routine.
- **A guard on anything retiring would hide.** A retired customer drops out of
  `get_customer_balances`, which is what the Customers page totals "still
  outstanding" from — so removing someone who owes Rs 50,000 would quietly drop
  Rs 50,000 from what the pump believes it is owed. Removal is therefore
  refused while the balance is non-zero, **in both directions**: money the
  customer owes, and money the pump owes them. Before adding this pattern to a
  third screen, ask what disappears from a total when the row leaves the list.

## A name in a list gets its initials, not a photo and not an icon

The Customers table puts a small coloured circle carrying **two letters** in
front of every row, on both the active and the Removed tables.
`app/_lib/customer-avatar.js` exports `customerInitials(name)`,
`customerAvatarColor(seed)` and `customerAvatar(customer)` — the colour is a
small hash of the customer's id against a fixed palette, **not
`Math.random()`**.

**This has been a single letter, then a person/vehicle icon, then two
letters,** and the round trip is the useful part. The icon version was asked
for and lost something visible immediately: forty identical circles tell you
nothing about which row you are on. **Initials are the strongest cue available
in a list because they differ per row**, which neither a colour nor an icon
manages. Two letters separate "Ahmad Ali" from "Ahmad Iqbal" where one does
not.

**The letters come from the FIRST TWO WORDS**, and words starting with a digit
are skipped. This started as first-word-and-last-word — sound reasoning for a
trading name, never checked against this pump's list, where names carry a
ledger number on the end. "Abdul Ghaffar 13 Solang 561" came out as **A5**, and
a column of A5/A4/A7/A6 reads as codes you are meant to recognise. **When a
helper derives something from user data, test it on the user's data** — the
fixtures it was built against were "John Doe" and "Bilal Sons Goods Carrier",
and both worked perfectly.

**Six tints, and none is a fuel's.** The reference the owner supplied used
lavender, pink, blue, peach and mint; blue and peach are the two this app
cannot spend. Violet, fuchsia, teal, rose, green and slate give the same soft
look with nothing borrowed from petrol or diesel. A name that changed
colour on every reload would read as a bug, and a stable colour is one more
thing that helps the owner recognise a regular in a long list, the same way
`customerEmoji` (an earlier version of this, replaced once initials were
asked for instead) was stable by design rather than genuinely random.

Retired customers get the same shape in muted grey (`bg-ink-100` /
`text-ink-500`) rather than the coloured palette, matching that table's
already-muted link colour — the avatar should not make a removed row look
more prominent than the active ones above it.

If a third list of named things wants this treatment, reuse
`customer-avatar.js` rather than inventing a second hash — the point of
picking one deterministic scheme is that it only needs auditing once.

## Icons

- `<Icon name>` (`app/_components/ui/Icon.js`) — the whole set, on a 24px
  grid, in `currentColor`. **Backed by Material UI** (`@mui/icons-material`,
  the Outlined variant throughout) at the owner's explicit request — this
  used to be a hand-drawn SVG per name and deliberately avoided any icon
  package; that reasoning is recorded in `docs/CHANGELOG.md` rather than
  here, since it no longer describes the current code. `Icon.js` is still
  the single place that decides what a name means: every call site writes
  `<Icon name="tank" className="h-5 w-5" />` exactly as before, so adding or
  changing an icon means editing this one file's `COMPONENTS` map, not every
  caller.
- **Sizing goes through a wrapper, not MUI's own sizing.** `Icon` renders a
  `<span>` sized by the `className` (e.g. `h-5 w-5`) with the MUI icon
  stretched to fill it via an inline style. MUI's `SvgIcon` sizes itself in
  `em` through its own Emotion-generated class, which can land after
  Tailwind's utilities in the stylesheet and win the cascade — so the
  className alone was not reliably sizing the icon. An inline style on the
  icon always wins, so the span is what actually carries the size.
- **An icon never carries meaning alone.** Every icon in the app sits beside
  its own word — nav tabs, the Entered/Enter status, the Check warning — and
  is `aria-hidden`. The icon is the redundant second cue: shape, on top of
  the word and the colour. Status told apart by colour alone fails in dim
  light and for a red-green colourblind reader, which is exactly what
  "Enter" in amber next to "Entered" in green was doing.
- **Do not icon everything.** The fuel badges stay plain: Petrol, Diesel and
  Lubricant already differ in both word and colour, and a droplet on all
  three would add shape without adding distinction. Stat tiles across the
  app now carry an icon ring (see `<StatGrid>`/`<StatTile>` above) because
  the owner asked for that look specifically — it is a deliberate exception
  made once, not a licence to add an icon to every future control.
- **A stat tile is: small icon + label, then the figure, then the
  comparison — with a sparkline at the figure's right if a series exists.**
  The anatomy comes from the Ramtabs dashboard the owner supplied as a
  reference. The icon is a 16px glyph sharing the label's line, not a filled
  ring; the colour it carries says which of four things the tile is about, not
  whether the news is good.
- **`ACCENT_COLORS` is the meaning; `tone` is the direction; they are
  different axes.** `AdminStats.js` maps each icon name to a hue — green for
  money arriving, amber for money owed or gone, red for something to look at,
  **teal for things the pump holds** (fuel in a tank, oil on a shelf, kit in
  the yard), **violet for the record-keeping** (what was read, what was
  banked, which day), slate for anything unlisted. Five hues, and every one of
  them is outside the fuel triad — teal and violet are there precisely because
  the obvious colours for "fuel" and "stock" are blue and orange, which belong
  to petrol and diesel and to nothing else. `tone` separately colours the figure and its
  pill, so a bad month is a red number under a green "profit" glyph: the glyph
  says "this tile is profit", the number says "and it is negative". Colouring
  both by `tone` would say the same thing twice and leave a row of tiles
  looking alike. Anything unlisted falls back to slate, so a new icon is never
  accidentally loud. (The map once had blue for fuel and violet for oil; those
  were the fuels' own colours and went in the palette audit.)
- **A sparkline may only be green, red or slate — never amber.** `SPARK_COLORS`
  is deliberately a different map from `ACCENT_COLORS` for one reason, and it
  is the most reusable thing on this page: **the test is AREA, not size.** A
  16px outline glyph in amber is a stroke, and the words "On credit" sit next
  to it. A 72×34px sparkline in the same amber is more of the hue than the
  44px filled circle that was already rejected — rendered directly above a
  diesel-accented card, the two read as one colour language. Amber is the
  single chrome colour a fuel owns (diesel), so anything with real area uses
  slate and keeps its amber on the glyph. A tile with `tone` set overrides
  this: direction wins over category, or a green line would sit under a red
  number saying the opposite thing.
- **Check a chrome colour against `fuel-colors.js` by hue before you saturate
  it**, not by eye. `amber-600` is `#d97706` at hue 33°; diesel's swatch is
  `#FB923C` at 27° and its accent rule `#C2410C` at 17°. Six degrees apart
  looks like a different colour in a swatch and the same colour on a page.
  This was found twice in one sitting — once as a filled ring, once as a
  sparkline — because the second one felt too small to matter and was not.
- **A sparkline carries no `width`/`height` attribute — the caller sizes it
  with a class.** An SVG with `width={72}` is 72px wide whatever the box round
  it says, so in a flex row beside a figure that cannot shrink it pushed out
  through the card's right edge on narrow tiles. Sized by class
  (`max-w-[72px] flex-1 min-w-0` on the wrapper, `w-full` on the svg) it
  shrinks with its container; `preserveAspectRatio="none"` lets it squash
  rather than crop, and `vectorEffect="non-scaling-stroke"` keeps the line 2px
  while it does.
- **Test containment against the card's PADDING box, not `scrollWidth`.** A
  figure or a chart can sit entirely inside its own box while hanging out of
  the card, so a `scrollWidth > clientWidth` check reports clean and the page
  still looks broken. Walk every width and compare each child's rect against
  its card's padding box — that is what caught both the sparkline leak and
  `Rs 14,386,211` escaping at 440px. The latter is why two columns now wait
  until `@[32rem]` instead of `@[24rem]`: at a 392px grid each tile was 188px
  and an eight-figure month needs about 200px.
- **The sparkline is the part that yields when space runs out.** It is hidden
  below `@[68rem]` and the tile is then exactly what it was, a label over a
  number. Ramtabs draws its mini-chart beside `$1,842,400` in a wide tile;
  ours would sit beside `Rs 1,204,950` in one about 265px wide, and the figure
  cannot shrink (`whitespace-nowrap` on money is not negotiable — a figure
  breaking after the "Rs" reads for a moment as two figures). **Decoration
  must never be the reason a figure cannot be read.**
- **A sparkline's hover readout is `fixed` and anchored to the pointer.** Not
  positioned in the card: the line sits hard against the card's right padding,
  and a tooltip placed in flow there can widen the card, push a figure, or
  scroll the page sideways. A fixed overlay is outside the layout and can do
  none of those. Flip it to the pointer's left near the viewport edge.
- **Anything a client chart displays is formatted on the SERVER and passed as
  strings.** A formatter cannot cross the server/client boundary, and the
  alternative — shipping raw numbers and re-implementing PKR or litre
  formatting inside the chart — is how a tooltip and a table start disagreeing
  about how a figure is written. The caller knows whether its series is money
  or litres; it formats, the chart displays.
- **A sparkline is hand-drawn SVG, not a chart library.** `Sparkline.js` is a
  path plus about forty lines of pointer maths. It became a `'use client'`
  component when the hover readout was added, having been written server-only
  with a comment saying so — and what that comment was defending was never
  "zero JavaScript", it was **"do not put a charting library in a stat tile"**,
  which still holds. The markup is still server-rendered on first paint, so
  there is no layout shift; the hover state is all the client adds. Four Recharts instances in a stat row would
  each ship a client bundle and measure-then-paint, so the row the owner looks
  at first would land empty and pop in a beat later. It is also `aria-hidden`
  and carries no scale: it says "rising", "falling", "steady", and the figure
  it belongs to is beside it at 24px. **Never let a sparkline be the only
  place a quantity appears.**
- **Four columns and the 24px figure have separate, measured thresholds.**
  `@[54rem]` for `grid-cols-4` and `@[62rem]` for `text-2xl`, both against the
  *grid*, not the window. They used to be one number (`@[50rem]`) and it was
  too low for both: four columns arrived while each tile was still ~204px, so
  the money figure overflowed its card at nearly every width from 860px up,
  and the page itself scrolled sideways between 860 and 900. Swept in 20px
  steps from 340px to 1600px before and after — the point is that a *single*
  breakpoint cannot serve a column count and a font size that need different
  amounts of room. Re-sweep if either changes.
- **`StatTile`'s `iconNode` prop is a narrower escape hatch than `icon`**,
  for a rendered node that isn't in `Icon.js`'s own set at all (a category
  badge's existing markup, say). Reach for `icon` — a name into the shared
  set — first; `iconNode` exists so one tile can differ without every other
  call site needing to know about it.
- **`app/layout.js` wraps the whole app in MUI's `AppRouterCacheProvider`
  (`@mui/material-nextjs/v16-appRouter`), and this is not optional.**
  Without it, every MUI icon threw a hydration mismatch: MUI's styling
  engine (Emotion) injects a `<style data-emotion>` tag next to each icon,
  and without server-side coordination that injection happens on the
  client only, so the server-rendered tree (icon, no style tag yet) and the
  client's first render (style tag present) disagree before React can
  reconcile them. `AppRouterCacheProvider` collects Emotion's styles during
  the server render and streams them down inline, so the client's first
  paint already has them — the same problem `next/font` and Tailwind's own
  build-time CSS never have, because neither injects `<style>` tags at
  request time. If a future MUI component (not just an icon) starts
  throwing the same hydration error, check this provider is still wrapping
  it before looking anywhere else.

## Page structure

- `<PageHeader title description>{children}</PageHeader>`
  (`app/_components/ui/PageHeader.js`) — title + description on the left,
  and anything passed as `children` (typically a dialog-form's trigger
  button, sometimes more than one) right-aligned beside it, wrapping on
  narrow screens. This is where "Add account", "Record a delivery",
  "Nozzle settings" etc. live — not inline in the page body.
- `<h2 className="section-heading">` for the heading that names a block on a
  page. The spacing is in the class deliberately: written out by hand it had
  drifted, and of nineteen headings nine had a top margin and ten did not, so
  "Previous checks" sat flush against the card above it while the same
  heading elsewhere had room. `first:mt-0` covers both cases — a heading that
  opens a column or section is its container's first child and wants no gap;
  one that follows content is not, and gets the full one.
- `<EmptyState title description>{children}</EmptyState>`
  (`app/_components/ui/EmptyState.js`) — centered card for "nothing here
  yet", used instead of rendering an empty table.
- **A month-scoped page filters from `<PageHeader>`'s children**: a plain
  `method="GET"` form with `<input type="month" name="month">` and a "Show"
  button, posting back to the page's own path, with the page validating
  `/^\d{4}-\d{2}$/` and falling back to the current month. Used by Reports
  and Expenses. No Client Component and no Server Action needed — it is a
  query string, so the browser can submit it and a shared link keeps the
  month. Everything the page shows should follow it, including any table:
  a card scoped to the chosen month above a table showing all time reads as
  a contradiction, which is what the expenses block on Reports used to do.
- `<DateNav>` (`app/_components/admin/DateNav.js`) — previous/next arrows, a
  date box and "Back to today", used by Readings, Dashboard and Stock. Anything
  passed as `children` joins the end of its button row, so a page action for
  the day on screen shares that row's baseline. The box itself is
  `DateJump.js`, a Client Component: **picking a date navigates immediately**,
  there is no Go button, and clicking anywhere on the box opens the calendar
  (`showPicker()`) rather than only its icon. It ignores incomplete dates
  because a native date box fires `change` while the year is still being typed.
- **When the day's controls outgrow the header, give them their own row.**
  `<DateNav>` normally rides in `<PageHeader>`'s children, which is right for
  a date row plus at most one action. Lubricants carries two actions on top
  of the arrows and the date box, and `<DateNav>`'s "Back to today" appears
  only when the date is _not_ today — enough extra width to tip the whole
  group over `PageHeader`'s wrap threshold, so the header jumped between one
  row and two as you stepped from today to yesterday and back. The fix is a
  `flex flex-wrap items-start justify-between` row of its own beneath the
  header, date controls left and actions right: it cannot wrap against the
  title, so nothing moves as the date changes. Reach for this only when a
  page really has that much in the row; a single trigger button still belongs
  in `PageHeader`.
- **A badge and the name it labels go on one line.** In the Purchases table
  the lubricant's name first sat under its badge, which made every lubricant
  row taller than the fuel rows either side of it and left the brand reading
  as a footnote to its own purchase. `flex items-center gap-2` with a
  `min-w-[13rem]` on the cell keeps the common name beside its badge on one
  line at 1024px while still letting a genuinely long one wrap rather than
  forcing a horizontal scrollbar.
- `<PendingLink>` (`app/_components/ui/PendingLink.js`) — use instead of
  `next/link`'s `<Link>` for any admin navigation. Every admin page fetches
  server-side, so a plain link leaves the screen looking frozen for a
  second with no feedback; this swaps in a spinner while the navigation is
  pending.

## Verification discipline

- A disposable `app/devcheck/page.js` route, rendering the real component
  with realistic fixture data (not placeholder text), is the standard way
  to screenshot a layout/component change with Playwright when scripting a
  real login is more overhead than the check needs. **It must never be
  committed** — `rm -rf app/devcheck` and confirm with `git status --short`
  before every commit.
- Screenshot at more than one viewport when a change touches layout —
  narrow-laptop widths (1024–1152px) and phone width (~400px) are where
  this app's layout bugs have actually shown up, not just the widest or
  most common width.
- A DOM boolean (`scrollWidth > clientWidth`, `hasScroll`) is a hint, not a
  verdict — a fix can make that boolean false while a screenshot shows text
  now wrapping somewhere it never used to. Always look at the rendered
  result with real-length data before calling a layout fix done.

## `BalanceDirection` is the general two-choice-in-a-sentence control

It was written for the customer ledger and is named for it, but nothing in it
knows about money: it takes `options` of `{value, title, detail}` and renders
two cards with a hidden input carrying the value. Migration 039's dip timing
(**Morning — before the pumps opened** / **Evening — after the pumps closed**,
in `StockCheckForm`) is its second caller, and reusing it was the right call
over forty lines of near-identical markup.

Reach for it whenever a choice is **two options, both legal, told apart by
reading a sentence, and neither one owns a colour of its own** — and follow
the rule the section above states: _show the consequence_. The dip card names
the day the choice closes ("at the close of 10 Aug 2026") and the book figure
that produces, then the gain or loss once a reading is typed. That is what
makes the choice checkable rather than merely labelled, and it is the whole
reason this control exists.

Use `CategoryPicker`'s icon tiles instead when the options are _kinds of
thing_ recognised on sight. Use a `<select>` when the list is long.

## Two buttons, not a toggle: when a choice picks which form opens

`ExpenseForm`'s **Paid out / Recovered** choice (migration 053) went through
`BalanceDirection`, then a hand-rolled toggle styled like Treasury's Cash in /
Cash out, before landing somewhere neither of those sections actually covers:
**two buttons and two dialogs, not one control inside one form.** `kind`
("paid" or "recovered") is now a prop fixed for the lifetime of one
`ExpenseForm` instance, and the page renders two instances — `Add expense` and
`Add recovery` — each its own button, its own `<Dialog>`, its own small form.
Nothing inside either dialog can be typed against the wrong choice, because
there is no choice inside it to get wrong; the choice was which button got
pressed, and by the time the form is open that is settled.

This is not "avoid `BalanceDirection`, use two buttons instead" as a general
substitute — the two are answers to different questions. `BalanceDirection`
and a hand-rolled toggle both answer *"which of two values does this ONE row
get"* and belong INSIDE a form the row is being built in. Paid out/Recovered
turned out to answer a different question — *"which of two forms should even
be open"* — and a value picked before the form exists is not a form control at
all; it is routing, the same way `Add account` and a delete button are two
different buttons rather than one button with a mode, never a toggle that
decides what a single button does. `moneyOut` / brand-`primary` for Paid out
and `moneyIn` / `secondary` for Recovered, per "one primary per view" — Paid
out is the common case.

Ask this before reaching for `BalanceDirection`, `CategoryPicker`'s tiles, or a
`<select>`: is the choice something that changes what gets filled into ONE row
(reach for one of those three), or does picking it decide which of several
SEPARATE, differently-shaped things is being recorded at all (reach for two
buttons and two forms instead, one per kind). A meter reading's cash/credit
split is the first kind. Which of two unrelated pieces of paper — a bill paid,
or a repayment against one — is being written down is the second.

## A signed money row needs colour and an icon, not a minus sign

`formatPKR` never hides a sign — `formatPKR(-5000)` prints **"Rs -5,000"** —
and a bare minus in front of a rupee figure reads as a typo before it reads as
a direction, on a screen scanned quickly for whether a number is right.
Treasury settled this first, for its Cash in / Cash out columns: never print
the signed figure, print the **magnitude**, and carry the direction in colour
(brand green for money arriving, amber for money leaving) plus the `moneyIn` /
`moneyOut` icon beside it — because colour alone is not a safe carrier of
meaning either (§ colour is never the only cue).

`ExpenseForm`'s recovery rows (migration 053) are the second case this shows up
in: a reimbursement is stored as a negative `expenses.amount` so every RPC that
already sums the column nets it out for free, but the table has to show that
row as money **coming back**, not as a mistyped expense. Same treatment —
`formatPKR(Math.abs(amount))` in brand green beside a `moneyIn` icon, never the
raw signed number.

**The rule generalises:** wherever a column can hold a value whose sign is the
whole story (a ledger movement, a safe entry, an expense that might be a
recovery), branch on the sign and show magnitude + colour + icon. Reserve a
literal negative number for places a minus is read as arithmetic, not as an
event — nowhere in this app, so far.

## A figure and its unit must not be able to break apart

The dip card originally put the day inside the label — "Books at the close of
10 Aug 2026" — beside the figure on one row. At a phone's width the label
wrapped to two lines, squeezed the figure, and left **`L` alone on its own
line** under `2,392.88`. The DOM was fine; `scrollWidth` matched `clientWidth`;
it only showed up in the screenshot. (See the note at the top of this file, and
the Purchases-table entries — this is the third time.)

Two things fix it, and both are worth copying:

- **`whitespace-nowrap` on any figure rendered as "number + unit"** — the pair
  is one token to a reader and must be one to the layout.
- **A qualifying date goes on its own line, not into the label.** The label
  stays short and fixed ("Expected in tank"); "at the close of 10 Aug 2026"
  sits underneath. A date grows when the month name is longer, and a label
  sharing a row with a number is the wrong place for anything that grows.

## Two entry cards side by side: colour the whole card, name the thing twice

The Stock page puts the petrol and diesel dip boxes next to each other, and the
figures typed into them are four-digit numbers that look alike. Nothing
downstream can catch petrol's reading going into diesel's box — both are legal,
and a dip is the baseline every later day is measured from, so the mistake
propagates forward until somebody notices a tank behaving impossibly.

Until this change the two cards were identical but for a small badge and a
name in `text-sm`. Now:

- **The card wears its fuel's colour**, from `app/_lib/fuel-colors.js` — the
  same colours `FuelBadge` uses everywhere else, so it reinforces an association
  the app has already taught rather than inventing a private one.
- **ONE DARK, ONE LIGHT. Never two of the same weight.** This is the rule, and
  it was learned by getting it wrong. Both bands were first made dark —
  `sky-800` against `amber-800` — reasoning that a pair matched in luminance
  would read as two tanks of equal standing, where a dark card beside a pale one
  silently ranks them. The owner's verdict, immediately: _"they both look the
  same, both are dark."_

  He was right and the reasoning was backwards. **Lightness is the cue the eye
  reads first**, and the one that survives poor light, a cheap screen and any
  colour-vision deficiency. Hue is the weaker, more fragile signal. Matching the
  luminance of two things whose entire job is to be told apart throws away the
  strongest difference available to buy a symmetry nobody asked for. sky-800 vs
  amber-800 is a **1.1× lightness gap** — which is to say none. Navy vs bright
  yellow is **6.5×**.

- **Then check each band carries its own text.** `ink-900` on the petrol gold is
  13.0:1; white on the diesel bronze is 7.1:1. Both clear AAA, the floor worth
  holding for a screen read in a forecourt office. (Watch the middle of the
  amber ramp: white on `amber-600` is 3.2:1 and fails AA outright.)

- **Take the hue the owner asks for, then make the lightness work.** He picked
  `#FFD865` for petrol and `#FFBF00` for diesel — both his forecourt's yellows,
  and 1.22× apart, which is no gap at all. Refusing his colours would have been
  wrong; shipping two of the same weight would also have been wrong. Diesel kept
  his hue (45°) and dropped to `#705400`. That is 7.3× and nobody had to give
  anything up.
- **The colour is on the header and border only.** The body stays white. This is
  read on a cheap tablet in poor light and the figures need full contrast; a
  card washed in colour throughout costs exactly the legibility the colour was
  bought to protect.
- **Drop a badge the band has made redundant.** `FuelBadge` used to sit in this
  header and was removed: on a band that is already the fuel's colour, beside a
  name that already reads "Petrol Tank", it said a third time what had been said
  twice — and no single chip shade contrasts with both a navy and a yellow band.
- **Colour is never the only cue** (the standing rule, and it applies hardest
  here): the tank name is `text-base font-bold` in the fuel's darkest shade, the
  badge is beside it, and **the input's own label names the tank** — "**Petrol
  Tank** dip reading in litres". Anyone who cannot separate sky from amber still
  gets told twice which box they are in.

Reach for this whenever two or more entry surfaces sit side by side, accept the
same shape of value, and cannot validate each other.

**"The colour is on the header and border only" is a rule about protecting
typed figures, not about fuel cards specifically — read-only ones can go
further.** Settings' two current-rate cards (`solid` filled edge to edge, no
white body left at all) look like they break this rule and do not: the figures
on them are read, never typed, so there is no data-entry contrast to protect,
and `solid`'s petrol/diesel pairs are already the ones measured for exactly
this job — white-on-`#075985` at 7.6:1, `ink-900`-on-`#FDBA74` at 10.6:1 — as
the fill's OWN text, not something laid over it that could lose contrast to
the background. The dip boxes stay header-band-only because a NumberInput
sits in the white part of that card and needs full, uncoloured contrast around
it. Ask which card you have: something being typed into (band only, protect
the white body) or something only ever read (`solid` can own the whole card,
and on the one figure a tired attendant checks before every reading, it
should).

**When a colour fills the WHOLE card, put the colour and the rounding on the
SAME element - never clip a filled child into a rounded parent.** The
Settings rate cards' first version was `card unit-card overflow-hidden`
outside, `fuel-band ... solid` filling it as a child; at every rounded
corner, a hairline of the parent's white showed through - invisible in the
DOM (nothing was overflowing, so `scrollWidth`/`clientWidth` had nothing to
report), only visible in a screenshot. The Readings unit header uses the
identical parent/child shape and never shows this, because its coloured band
is only a strip at the top of an otherwise white card - a seam has nowhere to
appear when the rest of the card is already the background colour. The
moment a fill reaches all four corners, though, the parent's clip-path and
the child's own rectangular edge have to agree at the pixel level, and they
do not always. Fix: one element carries the rounding AND the fill
(`card fuel-band ... ${color.solid}` together, no `overflow-hidden`, nothing
left to clip). Reserve the parent-clips-child shape for a partial fill only.

## A date-driven page does not remount: reset form state yourself

`<DateNav>` changes the day with a client-side navigation. The page re-renders
with new props, but a form component in the same tree position **keeps all of
its `useState`** — it is the same component instance.

`StockCheckForm` learned this the hard way. Stepping from one day to the next
carried both the typed dip reading _and_ the green "Saved…" line across with
it, so the next morning's card opened with **yesterday's reading already in the
box**, one tap from being saved again as today's measurement, under a message
describing a different day.

Two rules, and they are cheap:

- **Success goes to `<Toast>`, never inline.** `Toast`'s own comment has said
  this since it was written — _"a success message left sitting in a form is
  still there when the next entry is being typed"_. Failures stay inline in
  `<FormMessage>`, because an error has to survive long enough to act on. Guard
  the inline one with `state?.ok === false` rather than rendering both.
- **Clear the controlled state on success AND on date change.** `form.reset()`
  alone does nothing to a controlled input — the `useState` behind it has to be
  set back too. The date-change effect is the belt to the save-effect's braces:
  if a save is ever missed, the box still empties when the day does.

## A figure that is a moment in time should say which moment

The dashboard's tank card showed a bare litre figure under a list of that day's
sales, and the owner had to ask whether it was the level _before_ or _after_
those sales. It is after — `get_daily_summary` returns the books at the close of
the day on screen — but nothing on the card said so.

It now carries the same line the Stock page card already used: **"at the close of
07 Aug 2026"**, directly under the figure. Cheap, and it removes a question that
had to be asked out loud once already.

The general rule: a number that means _"as at some moment"_ and sits on a page
that can be scrolled through time must name its moment. Every other card on a
dated page describes the day in the banner; a figure that describes the day's
_end_ looks identical to one describing its start.

## Fuel colours live in one file

`app/_lib/fuel-colors.js` is the single definition of what petrol, diesel and
lubricant look like. Everything reads from it: `FuelBadge`, the Dashboard's
by-fuel and tank cards, the tank progress bars, `SalesTrendChart`, and the Stock
page's dip cards.

Before it existed the colours were retyped in six files and **had already
drifted** — the charts used `#0284c7`/`#ca8a04` while the badges used the
sky/amber 100s, so the same fuel was one colour in a chart and a different one
in the table underneath it. A shared token is not tidiness here; it is the only
way the pump's two fuels stay recognisable across nine screens.

Each entry carries what the surfaces actually need:

| key                    | for                                              |
| ---------------------- | ------------------------------------------------ |
| `solid` / `solidMuted` | a filled band or chip, and quieter text on it    |
| `border`               | the card outline that goes round a solid band    |
| `onWhite`              | the fuel's colour as text on a white background  |
| `accent`               | a 4px top rule — the quiet treatment             |
| `hex`                  | charts and progress bars, which need a raw value |

`fuelColor(type)` falls back to a neutral rather than to one of the fuels, so an
unrecognised value never silently paints itself petrol.

**Two weights, and the loud one is rationed.** `solid` fills a header band;
`accent` is a 4px rule on an otherwise plain card. The filled band is reserved
for surfaces where **typing into the wrong one costs something** — the Stock
page's dip boxes, where a petrol reading in the diesel card corrupts the
baseline every later day is measured from. Where the fuels are only being
_read_, the accent separates them just as reliably and leaves the page calm.
The first version banded everything, and six saturated blocks down one dashboard
is colour-blocking rather than design: loud everywhere is the same as loud
nowhere.

**The dark/light rule travels with them.** Petrol is a light gold carrying
near-black text; diesel a dark bronze carrying white. Lubricant is navy — the
only cool colour of the three, because the two fuels are now a warm pair, and
blue against amber is the one axis that survives red-green colour blindness
intact. Any new surface keeps that relationship — if a change would leave both light or both dark, it is wrong, for
the reason recorded in the section above and at length in the module's own
comment. Solid chips replaced the old pale tints for exactly this: two faint
pastels are the same chip to anyone glancing down a column of nozzles.

## A card that wears a colour owns the controls inside it

The Stock page's dip cards carry the tank's colour on their header band. The
morning/evening selector inside used `BalanceDirection`'s default green for its
chosen option, and the result read as a third, unrelated hue dropped into the
middle of a yellow card — _"it looks like random colours."_

`BalanceDirection` now takes an optional `activeClass`; the ledger callers keep
the green (there, "selected" has no other colour to belong to), and the dip
cards pass the fuel's `selected` token. Same for the tank fill bar, which was
still a hardcoded `bg-sky-500` / `bg-amber-500` pair left over from before the
colours were centralised.

**The rule: once a container wears a colour, everything decorative inside it
takes that colour or stays neutral.** Two exceptions, both because they outrank
identity — a red over-capacity bar is a warning, and the green primary button is
the same submit button on every form in the app, so making it per-tank would
break a stronger consistency than the one it fixed.

## A dark strip across the top was tried and removed

The four takings tiles were briefly a solid slate band with white figures, to
make the day's money lead a page whose fuel cards had just been given colour.
It was reverted: a black bar across the top of an otherwise light page reads as
a toolbar or an error state, not as a headline.

The hierarchy problem it was solving is real but is better solved by section
order and figure size. Recorded so it is not tried a third time.

## A heading must not be typeset like a caption

`.section-heading` and `.figure-label` were nearly the same style - both small,
uppercase, tracked, ink-600 - so "Lubricants" over a row of tiles was set like
the "SOLD" caption inside one of them. The owner reported the result exactly:
the sections on Reports "are not so prominent".

- **`.section-heading` is now `text-lg font-bold text-ink-900`, and not
  uppercase.** Dropping the uppercase does most of the work, because it was the
  feature the two classes most visibly shared. Lower case at 18px also reads
  faster in poor light than capitals at 14px.
- **`.figure-label` keeps the small uppercase treatment.** It is a caption, and
  captions should look like captions - the fix was to stop the heading looking
  like one, not to restyle both.
- **Two bars now exist, and which to use is decided by the surface.** A FILL
  gauge inside a coloured band (tank levels, unit progress) is hand-rolled, so
  it can carry its own track and fill colours against that band. A
  share-of-total bar in a plain list is MUI's `LinearProgress`, which is what
  that component is for - see `CategoryBreakdown`.

## A page with several `.section-heading`s in a row needs a second, bigger tier

The Dashboard grew to five `.section-heading`s stacked in a column - By fuel
type, Total sold this month, Tank stock, Lubricants, Last N days - each the
same size as the others, which reads as five unrelated topics even where
three of them are facts about the same thing (fuel). The complaint was blunt
and worth keeping verbatim: "too much numbers on one page, not separated into
subsection." Related `.section-heading`s do not automatically read as
related just because they are near each other; nothing about the previous
section says the next one belongs with it rather than after it.

**The fix is a size UP, not a size down.** A zone heading (`text-xl font-bold
text-ink-900`, one step above `.section-heading`'s `text-lg`) introduces a
group - "Fuel" - and the `.section-heading`-shaped labels that used to stand
alone become smaller subsection labels underneath it (`text-base font-bold
text-ink-800` - still bold, still near-black, still NOT the small uppercase
`.figure-label` treatment the section above this one exists to warn against).
Getting this backwards - shrinking the group heading toward caption size to
"de-emphasize" it - is the exact mistake `.section-heading` was already fixed
once for; two headings can differ in importance without either of them
looking like a caption.

**A zone break also gets a visible pause, not just a size change**: extra top
margin plus a hairline `border-t border-ink-200`, so a reader scanning down
the page feels a stop between topics rather than noticing a font-size change.
The first zone on a page (right after the headline stat row, which is its own
visually distinct block already) skips the divider - nothing needs separating
from a StatGrid - the same way `.section-heading`'s own `first:mt-0` treats
the first heading on a page as a special case.

**A secondary figure inside a zone is not automatically small text.** The
Dashboard's month-to-date total was first built as a slim strip at `text-sm`
throughout (14px, under this app's own 16px body floor for an older reader on
a tablet - see the small-business-ledger-app skill, §0) reasoning that "less
prominent" meant "smaller." It does not: "slim" is about how much WIDTH a
block takes (one line instead of a card grid), not the size of the type
inside it. Fixed to `text-base` labels and `text-lg font-bold` figures, with
the same `.card` shadow every other block on the page carries - a secondary
fact can occupy less space than a primary one without being harder to read
than one.

Reach for this two-tier heading whenever a page accumulates enough
`.section-heading`s that some of them are actually facts about the same
topic - three or more related sections is the threshold the Dashboard crossed.
A page with two or three genuinely unrelated sections does not need it;
`.section-heading` alone is still correct there.

## Free text that gets grouped needs a memory

Expenses take a typed category, and the pump's real data shows the cost of
offering a fixed suggestion list and nothing else: most rows had fallen into
"Other", and one category had become the sentence *"salary of haseeb and pump
tea and lunch"*. A breakdown is only worth as much as the consistency of what
was typed into it.

`getExpenseCategories()` returns every category actually used, **most-used
first**, and those go in front of the stock suggestions in the datalist.
Frequency order rather than alphabetical is the point - the handful used every
month sit at the top, which is where reuse actually comes from.

The lesson generalises: **any free-text field whose values are later grouped,
totalled or filtered should offer what has already been used.** Otherwise every
entry invents its own spelling and the grouping quietly becomes noise.

## Two palettes, and they never overlap

The app uses **two** colour vocabularies, deliberately kept apart:

- **Chrome** — what the app is doing. Green (primary, positive, done), amber
  (money owed or gone), red (danger, alert), slate (everything else).
- **Data** — which fuel this is. Blue petrol, orange diesel, gold lubricant,
  from `app/_lib/fuel-colors.js` only.

**Nothing in the chrome may use blue, orange or gold**, and nothing outside
`fuel-colors.js` may use them either. That is the whole rule, and it exists
because the fuel colours do a safety job — the owner's father reads them to
know which nozzle he is entering — and a colour spent twice is a colour that
has stopped meaning anything.

- **The MUI theme is the chrome palette** (`app/_components/ui/AppTheme.js`).
  MUI's own defaults could not be used: its primary is a blue and its warning
  an orange, which are exactly the two the fuels own. Its stock palette would
  have put a blue button next to a blue Petrol badge on the Readings screen.
- **Primary is `brand-700` (#047857), not `brand-600`.** MUI puts white text
  on a contained button, and white on brand-600 is 3.77:1 — under AA. The old
  `.btn-primary` used brand-600 and had been shipping that unnoticed.
  brand-700 is 5.48:1.
- **Colour a thing only when the colour adds meaning its shape does not.** The
  audit that produced this removed five hues that were decorating rather than
  saying anything: asset categories that already had five distinct icons,
  customer avatars that already had initials, stat rings on tiles whose icon
  already named them. Where a ring stayed coloured, the colour says something
  the icon cannot — a wallet says "expenses", the amber says "money leaving".
- **The rule above governs where colour is _required_, not where it is
  _forbidden_.** Read as a ban on decoration it produced a page of fourteen
  grey blocks (Company Assets), and the owner's verdict on that was "boring" —
  a fair verdict on a private register he opens for his own reference rather
  than to check a figure against cash. The category hues went back, and the
  distinction worth keeping is: **a screen someone reconciles against a drawer
  earns its colour; a screen someone browses may simply have some.** What made
  the restored hues safe was not that they now mean more, but that nothing on
  those cards is knowable by colour alone — every category still carries its
  own icon _and_ its written label. See "Where a decorative hue is allowed"
  below for the two hues it may never spend.
- **The one documented exception is `CashCreditChart`'s violet**, and it must
  stay. Making credit amber would have matched the stat tiles, but that pair
  was chosen with a palette validator: green/violet separates for red-green
  colour blindness where green/amber does not. **Consistency does not outrank
  being readable by the person using the app.** Check for a written reason
  before unifying a colour that looks out of place.

### Where a decorative hue is allowed, and what it may never spend

Company Assets is the one page carrying colour that is there to be pleasant
rather than to say something. When another page earns the same licence, the
constraint that made it safe there is what carries over — it is a much
shorter list than "anything not already used":

| Hue | Status | Why |
|---|---|---|
| blue, orange, gold | **never** | petrol, diesel, lubricant. The safety rule above; a colour spent twice has stopped meaning anything. |
| red | **never** | "look at this". |
| amber | **never** | "money owed, or gone". |
| brand green | fine | it is the app's own colour. |
| teal, violet, fuchsia | fine | owned by nothing. |
| slate | fine, and preferred | the right answer for "uncategorised", where the absence of a hue is itself accurate. |

Red and amber are barred for a sharper reason than tidiness: **every card on
that page carries a money figure**, and an amber tile beside `Rs 132,000`
reads as a warning about the number. A decorative hue must not be able to be
mistaken for a status one on the same card.

That leaves four usable hues and a neutral, which is a real ceiling — a
sixth category could not be given its own colour without breaking one of the
rows above, and the answer then is to let it fall to slate rather than to
reach for a reserved hue.

**Pale ground, dark glyph, three steps.** The icon tile takes the `100`, a
chip carrying words takes the `50`, a stat-tile ring takes the `50` (every
other ring in the app is a `50`, and a lone darker one on that row looks like
a different component), and glyph and text stay at the `700` throughout.
Tried at the `50` across the board, the tiles washed to near-white against a
white card and the page still read as grey — the change had cost the argument
without buying the look.

## Petrol is blue and dark; diesel is orange and light

The pair exists to stop one specific mistake: a reading typed against the
wrong nozzle. The owner asked for two colours his father cannot mix up, so
they now differ on **three** axes at once, and all three are load-bearing.

| | Petrol | Diesel |
|---|---|---|
| Hue | blue | orange (opposite on the wheel) |
| Weight | dark `#075985` | light `#FDBA74` (4.48x apart in luminance) |
| Letters on the fill | white | dark |

- **Hue alone is not enough, and lightness is the cue that survives.** Petrol
  and diesel were once a dark navy and a dark amber, and the owner's verdict
  was immediate: "they both look the same, both are dark." A later pair of his
  sat 1.22x apart, which is no gap either. The teal/yellow pair this replaced
  worked, but at 2.67x; blue against orange is 4.48x. **If a change would leave
  the two fuels the same weight, it is wrong however good the hues look.**
- **Blue against orange also survives colour blindness**, which red against
  green would not. That is not incidental — it is why this pair and not a more
  obvious one.
- **A light colour cannot do every job.** Diesel's `#FDBA74` is 10.6:1 behind
  dark text and excellent as a filled band, but 1.6:1 as a rule on a white
  card — invisible. So each fuel carries a darker relative of the same hue for
  rules, rails, chart marks and text on white. The identity is the hue; the
  lightness is chosen per job. Never reach for `solid` to draw a line.
- **`border` is a step lighter than `onWhite` on purpose.** A rule only has to
  be seen; text has to be read. At the text-grade darkness an 8px rail read as
  near-black for petrol and as brown — close to the app's red — for diesel, so
  both rules use the middle value and both texts use the dark one.
- **Lubricant keeps its gold** and is deliberately not part of this. Nobody
  enters a lubricant reading into a nozzle, so it is not in the pair that gets
  confused; and the owner settled on gold after rejecting violet ("girlish",
  his word), rust and navy. Diesel moving from yellow to orange takes it
  *further* from the gold than it was.

## `soft` and `strong`: one hue, two weights, so lightness is free

Each fuel carries a **pair** of filled-band tokens beyond `solid`:

- `soft` — the pale tint of the hue behind its own dark relative (~6.5:1)
- `strong` — the dark relative filled, behind white text (~7.5:1)

They exist so a surface can use **hue to say which fuel and lightness to say
something else entirely**. The Readings unit header does exactly that: it wears
its unit's fuel, `soft` while there is still a nozzle to enter and `strong`
once the pump is finished. Two questions, two channels, neither borrowing the
other's.

- **`strong` is not `solid`.** For diesel they are opposites — `solid` is the
  light orange band, so an "emphasised" header built from it would be *paler*
  than the quiet one. `strong` always comes from the dark relative.
- **Everything inside such a band takes its colour from the band**:
  `currentColor` for icons, white-alpha for chips and progress tracks. That is
  what lets one pair of classes serve both a pale band with dark text and a
  dark band with white text — nothing inside has to know which it is on.
- **A progress bar disappears at 100%, it does not sit there full.** A full
  bar has no empty track left to contrast against, so it stops reading as a
  bar and starts reading as a rule someone left behind - which is exactly how
  the owner reported it ("the progress bar looks white even when filled"). A
  finished unit is by definition at 100%, so the bar is dropped and the filled
  band, the check and "2 of 2 entered" carry it instead. Show a bar only while
  there is progress left to show.
- **A container whose contents disagree gets `NEUTRAL_FUEL`.** A unit is
  normally plumbed to one tank, but the schema does not require it, and a unit
  selling both fuels would be mislabelled by either colour. Falling back to
  neutral is the honest answer; picking the first nozzle's fuel and calling the
  whole pump diesel is not.

## A badge is not a card band: legibility per surface, not per fuel

`FuelBadge` and the card bands (Dashboard, Stock) both come from
`app/_lib/fuel-colors.js`, but they do not always read the same token. The
card bands use `solid`; badges read `color.badge`.

They happen to agree for petrol and diesel now — both fills are already at the
right weight for white and dark letters respectively — but they diverge for
lubricant, whose badge is the dark relative of its gold behind white text
(7.6:1) rather than the raw gold behind dark text (which passes AA but reads
as "hard to see" at chip size, and the owner said so).

**The rule generalises: pick the fill AND the text colour for the job the
surface is actually doing, not once per fuel.** A colour that is right as a
large band can be wrong as a small chip, and the fix is a second token, not a
compromise value that is mediocre at both jobs.

## Never hard-code a fuel's colour at the call site

`app/_lib/fuel-colors.js` is the only place a fuel gets a colour. This is not
tidiness — it is the failure that created the module. The colours had been
retyped in six files and drifted, so the same fuel was one colour in a chart
and another in the table beneath it.

It happened again during the blue/orange change: the customer detail page's
"Fuel taken in total" tiles carried their own `bg-sky-50` / `bg-amber-50`,
were invisible to the change, and were left as the only corner of the app
still wearing the old pair. **If a surface needs a fuel's colour, call
`fuelColor()`.** If the token it needs does not exist, add one to the module.

## Nozzle rows get the same accent as the Dashboard's cards

`ReadingForm`'s per-nozzle row (the tappable card on Readings) carries a 4px
`border-t` in the fuel's accent colour, same token and same reasoning as the
Dashboard's fuel cards: a quiet cue on a surface where the fuel is being READ,
not the filled band reserved for the Stock page's dip boxes. Six nozzles in
solid colour down one screen would be the "colour-blocking" mistake again;
a rule at the top of each card separates diesel from petrol without any of
them shouting.

Confirmed it survives the row's own `hover:border-brand-300` (the interactive
affordance already on that button) rather than being silently overridden by
it - checked the computed `border-top-color` on hover, not just the class list.

## Cards float on shadow, not on a border

`.card` used to be `border border-ink-200 bg-white shadow-sm`. The border is
gone and the shadow is a single wide, faint drop — `0 20px 27px 0 rgb(0 0 0 /
0.05)` at `rounded-2xl`, replacing the `shadow-md` this carried for a while:
a white card on the page's pale slate
background (`--color-ink-100`, `#f1f5f9`) now reads as a raised object rather
than a bounded region. `shadow-sm` was nearly invisible against that
background, so the border had quietly become the thing actually defining a
card's edge — the shadow was decorative, not structural. It is structural now.

**`shadow-md` was the wrong kind of structural, though.** It is a tight
contact shadow — two layers at 10% black within 6px of the edge — which reads
as cards pressed flat against the page and gives a grid of them a ruled,
gritty look. The current one is a single 27px blur at 5%, dropped 20px, so
cards separate from the canvas by **height** rather than by contrast. It has
to stay faint: on a cheap tablet in poor light a heavier shadow becomes a grey
band along every card edge and starts competing with the hairlines inside the
card.

This is the shared `.card` primitive nearly 70 places read from, so the change
is sitewide in one edit rather than a per-page pass. The Stock page's dip
cards additionally lost the coloured ring that used to run round the whole
card (`border-2 ${color.border}`) — redundant once the header band is already
the fuel's colour, and it read as a picture frame rather than a raised card.
They keep `shadow-xl`, a step above the app-wide card shadow: it is the one
surface where a wrong figure corrupts every later day's numbers, and gets the
strongest lift on the page for it.

## A dark relative is not "the colour" — carry a true-hue swatch too

The Dashboard's fuel cards (by-fuel and tank stock) use the fuel's darkened
relative for both the heading text and the accent rule, because raw diesel
yellow fails outright as text (1.09:1) and nearly disappears as a hairline
border on white. That is correct for legibility, but it means **nothing on
the card was ever actually diesel's colour** — heading and rule were both a
dark olive, and the owner noticed a card titled "Diesel" did not look yellow.

The fix is a small filled dot beside the heading, using a new `raw` token —
the owner's exact hex, unmodified — with its own `ring-1 ring-inset
ring-black/15` for an edge. A filled shape with its own ring has no
text-to-read and no contrast-against-its-neighbour problem to solve, so it is
the one place `raw` is safe. It is NOT safe as a flat fill with no ring:
diesel and lubricant are 1.1:1 and 1.7:1 against both white and the
progress-bar track, next to invisible without something crisping the edge.

**The general rule this leaves behind:** a colour token chosen for legibility
in one context (text, a hairline rule) is not "the fuel's colour" everywhere —
it is that colour ADAPTED for that job. Somewhere on the surface, in a spot
that carries no legibility burden of its own, the true hex should still
appear, or a light colour's identity quietly disappears into whatever
darkened relative was needed to keep it readable.

## A table too wide to read: pin the ends, scroll the middle

`RegisterTable` (`app/_components/admin/RegisterTable.js`, the Sale & Stock
Register) is the first table here that could not be read straight through, and
the pattern it establishes is worth copying before the next one is invented.

Every other list in the app scrolls sideways inside its card and that is fine
— Purchases, the ledger, the readings — because the columns off to the right
are the *less* important ones. The register inverts that: it is the running
totals at the far right that anybody opens the page for. Scrolled to its
natural start, the reader saw opening stock and receipts, and the block the
owner had circled on his own spreadsheet was off the edge at every width
including a phone.

- **Pin the ends, let the middle slide.** The date column is
  `.pinned .pinned-left`, the cumulative block `.pinned .pinned-right`. The
  reader can always see which row this is and what it adds up to; the working
  in between is what scrolls. It is the horizontal counterpart of
  `.table-scroll thead th`, and it depends on the same thing — `.table-scroll`
  must be the scrolling element for a sticky child to have anything to stick
  to.
- **The stacking belongs in `globals.css`, not in `sx`.**
  `.table-scroll thead th` sets `z-index: 10` and outranks anything MUI's `sx`
  emits (a class plus two elements against a single class), so pinned headers
  given `z-index: 2` at the call site were painted *over* by the ordinary
  headers they were meant to cover — the register's cumulative figures under a
  heading reading "Litres, %, %". `.pinned` carries the stacking; the call site
  keeps only `left`/`right` and the width.
- **…but the background belongs at the call site**, which is the same trap from
  the other end. A pinned cell must be opaque or the row slides through it, but
  *which* opaque colour is the table's business — the register's date column is
  white and its cumulative block is tinted. A `background-color` in `.pinned`
  would outrank the `sx` that sets it and flatten both.
- **Pinned columns need fixed widths, sized by the phone.** A sticky offset is
  a number, so `right` on the middle of three pinned columns is the sum of the
  widths to its right. And at 400px the pinned columns are very nearly the
  whole table: at laptop-derived widths they overlapped, rendering a date as
  `01 Aug 202` — a truncated year, which reads as corrupt data rather than as a
  layout bug.
- **Add `.has-pinned-columns` beside `.table-scroll`.** The bleed
  (`-mx-4 px-4` below `sm`) puts 16px of padding inside the scrollport, and a
  sticky offset is measured against the padding box — so `left: 0` stops short
  of the card edge and leaks a strip of scrolling table past the pinned column.
  This zeroes the padding; the negative margin still gives the bleed.
- **An edge shadow, not a border.** A scrollable region clips at its edge, and
  the first render cut through a dip reading (`5,219.(`) which reads as broken
  data. The shadow falls away from the pinned column, over the content sliding
  under it, so the clip reads as depth. It is not a substitute for **cutting
  columns until the clip lands in a gutter rather than through a number** —
  two derived columns came out of the register for exactly that.
- **Pin the right-hand block only where it fits beside the left one**
  (September 2026, when the register moved to the new look). Four pinned
  columns need about 28rem, a phone's panel has 20 to 23rem, and pinned
  regardless the running block slid over the date and printed "01 Sep 20".
  `.pinned-right-roomy` pins once its `@container` (the table's panel) is 40rem
  wide and leaves an ordinary scrolling cell below that; the date stays pinned
  at every width and prints "01 Sep" on a phone. **Its offset goes in as the
  custom property `--pin-right`, never an inline `right`**: a header cell is
  already sticky (for the vertical pin), so an inline `right` pinned the
  headings to the right edge on a phone while their columns scrolled away.
- **Two header rows need the second pinned below the first.** Both rows stick
  at `top: 0` by default, so the column row slid over the group row as the
  table scrolled. The register's group row is a fixed `h-9` and its column row
  `top-9`.
- **The register is a plain `<table>` now**, in `.th` / `.td-num` like every
  other table, where it was an MUI `Table` styled through `sx`. The notes above
  about `sx` losing to `.table-scroll thead th` are why the stacking stays in
  the stylesheet; they no longer describe a live call site.

## Units in the header when every column shares one

The register's ten columns are all litres, and `formatLitres` on each would
have spent about a third more width restating a fact the heading gives once.
The rule that a figure and its unit must not break apart (above) is not
weakened by this — it is satisfied by there being no unit in the cell to break
away from. This applies only when the whole table shares one unit; a mixed
table keeps its units in the cells.

And **fix the decimals across the column**. Left to `formatNumber`, one column
read "5,556", "332.46", "1,033.8" — three shapes in a column of tabular
numerals, which is precisely what tabular numerals exist to prevent. Two
decimals everywhere, including on whole numbers.

## A range of days, when a fixed window will not do

`<TrendRange>` (above) is the rule: chart filters are fixed windows, not a
from/to pair. `RegisterRange` is the documented exception, and the test is
**whether the end of the range is already known.**

The Dashboard's charts end on the day the page is showing, so "how far back"
is the only open question and one tap answers it. The register does not have
that: the owner reconciles a run of days he chooses — the month so far, the ten
days since a delivery, one week he is suspicious about — and no fixed window
expresses any of them. The cumulative columns only mean anything over a period
somebody picked on purpose.

Everything else `<TrendRange>` does still applies, and this does all of it:

- **The invalid state is unreachable, not validated.** Days are two
  `<select>`s of 1..(days in the month), so the range cannot be free text and
  cannot be empty; moving either end past the other **drags the other with
  it**, rather than refusing the input.
- **Changing the month resets the days to the whole month**, so day 31 cannot
  be left selected in February.
- **The server clamps it again.** A query string is not a control: `?from=0`
  would ask Postgres for `2026-08-00` and `?from=400` for four hundred days of
  rows. Same lesson as `trendDaysFrom()`.
- **A plain `method="GET"` form.** No Server Action and no router push — the
  URL carries the range, so a particular run of days can be linked or
  bookmarked.

## A `<section>` around a heading silently removes its margin

`.section-heading` carries `first:mt-0`, which is what lets one class cover
both "opens a container" and "follows content". Wrapping each block of a page
in its own `<section>` makes every heading its container's first child, and all
of them quietly lose the gap — on the register, "Diesel tank" sat flush against
the paragraph above it. Use a `<Fragment>` when the grouping is decorative. If
a `<section>` is genuinely wanted for semantics, the heading needs its top
margin putting back explicitly.

## A totals row needs two lines, and "Summary" is usually the honest word

The register's totals row was labelled "These days", and the owner's response
on first seeing it was *"what is these days"*. A label that has to be explained
is a defect, and the fix generalises.

- **Two lines, not one: what the row is, then which records it covers.**
  "Summary" over "01–07 Aug". One line cannot carry both, and the reader needs
  both - that this is not another data row, and what it spans.
- **"Summary", not "Total", unless every cell really is a total.** On this row
  opening stock and the closing dip are the two ENDS of the range while litres
  sold is a sum; calling the row a total promises arithmetic two of its own
  cells do not do. Where every cell genuinely is a sum, "Total" is right.
- **The qualifying dates go on the second line in ordinary case**, not
  uppercase - two shouted lines read as one phrase. Same instinct as "a
  qualifying date goes on its own line, not into the label" above.

## Use the app's own word for a figure, not the source document's

The register was built from a spreadsheet the owner keeps, and it arrived
carrying that spreadsheet's vocabulary: "Variance" for the difference between
the books and the dip, "Books" for the expected figure, "Cumulative" for the
running total. Every one of those was wrong for this app.

`stock_checks.gain_loss` is the column, "Gain / loss" is the Stock page's
heading, and the cards at the top of the register itself already read "Stock
gain / loss over these days". The register was the only surface using a
different word for a number the app names everywhere else - so the same figure
had two names depending on which page you were on.

**When a new screen is modelled on an outside document, translate its labels
into the app's existing vocabulary before shipping it.** The source document is
where the *columns* come from, not where the *words* do. What the register
ended up with:

| Came in as   | Ships as        | Why                                              |
| ------------ | --------------- | ------------------------------------------------ |
| Variance     | Gain / loss     | the app's own word, in the schema and on Stock    |
| Books        | Should be       | reads against "Dip" beside it, in plain language  |
| Cumulative   | Running total   | says the same thing without the Latin             |

And keep any explanatory note in step with the headings — the register's note
still said "Books" and "variance" after the columns had been renamed, which is
how a legend stops being read.

## Entry on Readings is a dialog, and inline was tried and reverted

Recorded so it is not rebuilt from scratch, the way the day-completion strip
above had to be recorded after three attempts.

The argument for inline entry was real and is still real: the job is six
numbers, and behind a dialog it costs six open / type / save / close round
trips, with the page covered over each time by the thing it had just launched.
The dialog had even grown its own running-total panel, because the page's own
figures were unreachable from inside the task.

It was built — each row a disclosure expanding in place, the live litres and
value computing under the closing field, Save and Close at the foot of the
panel — and the owner's verdict on seeing it was that **the modal window was
better**. It went back.

Worth understanding why, because the round-trip count was not wrong: what the
dialog gives this task is **one nozzle on screen and nothing else**. A reading
typed against the wrong nozzle is the mistake this whole screen is designed
around — it is why the fuels carry two independent colour cues and why the
dialog repeats the full "Unit 1 · Nozzle A" that the row shortens. Expanded in
place, the row being typed into sits in a column of five others that look very
much like it. The dialog's cost is navigation; its value is that there is
nothing else on the screen to type into by mistake.

So: **the dialog convention above is not only for set-up forms.** It also
covers a task where picking the wrong target is the failure being designed out,
however often that task is performed.

## A figure that must be checkable from the far end of a long page

`ReadingsCashUpBar` is a slim strip pinned to the bottom of Readings carrying
the day's running totals. The pattern is worth copying, and so is the
constraint that keeps it from being clutter.

- **It appears only when the thing it duplicates has scrolled away.** The same
  four figures sit in stat tiles at the top of the page; the bar watches those
  tiles with an `IntersectionObserver` and shows itself only once they leave
  the viewport. At any moment the day's totals are on screen exactly once —
  which is "say it once" honoured rather than broken.
- **`IntersectionObserver`, never a scroll handler.** The observer fires when
  the element actually crosses the edge, off the main thread; a scroll listener
  answers the same question on every frame of every scroll, on a cheap tablet.
- **`aria-hidden` while it is off screen**, so the figures are not read out
  twice.
- **Nothing to say, no bar.** Suppressed entirely until the first entry — on a
  fresh day it would be a strip of "Rs 0" following the reader down a page they
  have not started.
- **Leave a spacer the height of the bar**, and size it from the NARROWEST
  screen: this bar is 76px on a laptop and **100px on a phone**, where it wraps
  to two lines. Sized to the laptop it would have left the last nozzle's Save
  button underneath it, on the device the app is actually used on.
- **Drop the least useful figure before letting it wrap.** Litres go at narrow
  widths (a container query, not `sm:` — the bar is inset by the sidebar).
  The bar answers "does this match the notes in the drawer"; cash and credit
  answer it and litres do not.
- **`lg:pl-60` on a fixed element under the admin layout**, to match the
  sidebar offset. That number now appears in three places and they have to
  agree.
- **It does not need to dodge a dialog.** `<Dialog>` is a native `<dialog>`
  opened with `showModal()`, which renders in the browser's TOP LAYER — above
  every z-index on the page, whatever the numbers say. A `z-30` bar is
  correctly covered by it, backdrop and all. Verified rather than assumed, by
  asking `document.elementFromPoint` what is actually painted at the bar's
  position while a dialog is open: the answer is the dialog.

## The shared pieces added in the redesign round

Four components and three CSS classes carry most of the app's current look.
Reach for these before writing a new one.

| Piece | What it is | Where |
|---|---|---|
| `StatTile` / `StatGrid` | The headline figures. Small icon beside the label, figure below, optional sparkline at its right, then `delta` and `sub`. | `_components/admin/AdminStats.js` |
| `Sparkline` | Hand-drawn SVG trend line with a hover readout. Decoration with a shape, never a figure to read. | `_components/ui/Sparkline.js` |
| `DeltaBadge` | The percent pill. Arrow = direction, colour = whether it is good news. | `_components/ui/DeltaBadge.js` |
| `CustomerSearch` | Debounced query-string search over a table. | `_components/admin/CustomerSearch.js` |
| `.card` | Every block in the app. Wide faint shadow, `rounded-2xl`. | `globals.css` |
| `.fuel-band` | Soft lit surface for a fuel-coloured header. Adds no colour. | `globals.css` |
| `.unit-card` | Four stacked shadows. The Readings unit only. | `globals.css` |

### The stat tile's anatomy, and why it is that order

Label with a small icon, figure, comparison, description — reading order
matching importance. Taken from the Ramtabs dashboard the owner supplied, with
one change forced by this app's numbers: **the sparkline yields, the figure
never does.** `Rs 1,204,950` bold at 24px needs ~190px in a tile about 265px
wide, and `whitespace-nowrap` on money is not negotiable — a figure breaking
after the "Rs" reads for a moment as two figures. So the chart is `hidden`
until the tile has genuinely earned the width. **Decoration must never be the
reason a figure cannot be read.**

### `DeltaBadge`: two axes, not one

**The arrow is direction; the colour is whether it is good news.** Expenses up
is an up arrow and a RED pill; sales up is an up arrow and a green one.
Colouring by direction alone would paint "expenses rose 40%" the same green as
"sales rose 40%" — the one mistake a money app cannot make. Callers pass
`higherIsBetter`.

**No baseline means no badge.** A zero previous and an absent previous arrive
identically from a summary RPC, and "rose from nothing" and "there is no
earlier period" are different sentences. A card with no comparison shows none;
the figure above it is unaffected. (Live proof: the pump's records begin
01 Aug 2026, so every August range on the register compares against an empty
July and briefly showed "New" on all four tiles.)

**The badge is the pill alone.** It shipped with "up from Rs 655,595
yesterday" beside it and that was removed: on a card already carrying a label,
a figure and a sparkline it was the fourth thing and the only prose, and it
made every tile taller.

### Anything a client chart displays is formatted on the SERVER

A formatter cannot cross the server/client boundary, and shipping raw numbers
so the chart can re-implement PKR or litre formatting is how a tooltip and a
table start disagreeing about how a figure is written. Pass pre-formatted
strings (`Sparkline`'s `tips` are `{ v, d }`).

### Test containment against the card's PADDING box

A `scrollWidth > clientWidth` check asks whether an element overflows **itself**,
which is not the question — a figure or a chart can sit entirely inside its own
box while hanging out of the card. Walk every width and compare each child's
rect against its card's padding box. That is what caught the sparkline leaking
(it carried `width={72}` as an SVG attribute, so it stayed 72px however narrow
the tile got) and `Rs 14,386,211` escaping at 440px.

### Texture: nothing smaller than the thing it sits on

`.fuel-band` was first built with fractal grain and 1px 45° hairlines —
genuinely "grainy" and "patterned", and it hurt to look at. **Both are
high-frequency detail**, at the scale of a pixel or two: on a cheap tablet
that shimmers while scrolling, can moiré against the screen's pixel grid, and
gives a 40-plus eye something to keep trying to focus on that is not there.
This app's whole type and contrast floor exists for that reader.

Everything in it is now a wide soft wash measured in hundreds of pixels — a
sheen, a falloff, one ~300px diagonal sweep — plus a 1px bevel, which is an
edge read once rather than a field to scan.

**Depth comes from stacking shadows, not enlarging one.** `.unit-card` uses
four: a 1px contact shadow where the object meets the page, a mid shadow for
the body of the lift, a wide ambient one, and a white hairline inset along the
top edge as the highlight on its upper lip. The eye reads the combination as
height and any single one as a blur. Only the Readings unit is lifted this
far — if everything were raised, nothing would read as raised.

## Pinning one end, and why a pinned pair shares a cell

"A table too wide to read: pin the ends, scroll the middle" (above) is the
pattern; the Treasury table is the second table to use it and it deviates
twice, both times for a reason worth copying.

**Pin one end when the middle is narrow.** The register pins both ends because
its middle is eight columns. Treasury's middle is four, and at 400px a second
pinned column leaves about 140px of scrollport for a reason, an amount in and
an amount out — which is the register's own "at 400px the pinned columns are
very nearly the whole table" failure, reached from the other direction. So the
balance end is pinned and the date scrolls: the balance is what the page exists
to show, and the date is the first thing on screen at rest anyway.

**A pinned figure and its row action share ONE cell.** As two pinned cells the
outer one needs `right: <the width of everything to its right>`, and that
number is easy to get wrong — the action column is 3rem of button *plus* the
`.td` padding, so it renders at 68px, and offsetting the balance by `3rem`
painted the last 8px of every figure underneath it. `Rs 1,781,910` lost its
last digit on a phone. **The DOM check reported nothing**, because the text was
not overflowing its own box; another cell was simply on top of it.

One cell at `right: 0` has no offset to get wrong:

```jsx
const PIN_RIGHT = 'pinned pinned-right';
const BALANCE_PIN = { right: 0, width: '11rem', minWidth: '11rem', backgroundColor: '#fff' };
…
<td className={`td-num ${PIN_RIGHT}`} style={BALANCE_PIN}>
  <span className="flex items-center justify-end gap-1">
    <span className="font-bold">{formatPKR(balanceAfter)}</span>
    <DeleteEntryButton … />
  </span>
</td>
```

It is also the only arrangement where the button stays reachable: a balance
pinned alone at `right: 0` sits over the action column at every scroll
position, and the button can never be tapped.

Still true from the register: `.pinned` carries the stacking and
`.pinned-right` carries the edge shadow, so only the leftmost cell of a pinned
group gets the shadow; the cell must be opaque; and `.has-pinned-columns` goes
beside `.table-scroll`.

## An icon the set does not have is drawn IN `Icon.js`, not inline

The set is Material UI throughout and "adding a name means adding an import and
a line in `COMPONENTS`". `treasury` is the first exception and it stays inside
that contract: it is a local component in `Icon.js`, registered under a name
like any other, so every call site is still `<Icon name="treasury" … />` and
swapping it later costs that file only. **A one-off inline SVG at a call site
is still wrong** — that rule (under "Icons" above) is untouched.

Reach for this only when nothing in the package means the thing. Treasury did:
the page is about cash that is deliberately **not** in the banking system, and
`Savings` is a piggy bank, `Lock` reads as security settings among nav items,
`Payments` is a note stack sitting one row under `AccountBalance`.

Two things a drawn icon owes the set:

- **Take the same props MUI's icons take** (spread `...props` onto the `<svg>`)
  so `Icon`'s sizing wrapper treats it identically.
- **Be designed at the size it is read, and rendered to check.** Four variants
  of this one were laid out at 16 / 20 / 24 / 48px before choosing. The first
  draft had six marks — a body, an inner door rectangle, a small dial, a
  handle and two feet — and at 16px the nested rectangles closed up into
  something that read as a screen or a banknote. Four marks (body, a dial big
  enough to read as a dial, handle, feet) survive. Strokes rather than MUI's
  filled outlines, because a small dial drawn as a fill is a dot.

## The `<select>` side of the category question

"Picking one of a handful of categories: icon tiles, not a dropdown" (above)
names the test — tiles when every option has an obvious symbol, `<select>` when
they do not. `TreasuryEntryForm` is the worked example of the second half:
"Cash of shift closing", "Entry", "Money returned" and "Already in the safe"
have no symbols between them, and as tiles they would be five identical boxes
with a generic glyph in each.

What replaces the icon is a **hint line under the select that changes with the
choice** ("Cash carried into the office during the day"), so the reader can
check they picked the one they meant without knowing the list by heart. The
list itself is `{ value, label, hint }` in `app/_lib/treasury-categories.js` —
a plain data module outside the client boundary, same rule as
`asset-categories.js`.

## A dialog does not inherit the cell that opened it

`<dialog>` + `showModal()` paints in the browser's **top layer**, so nothing
about where the element sits in the DOM constrains its position or its size.
That is easy to read as "nothing about where it sits affects it at all", and it
is not: **inherited properties still come down the DOM ancestry as normal**,
and every `ConfirmAction` in this app renders its dialog inside the table cell
its trash icon lives in.

The Treasury ledger is where it finally bit. Its delete trigger sits in a
`.td-num` cell — `text-right`, and `whitespace-nowrap` so the balance beside it
cannot break. The confirmation inherited both: the sentence explaining what
deleting would do was right-aligned, could not wrap, ran off the side of the
panel and put a **horizontal scrollbar inside the dialog**, with half the
sentence off screen. Banking's delete dialog had been quietly inheriting
`text-right` from its own cell for as long as it has existed.

`Dialog`'s panel therefore carries `whitespace-normal text-left` as a **reset**,
not as styling. Fixed there rather than at the call site because it is the
panel that is wrong — a modal's typography must not depend on which cell opened
it. Anything else a cell can pass down (`text-sm`, `uppercase`, `tabular-nums`,
`leading-*`) is a candidate for the same treatment if it ever shows up.

The general rule: **treat the top layer as isolated for layout and inherited
for typography.**

## When the page size should be a day rather than a row count

`<Pager>` counts rows and is right nearly everywhere: Purchases, the ledger,
the fuel rates, Activity. Treasury is the exception, and the test is whether
**the data has a natural unit the reader already counts in**.

It does here. The owner closes the safe on an evening and checks that evening's
figure against the notes in it, so a day is a thing; "25 rows" is not. Paged by
rows, a page held four and a bit days cut mid-day at both ends, was tall enough
to hit the `.table-scroll` 70vh cap, and could not show a day's opening or
closing figure at all — its rows started and stopped mid-day, so there was no
such figure to print.

Three rules if you reach for this again:

- **Address the page by the unit, not by an index.** `?date=2026-08-21`, not
  `?page=3`. A page index is not stable — back-fill one older row and every
  index after it means a different day, so a bookmarked page 3 quietly becomes
  page 4's contents. It also lets `<DateJump>` work unchanged.
- **Skip empty units, and let the database decide which are empty.** The
  "previous" and "next" links go to the neighbouring days that *have* rows, so
  an arrow never lands on a dead page. Note this is the opposite of what a
  chart does with a gap (`treasury_overview` carries the balance forward across
  quiet days): a chart draws a continuous quantity and a gap in it is real,
  while a page is a thing to read and an empty one is a dead end.
- **Resolve any requested unit to one that exists, and say when you did.** Ask
  for a day with nothing on it and the RPC answers with the nearest that has
  something; the page then says so. A page that quietly shows a different day
  than the one asked for will be read as the day asked for.

The shared column that falls out of it: **whatever every row on the page has in
common stops being a column and becomes the heading.** The date left this table
entirely, which bought back about 110px of width.

`<TreasuryDayNav>` is the component, and it borrows rather than invents — the
disabled-button-not-a-dead-link rule from `<Pager>`, the date box from
`<DateNav>`, and an `hrefForDay(date)` callback for the same reason `<Pager>`
takes `hrefFor`: the page carries other query parameters and a link that
rebuilt the URL from scratch would drop them.

## A table's min-width is measured, not estimated

Treasury's table lost its date column and its `min-w` came down from 46rem to
36rem, which sounded generous for the four columns left. It was 100px short,
and the browser spent the shortfall on the `whitespace-nowrap` money cells —
`Rs 135,000` rendered as `Rs 135,0`, and the reason column broke one word to a
line on a phone.

Add up what the columns actually need, in the browser, with real content:

```js
// widest single line per column, at a width where nothing is squeezed
probe.style.font = getComputedStyle(cell).font;
probe.textContent = cell.textContent.trim();
needs = probe.offsetWidth + horizontalPadding;
```

Here that was 190px for "Fuel or code transfer" on one line, 146px for the
widest In with its arrow, 164px for the widest Out, and a fixed 176px for the
pinned balance block — **676px, so 43rem**. Note the icon inside a money cell
counts, and a fixed pinned column counts at its declared width, not its text's.

## Which navigations keep the scroll position

`<TrendRange>` documents the rule; Treasury's day arrows and date box are the
second and third places it applies, so it is worth stating in general terms.

**Scroll to the top when the whole page becomes a different screen** — Readings
or the Dashboard moving to another day. **Stay put when the control sits below
the fold and only the block above it changes** — a chart's window, a day step on
a ledger whose table is the last thing on the page. Getting this wrong sends the
reader back up past everything to look at the thing they were already looking
at.

`scroll={false}` on a `<Link>` or `<Button href>`, and `router.push(url, {
scroll: false })` for a programmatic one. A shared component that navigates
should take it as a **prop defaulting to the behaviour its existing callers
already have** rather than switching them all — `<DateJump>` defaults to
`scroll: true` and Treasury passes `false`.

`scroll` passes cleanly through `<Button href pending>`: MUI forwards props it
does not recognise to the component it renders as, which is `<PendingLink>`,
which spreads onto Next's `Link`, which consumes it. It never reaches the DOM.

**Measure it both ways.** A fix that happens to match the default is
indistinguishable from a working one if you only test after applying it. Record
`window.scrollY` before and after the click, with the fix and without: here it
was 479 → 0 without and 479 → 479 with, on all three controls.

## Money inside a sentence: nowrap the figure, and space it explicitly

Money in a table cell is already protected — `.td-num` is `whitespace-nowrap`.
Money in **prose** is not, and the Reports page's profit explanation is where
that showed up: at 400px it broke as "Rs" ending one line and "14,354,223"
beginning the next, which reads for a moment as two figures.

**Wrap every figure in a sentence in its own `whitespace-nowrap` span.** Prose
wraps; a money figure inside it does not. This is the same rule as "a figure
never wraps" everywhere else, it just has to be applied by hand because there is
no `.td-num` doing it.

**And put an explicit `{' '}` in every gap around one.** Written as ordinary JSX
whitespace, one of four otherwise identical gaps in that sentence came out of
React missing — `Rs 4,436,709still there` — while its three siblings were fine.
JSX's rules about whitespace next to an element and a line break are subtle
enough that "it is formatted the same as the line above" is not evidence, and a
missing space between a figure and a word reads as a typo in a money total.

Neither is visible to a build, a type check, or the clipping report — the text
was not overflowing anything. Both were caught by reading a screenshot at 400px.

## A rare, hard-to-undo action says back what it is about to do

**Settings → Dispensing units → Replace this unit** (`ReplaceUnitButton`) is the
first control in this app that is used perhaps once every few years, by someone
who will not have done it before and will not do it again for a long time. It is
not destructive — nothing is deleted, and migration 056 refuses anything
genuinely dangerous — but it is hard to undo, and its two date fields are the
part that is easy to get subtly wrong in a way no error message will catch.

So the dialog carries an **"After saving" panel** that restates the form's own
inputs as consequences, live, before anything is written:

> Unit 1's 2 nozzles (A, B) can be entered up to and including **10 Aug 2026**,
> and not after.
> Unit 1 gets 2 new nozzles, enterable from **14 Aug 2026**.
> The 3 days in between have no Unit 1 to enter at all, which is right if the
> pump stood out of service.

Three things make it worth copying rather than a decoration:

- **It states a derived fact the form does not show.** "The 3 days in between"
  is arithmetic on two date boxes that nobody performs in their head reliably,
  and it is exactly the mistake worth catching. A panel that only echoes the
  fields back would not be worth the room.
- **It is not a confirmation step.** `ConfirmAction`'s "are you sure?" is right
  for a delete, where the question is only yes-or-no. Here the answer is not yes
  or no, it is *are these the right two dates* — and a second dialog asking
  again would add a click without adding an answer.
- **The impossible case disables the submit and says why**, in the panel, in the
  same place the consequences would otherwise be. A first day before the last
  day is refused by the database anyway; saying so before the round trip is what
  keeps the panel the place to look.

Reach for this whenever an action is rare, its inputs interact, and its effect
is a *range* or a *boundary* rather than a single value.

## Two generations of one thing on screen at once

The day a dispensing unit is replaced, the reading sheet holds two Unit 1s — the
one being carted away, which sold that morning, and the one that took its place.
Both are diesel pumps, so both are correctly the same fuel colour, and colour is
therefore unavailable as the thing that tells them apart.

- **The distinguishing badge is words, not colour**, sitting beside the heading:
  *being replaced today* / *the new unit*. Colour already carries fuel here, and
  giving it a second meaning on one day a decade would break the one meaning it
  carries every day.
- **It appears only on the day both are present.** The Readings page counts the
  generations per unit number and shows the badge only where that count is above
  one — a permanent "the new unit" caption would still be there in five years,
  describing nothing.
- **The group key is the identity, not the label.** Grouping by unit number
  alone drew the two as a single four-nozzle pump that never existed. Anything
  grouping nozzles into units keys on unit number **and** `commissioned_on`.
- **The retired generation stays reachable, not hidden.** Its days still open
  and correct on Readings exactly as before; what changes is which pump is
  offered on which date. The Settings history table says so once, in a line
  under it, rather than as a warning repeated on every row.

## A field some rows opt out of cannot ride the repeated-name-and-index trick

`NozzleSettingsButton` posts one row per nozzle, and the established pattern
here is that every row repeats the same field names — `nozzle_id`,
`unit_number`, `nozzle_label` — because a form serialises repeated names in
markup order, so the Server Action can line the lists up by index. It is neat
and it needs no ids in the markup.

It breaks the moment a row *omits* one of those fields. A replaced nozzle's
tank and starting meter are read-only (they are arithmetic behind readings
already in the books), so those two rows post nothing for them — the
`tank_id` list arrives shorter than the `nozzle_id` list, and **every row after
the first read-only one silently lines up against the wrong nozzle.** No error,
no missing value: a tank written onto the next pump down.

The rule:

- **Fields that EVERY row has** may use the repeated name and be paired by
  index.
- **Fields that only SOME rows have** carry the row's id in the name —
  `tank_id__<uuid>` — and are looked up per row with `formData.get()`.

Do not "fix" the mismatch by padding the short list with placeholders. That
restores the index but leaves the action unable to tell "not editable on this
row" from "empty on this row", which are different instructions.

## A hidden input must still live in a cell

Related, and found the same afternoon. A `<input type="hidden">` placed as a
direct child of `<tr>` renders fine and screenshots fine — and the browser
**hoists it out of the table** while parsing, because it is not valid there.
The field survives, in a different place in the document, which reorders
exactly the sequence the index pairing above depends on.

Nothing in the rendered page shows this. It appears as `In HTML, <input> cannot
be a child of <tr>` in the dev-server log, next to a hydration warning. So:
**read the dev log as well as the screenshot** when a change touches table
markup — this file's standing advice is that a DOM measurement is not a
screenshot, and this is its opposite number.

## Renaming a thing: say what it applies to, before it is saved

Unit numbers and nozzle labels became editable, and "rename" turns out to be
two different operations that look identical in a form:

- the thing was always this, and the app had it wrong — the rename should apply
  to the whole history;
- the thing has *become* this, on a date — the history should keep the old name.

A form that offers only the first while the user means the second will silently
relabel months of records. So the dialog states which one it is doing, in a
bordered note above the fields, and names the control that does the other one:
*"Renaming applies to the whole history … For a pump that was actually swapped
out, use Replace this unit instead."*

Two rules fall out of it:

- **Point at the alternative by name.** A warning that only says what will
  happen leaves someone who wanted the other behaviour with nowhere to go, and
  they will use this control anyway.
- **Show enough of the frozen row to identify it.** The replaced pumps appear
  in the list read-only so they can be renumbered — and their tank and meter are
  displayed rather than hidden, because after a replacement two rows both read
  "Unit 2 · Nozzle A" and "Diesel Tank, 1,985,669.36 L" is the only thing that
  says which is which. Each row also carries its own date — *replaced 31 Aug
  2026*, *fitted 01 Sep 2026*.

## A field that rewrites the past is disabled, not merely warned about

The section above is about a field whose reach is *stated*. This is its harder
case: a field whose reach cannot be stated usefully, because there is no reading
of it the user could have meant that is safe.

`nozzles.tank_id` was that field. It says which tank every litre a nozzle has
ever sold came out of, with no date on it, and it sat in the wiring dialog as an
ordinary dropdown next to two captions. Picking the other tank on a pump that
had been trading all August moved 19,293.26 litres of petrol into the diesel
tank — silently, because nothing on the screen was about August. The full story
is in `docs/CHANGELOG.md` under "The tank a nozzle draws from is not a caption".

The rule that came out of it:

- **If the only correct answer is a date the form cannot ask for, take the field
  away and name the control that can.** The tank cell is now read-only on any
  nozzle with a reading against it, captioned *"set — this nozzle has days
  entered"*, and the notice points at **Replace this unit**, which asks for the
  two dates and carries the meter across. A warning would not have been enough:
  the owner was doing the right thing to the forecourt and had no reason to
  suspect the form of reaching backwards.
- **Freeze the field that is load-bearing, not every field on the row.** The
  starting meter stays editable on the same rows, because after a nozzle's first
  day it is dead data (012) and the amber notice above the table tells the owner
  to set it. Freezing a row wholesale is easier to write and worse to use.
- **Disable from a fact about the books, fetched as a count.** `getNozzles()`
  embeds `nozzle_readings(count)`; the dialog reads one integer per row. Do not
  infer "has it traded" from anything already on the screen — the screen is
  about the forecourt today, and this question is about every day.
- **The database still says no.** `set_nozzle_wiring()` (060) refuses the change
  whatever the form sends. The read-only cell is the courtesy; the guard is the
  rule.

Where three notices would stack above a table, fold the new one into an existing
box rather than adding a third — the owner scrolls past a wall to reach the
fields, and the rule he most needs to have read is the one that gets skipped.


## An append-only record needs a Correct button, never an Edit button

The customer ledger cannot be edited — the database refuses UPDATE and DELETE —
so the control that fixes a mistyped entry posts a cancelling row and a
replacement instead. Three rules came out of building it, and they apply to any
record in this app that is append-only by design.

- **Name the button for what it does, not for what the user wishes it did.**
  "Edit" promises the old row will disappear. It will not, and the owner who
  expects it to will find three rows where he expected one and trust the screen
  less than before. "Correct this entry", and a subtitle saying *nothing is
  erased — the old entry is cancelled and the right one recorded beside it*.
- **A cancelled row stays visible, and says so in a word.** Struck through and
  greyed, plus a `cancelled` badge; the row that cancelled it gets a
  `correction` badge. The strikethrough alone is decoration — easy to miss on a
  tablet in poor light — and it is the one thing on that row that changes what
  it means, so it is stated. Same rule as everywhere else here: colour and shape
  are never the only cue.
- **Show the resulting balance before it is committed.** Correcting Rs 15,000 to
  Rs 1,500 and to Rs 150,000 look identical while you are typing. *Rs 67,138 →
  Rs 80,638* does not. This is the same preview the manual adjustment carries,
  and for the same reason — it is the only check that catches a fat-fingered
  zero.
- **Offer the control only on rows it can act on, and let the database refuse
  the rest anyway.** A row posted automatically from a sale has no pencil,
  because the sale is where it gets fixed; the function says so too if asked
  directly. A row that is *not* correctable should also carry the badge that
  explains why — the lubricant row had no `auto` badge and so read as the one
  row that had simply been forgotten.

## A form beside a table is a form the table is paying for

The customer page held its payment form in a fixed 22rem column, so the ledger —
the thing the page exists to show — ran at four-fifths width every second of
every day to keep a form on screen that is used once a visit.

The rule: **a form used occasionally opens from a button; the data it acts on
keeps the width.** A dialog costs one tap when it is wanted and nothing when it
is not, and it is what every other screen here already does. A collapsible panel
is not the fix — it still reserves its column, and expanding it pushes the page
taller than the table it belongs to.

Where the summaries then go: across the top, two up, read once on arrival. The
eye goes to the table afterwards and stays there.


## A meter field asks what the machine reads, not what you expect it to read

Both places that take a nozzle's starting meter — "Replace this unit" and the
starting-reading column in the wiring dialog — used to describe the field in
terms of the cases the writer had thought of: 0 for a new pump, or the figures a
refurbished one arrives with. A pump was then moved with its lines empty, the
meter counted 157 L of air while it was being shifted, and the owner typed the
old pump's closing figure because that is what the copy implied. The gap only
surfaced days later.

The rule: **tell the user to read the instrument, then list the cases as reasons
it might surprise them.** "Type what the meter reads right now, standing at the
machine" is one sentence and is right in every case, including the ones nobody
has thought of yet. A list of cases is only ever as complete as the writer's
imagination, and this field is silently wrong when it disagrees with reality —
anything below the true reading gets billed to customers as the first day's
sales.

And **say the deadline where the field is**, not only in the schema comment. A
starting reading does nothing once that nozzle has a saved day, so the notice
says what happens after and the box itself goes grey, captioned *fixed — the
first day holds it*.

That last part was a correction. The meter was first left editable on a nozzle
that had traded, reasoning that a dead field can do no HARM. It was the owner
asking — *if my accountant finds the difference was smaller, can I just change
it there?* — that showed the reasoning was backwards: he can, until the first
day is entered, and afterwards the same edit **saves cleanly, reports success,
and changes nothing on any screen**.

**A control that silently no-ops is worse than one that is disabled**, and worse
than one that errors. Disable it, say why in the cell, and name the route that
does work — here: delete the day on Readings, correct the meter, enter the day
again. "It can do no harm" is not the test; "will the user believe it worked" is.


## When a form leaves a side panel, its button has to become the primary

Moving the payment form on the customer page into a dialog freed the ledger's
width, and quietly cost something: the trigger went into the page header at the
default outlined style, so four grey buttons sat in a row and the one thing the
page exists for read exactly like *Back to customers*.

A form in a panel does not need a primary button — it is already the only form
on screen, and its own Save is the emphasis. The moment it becomes one trigger
among several, the emphasis has to move with it. So: **one `variant="primary"`
per view, and it is the action the page is for** — here, recording a payment
with a customer standing at the counter. Everything else in the header is
navigation and housekeeping, and stays outlined.

Worth checking on any change that converts an inline form to a dialog: the
conversion is not finished until the trigger carries the weight the form used
to.


## The content column is 1360px, and prose is not

The app is read on one 1600x900 laptop. With the 240px sidebar that leaves
1360px, and the content column was capped at `max-w-6xl` (1152px) — so 104px of
empty page sat down each side while the widest tables scrolled sideways inside
themselves to fit. The cap is now `max-w-[85rem]` (1360px) in `app/admin/layout.js`,
with `ReadingsCashUpBar` carrying the same number because it is fixed to the
bottom of the window and has to line up with the content above it.

**Not wider than that.** A bigger monitor gains nothing from a longer line, and
1360 is the screen this is for rather than a number chosen to fill whatever is
plugged in.

**Extra width goes to tables, never to paragraphs.** Every pixel a table gains
is a column that no longer has to be scrolled to. Every pixel a paragraph gains
is a line the eye has to track further back across — at 1328px an ordinary note
ran to 107 characters, well past the ~75 that is comfortable. The four
multi-sentence notes at page level therefore carry `max-w-[70ch]`.

Applied at the call site rather than as a class, because it is a judgement about
each one: **a single-line statement of a figure is not prose** and looks wrong
boxed into a narrow measure — *"2,000 L delivered on this date, costing
Rs 731,200"* stays full width. Ask whether it is something to read or something
to glance at.

Nothing else needed changing: `StatGrid` and the Readings unit cards are already
container-queried (`@[50rem]`, `@[54rem]`, `@[62rem]`), so they picked up the
new width by themselves and were already at their widest layout at 1152.

## A sidebar costs width, and width is not what a short screen lacks

Asked whether the sidebar should collapse to a burger at 1600x900, the answer
was measured rather than argued, and it was no:

| | content width | rows visible |
| --- | --- | --- |
| as it was | 1152px | 16 |
| sidebar hidden behind a burger | 1152px | 16 |
| sidebar kept, cap widened | 1360px | 16 |

The burger changed **nothing** — the container cap, not the sidebar, was what
held the content at 1152, so hiding the nav moved the empty space from beside
the content to beside the content. And rows visible never moved in any of the
three, because **a sidebar occupies width and a short screen is short of
height.** Hiding it would have cost a click on every navigation and bought
nothing at all.

The sidebar does already collapse to a burger below `lg` (1024px), which is
where the trade actually turns: there, width is genuinely scarce.

The general rule: **before hiding a control to make room, measure which
dimension is short.** The instinct to reclaim space reaches for whatever is
biggest on screen rather than for whatever is actually constraining the content.


## A grid of "however many there are" must not hard-code how many

The customer page's *Fuel taken in total* card carried `sm:grid-cols-2` because
the pump sells two fuels. Most customers have only ever bought one, so most of
the time it rendered one tile in the left half and a hole in the right — which
does not read as "this customer buys one fuel", it reads as **a figure that has
not arrived yet.** The owner asked whether the page was waiting for a diesel
entry. It was not; the list only ever contains fuels actually taken.

Two rules from it:

- **Let the column count follow the data** — `rows.length > 1 ? 'sm:grid-cols-2' : ''`.
  A fixed column count is only safe when the number of items is fixed too.
- **Widening a page turns small oddities into obvious ones.** This was mildly
  untidy at 1152px and half an empty card at 1360px. Anything laid out as a
  fraction of the page is worth re-checking after a width change, especially
  where the item count varies.

**But the rule is about grids INSIDE a card, and only those.** Checked
afterwards on the Dashboard and Stock pages, where the same `sm:grid-cols-2`
sits over a variable list — and it is fine there, because those cards sit on
page background. One card in a two-column row reads as *one card*; the space
beside it is the page, and the page is allowed to be empty. On the customer
page the grid was inside a card, so the empty half was white card surface with
nothing on it, which reads as a figure that has not loaded.

Rendered all three to be sure rather than reasoning it out, and full width was
plainly the worst of them for the Dashboard: the litres figure ends up a hand's
width from its own heading and the three money figures spread across 1,300px.

So the question to ask is not "does the item count vary" but **"what is behind
the gap?"** Card surface is a hole. Page background is a margin.

**And a lone tile should spread, not stack.** Full width, a badge with two
numbers stacked under it leaves a stretch of empty paper to their right. Badge
one side, figures the other, reads as a single line — *Petrol … 68.63 L,
Rs 23,101* — and still works when two sit side by side.

## Cards in a row are one height

Until 27 Sep 2026 this section said the opposite, under the heading
"`items-start` on a summary row, so a short card stays short". A grid stretches
its children to the height of the tallest by default, and this app turned that
off on every row of summary cards. The reasoning came from the customer page: a
one-line fuel card stretched beside the taller balance card became a band at
the top with a hand's width of blank card under it, which read as a figure that
had not loaded, while "two cards of honestly different heights read as normal".

In the new look that turned out to be the wrong way round. Screenshots of
Banking, the Dashboard's lubricants and Treasury's two breakdowns came back
with the space under the shorter card circled: uneven cards in a row look
broken. So every row of peer cards stretches again, and the old worry is
answered inside the card, by choosing where the spare height goes:

- **Pin the line a reader compares across the row to the card's foot**
  (`flex flex-col` on the card, `mt-auto` on that line): the Banking card's
  main-account slot, the Settings tank's "Last dipped" line, the unit's Replace
  button, and the Stock card's recorded dip (a `flex-1` spacer above it, so a
  recorded dip sits level with the other tank's).
- **Or give it to the part that is empty for a reason written on it.** The
  Dashboard's fuel card gives it to "Sold on", so the blank sits under "No
  diesel readings entered for this day", and the tank and the month below stay
  level with the card beside it.
- **Or let a tinted tile fill it.** The customer page's fuel bands grow to fill
  their panel (`flex-1 auto-rows-fr`), so one fuel is one large tile rather than
  a band over white paper; the balance panel's two tiles drop to its foot.
- **Give every card in a row the same shape where it is compared.** Banking's
  "Main account" badge sat under the account's name, which made that card's
  header a line taller and put its balance out of step with the card beside
  it. It moved to the foot, into the slot where every other card has "Make this
  the main account".
- **A `min-h` meant to hold a row at a button's height goes on an element with
  no padding.** On the element carrying the rule's `pt-4` it counted the
  padding (`border-box`) and did nothing, and the badge row came out 9px
  shorter than the button row, so the rules above them sat out of line.

**What keeps `items-start`: a panel beside something that grows without
limit.** Expenses' breakdown beside its table, Banking's form beside the
transactions, Your account beside the staff list. Stretched, the panel would
be as tall as a forty-row table. (Company Assets carries `items-start` too, but
its cards are `h-full`, which fills the row anyway: a percentage height on a
grid item resolves against its row.)

**Measure as well as look.** The check for this printed each card's height per
row, before (280/331, 122/170, 186/334, 436/530, 453/874) and after (equal in
every row from two columns up). Below two columns the cards stack and their
heights are their own.


## The sidebar is the reader's choice, not the breakpoint's

The nav was a permanent 240px column above 1024px and a burger below. On a 14in
1600x900 laptop that meant a fixed column on a physically small screen, which
only went away if the window was dragged narrower than 1024 — the same screen
answered two different ways, and the wrong way at the size the app is used at.

**The breakpoint is now 1620px**, which is where a window can hold the 240px
column *and* the 1360px content cap at once. Below it the column is taking width
out of the thing being read. It was picked so the content width barely moves
across it — 1360 either side — because **a breakpoint that visibly reflows the
page is worse than either of the layouts it switches between.**

**And the reader overrides it.** The burger pins the column open on anything but
a phone; it stays open across navigations and reloads until the close button in
its header puts it away. Below 1024px the burger still opens the overlay drawer:
a 240px column pinned over a 400px screen leaves nothing to pin it beside, so
there the menu stays a thing you visit and dismiss.

Three rules came out of building it:

- **A layout preference is read on the server, not the client.** The choice is a
  cookie; `app/layout.js` reads it and stamps `data-nav` onto `<html>` in the
  first response. Read in a `useEffect` instead, the page paints one layout and
  jumps to the other — on every navigation. Write both on toggle: the attribute
  for this instant, the cookie for the next request.
- **When several elements must agree about one layout fact, give them a class,
  not a repeated variant.** Four elements in three files depend on whether the
  column is standing: the column, the burger bar, the drawer, and the padding
  that keeps content clear — and that padding is applied in two files.
  `.nav-column` / `.nav-when-burger` / `.nav-offset` hang off `data-nav` in
  globals.css. The repeated-variant version had already failed once:
  `ReadingsCashUpBar` kept its own copy of the breakpoint, the layout's moved,
  and the bar sat indented 240px for a column that was not there.
- **Don't reserve space for a control that can sit over empty space.** `pr-12`
  on the column header, to clear the new close button, pushed *"Muhammad
  Sagheer · Owner"* onto two lines. The block is centred and the logo row leaves
  the corner empty, so the button overlaps nothing and the padding was simply
  wrong.

## A document the app produces is still a screen someone reads

`app/_lib/statement-pdf.js` is the first thing this app draws that is not HTML —
a customer's statement of account, laid out with `pdf-lib` on A4. Nothing about
Tailwind survives the trip, so everything the design system encodes has to be
re-stated by hand. Which turned out to be a useful test of which conventions were
real and which were just classes.

The ones that carried over unchanged:

- **The type is bigger than a document of this kind normally uses.** Body text is
  9.5pt where a dense financial document would set 7.5, and the figure that
  matters is 26pt. Same reason the screens are large: poor light, a cheap tablet,
  and now a customer squinting at a phone.
- **Colour is never the only cue.** A part-paid line's "paid off" figure is in
  the green the app uses for money received *and* carries a minus sign, because
  this page gets photocopied in black and white. The one alarming ageing band is
  tinted red *and* is the band whose label says "over 30 days".
- **The palette is the app's**, taken off `globals.css` rather than picked
  afresh, so a statement in a folder and the screen it came from are recognisably
  the same document.

And three that only exist once you are laying out paper:

- **Measure a column off its content, not off its heading.** The Date column was
  sized to the word "Date" and every row printed "11 Aug 2..." — the year, which
  is the part that settles an argument about an old fill, was what got cut. There
  is no `overflow` on paper: it truncates or it fits.
- **A continuation page must be worth turning to.** An ordinary account spilled
  its closing note and signature strip onto a second page holding nothing else,
  and repeated the table's column headings above no rows at all. A near-empty
  second page is the one that gets handed over by mistake. Reclaim the space
  (logo beside the name, not above it) and make repeating furniture conditional
  on the thing that actually broke across the page.
- **Every figure on the page must add up to every other figure on the page.** A
  filtered list is fine on screen, where the reader can see the filter; on a page
  handed to the person being asked for money, a list of lines that sums to less
  than the total at the foot is an argument waiting to happen. Whatever is
  excluded from the detail comes back as one summarising line.

The mechanics worth copying if a second document is ever added: build with
`pdf-lib` behind a route handler (never a Server Action — the browser needs
download headers), redirect back with the reason on failure rather than returning
text, since a download link writes whatever it receives to disk. Use a standard
font — the WinAnsi encoding means non-ASCII **throws** rather than degrading, so
scrub the input; the app writes "Rs" everywhere anyway.


## Show the document before you produce it

A button that hands over a file and nothing else is a bad loop for anything the
reader is meant to CHECK. The statement of account shipped that way — pick a
range, download a PDF — and a statement whose lines came to Rs 12,000 under a
total of Rs 10,100 got as far as being printed and handed over. Nothing on screen
was ever going to catch it, because the screen was not showing the statement.

So the dialog now renders the document, and the download is what you reach for
once the figures look right. Three rules came out of it:

- **The preview must be the document, not a summary of it.** Every figure that
  prints is on screen: the total, the opening balance, every fill and every
  payment with the balance standing after it, the period subtotals. A preview
  that shows less than the page is the same trap one step further back.
- **It must share the arithmetic, not repeat it.** `accountFromParts()` is
  called by the screen and by the PDF route, over rows prepared once on the
  server. A preview that computes its own figures agrees with the file right up
  until the day it quietly stops — and that day, nobody looks, because the whole
  point of the preview was that it had been checked.
- **Don't mimic the paper.** This is not a thumbnail of an A4 page: that is
  unreadable on a phone and invites the reader to check the layout instead of the
  numbers. Same information, in this app's own table classes, at this app's own
  type sizes.

A corollary for the formatters. `formatPKR` and `roundRupees` had to move from
`helpers.js` (server-only — it reads request cookies) into `format-helpers.js`,
re-exported so server callers are unchanged. Client components in this app have
historically hand-rolled a local `showMoney`, and that is fine for a figure that
only ever appears on screen. It is not fine for one that also has to match a file:
**anything the screen and a produced document both display must come from one
formatter.**

And one thing the preview itself taught: **a summary row should span the columns
it has nothing to say about.** Given its own Detail cell, "Total now due" wrapped
onto three lines at phone width. `colSpan` across the columns it has no figure
for leaves the amount in the Balance column, where the eye is already looking.


## A running total in a paged table is the database's job

The customer ledger's Balance column showed what was owed immediately after each
entry, worked out in the component: sort the rows oldest first, run a total
through them from zero, print it against each row. That was right for as long as
the component was handed the whole ledger, and wrong from the day it was handed a
page of 25 — zero is the balance before the customer's *first ever* entry, and
that entry is on the *last* page. Every figure in the column was out by the net of
everything older, and page 1, the page anyone actually looks at, was out by the
most: a customer owing Rs 97,515 had **Rs −59,728** printed against his newest
entry. Not merely the wrong number. The wrong side of zero.

The card above the table and the printed statement were right the whole time,
because both are summed in Postgres over every row. Only the column you would use
to *check* them was wrong, which is the worst place for it: the reader looks there
when he wants to know where a figure came from, and if it disagrees he stops
trusting both.

So:

- **A running figure is a property of the whole series, never of the page.** If
  the table is paged, the figure cannot be derived from what the page happens to
  hold. Compute it in SQL over everything and page afterwards — a window function
  (`sum(...) over (order by ...)`) costs nothing and cannot drift.
- **It is also money, so it belongs in `numeric` anyway.** See CLAUDE.md: a
  running balance is `customer_balance()` stopped part way, and the two have to
  agree to the paisa on the last row.
- **Order the window and the list by the same total order.** Rows written in one
  statement share a `created_at` to the microsecond — a correction's reversal and
  its replacement always do — so date-plus-time is not a total order and two
  queries can return them in different orders. Add the id as a final tiebreak in
  both, or the balance ends up beside the wrong line.
- **The clue that this class of bug is present**: a figure that is plausible
  everywhere except at the boundary. Check the newest row against the headline
  total; they are the same number, and if they are not, the column is relative to
  something it should not be.


## A figure that needs a footnote is the wrong figure

The statement of account began as an *open-item* statement: only the fills still
unpaid, each showing how much of it had already been covered, with payments
applied to the oldest fill first. That is the textbook shape for chasing money,
the arithmetic was exact, and the lines always totalled the balance.

The owner read one and asked where the numbers came from. A Rs 5,000 fill from 31
August printed as "Rs 4,980 paid off, Rs 20 still due" — and Rs 4,980 appears
nowhere in the ledger. It was the tail of a payment the allocation had spread
across four earlier fills. Every figure was defensible. The document was still
unusable, because **a statement is checked by finding its figures somewhere
else**, and these could not be found; the page had to carry a footnote explaining
oldest-first allocation before it meant anything at all.

It is a balance-forward statement now: every fill, every payment, the balance
after each, ending in the total. Longer, and every line is a row of the ledger.

The general rule, which is not only about statements:

- **Prefer a figure the reader can find twice.** A derived number that exists
  only on this page will be questioned, and the answer will be a lecture about a
  convention. A number that also appears on a screen, a slip or a register
  answers itself.
- **If the only way to defend a figure is to explain the method, the method is
  showing through.** Allocation, apportionment, weighting and smoothing all read
  as invention to the person being asked to pay.
- **Write the page for the person who did not build it.** This one is read by a
  customer at a counter, on a phone, often in a second language: short lines,
  ordinary words, no explanation of the document to itself. What cannot be shown
  plainly should usually not be on the page.
- **Something undone still has to appear, and must not read as money.** Nothing in
  this ledger is deleted, so a cancelled entry and the row cancelling it both
  print — greyed, labelled "Cancelled" and "Cancels the entry above", and kept out
  of the *fuel taken* and *paid* totals. Only the balance column carries them.
  Listing a reversal as a payment once told a customer he had paid Rs 5,001 he had
  never handed over.


## A period that ends in the past closes with a different number

The statement's period picker was a set of fixed windows — 7, 15, 30, 90 days
back from today, plus a typed number of days. The owner asked for a date range
instead, and the reason is the one `<RegisterRange>` already gives: a fixed
window answers *"how are we doing lately"*, where the end is always today; a
from/to pair answers *"these particular days, which I chose"*. A haulier settling
for August wants August, and "the last 45 days" drags half of July onto the page
and then stops at today rather than at the 31st.

Swapping one for the other brought in a problem the day count never had. **A
window that always ends today can always close with the current balance. A range
cannot.** Print 1–31 August on an account that has traded since, and the
September entries have to be either listed — in which case the range was not
honoured — or dropped from a total still labelled "total now due", in which case
the largest figure on the page asks for the wrong money.

So the closing figure is the balance *as at* the end of the period, read off the
last row inside it, and the label changes with it: **"Balance as at 31 Aug 2026"**
rather than "Total now due". One flag (`isCurrent`) carries this to both
renderers so the screen and the PDF cannot disagree about which document this is.

Generalised, for the next range picker in this app:

- **When a filter can change what a headline figure MEANS, the headline's label
  has to change too.** Re-labelling is not decoration; it is the only thing
  standing between a period statement and a wrong demand.
- **Either end may be left blank, and blank means "no limit"** — which makes "the
  whole account" the same control with both boxes empty rather than a mode of its
  own. Presets set the boxes; they do not replace them.
- **Either end pushes the other rather than being refused.** Dragging the start
  past the end is how somebody asks for a later period, not a mistake to be told
  off for. The invalid state is then unreachable in the UI, and the server swaps
  them again anyway, because a query string is not a control.
- **A native date box clips rather than shrinks.** Give it room or it will lose
  the year: two side by side under 400px rendered "08/01/202" in this dialog
  until the pair got a min-width that pushes the third control onto its own line.
  The year is the part of a date that settles an argument about an old fill.


## The new look — built on the Dashboard first

In September 2026 the owner asked for a complete new look on the Dashboard, and
said the rest of the site would be brought into line with it afterwards, which
it was, the same month: every page and subpage wears it now, and the old look's
pieces are deleted. **A new page is built from this, not from anything older in
this file**, and where an older section here says "the tile" or "the card", it
is describing the old look.

The disciplines did not change, and that is the first thing to know about it.
The type floor (16px body, figures never smaller than their labels, 12px caption
floor), money never wrapping, colour never the only cue, fuel hues never spent on
chrome, the day said once and loudly, a heading never typeset as a caption, no
dark strip across the top, texture never finer than the thing it sits on — every
one of those holds, and each new piece below says where it keeps them.

### The pieces

| Piece | What it is | Old-look counterpart |
|---|---|---|
| `.panel` | The surface. 24px radius, a 6% slate hairline, a contact shadow plus a wide soft lift. `data-card` on it, so the render-check escape pass sees it. | `.card` |
| `.icon-tile` | A rounded square carrying one glyph on a pale ground of its meaning's hue. 40px on a card, 44px on a section header. | the 20px glyph beside a `figure-label` |
| `.caption` | Sentence case, 14px, ink-600. | `.figure-label` (12px uppercase) |
| `.seg` / `.seg-item` / `.seg-item-active` | A segmented control: a few fixed choices, one on. The chosen one is filled green with white text. | `<TrendRange>`'s chips, the chart's own toggle |
| `DayHeader` | The day on screen, as the h1, in a panel washed by the kind of day (white/green today, slate past, amber future), with the arrows, the date box and "Back to today". | `<PageHeader>` + `<DateNav>` |
| `KpiCard` | A headline figure: icon tile + label, the percent pill top right, the figure at 30px, a description, and the trend as a band along the card's bottom edge. | `<StatTile>` |
| `MonthEndStock` | Stock on one date, per fuel: litres, cost a litre, value at cost, pump price, value at pump price, and the value **used in profit** (the lower of the two, with "cost" or "pump price, below cost" under it), then a total row and a sentence on the gap or the write-down. A table at 52rem of card, one block per fuel below it. Every total comes from Postgres (068, 069). | none |
| `SectionHeader` | A zone heading: icon tile, 20px bold title, one line saying what span the zone covers, controls on the right. | the `text-xl` zone `<h2>` + hairline |
| `FigureTile` / `FigureRow` | A breakdown inside a card ("Sales / Cash / Credit") as small tiles; three across above 36rem of card, rows below. | three `figure-label` + figure pairs in a `<dl>` |
| `FuelCard` + `TankGauge` | Everything about one fuel on one card: sold on the day, the tank at the close (drawn as a tank), the month so far. | "By fuel type", the month strip and "Tank stock", as three sections |
| `TrendWindow` | The 7/14/30/90-day window as a segmented control; reuses `TREND_WINDOWS` from `TrendRange.js`. | `<TrendRange>` |
| `TrendCharts` | The three dashboard charts, same series and colours, redrawn. | `SalesTrendChart`, `CashCreditChart`, `LubricantTrendChart` |
| `TitleHeader` | The top of a page that is not about one day: an icon tile in the page's tone, the page's name as the h1, one line on what it is for, the actions on the right, and an optional `back` for a page under another, drawn as an outlined brand-green button worded "Back to customers" (not a text link: see the changelog, "The way back is a button"). The panel carries the tone's palest wash (`WASH` in `tones.js`), never the slate one, which on `DayHeader` means "a past day". | `<PageHeader>` |
| `KpiGrid` | The row `KpiCard`s sit in, from `KpiCard.js`: one column, two from 34rem of row, then three (56rem) or four (72rem). | `<StatGrid>` |
| `Notice` | A page-level message: an icon tile and the sentence, with an optional bold first line. `danger` red, `warn` amber, `info` slate, `ok` green; the words carry it, colour and glyph are the second and third cue. Lifted out of Readings. | tinted boxes written at each call site |

The components live in `app/_components/admin/dashboard/`, the classes at the
end of `globals.css`, and the meaning colours in `dashboard/tones.js`.

**Changed in place for the whole site** when every page was moved over
(September 2026), because by then nothing was left on the old look for them to
break:

- **`.th` is sentence case**, 14px semibold ink-700. The per-page override the
  Stock page carried is gone.
- **Inputs have 12px corners** (`.input`, `.input-number`), the radius of every
  other control in the new look.
- **Buttons, in the MUI theme** (`AppTheme.js`): a 12px corner on every button,
  and the secondary (outlined) button white-filled with a slate hairline where
  MUI draws a near-black outline. Primary and danger are MUI's own.
- **`<Dialog>`**: 24px corners on the desktop panel and an 18px title, which was
  14px, the size of a caption.
- **`<EmptyState>`**: a `.panel`, an optional icon tile, and its sentence at the
  16px body size instead of 14px.
- **The sidebar** puts each section's glyph in a 32px icon tile, pale slate, and
  fills the open section's tile green with a white glyph (see "Navigation").

`app/admin/page.js` is now only the role check and the three queries; the page
itself is `DashboardView`. That split is what lets a devcheck route render the
real page with fixture data, and every page has since been split the same way
(see "Building a page in it").

### What changed, and why each change was made

- **Captions are sentence case at 14px.** The old 12px uppercase caption was the
  hardest text on the page to read in poor light, and it sat over the figures
  being checked. Lower case reads by its shape. It is still clearly smaller and
  lighter than the figure it names.
- **A card's label is body-sized.** "Total sales" at 16px, not "TOTAL SALES" at
  12px. The figure under it is 30px, so the data is still bigger than the chrome.
- **The sparkline has its own band.** On `StatTile` the line shared a row with
  the figure and had to yield — first by vanishing, then by wrapping. On
  `KpiCard` it runs the full width of the card's bottom edge at every size, so
  nothing competes with the figure and nothing moves as the window changes.
- **Credit is violet, cash is green — on the tiles as well as the chart.** The
  chart already paired them (validated for red-green colour blindness), so the
  old page drew credit amber in the tile and violet in the chart below it.
  Violet belongs to no fuel; amber sits six degrees from diesel. Amber now means
  only a warning (a future day). See `tones.js`.
- **One card per fuel.** Diesel's day, tank and month used to be three blocks
  interleaved with petrol's. Now each fuel is one object, and the page reads as
  two columns. The same rule as Readings: the container is the group.
- **Quiet fuel colour, and the true hue somewhere.** A fuel card's band is the
  fuel's `soft` pair, the treatment `fuel-colors.js` provides for a header that
  names a fuel without shouting; the loud `solid` band is still rationed to the
  Stock page. The dot beside the name is the fuel's `raw` hue. The tank gauge
  fills with the `solid` pair, so the two tanks differ in lightness as well as
  hue — dark blue petrol, light orange diesel — with the light fill's surface
  drawn in its darker relative.
- **Lubricants wear gold bands the same way**, so every product card on the page
  is banded in its product's colour and nothing else is.
- **Charts: 12px ink-600 axis text, days as "26 Sep", the legend in words in the
  header, a tooltip naming the weekday and giving the day's total.** The old
  ticks were 11px ink-500, under both floors; "26/09" is the format a day-first
  reader and an en-US browser disagree about.
- **Buttons are still Material UI** — the one button system. The date arrows
  carry the new look's shape through `sx` (12px radius, 42px tall to match the
  date box, a hairline instead of MUI's near-black outline). If the rollout wants
  that everywhere, it belongs in the theme or `Button.js`, not in more `sx`.

### Rules the build turned up

Each of these was found by rendering, not by reading the code, and each is now
written into the component that needed it.

- **A tile on the page canvas cannot use the canvas colour.** The neutral tile
  was `ink-100`, which is the page background; on a section header, which sits
  on the page rather than on a panel, it vanished. Neutral is `ink-200`.
- **Set a breakdown's column threshold from the biggest real figure, not the
  usual one.** Three tiles across at 27rem looked fine on an ordinary day and
  clipped "Rs 1,538,860" at 1024px on a busy one. 36rem, measured.
- **A label must not wrap to make room for a badge.** "Total / sales" beside the
  percent pill made four cards four heights. The label is nowrap and the pill
  drops a line instead; and four across waits for 72rem of grid.
- **A comparison against a day that has not been entered is not a percentage.**
  Until the evening's readings are in, today is Rs 0 against a full yesterday,
  and every card said "down 100%". That is the mirror of the zero-baseline rule
  `DeltaBadge` already keeps: no fuel readings, no badges.
- **The line under a figure must plot that figure.** The old tiles drew fuel-only
  lines under fuel-plus-oil figures, so the hover readout for today disagreed
  with the card by the day's oil takings. The series is now built the same way
  as the figure.

### The pages, as each was moved over

- **Dashboard** — the reference.
- **Daily readings** — `app/_components/admin/readings/ReadingsView.js`. Kept, on
  purpose: unit-as-card, entry in a dialog with one nozzle in it, the unit band in
  the fuel's `solid` colour, entered nozzles washed in their fuel's `tint`, the
  cash-up bar that appears only once the totals have scrolled away. New:
  `DayHeader` (now taking `title`, `icon` and `children` — Clear this day rides in
  its control row), the four totals as `KpiCard`s without sparklines, `.panel`
  units, warnings as tinted panels with an icon tile, sentence-case captions on
  the nozzle card, chain warnings at 14px instead of 12px, and **no black
  surfaces** — the dialog's running total is the nozzle's fuel tint and the
  cash-up bar is a white panel with a strong lift. The nozzle card's figures
  drop to one per row below 19rem of card, because the old card was
  `truncate`-ing seven-figure sums at 360px rather than admitting they did not
  fit.

- **Stock** — `app/_components/admin/stock/StockView.js`. Three zones under
  `SectionHeader`s: the dips, the lubricant shelf, the dips already taken. The dip
  card keeps the page's one **loud** band (the fuel's `solid`, now with
  `.fuel-band`'s sheen) and its extra lift — this is the surface where a wrong
  figure corrupts every later day — and gains the Dashboard's `TankGauge` beside
  the book figure. A dip's result (preview and recorded) is one `DipDifference`
  line with a tick or an arrow; a first dip stays amber and never says "gain".
  The shelf says **Low** and **Out of stock** in words, on the Lubricants page's
  rule (below one pack; ten litres for the drum), where it used to colour the
  figure and nothing else, and the drum no longer prints "0 L pack".
- **Tables in the new look** sit in a `.panel` with `overflow-hidden`; inside it
  `.table-scroll` takes `mx-0 px-0`, because its phone-width bleed (`-mx-4 px-4`)
  is clipped by the panel and reads to the render check as the table escaping.
  Headings are `.th` with `normal-case tracking-normal text-ink-700` — sentence
  case, like every other caption in the new look. Cells scrolled out of view
  still show in the check's "escaped" list; confirm the page itself does not
  scroll sideways and look at the table scrolled to its end.
- **A free-text note is a line under the row's description, not a column of
  its own** — the way Banking and Lubricants already carried theirs. A note
  column is whatever the figure columns (which never wrap) leave behind: on
  Stock's history that was 112px, a note one word to a line in a row four times
  the height of the rest, and a table too wide for a tablet held upright. Under
  the description it is `block whitespace-normal text-sm` with a `Note:` lead,
  capped at `max-w-[48ch]` so a long one wraps at a readable measure instead of
  widening its column, and `[overflow-wrap:anywhere]` so one long unbroken
  string cannot. Expenses still has a Note column; it follows this when it
  moves over.

- **Purchases** - `app/_components/admin/purchases/PurchasesView.js`. A
  `TitleHeader` carrying the three record buttons, the amount still owed to
  suppliers as a `Notice` (amber: money owed), and the table in a panel. **Seven
  columns, not eight: the rate is a line under its cost** ("Rs 283.45 / L"). With
  a Rate column of its own, the item and the supplier shared about 360px at
  1152, which wrapped supplier names three lines deep and broke invoice numbers
  in half, the squeeze `CHANGELOG.md` -> "Purchases page" records rejecting
  before. Measured: fits at 1600, at 1366 beside a pinned sidebar, and at 1152;
  scrolls inside its panel at 1024, the trade-off that entry settled on.
- **Inside a form, four shared boxes** (end of `globals.css`): `.callout` for a
  hint, `.callout-warn` for "can be saved, look first", `.callout-danger` for
  "will be refused", and `.figure-box` for a figure the form worked out from
  what was typed. The hints are 14px where most were 12px. `.figure-box` is
  where the black running-total boxes went: white on near-black under a 12px
  grey uppercase caption was the hardest text in the app to read.
- **A hidden column heading is a hidden span in a real cell**:
  `<th className="th"><span className="sr-only">Actions</span></th>`, never
  `<th className="th sr-only">`. `sr-only` on the cell takes it out of the
  table's layout, so the heading band stopped short of the column under it and
  the render check reported that column's buttons escaping the card.
- **Product names in a table go through `nonBreakingHyphens()`**
  (`format-helpers.js`), which swaps a hyphen between two letters or digits for
  U+2011, so "20W-50" cannot end one line at "20W-" and start the next with
  "50". Display only; never for text that is saved.

- **Lubricants** - `app/_components/admin/lubricants/LubricantsView.js`. A
  dated page, so `DayHeader`, with Manage lubricants and both sale buttons as
  one group in its control row (they wrap together, under the date controls,
  on a phone). The day as four `KpiCard`s, the day's sales and the shelf under
  `SectionHeader`s, and the packed/loose filter as the Dashboard's `.seg`
  control. "Oil sold today" became "Oil sold": the header states the day, and
  on yesterday's page "today" was untrue. The drum's "loose" mark is a neutral
  badge where it was amber, which means a warning or money owed here. The shelf
  says Low and Out of stock the Stock page's way.
- **An empty value is a real zero or a word, never a dash.** Zero credit is
  `Rs 0` set quiet (`text-ink-600`, normal weight) so the credit figures stand
  out; a sale with no customer says "Cash sale"; a drum's pack size says "By the
  rupee"; a missing rate says "Not set". The owner asked for no em dashes on any
  page, and a dash in a cell was always the least readable way to say any of
  these.
- **An MUI button that is the first child of a `space-y-*` stack goes in a
  `<div>`.** MUI sets `margin: 0` on the button, which outranks Tailwind's
  zero-specificity `space-y` rule, so the gap under it vanishes.

- **Customers** - `app/_components/admin/customers/CustomersView.js` (the
  list) and `CustomerView.js` (one account). The list keeps the table's own
  header bar with search and New customer, and its ruling in both directions,
  both at the owner's request. A customer's page puts "Back to customers" in
  `TitleHeader`'s `back` link, the balance and the fuel taken in two panels of
  one height (the balance's tiles at its foot, the fuel bands filling theirs),
  and the ledger under a `SectionHeader`. A ledger leaves the
  unused Debit or Credit cell **blank**, the way the book does; the badges read
  Auto, Cancelled and Correction; struck-through rows are faded to ink-600, not
  below it.
- **Never an `sr-only` label in a table's body cell.** `sr-only` is
  `position: absolute`; a `<td>` is not positioned, so the label's containing
  block is the page, not the table's scroller, and it escaped the scroller and
  widened the whole page by 17px on a phone (a missing phone number, Customers).
  Header cells are safe, because `.table-scroll` makes them sticky, which
  positions them. In a body cell, leave it empty, or put words in it.
- **A figure's box is as wide as the figure.** The credit limit sat in a fixed
  `w-24`, which clipped "Rs 1,000,000" at every width; it is `w-fit min-w-24`
  now. A fixed width on anything holding money is a clip waiting for a bigger
  number.
- **`<DownloadNotice>` takes a `className`** and carries no margin of its own:
  it sits under a page header in one place and at the top of a card in another.

- **Banking** - `app/_components/admin/banking/BankingView.js`. The three
  totals as `KpiCard`s (an overdrawn total says so in the card's red pill), each
  account a panel with Paid in and Paid out as two tiles carrying an arrow as
  well as green and amber, and the transaction form standing open beside the
  table **only from 80rem of section**: the owner's 1600px laptop has that with
  the sidebar pinned or not, and the table gets about 950px. Below it the form
  stacks above the table (capped at 36rem), because beside it at 1366 with a
  pinned sidebar the table got 720px and a note ran eleven lines deep. An
  account's name and number wrap, never truncate: a number cut short is a
  different number. `IconButton` corners are 12px, and the account's delete is
  the trash button every other delete uses (it was the word "Delete" at 12px in
  ink-500).
  **The main account** (migration 065) wears a "Main account" badge, a tick and
  the words, at the foot of its card, in the slot where every other account
  offers "Make this the main account" (it sat under the name at first, and put
  that card's balance out of line with its neighbour's). The money in / money
  out form starts on the main one, and on the first account added when none is
  marked (as before the migration).

- **Suppliers** — `app/_components/admin/suppliers/` (`SuppliersView`, `SupplierView`,
  `SupplierLedgerTable`, `SupplierForm`, `SupplierPaymentForm`,
  `SupplierEntryForm`, `SupplierButtons`, `SupplierSelect`). Built in the new
  look from the start (067), as the customer pages turned round: a `TitleHeader`
  (with `back` on one supplier), `KpiCard`s for payable, suppliers on the list
  and paid to date, then the list or the ledger in a panel at full width. A
  balance is always said with its side, **Payable** or **Advance**, never with a
  minus sign. On one supplier the only primary button is **Record a payment**,
  because paying is why the owner opens the page; a discount or adjustment is
  secondary. A cancelled entry stays in the ledger, struck through, with the word
  "Cancelled", and keeps its place in the running balance, which comes from
  Postgres. Cancelling a payment says in its confirmation that the money goes back
  to the safe or the bank it came from. Staff never open these pages; they only
  see the names, in `SupplierSelect` on both purchase forms.
- **Treasury** - `app/_components/admin/treasury/TreasuryView.js`. Four
  `KpiCard`s (the safe's balance with its sparkline), "Day by day" under a
  `SectionHeader` carrying `TrendWindow` (the new-look window control, in place
  of `TrendRange`), and the day's sheet under a `SectionHeader` whose title is
  the day. The pinned balance column is unchanged, down to its measured 11rem
  (no `pr-5` on it: the padding would come out of the balance beside its delete
  button); its heading cell now wears the heading row's grey instead of
  breaking the band in white. The day's four figures stack one per row below
  22rem of section, where two across clipped "Rs 2,151,910".
- **Charts share one frame**: `TrendCharts.js` exports `ChartHeader` (title and
  the legend in words), `Tip` (the tooltip naming the weekday), `EmptyChart`,
  `tickDay` ("26 Sep") and the `TICK` / `GRID` / `AXIS` / `CURSOR` constants,
  and `TreasuryBalanceChart` is drawn with them. A new chart imports these
  rather than restating them. When screenshotting a chart, wait out its
  draw-in animation (about 1.5s): a line caught mid-animation looks like a line
  that stops.
- **`CategoryBreakdown`** is a `.panel` with no margin of its own, rows at 16px,
  and a row that wraps its figure onto a line of its own when not even one word
  of the category fits beside it (320px).

- **Expenses** - `app/_components/admin/expenses/ExpensesView.js`. The month
  picker and both record buttons in `TitleHeader`; three `KpiCard`s; the month
  under a `SectionHeader` with the breakdown beside the table from 64rem of
  section. The Note column became a line under the category, as the rule above
  says. **A `KpiCard` label is short and the period goes in the line under the
  figure**: the label never wraps (it is what keeps a row of cards one height),
  and "Recovered in September 2026" ran out of its card on a phone. And a native
  month or date box in a row that wraps takes `w-auto`: `.input` is full width,
  and in a wrapping row that pushed the button beside it onto its own line.
- **The render check lists `CategoryBreakdown`'s bars as escaping their card.**
  MUI's `LinearProgress` draws a full-width bar and slides it sideways inside a
  clipped track, so its box is outside the panel while nothing is visible there.
  A false positive; the bars stay MUI's, for the reason that component gives.

- **Assets** - `app/_components/admin/company-assets/CompanyAssetsView.js`.
  The category hues are unchanged (this is still the one page a decorative hue
  is allowed); each asset is a `.panel`, the cards in a row keep one height with
  "Bought for" pinned to the bottom, and "Biggest holding" wears its category's
  hue through `KpiCard`'s new `tileClass`, which overrides the tone's tile for a
  card whose colour is a category's rather than a kind of figure's. An empty
  holding says "None yet", not a dash.

- **Reports** - `app/_components/admin/reports/ReportsView.js`. The month box,
  the register and the Excel download in `TitleHeader`; the month as four
  `KpiCard`s and "How profit is worked out" as an info `Notice` (the working,
  not a warning), then Cash taken, Given on credit and Owed to suppliers as
  three more; Lubricants, Closing stock and Day by day under `SectionHeader`s.
  The day-by-day charts are the Dashboard's own `FuelSalesChart` and
  `CashAgainstCreditChart`, so `SalesTrendChart` and `CashCreditChart` have no
  caller left. A tank with no dip in the month says "No dip"; a lubricant not
  restocked says "None".
- **Daily sales** - `DailySalesView.js` beside it, with Reports as the header's
  back link. `DailySalesTable` takes `framed` for its own panel (20px edges) and
  sits bare inside the Reports dialog. Its cells are 10px either side, not 12:
  with the panel's edges and the usual padding it needed 892px of the 878 a
  pinned sidebar leaves at 1152.
- **Sale & stock register** - `RegisterView.js`, with Reports (and its month)
  as the back link and `RegisterRange` in the header as the app's own inputs,
  labelled over each box. The fuel cards are the Dashboard's fuel card cut to
  two questions: what was sold, and, in its grey foot, what the dips found (a
  run of days with no dip says so, where it used to print "0 L"). The four
  money cards are `KpiCard`s with their comparisons and sparklines;
  `RegisterSummary.js` and its `MoneyTile` are gone, the decision their own
  note deferred until the page graduated. Each tank's table sits in a panel
  under its fuel's quiet band. See "A table too wide to read" above for the
  pinning.
- **An HTML entity in a run of JSX text can eat the space before it.** "the
  stock **sold**over these days": the compiler trimmed the space after
  `</span>` because the same text node held `&rsquo;` further on. Type the
  character itself (’), or put an explicit `{' '}` after the tag, and check the
  server HTML for a tag followed directly by a letter.

- **Activity** - `app/_components/admin/activity/ActivityView.js`. Clear old
  entries in `TitleHeader`; the trail under a `SectionHeader` whose title is
  whose entries these are, with the person filter as the Dashboard's `.seg`
  control. A person's name may wrap inside its choice (`whitespace-normal` on
  that control only): `.seg-item` never wraps, and a full name was wider than a
  320px phone. The log is a `.panel` with sentence-case headings and 20px
  edges; the action badge reads Created, Changed, Deleted.
- **Text the database wrote goes through `withoutDashes()`**
  (`format-helpers.js`). The activity trigger stores a spaced em dash between a
  name and its figure, and one refusal message carries one, so they are cleaned where
  they are read: the activity sentences with the app's middle dot, every
  action result (`ok()` / `fail()` in `actions.js`) and the two download
  errors that arrive in the URL with a colon. Rewriting the SQL would have
  left every stored line as it was.
- **A timestamp's date is `formatDate`'s**: `formatDateTime` takes only the
  time of day from Intl. en-GB's short month is "Sept" in current ICU, so the
  log read "25 Sept 2026" beside every other date's "25 Sep", and ran out of
  its 12rem column.
- **`<Pager>` is 16px**, the body size, now that every table it sits under is
  on a new-look page.

- **Settings** - `app/_components/admin/settings/SettingsView.js`, and
  `FuelPricesView.js` for All fuel rates (Settings as its back link). Nozzle
  wiring in `TitleHeader`; Fuel prices, Tanks, Dispensing units, Backup and
  (while testing) the reset under `SectionHeader`s. The rate cards keep the
  loud `solid` fill, as a `.panel`, with their words in sentence case; the
  figure steps 30, 36 and 48px by the card's own width, because at 48px from
  16rem it ran out of a 360px phone's card. A tank is the Dashboard's tank
  card: the quiet band with Edit in it, `TankGauge`, and the last dip in a grey
  foot. A unit wears its fuel's quiet band, not the loud one: it is only read
  here.
- **A table inside a dialog sits in a bordered box**
  (`overflow-hidden rounded-2xl border border-ink-200`), not a `.panel`: the
  dialog is already the surface, and a second shadow reads as a card on a card.
- **An input in a table's body cell is named with `aria-label`**, never an
  `sr-only` `<label>` beside it, for the reason in "Never an sr-only label in a
  table's body cell" above. The nozzle wiring and replace-unit tables had one
  per input.
- **`ConfirmAction`** (every delete) now pads 20px like the other dialogs,
  rules off its buttons, and shows a refusal in a rounded red box with a border.

- **Your account** - `app/_components/admin/account/AccountView.js`. Add login
  in `TitleHeader`; "You" and "Staff logins" under `SectionHeader`s, side by
  side from 64rem of page. A login's Active / Disabled switch is a pill again:
  it had been a `SubmitButton`, whose Material UI fill painted both states solid
  green, so a login that could not sign in looked like the good state. **A
  status pill that submits a form is a native `<button>` with
  `useFormStatus`, never `SubmitButton`.** The delete is the trash
  `IconButton`. An email may break only after its "@" (`<wbr>`), and the
  closed password form is `inert`, so Tab no longer walks into boxes nobody
  can see.
- **Guide** - `app/_components/admin/guide/GuideView.js`, in English and Urdu.
  The language switch stays above the title, at the end of its row in both
  languages; every section is a `SectionHeader`; the setup is still a native
  `<details>`, now a panel. **The shared pieces had to be right-to-left safe**:
  `TitleHeader` indents its description with `ps-16`, not `pl-16`, and the
  roles table uses `ps-` / `pe-` / `text-start`. A "no" in the roles table is
  a cross (a different shape from the tick, and no word to translate) where it
  was a dash. In the guide's Urdu text a single em dash became the Urdu comma
  (،) and a pair around an aside became brackets, which the bidi algorithm
  mirrors for right-to-left.

- **`CategoryBreakdown` takes negative rows.** Expenses nets a recovery into its
  category, so a category is negative whenever more came back under it than
  went out that month. On this pump that is the usual case: the owner types
  each repayment under a name of its own ("Electricity bill recovery from Tyre
  shop"), and a bill repaid a month after it was paid leaves that month's
  category holding only the repayment. Such a row is listed apart, under
  "Recovered this month", biggest first, in green with the arrow in and the
  word "back", and no bar. `total` is the base of the shares: pass the sum of
  the rows that cost money, never a net figure, or the shares add up to more
  than 100%.
- **A caption over part of a list names the list; it does not compare.** The
  recovered rows first sat under "More came back than was spent this month",
  meant of each row and read, as a heading is, as a claim about the month. The
  owner's September had spent more than ten times what it recovered, and the
  caption said the opposite. A sentence that is true of every row and false of
  the page is false where it will be read. Name the list with the word already
  on the button and the card ("Recovered").

### Building a page in it

1. Split the page into the fetch (`page.js`: the role check and the queries)
   and a view component, so it can be rendered from fixtures in a disposable
   `app/devcheck` route. Every page is built this way now.
2. `TitleHeader` or `DayHeader` at the top; each zone under a `SectionHeader`
   in a `section.@container`; figures as `KpiCard`s in a `KpiGrid`; blocks as
   `.panel` (+ `data-card`); a table as `panel overflow-hidden` around
   `table-scroll mx-0 px-0`, with `pl-5` / `pr-5` on its end cells; hints in a
   form as `.callout`s; a page message as a `Notice`.
3. No em dash in any string, and no dash standing in for an empty value: a
   real zero or a word.
4. Render it with real-length fixtures at 1600, 1366, 1152, 1024, 768, 400, 360
   and 320, run `render-check.mjs`, measure any table at 1600, 1366 and 1152
   with and without the pinned sidebar, open every dialog, and look at the
   screenshots.

## A ledger the other way round says so in its column names

The supplier account (067) is the customer ledger turned round: there the
customer owes the pump, here the pump owes the supplier. "Debit" and "credit"
would point opposite ways on two pages the owner reads in one sitting, so the
supplier table names its columns the way a supplier statement does:
**Purchases** (the pump owes more), **Payments & credits** (it owes less: a
payment, a discount, an adjustment the pump's way), **Balance**. Every balance
carries its side in a word after the figure (`OwedFigure`): **Payable** in red
when the pump owes, **Advance** in green when it has paid ahead, **Settled** at
zero; never a minus in front of "Rs". The account page's balance card is titled
the same way ("Payable to supplier" / "Advance with supplier"), and the list's
KPI is "Payable to suppliers". The first wording (Bill / Paid or taken off /
Owed after / "in your favour") read as unclear to the owner and was replaced
on 29 Sep 2026.

The supplier forms carry the register's Urdu word beside each choice, as the
customer forms do (`BalanceDirection`'s `urdu`): **نقد** for cash from the
safe, **بینک** for a bank transfer, and on an adjustment **جمع** for "owes the
supplier more" and **بنام** for "owes the supplier less". Those last two are
turned round from the customer forms on purpose: in a supplier's khata what
they supplied is جمع and what was paid them is بنام, the way the owner's
father writes his register.

Two smaller rules from building it:

- **A figure inside a native `<select>` option gets cut off on a phone**,
  with no ellipsis to say so ("holds Rs 1,740,"). Keep the option to the name
  and show the chosen row's figure on a line under the select.
- **A reversible, rare action is a text button, not ConfirmAction's red
  icon.** Retiring a supplier was a red cross on each row of the list, which
  reads as "delete". It is a button in words at the foot of the supplier's own
  page. ConfirmAction's red icon stays for what really removes or cancels.



## A vehicle is a violet badge with its number (Al Hakeem, 801)

Where a ledger row, a statement row or an oil sale says which vehicle on an
account took it, the number goes in a `badge bg-violet-100 text-violet-800`
beside the fuel badge, in semibold. Violet because no fuel, no status and no
money direction uses it, so it never reads as one of those; the number itself
is the information, so it still reads in grey on a photocopy. A fleet in a
list is counted ("5 vehicles"), never listed. The pickers live in
`VehiclePicker.js` (`VehicleSelect`, `VehicleFinder`, `customerLabel`); use
them rather than a new select on any new credit form.


## A register choice is filled in its own colour (Salaries, 802)

`AttendanceRegister` uses the `.seg` track, but the chosen item is filled by
meaning: Present `bg-brand-700`, Half day `bg-amber-700`, Absent `bg-red-700`,
white text, the word always on it. A list of thirty people is checked for the
red ones at a glance; `.seg-item-active`'s single green would make an absent
day look like the good choice. Use it only where the choices are statuses
with a good and a bad end, not for a view switch.

**A table's action shares a cell with its figure** when the row ends in one
(Earned and Pay on Salaries): as separate columns the action is the first
thing to scroll off a laptop with the sidebar open.
