import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDataTableUrl, nextSort } from "./query";
import type { DataTableColumn, DataTableConfig, DataTableFetcher } from "./types";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
// Matches `EnvelopePageNumberPagination.page_size` (pagination.py) - the
// server's own default when `?page_size=` is omitted. This hook always
// sends `?page_size=` explicitly, so it has to pick its own default
// independently, and picking anything else would make an unconfigured
// `DataTable` request a different page size than every other client of
// the same endpoint.
const DEFAULT_PAGE_SIZE = 25;

const defaultFetcher: DataTableFetcher<unknown> = async (url) => {
  try {
    return (await axios.get(url)).data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) throw new Error(`GET ${url} failed with ${error.response.status}`);
    throw error;
  }
};

/**
 * Owns every piece of `DataTable` state (page/pageSize/sort/search/
 * column visibility/column order) and the one effect that
 * refetches when any of it changes - split out from `DataTable.tsx` so
 * the state machine is testable (`renderHook`) without mounting a table,
 * and so a caller who wants a different layout around the same data can
 * use this directly. `useMemo`/`useCallback` throughout aren't
 * micro-optimization here - `url`'s identity is the effect's dependency,
 * so a stable value keyed to the actual state (not a new string every
 * render) is what stops it from refetching on every render.
 */
export interface DataTableState<T> {
  items: T[];
  total: number;
  loading: boolean;
  error: Error | null;
  columns: DataTableColumn<T>[];
  orderedColumns: DataTableColumn<T>[];
  visibleColumns: DataTableColumn<T>[];
  hiddenColumns: Set<string>;
  toggleColumn: (columnKey: string) => void;
  moveColumn: (columnKey: string, direction: -1 | 1) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: number[];
  setPage: (next: number) => void;
  setPageSize: (next: number) => void;
  sort: string | null;
  toggleSort: (column: DataTableColumn<T>) => void;
  searchable: boolean;
  search: string;
  setSearch: (next: string) => void;
  /** Extra query params (see `DataTableQueryState.filters`); setting them goes back to page 1. */
  filters: [string, string][];
  setFilters: (next: [string, string][]) => void;
  rowKey: (row: T) => string | number;
  /** Forces a fresh fetch of the current page/sort/search without changing any of it - for a caller that just changed something server-side out of band (e.g. deleted a row) and needs the list to catch up. */
  refetch: () => void;
}

export function useDataTable<T>(config: DataTableConfig<T>): DataTableState<T> {
  const {
    endpoint,
    columns,
    rowKey,
    fetcher = defaultFetcher as DataTableFetcher<T>,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    defaultSort = null,
    searchable = true,
  } = config;

  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [sort, setSort] = useState<string | null>(defaultSort);
  const [search, setSearchState] = useState("");
  const [filters, setFiltersState] = useState<[string, string][]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => columns.map((column) => column.key));
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(columns.filter((column) => column.hidden).map((column) => column.key)),
  );

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);

  const url = useMemo(
    () => buildDataTableUrl(endpoint, { page, pageSize, sort, search, filters }),
    [endpoint, page, pageSize, sort, search, filters],
  );

  useEffect(() => {
    let cancelled = false;
    // Synchronizing with an external system (the network), not deriving
    // state from props/state - exactly the case React's own docs carve
    // out as a legitimate effect. `loading`/`error` reset synchronously
    // here on purpose: skipping that reset would leave a stale error (or
    // a stale "not loading") on screen for the entire round-trip after a
    // page/sort/search change, not just on first mount.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true);
    // oxlint-disable-next-line react/set-state-in-effect
    setError(null);

    fetcher(url)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((thrown: unknown) => {
        if (!cancelled) setError(thrown instanceof Error ? thrown : new Error(String(thrown)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, fetcher, refetchNonce]);

  const refetch = useCallback(() => setRefetchNonce((n) => n + 1), []);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return columnOrder.map((key) => byKey.get(key)).filter((column): column is DataTableColumn<T> => column != null);
  }, [columnOrder, columns]);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenColumns.has(column.key)),
    [orderedColumns, hiddenColumns],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const setPage = useCallback((next: number) => {
    setPageState(Math.max(1, next));
  }, []);

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next);
    setPageState(1);
  }, []);

  const setSearch = useCallback((next: string) => {
    setSearchState(next);
    setPageState(1);
  }, []);

  const setFilters = useCallback((next: [string, string][]) => {
    setFiltersState(next);
    setPageState(1);
  }, []);

  const toggleColumn = useCallback((columnKey: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) next.delete(columnKey);
      else next.add(columnKey);
      return next;
    });
  }, []);

  const moveColumn = useCallback((columnKey: string, direction: -1 | 1) => {
    setColumnOrder((prev) => {
      const index = prev.indexOf(columnKey);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const toggleSort = useCallback((column: DataTableColumn<T>) => {
    setSort((prev) => nextSort(prev, column));
    setPageState(1);
  }, []);

  return {
    // data
    items,
    total,
    loading,
    error,
    // columns
    columns,
    orderedColumns,
    visibleColumns,
    hiddenColumns,
    toggleColumn,
    moveColumn,
    // paging
    page,
    pageCount,
    pageSize,
    pageSizeOptions,
    setPage,
    setPageSize,
    // sorting
    sort,
    toggleSort,
    // search
    searchable,
    search,
    setSearch,
    // filters
    filters,
    setFilters,
    // misc
    rowKey,
    refetch,
  };
}
