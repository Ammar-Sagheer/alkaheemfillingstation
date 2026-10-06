'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  createLubricant,
  updateLubricant,
  deleteLubricant,
  setLubricantActive,
} from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import IconButton from '@/app/_components/ui/IconButton';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import FormMessage from '@/app/_components/ui/FormMessage';
import Dialog from '@/app/_components/ui/Dialog';
import NumberInput from '@/app/_components/ui/NumberInput';
import { todayISO } from '@/app/_lib/date-helpers';
import Button from '@/app/_components/ui/Button';

const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * The product list: adding a lubricant, changing one, and taking one off.
 *
 * Owner only, and behind a dialog, because it is configuration - which brands
 * the pump stocks - rather than something touched during a shift. It sits on
 * the Lubricants page all the same, next to the sales it governs, so a new
 * brand can be added the moment the first carton is sold rather than sending
 * someone to Settings mid-sale.
 *
 * TAKING ONE OFF has two meanings and the database picks between them (see
 * delete_lubricant in migration 024): a product never bought or sold is
 * deleted, one with history is retired. Retired products stay listed here,
 * greyed out, so bringing a brand back is one tap rather than retyping it.
 */
export default function LubricantManager({ lubricants }) {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null); // a product, or 'new', or null

  const active = lubricants.filter((row) => row.is_active);
  const retired = lubricants.filter((row) => !row.is_active);

  function close() {
    setIsOpen(false);
    setEditing(null);
  }

  return (
    <>
      <Button variant="secondary" type="button" onClick={() => setIsOpen(true)}>
        Manage lubricants
      </Button>

      <Dialog
        open={isOpen}
        onClose={close}
        title={
          editing === 'new'
            ? 'Add a lubricant'
            : editing
              ? `Edit ${editing.name}`
              : 'Lubricants on the shelf'
        }
        size="lg"
      >
        {editing ? (
          <ProductForm
            lubricant={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div className="space-y-4 p-5">
            {/* In a <div> of its own: MUI sets `margin: 0` on the button, which
                outranks the `space-y` gap, so on its own it sat flush against
                the list below. */}
            <div>
              <Button variant="primary" fullWidth type="button" onClick={() => setEditing('new')}>
                <span aria-hidden="true" className="text-base leading-none">
                  +
                </span>
                Add a lubricant
              </Button>
            </div>

            {active.length === 0 ? (
              <p className="rounded-2xl border border-ink-200 bg-ink-50 px-4 py-6 text-center text-base text-ink-700">
                No lubricants yet. Add the first one above and it can be sold and restocked from
                then on.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200">
                {active.map((row) => (
                  <ProductRow key={row.id} lubricant={row} onEdit={() => setEditing(row)} />
                ))}
              </ul>
            )}

            {retired.length > 0 ? (
              <div>
                <h3 className="mb-1 text-base font-bold text-ink-900">Retired</h3>
                <p className="mb-2 text-sm text-ink-600">
                  Not offered on the sale form any more. Their past sales and purchases still count
                  towards every month they appear in.
                </p>
                <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200">
                  {retired.map((row) => (
                    <ProductRow key={row.id} lubricant={row} retired />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Dialog>
    </>
  );
}

function ProductRow({ lubricant, retired = false, onEdit }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <p
          className={`flex flex-wrap items-center gap-2 text-base font-semibold ${
            retired ? 'text-ink-600' : 'text-ink-900'
          }`}
        >
          {lubricant.name}
          {/* Neutral, not amber: amber is the colour of a warning or of money
              owed, and "sold loose" is neither - it is a kind. */}
          {lubricant.sold_loose ? (
            <span className="badge bg-white text-ink-800 ring-1 ring-inset ring-ink-300">
              Loose
            </span>
          ) : null}
        </p>
        <p className="text-sm text-ink-600">
          {lubricant.sold_loose
            ? 'Sold by the rupee'
            : `${litreFormat.format(lubricant.pack_size_litres)} L pack`}
          {Number(lubricant.sale_rate_per_litre) > 0
            ? ` · Rs ${litreFormat.format(lubricant.sale_rate_per_litre)} a litre`
            : ''}
          {retired
            ? ''
            : ` · ${litreFormat.format(lubricant.current_stock_litres ?? 0)} L in stock`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {retired ? (
          <RestoreButton lubricantId={lubricant.id} />
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg px-1 text-sm font-semibold text-brand-700 hover:underline"
            >
              Edit
            </button>
            <RemoveButton lubricantId={lubricant.id} name={lubricant.name} />
          </>
        )}
      </div>
    </li>
  );
}

/** Add or edit, one form. `lubricant` is null when adding. */
function ProductForm({ lubricant, onDone }) {
  const isEdit = Boolean(lubricant);
  const [state, formAction] = useActionState(isEdit ? updateLubricant : createLubricant, null);

  /*
   * Which of the two kinds this is decides what the rest of the form asks for,
   * so it is a choice at the top rather than a checkbox buried among the
   * fields. A drum has no pack size worth typing and cannot do without a rate;
   * a carton is the other way round.
   */
  const [soldLoose, setSoldLoose] = useState(Boolean(lubricant?.sold_loose));

  // Leave the dialog on the list once it has saved, so the change can be seen.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4 p-5">
      {isEdit ? <input type="hidden" name="lubricant_id" value={lubricant.id} /> : null}
      <input type="hidden" name="sold_loose" value={soldLoose ? 'true' : 'false'} />

      <fieldset>
        <legend className="label">What kind of stock is this?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <KindChoice
            active={!soldLoose}
            onPick={() => setSoldLoose(false)}
            title="Sealed packs"
            detail="Cartons and bottles off the shelf. Sold by the litre."
          />
          <KindChoice
            active={soldLoose}
            onPick={() => setSoldLoose(true)}
            title="Loose oil"
            detail="A drum poured from. Sold by the rupee."
          />
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="lubricant_name">
          Name
        </label>
        <input
          id="lubricant_name"
          name="name"
          type="text"
          required
          defaultValue={lubricant?.name ?? ''}
          className="input"
          placeholder={soldLoose ? 'e.g. Loose oil' : 'e.g. Shell Helix HX5 20W-50'}
        />
        <p className="mt-1 text-sm text-ink-600">
          {soldLoose
            ? 'Loose oil has no brand on it, so a plain name is fine. If more than one drum is kept, name the grade, as in “Loose oil 20W-50”.'
            : 'Whatever is written on the carton: brand, grade and all. It is what staff will pick from when recording a sale.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* A drum is not sold in packs, so the field is not shown - but the
            column is NOT NULL and above zero, so a hidden 1 goes with it. */}
        {soldLoose ? (
          <input type="hidden" name="pack_size_litres" value="1" />
        ) : (
          <div>
            <label className="label" htmlFor="pack_size_litres">
              Pack size (litres)
            </label>
            <NumberInput
              id="pack_size_litres"
              name="pack_size_litres"
              step="0.01"
              min="0.01"
              required
              defaultValue={lubricant?.pack_size_litres ?? 4}
              className="input-number"
            />
            <p className="mt-1 text-sm text-ink-600">
              The usual carton: 4, 3 or 1. Only a shortcut on the sale form.
            </p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="sale_rate_per_litre">
            Selling rate a litre{' '}
            {soldLoose ? null : <span className="font-normal text-ink-600">(optional)</span>}
          </label>
          <NumberInput
            id="sale_rate_per_litre"
            name="sale_rate_per_litre"
            step="0.01"
            min="0.01"
            required={soldLoose}
            defaultValue={lubricant?.sale_rate_per_litre ?? ''}
            className="input-number"
            placeholder="0"
          />
          <p className="mt-1 text-sm text-ink-600">
            {soldLoose
              ? 'Required. This is what turns “Rs 20 of oil” into litres off the drum, so the drum’s level stays honest. Change it whenever the price changes.'
              : 'Used to fill in the amount when a sale is typed. It can always be changed on the sale itself.'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="opening_stock_litres">
            Stock on hand to begin with
          </label>
          <NumberInput
            id="opening_stock_litres"
            name="opening_stock_litres"
            step="0.01"
            min="0"
            required
            defaultValue={lubricant?.opening_stock_litres ?? 0}
            className="input-number"
          />
        </div>
        <div>
          <label className="label" htmlFor="opening_stock_date">
            Counting from
          </label>
          <input
            id="opening_stock_date"
            name="opening_stock_date"
            type="date"
            required
            defaultValue={lubricant?.opening_stock_date ?? todayISO()}
            className="input"
          />
        </div>
      </div>

      <p className="callout">
        Stock is worked out from this figure forward: opening stock, plus everything bought since,
        minus everything sold. Purchases and sales dated before that day are not counted.
        {soldLoose
          ? ' For a drum, what comes off is worked out from the rate above, so if the level on the dipstick drifts from the level here, the rate is the thing to check.'
          : ''}
      </p>

      <FormMessage state={state} />

      <div className="flex gap-2 border-t border-ink-200 pt-4">
        <SubmitButton className="flex-1" >
          {isEdit ? 'Save changes' : 'Add lubricant'}
        </SubmitButton>
        <Button variant="secondary" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * One of the two kinds of stock. A card rather than a radio dot: it is the
 * choice the rest of the form hangs off, and the second line is what tells the
 * owner which one his drum is without having to know the app's vocabulary.
 */
function KindChoice({ active, onPick, title, detail }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={[
        'rounded-xl border px-3.5 py-2.5 text-left transition',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-900'
          : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
      ].join(' ')}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className={`block text-sm ${active ? 'text-brand-800' : 'text-ink-600'}`}>
        {detail}
      </span>
    </button>
  );
}

function RemoveButton({ lubricantId, name }) {
  const [state, formAction] = useActionState(deleteLubricant, null);

  return (
    <ConfirmAction
      triggerLabel={`Take ${name} off the shelf`}
      title="Take this off the shelf?"
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ lubricant_id: lubricantId }}
    >
      <p>
        Take <span className="font-semibold text-ink-900">{name}</span> off the shelf?
      </p>
      <p className="text-ink-600">
        Sales already recorded against it stay on the books. It can be brought back from the removed
        list.
      </p>
    </ConfirmAction>
  );
}

function RestoreButton({ lubricantId }) {
  const [state, formAction] = useActionState(setLubricantActive, null);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="lubricant_id" value={lubricantId} />
      <input type="hidden" name="is_active" value="true" />
      {/* A small secondary button. It had link styles written on it and its
          variant left at the default, so MUI drew it as a filled green one
          - the same slip Sign out had. */}
      <SubmitButton variant="secondary" size="small" pendingLabel="Bringing back…">
        Bring back
      </SubmitButton>
      {state?.ok === false ? <span className="text-sm text-red-700">{state.message}</span> : null}
    </form>
  );
}
