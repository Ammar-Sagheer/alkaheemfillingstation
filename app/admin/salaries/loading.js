/* The Salaries loading state: the day panel, the register, the month's table. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-32 rounded-3xl bg-ink-200" />
      <div className="mt-10 h-72 rounded-3xl bg-ink-200" />
      <div className="mt-12 h-96 rounded-3xl bg-ink-200" />
      <span className="sr-only">Loading salaries…</span>
    </div>
  );
}
