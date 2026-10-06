/**
 * The "working on it" indicator, shared so every pending state in the app
 * looks like the same thing happening rather than three different things.
 *
 * `border-current` means it takes the colour of whatever it sits inside, so it
 * reads correctly on a white button, a green one and a plain input alike
 * without a variant for each.
 */
export default function Spinner({ className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
