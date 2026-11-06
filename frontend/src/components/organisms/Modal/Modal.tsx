import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../i18n";
import messages from "../../messages";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  /** Render nothing when false - the host owns open/closed state. */
  open: boolean;
  title: ReactNode;
  /** Escape, the close button and a backdrop click all call this. */
  onClose: () => void;
  children: ReactNode;
  /** `.modal-footer` content (e.g. Save/Cancel). A submit button for a form in `children` can use the native `form="<id>"` attribute to live here. */
  footer?: ReactNode;
  /** @default "md" */
  size?: ModalSize;
}

/**
 * Tabler's modal markup (docs.tabler.io/ui/components/modals) rendered
 * by React, NOT driven by Bootstrap's modal JS - same "no imperative
 * design-system JS for stateful UI" line as the rest of this package;
 * `open` is plain host state. Portaled to `document.body` (it only ever
 * renders after a user action, so never during SSR). Escape / backdrop
 * click / close button -> `onClose`; the page behind stops scrolling
 * (`.modal-open` on body, as Bootstrap does); focus moves into the
 * dialog (an `autoFocus` child wins, else the dialog itself) and goes
 * back to whatever was focused before (usually the button that opened
 * it) on close. No full focus trap yet.
 */
function Modal({ open, title, onClose, children, footer, size = "md" }: ModalProps) {
  const t = useT(messages);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // The element to return focus to - read during the render that OPENS
  // the modal, i.e. before commit: by the time an effect runs, a child's
  // `autoFocus` has already moved focus into the dialog.
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    document.body.classList.add("modal-open");
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.classList.remove("modal-open");
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size === "sm" ? " modal-sm" : size === "lg" ? " modal-lg" : "";
  return createPortal(
    <>
      <div
        className="modal modal-blur fade show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        // Only a press that starts AND ends on the backdrop itself - not a
        // text selection dragged out of an input.
        onMouseDown={(event) => {
          (event.currentTarget as HTMLElement).dataset.downOnBackdrop = String(event.target === event.currentTarget);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && event.currentTarget.dataset.downOnBackdrop === "true") onClose();
        }}
      >
        <div className={`modal-dialog modal-dialog-centered${sizeClass}`} role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                {title}
              </h5>
              <button type="button" className="btn-close" aria-label={t("close")} onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>,
    document.body,
  );
}

export default Modal;
