/* The Lubricants loading state, in the new look's shapes: the day header, the
   four headline cards and the sales table's panel, so the page lands where the
   skeleton already was. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-28 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="mt-12 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-56 rounded bg-ink-200" />
      </div>
      <div className="mt-4 h-72 rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading the day’s lubricant sales…</span>
    </div>
  );
}
