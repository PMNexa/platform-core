export interface SpinnerProps {
  /** What is loading - read out by a screen reader and, unless `hideLabel`, shown next to the spinner. @default "Loading…" */
  label?: string;
  /** Show only the spinner; the label stays for assistive tech (`visually-hidden`). */
  hideLabel?: boolean;
  /** @default "sm" - inline with text, same compact default as `Button`/`FormControl`; `"md"` is Tabler's plain spinner. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Tabler's `.spinner-border` with its label, as one `role="status"`
 * element - every "Loading…" line in `containers/` and the admin screens
 * renders this instead of a bare `<p>Loading…</p>` (announced to nobody)
 * or a hand-rolled spinner + text pair. Inline (a flex row), so it sits
 * wherever the content it stands in for will.
 */
function Spinner({ label = "Loading…", hideLabel = false, size = "sm", className }: SpinnerProps) {
  const classes = ["d-inline-flex align-items-center gap-2 text-secondary", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="status">
      <span className={`spinner-border${size === "sm" ? " spinner-border-sm" : ""}`} aria-hidden="true" />
      <span className={hideLabel ? "visually-hidden" : undefined}>{label}</span>
    </div>
  );
}

export default Spinner;
