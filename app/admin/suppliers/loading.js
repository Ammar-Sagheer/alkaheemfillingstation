/* The Suppliers loading state, in the new look's shapes: the title panel, the
   three headline cards and the table's panel. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-3">
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
          <div className="h-40 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="mt-5 h-96 rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading suppliers…</span>
    </div>
  );
}
