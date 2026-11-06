import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../i18n";
import messages from "../../messages";

export type DrawerPlacement = "start" | "end";

export interface DrawerProps {
  /** Render nothing when false - the host owns open/closed state. */
  open: boolean;
  title: ReactNode;
  /** Escape, the close button and a backdrop click all call this. */
  onClose: () => void;
  children: ReactNode;
  /** Which edge it slides in from. @default "end" */
  placement?: DrawerPlacement;
  /** Panel width, any CSS length - never wider than the viewport. @default "40rem" */
  width?: string;
}

/**
 * Tabler's offcanvas markup (docs.tabler.io/ui/components/offcanvas)
 * rendered by React, NOT driven by Bootstrap's offcanvas JS - same rules
 * as `Modal`: `open` is plain host state, portaled to `document.body`,
 * Escape / backdrop click / close button -> `onClose`, the page behind
 * stops scrolling, focus moves in and goes back to the opener on close.
 *
 * A `Modal` opened from inside the drawer (e.g. a detail screen's
 * "New check-in") sits above it, and Escape closes only that modal:
 * while `body.modal-open` is set, the drawer ignores the key.
 */
function Drawer({ open, title, onClose, children, placement = "end", width = "40rem" }: DrawerProps) {
  const t = useT(messages);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Read during the render that OPENS the drawer - see Modal's own note.
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.body.classList.contains("modal-open")) onCloseRef.current();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className={`offcanvas offcanvas-${placement} show`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
        style={{ width, maxWidth: "100%" }}
      >
        <div className="offcanvas-header">
          <h2 className="offcanvas-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="btn-close" aria-label={t("close")} onClick={onClose} />
        </div>
        <div className="offcanvas-body">{children}</div>
      </div>
      <div className="offcanvas-backdrop fade show" onClick={onClose} />
    </>,
    document.body,
  );
}

export default Drawer;
