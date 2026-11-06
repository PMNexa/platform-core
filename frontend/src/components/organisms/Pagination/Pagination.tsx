import { useT } from "../../../i18n";
import messages from "../../messages";

export interface PaginationProps {
  /** 1-indexed, same convention as `?page=`. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Renders a page-size `<select>` alongside the page nav - all three of these are required together, or none. */
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

/**
 * Bootstrap/Tabler's `.pagination` nav markup (`page-item`/`page-link`),
 * `<button>`s instead of `<a href="#">`s - this is JS-driven pagination
 * (`onPageChange`), not real hrefs a host's router should intercept, and
 * a `button` gets the disabled/keyboard/focus behavior of the "Prev"/
 * "Next" ends for free instead of needing `preventDefault` plus manual
 * `aria-disabled`. Pure presentation - "page"/"pageCount" are the
 * CALLER's state, same "props in, no owned state" rule as `Table`.
 */
function Pagination({ page, pageCount, onPageChange, pageSize, pageSizeOptions, onPageSizeChange, className }: PaginationProps) {
  const t = useT(messages);
  const classes = ["d-flex align-items-center gap-3", className].filter(Boolean).join(" ");
  const showPageSize = pageSize != null && pageSizeOptions != null && onPageSizeChange != null;

  return (
    <div className={classes}>
      {showPageSize && (
        <select
          className="form-select form-select-sm"
          style={{ width: "auto" }}
          aria-label={t("pageSize")}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {t("perPage", { size })}
            </option>
          ))}
        </select>
      )}

      <nav aria-label={t("pagination")} className="ms-auto">
        <ul className="pagination pagination-sm m-0">
          <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
            <button type="button" className="page-link" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              {t("prev")}
            </button>
          </li>
          <li className="page-item disabled">
            <span className="page-link">
              {t("pageOf", { page, count: pageCount })}
            </span>
          </li>
          <li className={`page-item ${page >= pageCount ? "disabled" : ""}`}>
            <button
              type="button"
              className="page-link"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              {t("next")}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export default Pagination;
