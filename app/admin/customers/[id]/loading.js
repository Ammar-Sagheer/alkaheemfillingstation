/* A customer's page while it loads, in the new look's shapes: the title
   panel, the two summary panels side by side, and the ledger. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-40 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid gap-5 @[56rem]:grid-cols-2">
          <div className="h-60 rounded-3xl bg-ink-200" />
          <div className="h-60 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="mt-12 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-56 rounded bg-ink-200" />
      </div>
      <div className="mt-4 h-80 rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading the customer…</span>
    </div>
  );
}
