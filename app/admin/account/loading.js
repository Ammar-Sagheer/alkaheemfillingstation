/* Your account loading, in the new look's shapes: the title panel, then your
   own details and the staff logins under their headings. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="mt-10 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-ink-200" />
        <div className="h-6 w-24 rounded bg-ink-200" />
      </div>
      <div className="mt-4 h-60 max-w-[24rem] rounded-3xl bg-ink-200" />
      <div className="mt-4 h-20 max-w-[24rem] rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading your account…</span>
    </div>
  );
}
