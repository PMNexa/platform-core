import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataTableColumn, DataTablePage } from "./types";
import { useDataTable } from "./useDataTable";

interface Row {
  id: number;
  name: string;
  status: string;
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "status", header: "Status" },
  { key: "id", header: "ID", hidden: true },
];

function page(items: Row[], overrides: Partial<DataTablePage<Row>> = {}): DataTablePage<Row> {
  return { items, total: items.length, page: 1, page_size: 25, ...overrides };
}

describe("useDataTable", () => {
  it("fetches page 1 on mount and exposes the result", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: 1, name: "Acme", status: "active" }], { total: 1 }));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetcher).toHaveBeenCalledWith("/api/v1/orgs?page=1&page_size=25");
    expect(result.current.items).toEqual([{ id: 1, name: "Acme", status: "active" }]);
    expect(result.current.total).toBe(1);
  });

  it("hides columns marked hidden by default", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(["name", "status"]);
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["name", "status", "id"]);
  });

  it("refetches with the new page when setPage is called", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=2&page_size=25"));
  });

  it("resets to page 1 when the page size changes", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(3));
    await waitFor(() => expect(result.current.page).toBe(3));
    act(() => result.current.setPageSize(50));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=1&page_size=50"));
  });

  it("cycles a sortable column's sort and resets to page 1", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.toggleSort(COLUMNS[0]));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=1&page_size=25&sort=name"));

    act(() => result.current.toggleSort(COLUMNS[0]));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=1&page_size=25&sort=-name"));
  });

  it("sends search as ?q= and resets to page 1", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSearch("acme"));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=1&page_size=25&q=acme"));
  });

  it("moves a column's order with moveColumn", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.moveColumn("status", -1));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["status", "name", "id"]);
  });

  it("surfaces a rejected fetch as an error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("boom");
  });
});

describe("useDataTable persistKey", () => {
  const KEY = "platform-core:test-table";
  const config = (fetcher: ReturnType<typeof vi.fn>, extra = {}) => ({
    endpoint: "/api/v1/orgs",
    columns: COLUMNS,
    rowKey: (r: Row) => r.id,
    fetcher,
    persistKey: "test-table",
    ...extra,
  });

  beforeEach(() => window.localStorage.clear());

  it("remembers sort, search, page size, filters and columns across mounts", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([], { total: 200 }));
    const first = renderHook(() => useDataTable(config(fetcher)));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    act(() => first.result.current.toggleSort(COLUMNS[0]));
    act(() => first.result.current.setSearch("acme"));
    act(() => first.result.current.setPageSize(50));
    act(() => first.result.current.setFilters([["filter{status}", "active"]]));
    act(() => first.result.current.toggleColumn("id"));
    act(() => first.result.current.moveColumn("status", -1));
    act(() => first.result.current.setPage(3));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const again = vi.fn().mockResolvedValue(page([{ id: 1, name: "Acme", status: "active" }], { total: 200 }));
    const second = renderHook(() => useDataTable(config(again)));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    // Only the remembered state is fetched - never the defaults first.
    expect(again).toHaveBeenCalledTimes(1);
    expect(again).toHaveBeenCalledWith("/api/v1/orgs?page=3&page_size=50&sort=name&q=acme&filter%7Bstatus%7D=active");
    expect(second.result.current.orderedColumns.map((c) => c.key)).toEqual(["status", "name", "id"]);
    expect(second.result.current.visibleColumns.map((c) => c.key)).toEqual(["status", "name", "id"]);
  });

  it("keeps a stored column order to the columns that still exist", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, page: 1, pageSize: 25, sort: null, search: "", filters: [], columnOrder: ["gone", "status"], hiddenColumns: ["gone"] }),
    );
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useDataTable(config(fetcher)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orderedColumns.map((c) => c.key)).toEqual(["status", "name", "id"]);
    expect([...result.current.hiddenColumns]).toEqual([]);
  });

  it("goes to the last page when the remembered one is past the end", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, page: 9, pageSize: 25, sort: null, search: "", filters: [], columnOrder: [], hiddenColumns: [] }),
    );
    const fetcher = vi.fn((url: string) => Promise.resolve(url.includes("page=9") ? page([], { total: 30 }) : page([{ id: 1, name: "A", status: "x" }], { total: 30 })));
    const { result } = renderHook(() => useDataTable(config(fetcher)));
    await waitFor(() => expect(result.current.page).toBe(2));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
  });

  it("can leave the page out (persistPage: false) and survives broken storage", async () => {
    window.localStorage.setItem(KEY, "{not json");
    const fetcher = vi.fn().mockResolvedValue(page([], { total: 100 }));
    const first = renderHook(() => useDataTable(config(fetcher, { persistPage: false })));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    act(() => first.result.current.setPage(2));
    first.unmount();
    const second = renderHook(() => useDataTable(config(fetcher, { persistPage: false })));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.page).toBe(1);
  });

  it("the same filters again keep the page", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([], { total: 100 }));
    const { result } = renderHook(() => useDataTable(config(fetcher)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setFilters([["filter{status}", "a"]]));
    act(() => result.current.setPage(3));
    act(() => result.current.setFilters([["filter{status}", "a"]]));
    expect(result.current.page).toBe(3);
  });
});
