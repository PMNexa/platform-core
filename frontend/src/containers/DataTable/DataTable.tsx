import type { ReactNode } from "react";
import FormControl from "../../components/atoms/FormControl";
import Spinner from "../../components/atoms/Spinner";
import Alert from "../../components/molecules/Alert";
import EmptyState from "../../components/organisms/EmptyState";
import Pagination from "../../components/organisms/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../components/organisms/Table";
import ColumnPicker from "./ColumnPicker";
import { sortDirectionForColumn } from "./lib/query";
import type { DataTableColumn, DataTableConfig } from "./lib/types";
import { useDataTable, type DataTableState } from "./lib/useDataTable";

/** A header's label; with a `hint`, dotted-underlined and explained on hover. */
function headerWithHint<T>(column: DataTableColumn<T>) {
  if (!column.hint) return column.header;
  return (
    <span title={column.hint} style={{ cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: "3px" }}>
      {column.header}
    </span>
  );
}

/** What to render where the rows would be when the page is empty - a caller that knows what the rows are says so (`CrudListScreen`: the resource's name, its "New" link). @default an `EmptyState` reading "No results." */
interface DataTableEmpty {
  empty?: ReactNode;
}

export type DataTableProps<T> =
  | ({ config: DataTableConfig<T>; table?: undefined } & DataTableEmpty)
  | ({
      /**
       * A `useDataTable(config)` instance the CALLER already owns -
       * lets a host render its own UI (e.g. `CrudListScreen` puts the
       * search box, `ColumnPicker` and `Pagination` in a `Card`'s
       * header/footer) against the SAME state this component reads,
       * instead of two independent `useDataTable` instances silently
       * drifting apart. Mutually exclusive with `config` - pass one or
       * the other, never both.
       *
       * Passing `table` also switches this component to BARE mode: no
       * toolbar (search/`ColumnPicker`), no `Pagination` - just the
       * `<Table>` itself (plus the loading/error/no-results messages,
       * which are data-dependent content, not chrome). The assumption
       * is that a caller lifting the hook this way is already taking
       * over that chrome, same as `CrudListScreen` does; `config` mode
       * stays fully self-contained for a simpler, no-`Card` consumer.
       */
      table: DataTableState<T>;
      config?: undefined;
    } & DataTableEmpty);

/**
 * The feature: `Table`'s presentational pieces (`components/organisms/
 * Table`) wired to `useDataTable`'s state - a real, fetched, paginated,
 * sortable, searchable list from one `DataTableConfig`. See that hook's
 * own docstring for the state; this file only renders it
 * (plus `ColumnPicker`/`Pagination`, this container's own two extracted
 * pieces). A thin dispatcher on `config` vs `table` - `useDataTable`
 * can't be called conditionally, so the two modes are two components,
 * not one `if` inside a single component's body.
 */
function DataTable<T>(props: DataTableProps<T>) {
  if (props.table) return <DataTableView table={props.table} bare empty={props.empty} />;
  return <DataTableWithOwnState config={props.config} empty={props.empty} />;
}

function DataTableWithOwnState<T>({ config, empty }: { config: DataTableConfig<T> } & DataTableEmpty) {
  const table = useDataTable(config);
  return <DataTableView table={table} empty={empty} />;
}

function DataTableView<T>({ table, bare = false, empty }: { table: DataTableState<T>; bare?: boolean } & DataTableEmpty) {
  return (
    <div>
      {!bare && (
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          {table.searchable && (
            <FormControl
              type="search"
              aria-label="Search"
              placeholder="Search…"
              value={table.search}
              onChange={(event) => table.setSearch(event.target.value)}
              style={{ maxWidth: 240 }}
            />
          )}

          <ColumnPicker
            columns={table.orderedColumns}
            hiddenColumns={table.hiddenColumns}
            onToggleColumn={table.toggleColumn}
            onMoveColumn={table.moveColumn}
            className="ms-auto"
          />
        </div>
      )}

      {table.visibleColumns.length > 0 && (
        <Table responsive vcenter>
          <TableHead>
            <TableRow>
              {table.visibleColumns.map((column) =>
                column.sortable ? (
                  <TableHeaderCell
                    key={column.key}
                    sort={sortDirectionForColumn(table.sort, column)}
                    onSort={() => table.toggleSort(column)}
                    sortKey={column.sortKey ?? column.key}
                  >
                    {headerWithHint(column)}
                  </TableHeaderCell>
                ) : (
                  <TableHeaderCell key={column.key}>{headerWithHint(column)}</TableHeaderCell>
                ),
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {table.items.map((row) => (
              <TableRow key={table.rowKey(row)}>
                {table.visibleColumns.map((column) => (
                  <TableCell key={column.key} truncate={column.truncate} className={column.className}>
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {table.loading && <Spinner />}
      {table.error && <Alert variant="danger">{table.error.message}</Alert>}
      {/* Distinct from "No results." (a legitimately empty dataset) -
          this is every column toggled off via ColumnPicker, not a data
          state at all. Without this, the table renders as a totally
          bare, unexplained blank area: no header, no rows, no error -
          "schema loaded but nothing shows", indistinguishable from an
          actual bug. Shown in BOTH modes, not just non-`bare` - a lifted
          `table` caller (e.g. `CrudListScreen`) still renders its own
          `ColumnPicker` around this component, it just puts it in its
          own chrome instead of the toolbar above, so the same message
          still applies. */}
      {table.visibleColumns.length === 0 && (
        <p className="text-secondary">All columns are hidden - use "Columns" to show at least one.</p>
      )}
      {!table.loading &&
        !table.error &&
        table.visibleColumns.length > 0 &&
        table.items.length === 0 && (empty ?? <EmptyState size="sm" title="No results." />)}

      {!bare && (
        <Pagination
          page={table.page}
          pageCount={table.pageCount}
          onPageChange={table.setPage}
          pageSize={table.pageSize}
          pageSizeOptions={table.pageSizeOptions}
          onPageSizeChange={table.setPageSize}
          className="mt-3"
        />
      )}
    </div>
  );
}

export default DataTable;
