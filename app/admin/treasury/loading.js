/* The Treasury loading state, in the new look's shapes: the title panel, the
   four headline cards, the chart's panel and the day's table. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <div className="h-52 rounded-3xl bg-ink-200" />
          <div className="h-52 rounded-3xl bg-ink-200" />
          <div className="h-52 rounded-3xl bg-ink-200" />
          <div className="h-52 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="mt-12 h-96 rounded-3xl bg-ink-200" />
      <div className="mt-12 h-80 rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading the treasury…</span>
    </div>
  );
}
