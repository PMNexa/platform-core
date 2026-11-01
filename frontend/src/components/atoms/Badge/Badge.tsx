import type { ReactNode } from "react";

/** Tabler's color names (`bg-{color}` / `bg-{color}-lt`). */
export type BadgeColor =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "blue"
  | "azure"
  | "indigo"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "cyan";

export interface BadgeProps {
  children: ReactNode;
  /** @default "secondary" - the neutral grey; a status states its color (`green` ready, `yellow` running, `red` failed, ...). */
  color?: BadgeColor;
  /** @default true - the light tint (`bg-{color}-lt`, colored text on a pale background), what every status/label here uses. `false` is the solid fill with Tabler's matching foreground color - for a count on a selected control, a filter counter on a primary button. */
  light?: boolean;
  /** `.badge-pill` - fully rounded, for a count. */
  pill?: boolean;
  /** Lets a long label wrap instead of overflowing its cell (a choice's label on a detail page). */
  wrap?: boolean;
  /** A hover explanation (`title`). */
  title?: string;
  className?: string;
}

/**
 * Tabler's `.badge` (docs.tabler.io/ui/components/badges) - a short status
 * or label. Every status badge in `containers/` and the admin screens
 * goes through this, so "ready"/"running"/"failed" read the same
 * everywhere instead of each screen picking its own `bg-*-lt` class.
 * Text only: an icon-only badge would need an accessible name the
 * component doesn't take.
 */
function Badge({ children, color = "secondary", light = true, pill, wrap, title, className }: BadgeProps) {
  const classes = [
    "badge",
    light ? `bg-${color}-lt` : `bg-${color} text-${color}-fg`,
    pill && "badge-pill",
    wrap && "text-wrap text-start mw-100",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} title={title} style={wrap ? { lineHeight: 1.3 } : undefined}>
      {children}
    </span>
  );
}

export default Badge;
