/* The Stock loading state, in the new look's shapes: the day header, a
   section heading, and the two dip cards - so the page lands where the
   skeleton already was. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-28 rounded-3xl bg-ink-200" />
      <div className="mt-10 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-64 rounded bg-ink-200" />
      </div>
      <div className="@container mt-4">
        <div className="grid gap-5 @[50rem]:grid-cols-2">
          <div className="h-[34rem] rounded-3xl bg-ink-200" />
          <div className="h-[34rem] rounded-3xl bg-ink-200" />
        </div>
      </div>
      <span className="sr-only">Loading the stock…</span>
    </div>
  );
}
