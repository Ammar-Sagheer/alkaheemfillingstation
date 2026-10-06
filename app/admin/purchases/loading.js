/* The Purchases loading state, in the new look's shapes: the title panel and
   the table's panel, so the page lands where the skeleton already was. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-44 rounded-3xl bg-ink-200 sm:h-40" />
      <div className="mt-5 h-[36rem] rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading the purchases…</span>
    </div>
  );
}
