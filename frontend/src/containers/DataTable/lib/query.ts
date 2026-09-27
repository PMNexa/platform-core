import type { SortDirection } from "../../../components/organisms/Table";
import type { DataTableColumn } from "./types";

export interface DataTableQueryState {
  page: number;
  pageSize: number;
  /** `?sort=` value - a bare field for ascending, a `-`-prefixed one for descending, `null` for unsorted. */
  sort: string | null;
  search: string;
  /** Extra query params, appended as is - e.g. `CrudListScreen`'s `["filter{status}", "done"]` pairs. A key may repeat. */
  filters?: [string, string][];
}

/**
 * Builds a URL against `core_api`'s list-endpoint conventions
 * (pagination.py/filters.py): `?page=`/`?page_size=`, `?sort=`, `?q=`.
 * A pure function on purpose - every branch here is a server-side
 * contract detail, easiest to get right (and keep right) tested on its
 * own, with no rendering involved.
 */
export function buildDataTableUrl(endpoint: string, state: DataTableQueryState): string {
  const params = new URLSearchParams();
  params.set("page", String(state.page));
  params.set("page_size", String(state.pageSize));
  if (state.sort) params.set("sort", state.sort);
  if (state.search) params.set("q", state.search);
  for (const [key, value] of state.filters ?? []) params.append(key, value);

  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${params.toString()}`;
}

function sortFieldFor<T>(column: DataTableColumn<T>): string {
  return column.sortKey ?? column.key;
}

/** Which way (if any) `sort` currently sorts by this column - what `TableHeaderCell`'s `sort` prop wants. */
export function sortDirectionForColumn<T>(sort: string | null, column: DataTableColumn<T>): SortDirection {
  const field = sortFieldFor(column);
  if (sort === field) return "asc";
  if (sort === `-${field}`) return "desc";
  return null;
}

/** none -> asc -> desc -> none, single-column (this platform's `?sort=` supports a comma-separated list, but one active sort at a time is the common case and what the UI below assumes). */
export function nextSort<T>(sort: string | null, column: DataTableColumn<T>): string | null {
  const field = sortFieldFor(column);
  switch (sortDirectionForColumn(sort, column)) {
    case null:
      return field;
    case "asc":
      return `-${field}`;
    case "desc":
      return null;
  }
}
