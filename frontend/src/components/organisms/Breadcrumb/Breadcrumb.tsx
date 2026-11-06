import type { ReactNode } from "react";
import { DefaultLink, type LinkComponent } from "../../types";
import { useT } from "../../../i18n";
import messages from "../../messages";

export type BreadcrumbSeparator = "dots" | "arrows" | "bullets";

export interface BreadcrumbItem {
  label: ReactNode;
  icon?: ReactNode;
  /**
   * Omit for the current page - Tabler's own accessibility note is
   * explicit that the current page "should not be a link". The LAST
   * item renders as the current page regardless of whether `to` is
   * given, since a breadcrumb trail only ever has one current page and
   * it's always the end of the trail.
   */
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  linkComponent?: LinkComponent;
  /** `.breadcrumb-{separator}` - Tabler's default (no class) is a plain slash, drawn in CSS either way (never typed into the markup - a separator in the DOM would be read out between every item by a screen reader). */
  separator?: BreadcrumbSeparator;
  /** `.breadcrumb-muted` - the secondary text color, so the trail takes less attention than a page title next to it. */
  muted?: boolean;
  className?: string;
}

/**
 * Tabler's `.breadcrumb` (docs.tabler.io/ui/components/breadcrumb) -
 * `<nav aria-label={t("breadcrumb")}>` wrapping an `<ol>`, same accessibility
 * shape Tabler's own docs call out: the label is what tells this nav
 * apart from others on the page, and the current (last) item is a plain
 * `<li aria-current="page">`, never a link. Zero react-router dependency
 * of its own, same convention as `Sidebar`/`Brand` - `linkComponent`
 * defaults to a plain `<a>` (`DefaultLink`) when the host doesn't pass
 * its own router's `Link`.
 */
function Breadcrumb({ items, linkComponent: Link = DefaultLink, separator, muted, className }: BreadcrumbProps) {
  const t = useT(messages);
  const classes = ["breadcrumb", separator && `breadcrumb-${separator}`, muted && "breadcrumb-muted", className]
    .filter(Boolean)
    .join(" ");

  return (
    <nav aria-label={t("breadcrumb")}>
      <ol className={classes}>
        {items.map((item, index) => {
          const isLastItem = index === items.length - 1;
          if (isLastItem || !item.to) {
            return (
              <li key={item.to ?? index} className="breadcrumb-item active" aria-current="page">
                {item.icon}
                {item.label}
              </li>
            );
          }
          return (
            <li key={item.to} className="breadcrumb-item">
              <Link to={item.to}>
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
