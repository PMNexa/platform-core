import type { ReactNode } from "react";

export type AlertVariant = "danger" | "success" | "warning" | "info" | "primary" | "secondary";

export interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
  /** A bold first line (`.alert-title`) above the body. */
  title?: ReactNode;
  /** Renders a close button; the host hides the alert (it owns whether it's shown). */
  onDismiss?: () => void;
  /** @default `"alert"` for `danger` (announced at once - something went wrong), `"status"` for the rest (announced politely). */
  role?: "alert" | "status";
  className?: string;
}

/**
 * Tabler's `.alert` (docs.tabler.io/ui/components/alerts) - a message
 * that stays on the page: a failed request, a saved confirmation, a
 * warning about the instance's setup. Every `<div className="alert
 * alert-danger">` and `<p className="text-danger" role="alert">` in
 * `containers/` and the admin screens goes through this, so an error
 * looks and is announced the same everywhere. Not for a transient
 * notification (nothing here auto-hides).
 */
function Alert({ variant, children, title, onDismiss, role, className }: AlertProps) {
  const classes = ["alert", `alert-${variant}`, onDismiss && "alert-dismissible", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role={role ?? (variant === "danger" ? "alert" : "status")}>
      {title && <h4 className="alert-title">{title}</h4>}
      {title ? <div className="text-secondary">{children}</div> : children}
      {onDismiss && <button type="button" className="btn-close" aria-label="Dismiss" onClick={onDismiss} />}
    </div>
  );
}

export default Alert;
