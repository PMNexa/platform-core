import type { ReactNode } from "react";

/**
 * Matches `core_api`'s list-endpoint contract exactly - `EnvelopePageNumberPagination`'s
 * `{items, total, page, page_size}` response shape (pagination.py). Any
 * `BaseViewSet`-backed endpoint returns this, so `DataTable` can point at
 * one with zero server-side glue.
 */
export interface DataTablePage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type DataTableFetcher<T> = (url: string) => Promise<DataTablePage<T>>;

export interface DataTableColumn<T> {
  /** Field name - also the default `?sort=` key and the `data-label` for a stacked table. */
  key: string;
  header: ReactNode;
  /** Plain-language explanation of the column, shown on hover over its header (from a schema field's `help_text`). */
  hint?: string;
  /** Defaults to `String(row[key])`. */
  render?: (row: T) => ReactNode;
  /** Adds a `.table-sort` button wired to `?sort=`. */
  sortable?: boolean;
  /** `?sort=` field name, if it differs from `key` (e.g. a computed/related field). */
  sortKey?: string;
  /** Hidden by default - still toggleable through the column picker. */
  hidden?: boolean;
  /** `Table`'s `TableCell` `truncate` prop. */
  truncate?: boolean;
  className?: string;
}

export interface DataTableConfig<T> {
  /** List endpoint - relative or absolute. Query params (`page`, `page_size`, `sort`, `q`) are appended, never assumed already present. */
  endpoint: string;
  columns: DataTableColumn<T>[];
  /** Extracts a stable React key from a row - usually `(row) => row.id`. */
  rowKey: (row: T) => string | number;
  /** @default an unauthenticated `axios.get(url)` - override for auth headers etc. */
  fetcher?: DataTableFetcher<T>;
  /** @default [10, 25, 50, 100] */
  pageSizeOptions?: number[];
  /** @default 25 - matches `EnvelopePageNumberPagination.page_size`'s own server-side default. */
  defaultPageSize?: number;
  /** Initial `?sort=` value, e.g. `"-created_at"`. */
  defaultSort?: string | null;
  /** Shows the global `?q=` search box. @default true */
  searchable?: boolean;
}
