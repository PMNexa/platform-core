import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readPersisted, writePersisted } from "./persist";
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

/** What `persistKey` stores (version 1). */
interface PersistedTable {
  v: 1;
  page: number;
  pageSize: number;
  sort: string | null;
  search: string;
  filters: [string, string][];
  columnOrder: string[];
  hiddenColumns: string[];
}

function sameFilters(a: [string, string][], b: [string, string][]): boolean {
  return a.length === b.length && a.every(([key, value], index) => key === b[index][0] && value === b[index][1]);
}

/** A stored column order, kept to the columns that still exist, new ones appended. */
function mergeColumnOrder(stored: string[], keys: string[]): string[] {
  const known = new Set(keys);
  const kept = stored.filter((key) => known.has(key));
  return [...kept, ...keys.filter((key) => !kept.includes(key))];
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
    persistKey,
    persistPage = true,
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
  // With a `persistKey`, the remembered state is applied after mount (not
  // in the initializers - the server render must match the first client
  // render) and nothing is fetched until then, so the defaults are never
  // fetched just to be thrown away.
  const [restored, setRestored] = useState(!persistKey);

  useEffect(() => {
    if (!persistKey) return;
    const stored = readPersisted<PersistedTable>(persistKey);
    if (stored?.v === 1) {
      const keys = columns.map((column) => column.key);
      // Applying remembered state from browser storage - an external system.
      // oxlint-disable-next-line react/set-state-in-effect
      if (persistPage) setPageState(Math.max(1, stored.page || 1));
      // oxlint-disable-next-line react/set-state-in-effect
      if (pageSizeOptions.includes(stored.pageSize)) setPageSizeState(stored.pageSize);
      // oxlint-disable-next-line react/set-state-in-effect
      setSort(stored.sort ?? null);
      // oxlint-disable-next-line react/set-state-in-effect
      setSearchState(stored.search ?? "");
      // oxlint-disable-next-line react/set-state-in-effect
      setFiltersState(Array.isArray(stored.filters) ? stored.filters : []);
      // oxlint-disable-next-line react/set-state-in-effect
      setColumnOrder(mergeColumnOrder(stored.columnOrder ?? [], keys));
      // oxlint-disable-next-line react/set-state-in-effect
      setHiddenColumns(new Set((stored.hiddenColumns ?? []).filter((key) => keys.includes(key))));
    }
    // oxlint-disable-next-line react/set-state-in-effect
    setRestored(true);
    // Once per key: options and `columns` are only read here, a change to
    // them must not re-apply the remembered state over the user's edits.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || !restored) return;
    const state: PersistedTable = {
      v: 1,
      page,
      pageSize,
      sort,
      search,
      filters,
      columnOrder,
      hiddenColumns: [...hiddenColumns],
    };
    writePersisted(persistKey, state);
  }, [persistKey, restored, page, pageSize, sort, search, filters, columnOrder, hiddenColumns]);

  const url = useMemo(
    () => buildDataTableUrl(endpoint, { page, pageSize, sort, search, filters }),
    [endpoint, page, pageSize, sort, search, filters],
  );

  useEffect(() => {
    if (!restored) return;
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
        // A remembered page past the end (rows were deleted since): go to the last one.
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (result.items.length === 0 && page > lastPage) {
          setPageState(lastPage);
          return;
        }
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
  }, [url, fetcher, refetchNonce, restored, page, pageSize]);

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

  // The same filters again (a screen re-syncing its own filter state) keep the page.
  const setFilters = useCallback((next: [string, string][]) => {
    setFiltersState((prev) => {
      if (sameFilters(prev, next)) return prev;
      setPageState(1);
      return next;
    });
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
