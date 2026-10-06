/*
 * The Dashboard's loading state, in the shape of the new look - the day
 * header, the four headline cards, and the two fuel cards - so the page lands
 * where the skeleton already was rather than jumping when it arrives.
 *
 * It is also what Activity, Banking and Company Assets show while loading:
 * they have no loading.js of their own and this segment's covers them. That
 * was already so before the redesign; the shapes are simply the new ones.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-28 rounded-3xl bg-ink-200" />
      <div className="@container mt-5">
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <div className="h-52 rounded-3xl bg-ink-200" />
          <div className="h-52 rounded-3xl bg-ink-200" />
          <div className="h-52 rounded-3xl bg-ink-200" />
          <div className="h-52 rounded-3xl bg-ink-200" />
        </div>
      </div>
      <div className="mt-12 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-48 rounded bg-ink-200" />
      </div>
      <div className="@container mt-4">
        <div className="grid gap-4 @[50rem]:grid-cols-2">
          <div className="h-[34rem] rounded-3xl bg-ink-200" />
          <div className="h-[34rem] rounded-3xl bg-ink-200" />
        </div>
      </div>
      <span className="sr-only">Loading the dashboard…</span>
    </div>
  );
}
