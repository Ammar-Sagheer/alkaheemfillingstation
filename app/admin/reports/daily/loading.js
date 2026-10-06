/* Daily sales loading, in the new look's shapes: the title panel with its
   back link, then the table's panel. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-40 rounded-3xl bg-ink-200" />
      <div className="mt-5 h-[34rem] rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading the daily sales…</span>
    </div>
  );
}
