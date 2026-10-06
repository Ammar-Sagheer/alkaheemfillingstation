/* The Guide loading, in the new look's shapes: the language switch, the title
   panel, then the three stages. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 flex justify-end">
        <div className="h-11 w-40 rounded-xl bg-ink-200" />
      </div>
      <div className="h-40 rounded-3xl bg-ink-200" />
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <div className="h-32 rounded-3xl bg-ink-200" />
        <div className="h-32 rounded-3xl bg-ink-200" />
        <div className="h-32 rounded-3xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading the guide…</span>
    </div>
  );
}
