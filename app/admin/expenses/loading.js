/* The Expenses loading state, in the new look's shapes: the title panel, the
   three headline cards, and the breakdown beside the month's table. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[56rem]:grid-cols-3">
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="@container mt-12">
        <div className="grid items-start gap-5 @[64rem]:grid-cols-[22rem_1fr]">
          <div className="h-80 rounded-3xl bg-ink-200" />
          <div className="h-96 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <span className="sr-only">Loading expenses…</span>
    </div>
  );
}
