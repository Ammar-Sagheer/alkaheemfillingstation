/* The Settings loading state, in the new look's shapes: the title panel, then
   the rate cards and the tank cards under their headings. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="mt-10 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-40 rounded bg-ink-200" />
      </div>
      <div className="@container mt-4">
        <div className="grid gap-5 @[40rem]:grid-cols-2">
          <div className="h-36 rounded-3xl bg-ink-200" />
          <div className="h-36 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="mt-12 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-28 rounded bg-ink-200" />
      </div>
      <div className="@container mt-4">
        <div className="grid gap-5 @[40rem]:grid-cols-2">
          <div className="h-64 rounded-3xl bg-ink-200" />
          <div className="h-64 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <span className="sr-only">Loading settings…</span>
    </div>
  );
}
