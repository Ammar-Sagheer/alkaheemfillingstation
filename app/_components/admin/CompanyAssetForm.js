'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createCompanyAsset, updateCompanyAsset } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import NumberInput from '@/app/_components/ui/NumberInput';
import Icon from '@/app/_components/ui/Icon';
import { todayISO } from '@/app/_lib/date-helpers';
import { ASSET_CATEGORIES } from '@/app/_lib/asset-categories';
import Button from '@/app/_components/ui/Button';

/**
 * Adding and correcting a company asset, in one file with two triggers.
 *
 * Same split as `RemoveCustomerButton.js`: one add dialog and one edit dialog,
 * sharing the fields between them, because they are the same four questions
 * asked at two different moments rather than two different forms. `AssetForm`
 * below is the shared body; `AddAssetButton` and `EditAssetButton` are the two
 * ways into it.
 *
 * A DIALOG, NOT A PAGE OF ITS OWN - same reasoning as `BankAccountForm`. An
 * asset is added a handful of times a year; a permanent form standing open on
 * the page would outweigh the list it is meant to add to.
 *
 * The category list itself lives in `asset-categories.js`, not here - see
 * that file for why a plain array cannot be exported from a 'use client'
 * module for a server component to read.
 */

/**
 * Five tiles rather than a `<select>`.
 *
 * A dropdown of five words is fine to read and slow to scan; a picture per
 * category is answered at a glance, which matters here because the category is
 * the one field with no natural default someone is likely to get right without
 * thinking about it. `@container` on the wrapper rather than a viewport
 * breakpoint, because this sits inside a dialog whose width is fixed and has
 * nothing to do with the window - three columns on a phone's full-screen
 * sheet, five once there is room, judged by the picker's own width.
 */
function CategoryPicker({ value, onChange }) {
  return (
    <div className="@container">
      <div
        role="radiogroup"
        aria-label="Category"
        className="grid grid-cols-3 gap-2 @[26rem]:grid-cols-5"
      >
        {ASSET_CATEGORIES.map((category) => {
          const active = value === category.value;
          return (
            <button
              key={category.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(category.value)}
              className={[
                'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition',
                active ? 'border-brand-600 bg-brand-50' : 'border-ink-300 bg-white hover:bg-ink-50',
              ].join(' ')}
            >
              <Icon
                name={category.icon}
                className={`h-6 w-6 ${active ? 'text-brand-700' : 'text-ink-600'}`}
              />
              <span
                className={`text-sm font-semibold ${active ? 'text-brand-900' : 'text-ink-700'}`}
              >
                {category.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The four questions, shared by both dialogs. `asset` is undefined when adding. */
function AssetFields({ asset, category, setCategory }) {
  const today = todayISO();

  return (
    <>
      <div>
        <label className="label" htmlFor="asset_name">
          What was bought
        </label>
        <input
          id="asset_name"
          name="name"
          type="text"
          required
          autoFocus
          defaultValue={asset?.name ?? ''}
          className="input"
          placeholder="e.g. Honda CG 125, delivery bike"
        />
      </div>

      <div>
        <span className="label">Category</span>
        <CategoryPicker value={category} onChange={setCategory} />
        <input type="hidden" name="category" value={category} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="asset_value">
            What it cost
          </label>
          <NumberInput
            id="asset_value"
            name="purchase_value"
            step="0.01"
            min="0.01"
            required
            defaultValue={asset?.purchase_value ?? ''}
            className="input-number"
            placeholder="0"
          />
        </div>

        <div>
          <label className="label" htmlFor="asset_date">
            Date bought
          </label>
          <input
            id="asset_date"
            name="purchase_date"
            type="date"
            required
            defaultValue={asset?.purchase_date ?? today}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="asset_note">
          Note <span className="font-normal text-ink-600">(optional)</span>
        </label>
        <input
          id="asset_note"
          name="note"
          type="text"
          defaultValue={asset?.note ?? ''}
          className="input"
          placeholder="e.g. registration number, where it is kept"
        />
      </div>
    </>
  );
}

export function AddAssetButton() {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [category, setCategory] = useState('vehicle');

  const [state, formAction] = useActionState(createCompanyAsset, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setCategory('vehicle');
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
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Add an asset
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add a company asset"
        subtitle={
          <span className="text-sm text-ink-600">
            Something bought and kept, not sold: a vehicle, a generator, new machinery.
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <AssetFields category={category} setCategory={setCategory} />

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Adding…">
              Add asset
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

export function EditAssetButton({ asset }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [category, setCategory] = useState(asset.category ?? 'other');

  const [state, formAction] = useActionState(updateCompanyAsset, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShowResult(false);
          setCategory(asset.category ?? 'other');
          setIsOpen(true);
        }}
        aria-label={`Edit ${asset.name}`}
        className="text-sm font-semibold text-ink-600 hover:text-ink-900 hover:underline"
      >
        Edit
      </button>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Edit this asset">
        <form
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="asset_id" value={asset.id} />

          <AssetFields asset={asset} category={category} setCategory={setCategory} />

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Saving…">
              Save changes
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
