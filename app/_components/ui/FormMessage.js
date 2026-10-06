/**
 * The success or failure line under a form.
 *
 * Server Actions all return { ok, message }, so this renders that shape
 * directly. Announced politely to screen readers rather than assertively -
 * these appear after a deliberate save, not out of nowhere.
 */
export default function FormMessage({ state }) {
  if (!state?.message) return null;

  const isError = state.ok === false;

  return (
    <p
      role="status"
      aria-live="polite"
      className={[
        'rounded-lg px-3 py-2 text-sm font-medium',
        isError
          ? 'border border-red-200 bg-red-50 text-red-800'
          : 'border border-brand-200 bg-brand-50 text-brand-800',
      ].join(' ')}
    >
      {state.message}
    </p>
  );
}
