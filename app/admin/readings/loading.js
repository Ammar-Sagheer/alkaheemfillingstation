/* The Readings loading state, in the new look's shapes: the day header, the
   four figure cards, and three unit panels - so the page lands where the
   skeleton already was. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-28 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 rounded-3xl bg-ink-200" />
          ))}
        </div>
      </div>
      <div className="mt-10 space-y-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-64 rounded-3xl bg-ink-200" />
        ))}
      </div>
      <span className="sr-only">Loading the day’s readings…</span>
    </div>
  );
}
