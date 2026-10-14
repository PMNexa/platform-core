import { useEffect, useRef, useState } from "react";
import type { LinkComponent, NavGroup } from "../../types";

export interface SidebarNavGroupProps {
  group: NavGroup;
  /** Whether each child link is the current page. */
  isActive: (to: string) => boolean;
  linkComponent: LinkComponent;
  /** Expanded sidebar: whether the group is open (the caller owns and remembers it). */
  open: boolean;
  onToggle: () => void;
  /** Folded icon rail: the group opens as Tabler's flyout on hover/focus instead - never left open, so it can't cover the page. */
  folded?: boolean;
}

/**
 * Tabler's own vertical-sidebar dropdown markup (`.nav-item.dropdown` >
 * `.dropdown-toggle` + `.dropdown-menu`), driven by React state rather
 * than Bootstrap's dropdown JS: expanded, Tabler renders the open menu
 * inline under its heading; folded, as a flyout beside the rail.
 */
function SidebarNavGroup({ group, isActive, linkComponent: Link, open, onToggle, folded = false }: SidebarNavGroupProps) {
  const [hovered, setHovered] = useState(false);
  // The pointer crosses a gap between the rail and the flyout: close a moment
  // after it leaves, and stay open if it comes back (onto the flyout) first.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const enter = () => {
    cancelClose();
    setHovered(true);
  };
  const leave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(false), 300);
  };
  useEffect(() => cancelClose, []);
  const active = group.children.some((child) => isActive(child.to));
  const shown = folded ? hovered : open;
  const icon = group.icon ?? (folded ? <span className="fw-bold">{group.label.charAt(0).toUpperCase()}</span> : null);
  const menuId = `sidebar-group-${group.label.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <li
      className={`nav-item dropdown${active ? " active" : ""}`}
      title={folded ? group.label : undefined}
      onMouseEnter={folded ? enter : undefined}
      onMouseLeave={folded ? leave : undefined}
      onFocus={folded ? enter : undefined}
      onBlur={
        folded
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                cancelClose();
                setHovered(false);
              }
            }
          : undefined
      }
    >
      <button
        type="button"
        className={`nav-link dropdown-toggle${shown ? " show" : ""}`}
        aria-expanded={shown}
        aria-controls={menuId}
        onClick={folded ? () => setHovered((prev) => !prev) : onToggle}
      >
        {icon && <span className="nav-link-icon">{icon}</span>}
        <span className="nav-link-title">{group.label}</span>
      </button>
      <div id={menuId} className={`dropdown-menu${shown ? " show" : ""}`}>
        {group.children.map((child) => (
          <Link key={child.to} to={child.to} className={`dropdown-item${isActive(child.to) ? " active" : ""}`}>
            {child.label}
          </Link>
        ))}
      </div>
    </li>
  );
}

export default SidebarNavGroup;
