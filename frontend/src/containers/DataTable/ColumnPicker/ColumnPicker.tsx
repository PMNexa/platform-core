import { useState } from "react";
import Button from "../../../components/atoms/Button";
import FormCheck from "../../../components/molecules/FormCheck";
import { useT } from "../../../i18n";
import type { DataTableColumn } from "../lib/types";
import messages from "../messages";

export interface ColumnPickerProps<T> {
  /** Already in display order - `DataTable` passes `orderedColumns`, not `visibleColumns`, so a hidden column still shows up here to be re-shown. */
  columns: DataTableColumn<T>[];
  hiddenColumns: Set<string>;
  onToggleColumn: (columnKey: string) => void;
  onMoveColumn: (columnKey: string, direction: -1 | 1) => void;
  className?: string;
}

/**
 * The "Columns" button + its dropdown - show/hide (a `FormCheck` per
 * column) and reorder (move-up/move-down buttons, not drag-and-drop - see
 * `DataTable`'s own AGENTS.md note on why). Its open/closed flag is the
 * only state it owns; which columns are hidden/in what order is
 * `useDataTable`'s state, passed in and reported back through
 * `onToggleColumn`/`onMoveColumn` - same "props in, no owned DATA state"
 * rule as everything in `components/`.
 */
function ColumnPicker<T>({ columns, hiddenColumns, onToggleColumn, onMoveColumn, className }: ColumnPickerProps<T>) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const classes = ["position-relative", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <Button
        type="button"
        variant="secondary"
        outline
        icon
        aria-expanded={open}
        aria-label={t("columns")}
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="6" height="16" rx="1" />
          <rect x="14" y="4" width="6" height="16" rx="1" />
        </svg>
      </Button>
      {open && (
        <div className="card position-absolute end-0 mt-1" style={{ zIndex: 10, minWidth: 220 }}>
          <div className="card-body p-2">
            {columns.map((column, index) => (
              <div key={column.key} className="d-flex align-items-center gap-1 py-1">
                <FormCheck
                  label={column.header}
                  checked={!hiddenColumns.has(column.key)}
                  onChange={() => onToggleColumn(column.key)}
                />
                <div className="ms-auto d-flex gap-1">
                  <Button
                    type="button"
                    icon
                    disabled={index === 0}
                    aria-label={t("moveUp", { name: column.key })}
                    onClick={() => onMoveColumn(column.key, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    icon
                    disabled={index === columns.length - 1}
                    aria-label={t("moveDown", { name: column.key })}
                    onClick={() => onMoveColumn(column.key, 1)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ColumnPicker;
