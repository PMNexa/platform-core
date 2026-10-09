import { useEffect, useId, useRef, useState } from "react";
import Avatar from "../../atoms/Avatar";
import { DefaultLink, type AppShellUser, type LinkComponent, type UserMenuEntry } from "../../types";

export interface UserMenuProps {
  user: AppShellUser;
  /** Entries above "Log out" - see `UserMenuEntry`. */
  items?: UserMenuEntry[];
  onLogout?: () => void;
  /** Called each time the menu opens - e.g. to refresh a list it shows. */
  onOpen?: () => void;
  linkComponent?: LinkComponent;
}

/** Tabler's "check" outline icon (MIT), inlined. */
function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ms-auto ps-2" aria-hidden="true">
      <path d="M5 12l5 5l10 -10" />
    </svg>
  );
}

/**
 * The header's user block as a dropdown - Tabler's own top-bar user menu
 * markup, opened by React state rather than Bootstrap's JS (not loaded).
 * Positioned inline: `.navbar-nav .dropdown-menu` is `position: static`
 * in Bootstrap outside a `navbar-expand-*` header (which Header can't
 * have - see its note), and `.dropdown-menu-end` only right-aligns with
 * Popper. A disclosure (`aria-expanded`), not an ARIA
 * menu - its links come from the host's `linkComponent`, which takes no
 * `role`. Closes on an outside click, Escape, or picking an entry.
 */
function UserMenu({ user, items = [], onLogout, onOpen, linkComponent: Link = DefaultLink }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open) onOpen?.();
    setOpen(!open);
  }

  const close = () => setOpen(false);

  return (
    <div className="nav-item dropdown position-relative" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="nav-link d-flex lh-1 p-0 px-2 border-0 bg-transparent text-reset dropdown-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.name}`}
        onClick={toggle}
      >
        <Avatar name={user.name} />
      </button>
      {open && (
        <div
          id={menuId}
          className="dropdown-menu dropdown-menu-end dropdown-menu-arrow show"
          style={{ position: "absolute", top: "100%", right: 0, left: "auto", minWidth: "14rem" }}
        >
          <div className="dropdown-header">
            <div className="text-body">{user.name}</div>
            <div className="small text-secondary">{user.email}</div>
          </div>
          <div className="dropdown-divider" />
          {items.map((entry, index) => {
            if ("divider" in entry) return <div key={index} className="dropdown-divider" />;
            if ("header" in entry) {
              return (
                <div key={index} className="dropdown-header">
                  {entry.header}
                </div>
              );
            }
            const body = (
              <>
                {entry.icon}
                <span className="text-truncate">{entry.label}</span>
                {entry.active && <CheckIcon />}
              </>
            );
            const className = `dropdown-item d-flex align-items-center${entry.active ? " active" : ""}`;
            if ("to" in entry) {
              return (
                // A wrapper catches the click: LinkComponent takes no onClick.
                <div key={index} onClick={close}>
                  <Link to={entry.to} className={className}>
                    {body}
                  </Link>
                </div>
              );
            }
            return (
              <button
                key={index}
                type="button"
                className={className}
                aria-current={entry.active ? "true" : undefined}
                onClick={() => {
                  close();
                  entry.onClick();
                }}
              >
                {body}
              </button>
            );
          })}
          {onLogout && (
            <>
              {items.length > 0 && <div className="dropdown-divider" />}
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  close();
                  onLogout();
                }}
              >
                Log out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default UserMenu;
