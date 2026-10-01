import { useEffect, useState, type ReactNode } from "react";
import Brand from "../../atoms/Brand";
import Drawer from "../Drawer";
import SidebarNavGroup from "../../molecules/SidebarNavGroup";
import SidebarNavItem from "../../molecules/SidebarNavItem";
import { isNavGroup, type LinkComponent, type NavEntry } from "../../types";

export interface SidebarProps {
  brand: ReactNode;
  /** Links and collapsible groups (`NavGroup` - an entry with `children`). */
  navItems: NavEntry[];
  currentPath: string;
  linkComponent: LinkComponent;
  /** Desktop (lg+) only: fold to Tabler's 4rem icon rail (`.navbar-folded` - Tabler's own CSS narrows it and re-offsets the header/page via `--tblr-sidebar-width`). Below lg the sidebar is a top bar whose toggler opens the menu in a left `Drawer` either way. */
  folded?: boolean;
  /** Which groups are closed, by label (expanded sidebar) - absent = open. */
  closedGroups?: ReadonlySet<string>;
  onToggleGroup?: (label: string) => void;
}

// Outside `.navbar-vertical`, Tabler floats a nav group's `.dropdown-menu`
// as a popover - in the drawer it opens inline under its heading instead,
// like the desktop sidebar. A string, not a .css import (see AGENTS.md).
const SIDEBAR_DRAWER_STYLES = `
.pc-sidebar-drawer.navbar { display: block; border: 0; box-shadow: none; background: transparent; }
.pc-sidebar-drawer .navbar-nav { flex-direction: column; }
.pc-sidebar-drawer.navbar .navbar-nav .nav-item .nav-link { justify-content: flex-start; width: 100%; padding: 0.5rem 0.75rem; }
.pc-sidebar-drawer.navbar .navbar-nav .dropdown-menu {
  position: static; float: none; min-width: 0; margin: 0; padding: 0 0 0.25rem 2.25rem;
  border: 0; box-shadow: none; background: transparent;
}
`;

function isActive(currentPath: string, to: string): boolean {
  return currentPath === to || currentPath.startsWith(`${to}/`);
}

/**
 * Tabler's vertical-navbar layout (docs.tabler.io/ui/layout/page-layouts,
 * "Sidebar layout") - a direct child of the host's `.page` wrapper
 * (see templates/DashboardLayout), not a standalone positioned element:
 * Tabler's own CSS gives `.navbar-vertical` its fixed positioning and
 * full height, and offsets `.page-wrapper` to make room for it.
 *
 * Below lg the sidebar is Tabler's top bar, and its toggler opens the
 * same menu in a `Drawer` from the left (React state, not Bootstrap's
 * collapse JS). It closes on navigation (`currentPath` changes), on
 * Escape / backdrop / close button, and when the viewport grows to lg.
 */
function Sidebar({ brand, navItems, currentPath, linkComponent, folded = false, closedGroups, onToggleGroup }: SidebarProps) {
  // The path the drawer was opened on: navigating elsewhere closes it, no effect needed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const drawerOpen = openOn === currentPath;
  const setDrawerOpen = (open: boolean) => setOpenOn(open ? currentPath : null);
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 992px)");
    const close = () => desktop.matches && setOpenOn(null);
    close();
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, [drawerOpen]);

  const renderNav = (railFolded: boolean) =>
    navItems.map((item) =>
      isNavGroup(item) ? (
        <SidebarNavGroup
          key={`group:${item.label}`}
          group={item}
          isActive={(to) => isActive(currentPath, to)}
          linkComponent={linkComponent}
          open={!closedGroups?.has(item.label)}
          onToggle={() => onToggleGroup?.(item.label)}
          folded={railFolded}
        />
      ) : (
        <SidebarNavItem
          key={item.to}
          item={item}
          active={isActive(currentPath, item.to)}
          linkComponent={linkComponent}
          folded={railFolded}
        />
      ),
    );

  return (
    <aside className={`navbar navbar-vertical navbar-expand-lg${folded ? " navbar-folded" : ""}`}>
      <div className="container-fluid">
        <button
          className="navbar-toggler"
          type="button"
          aria-controls="sidebar-drawer"
          aria-expanded={drawerOpen}
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="navbar-toggler-icon" />
        </button>
        <Brand
          label={
            folded && typeof brand === "string" ? (
              // Folded is a desktop-only state - the mobile top bar keeps the full name.
              <>
                <span className="d-none d-lg-inline">{brand.charAt(0)}</span>
                <span className="d-lg-none">{brand}</span>
              </>
            ) : (
              brand
            )
          }
          linkComponent={linkComponent}
          // Tabler's lg sidebar brand is full-width `space-between`, which
          // puts a lone initial at the left edge - center it on the rail.
          className={folded ? "justify-content-lg-center" : undefined}
        />
        <div className="collapse navbar-collapse" id="sidebar-menu">
          <ul className="navbar-nav pt-lg-3">{renderNav(folded)}</ul>
        </div>
      </div>
      <Drawer open={drawerOpen} title={brand} onClose={() => setDrawerOpen(false)} placement="start" width="16rem">
        <style href="platform-core-sidebar-drawer" precedence="default">
          {SIDEBAR_DRAWER_STYLES}
        </style>
        <nav id="sidebar-drawer" className="pc-sidebar-drawer navbar p-0" aria-label="Main">
          <ul className="navbar-nav w-100">{renderNav(false)}</ul>
        </nav>
      </Drawer>
    </aside>
  );
}

export default Sidebar;
