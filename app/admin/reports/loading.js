/* The Reports loading state, in the new look's shapes: the title panel, the
   month's four headline cards, and the two charts. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="mt-10 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-48 rounded bg-ink-200" />
      </div>
      <div className="@container mt-4">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="@container mt-12">
        <div className="grid gap-5 @[56rem]:grid-cols-2">
          <div className="h-96 rounded-3xl bg-ink-200" />
          <div className="h-96 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <span className="sr-only">Loading the report…</span>
    </div>
  );
}
