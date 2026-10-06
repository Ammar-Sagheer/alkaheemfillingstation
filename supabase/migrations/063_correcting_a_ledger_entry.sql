-- =============================================================================
-- 063_correcting_a_ledger_entry.sql
--
-- An "edit" button for the customer ledger, in a ledger that cannot be edited.
--
-- THE RULE THIS HAS TO LIVE INSIDE. `ledger_entries` is append-only and always
-- has been: two triggers refuse UPDATE and DELETE outright (002), and RLS grants
-- select and insert and nothing else (003). That is not caution, it is the point
-- of the table - a customer's balance is the sum of rows nobody can quietly
-- reach back and change, which is the whole reason the owner can trust it
-- against a paper khata that anyone could have rubbed out.
--
-- So the button cannot edit. What the owner actually means when he says "I
-- typed 6,000 and he paid 600" is: cancel what I wrote, and put the right thing
-- in its place. That is two new rows, and the page has said so in words since
-- the beginning - "a mistake is corrected with a new entry pointing the other
-- way, so the history always adds up". This migration is that sentence made
-- into a button.
--
-- WHAT A CORRECTION IS, EXACTLY.
--
--   * a REVERSAL - same amount, same date, opposite direction - which cancels
--     the wrong row where it stands, so every balance from that date onward is
--     right again rather than only the balance today;
--   * and, unless the entry should never have existed at all, a REPLACEMENT
--     carrying what it should have said.
--
-- Both in one statement. Half a correction is worse than none: a reversal
-- without its replacement silently wipes a real payment, and a replacement
-- without its reversal doubles it. Neither is visible on any screen afterwards.
--
-- WHY A COLUMN AND NOT JUST TWO MORE ROWS. Without `corrects_entry_id` the
-- ledger grows three rows of the same amount and nothing says which cancels
-- which. The owner reading down the page cannot tell a real payment from a
-- reversed one, which is a worse account than he had before the button existed.
-- The column lets the table strike the row that was cancelled, mark the row
-- that cancelled it, and refuse to cancel the same row twice.
--
-- WHAT CANNOT BE CORRECTED HERE, AND WHY.
--
--   * A row posted automatically from a sale - `credit_sale_id` (a nozzle
--     reading) or `lubricant_sale_id` (a counter sale of oil). The mistake is in
--     the SALE - the litres, the rate, the customer - and cancelling only its
--     ledger side would leave the sale and the ledger disagreeing about the same
--     money forever. 016 already reverses the slip when the reading is deleted,
--     so the sale is where that is fixed, and the error says which screen.
--   * A reversal. It exists only to cancel something else and has no meaning of
--     its own; if the correction was wrong, the REPLACEMENT is the row to
--     correct, and it is an ordinary entry.
--   * A row already corrected. One cancellation per entry, enforced by a unique
--     index rather than by the function, so it holds however the row is written.
--
-- OWNER ONLY. Recording a payment is a data-entry job; deciding that something
-- already in the books was wrong is not. This matches `recordLedgerAdjustment`,
-- which is owner-only for the same reason.
-- =============================================================================

alter table public.ledger_entries
  add column if not exists corrects_entry_id uuid references public.ledger_entries(id);

comment on column public.ledger_entries.corrects_entry_id is
  'Set on a reversal row: the entry it cancels. Null on every ordinary entry. The ledger stays append-only - this records WHY a row is there, it does not permit editing the row it points at.';

-- One cancellation per entry. Without this, two reversals of the same row would
-- both post and take the balance the wrong way by the amount twice.
create unique index if not exists ledger_entries_one_correction_per_entry
  on public.ledger_entries (corrects_entry_id)
  where corrects_entry_id is not null;

alter table public.ledger_entries drop constraint if exists ledger_entries_no_self_correction;
alter table public.ledger_entries
  add constraint ledger_entries_no_self_correction
  check (corrects_entry_id is null or corrects_entry_id <> id);

-- ---------------------------------------------------------------------------
-- The correction itself.
--
-- One function, because the reversal and the replacement have to arrive
-- together or not at all - see above. It returns what it wrote so the action
-- can say "Rs 6,000 cancelled, Rs 600 recorded" rather than "Saved".
--
-- p_amount / p_entry_date / p_note describe the REPLACEMENT. p_remove says the
-- entry should not exist at all, and then the three are ignored.
-- ---------------------------------------------------------------------------
create or replace function public.correct_ledger_entry(
  p_entry_id   uuid,
  p_remove     boolean default false,
  p_amount     numeric default null,
  p_entry_date date    default null,
  p_note       text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old        public.ledger_entries;
  v_reversal   uuid;
  v_replacement uuid;
  v_amount     numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may correct a ledger entry' using errcode = '42501';
  end if;

  select * into v_old from public.ledger_entries where id = p_entry_id;

  if v_old.id is null then
    raise exception 'That entry is no longer on the ledger.' using errcode = '23503';
  end if;

  if v_old.credit_sale_id is not null or v_old.lubricant_sale_id is not null then
    raise exception
      'This entry was posted automatically from a %, so it cannot be corrected here - the sale '
      'and the ledger have to keep saying the same thing about the same money. Correct the sale '
      'itself and the slip follows it.',
      case when v_old.credit_sale_id is not null then 'nozzle reading' else 'lubricant sale' end
      using errcode = '23514';
  end if;

  if v_old.corrects_entry_id is not null then
    raise exception
      'This row was posted to cancel an earlier entry, so there is nothing in it to correct. If '
      'the correction itself was wrong, correct the replacement entry instead.'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.ledger_entries where corrects_entry_id = p_entry_id) then
    raise exception
      'This entry has already been cancelled once. Correct the entry that replaced it instead.'
      using errcode = '23505';
  end if;

  if not p_remove then
    if p_amount is null or round(p_amount) <= 0 then
      raise exception 'Enter what the entry should have been, in whole rupees above zero.'
        using errcode = '23514';
    end if;
    if p_entry_date is null then
      raise exception 'Enter the date the entry should carry.' using errcode = '23514';
    end if;
  end if;

  -- THE REVERSAL. Same amount, same date, opposite direction - so the balance
  -- is right on every day from the mistake onward, not merely today.
  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by, corrects_entry_id)
  values (
    v_old.customer_id,
    (case when v_old.entry_type = 'debit' then 'credit' else 'debit' end)::public.ledger_entry_type,
    v_old.amount,
    v_old.entry_date,
    'Cancels: ' || coalesce(nullif(btrim(v_old.note), ''),
                            case when v_old.entry_type = 'debit' then 'an entry' else 'a payment' end),
    auth.uid(),
    v_old.id
  )
  returning id into v_reversal;

  if not p_remove then
    v_amount := round(p_amount);

    insert into public.ledger_entries
      (customer_id, entry_type, amount, entry_date, note, created_by)
    values (
      v_old.customer_id,
      v_old.entry_type,
      v_amount,
      p_entry_date,
      coalesce(nullif(btrim(p_note), ''), v_old.note),
      auth.uid()
    )
    returning id into v_replacement;
  end if;

  return jsonb_build_object(
    'customer_id',    v_old.customer_id,
    'entry_type',     v_old.entry_type,
    'was_amount',     v_old.amount,
    'now_amount',     v_amount,
    'removed',        p_remove,
    'reversal_id',    v_reversal,
    'replacement_id', v_replacement
  );
end;
$$;

comment on function public.correct_ledger_entry(uuid, boolean, numeric, date, text) is
  'Cancels a hand-entered ledger row and, unless removing it, posts what it should have said - both in one statement. Owner only. The ledger stays append-only.';

revoke execute on function public.correct_ledger_entry(uuid, boolean, numeric, date, text) from public, anon;
grant  execute on function public.correct_ledger_entry(uuid, boolean, numeric, date, text) to authenticated;
