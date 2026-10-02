import UserMenu from "../../molecules/UserMenu";
import type { AppShellUser, LinkComponent, UserMenuEntry } from "../../types";

export interface HeaderProps {
  user?: AppShellUser | null;
  onLogout?: () => void;
  /** The user dropdown's entries above "Log out" (see `UserMenuEntry`). */
  userMenu?: UserMenuEntry[];
  /** Called each time the user dropdown opens. */
  onUserMenuOpen?: () => void;
  /** Renders `userMenu` links. */
  linkComponent?: LinkComponent;
  /** Renders the desktop-only (lg+) sidebar fold toggle at the header's start when given. */
  onToggleSidebar?: () => void;
  /** Current fold state - drives the toggle's label/`aria-expanded`. */
  sidebarFolded?: boolean;
  /** Hide the whole header below lg - for a layout whose sidebar top bar already carries the user menu there (`Sidebar`'s `mobileEnd`). */
  desktopOnly?: boolean;
}

/** Tabler's "layout-sidebar" outline icon (MIT), inlined - no icon font is loaded. */
function SidebarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d="M9 4v16" />
    </svg>
  );
}

/**
 * `sticky-top` (a plain Bootstrap utility) rather than Tabler's
 * `data-bs-navbar="sticky"` html-attribute route - that route needs the
 * host to own `<html>` and set the attribute itself, coupling this
 * package to a specific host wiring. A class on the element it belongs to
 * works the same and needs nothing from the host beyond loading Tabler's
 * CSS.
 *
 * Deliberately has no `navbar-expand-*` class (this header has no
 * collapsible nav of its own, so it doesn't need one) - Tabler's CSS
 * treats ANY `.page` child matching `[class*=navbar-expand]` that isn't
 * `.navbar-vertical` as "the other navigation" in its vertical/horizontal
 * toggle (docs.tabler.io/ui/layout/page-layouts, "Navigation position"):
 * `html:not([data-bs-navbar-position=vertical]) .page:has(>
 * [class*=navbar-expand]:not(.navbar-vertical))>.navbar-vertical{display:
 * none}`. With that class here, Sidebar's `aside.navbar-vertical` gets
 * hidden outright (not just below a breakpoint) unless the host sets
 * `data-bs-navbar-position="vertical")` on `<html>` - and setting that
 * instead hides THIS header. Neither is what we want (both should always
 * show); dropping the class here sidesteps the toggle entirely.
 *
 * The user block is a dropdown (`UserMenu`): the host's `userMenu`
 * entries, then "Log out". With no user, a bare "Log out" button.
 */
function Header({ user, onLogout, userMenu, onUserMenuOpen, linkComponent, onToggleSidebar, sidebarFolded = false, desktopOnly = false }: HeaderProps) {
  return (
    <header className={`navbar d-print-none sticky-top bg-white${desktopOnly ? " d-none d-lg-flex" : ""}`}>
      <div className="container-fluid">
        {onToggleSidebar && (
          <button
            type="button"
            className="btn btn-ghost-secondary btn-icon btn-sm d-none d-lg-inline-flex"
            onClick={onToggleSidebar}
            aria-label={sidebarFolded ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarFolded}
            title={sidebarFolded ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarIcon />
          </button>
        )}
        <div className="navbar-nav flex-row order-md-last align-items-center gap-3 ms-auto py-2">
          {user && (
            <UserMenu user={user} items={userMenu} onLogout={onLogout} onOpen={onUserMenuOpen} linkComponent={linkComponent} />
          )}
          {!user && onLogout && (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
