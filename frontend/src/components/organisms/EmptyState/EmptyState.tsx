import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** What there is none of - "No sources yet." */
  title: ReactNode;
  /** What to do about it, or why - "Try another search, or clear the filters." */
  description?: ReactNode;
  /** An illustration or icon above the title (`.empty-icon`). */
  icon?: ReactNode;
  /** The way out: a "New …" link, a "Clear filters" button. */
  action?: ReactNode;
  /** @default "md" - Tabler's own spacing, for a page; `"sm"` is tighter, for inside a card or where a table's rows would be. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Tabler's `.empty` (docs.tabler.io/ui/components/empty) - what shows
 * where a list has nothing to show. A bare "No results." leaves the
 * reader guessing whether nothing exists yet or nothing matched; this
 * says which, and hands over the next step (`action`). `DataTable`
 * renders one by default and `CrudListScreen` passes its own, with the
 * resource's name and its "New" link.
 */
function EmptyState({ title, description, icon, action, size = "md", className }: EmptyStateProps) {
  const classes = ["empty", className].filter(Boolean).join(" ");
  return (
    <div className={classes} style={size === "sm" ? { padding: "2rem 1rem" } : undefined}>
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-subtitle text-secondary">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export default EmptyState;
