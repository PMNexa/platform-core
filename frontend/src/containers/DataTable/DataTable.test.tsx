import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DataTableColumn, DataTablePage } from "./lib/types";
import { useDataTable } from "./lib/useDataTable";
import DataTable from "./DataTable";

interface Row {
  id: number;
  name: string;
  status: string;
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "status", header: "Status" },
];

const ROWS: Row[] = [
  { id: 1, name: "Acme", status: "active" },
  { id: 2, name: "Globex", status: "invited" },
];

function page(items: Row[], overrides: Partial<DataTablePage<Row>> = {}): DataTablePage<Row> {
  return { items, total: items.length, page: 1, page_size: 25, ...overrides };
}

describe("DataTable", () => {
  it("renders the fetched rows once loading finishes", async () => {
    const fetcher = vi.fn().mockResolvedValue(page(ROWS));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("shows a no-results message for an empty page", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);
    await waitFor(() => expect(screen.getByText("No results.")).toBeInTheDocument());
  });

  it("refetches with ?q= when the search box is used", async () => {
    const fetcher = vi.fn().mockResolvedValue(page(ROWS));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "acme" } });
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=1&page_size=25&q=acme"));
  });

  it("refetches with ?sort= when a sortable header is clicked", async () => {
    const fetcher = vi.fn().mockResolvedValue(page(ROWS));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=1&page_size=25&sort=name"));
  });

  it("refetches with the next page when Next is clicked", async () => {
    const fetcher = vi.fn().mockResolvedValue(page(ROWS, { total: 60 }));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith("/api/v1/orgs?page=2&page_size=25"));
  });

  it("disables Prev on the first page and Next on the last page", async () => {
    const fetcher = vi.fn().mockResolvedValue(page(ROWS, { total: 2 }));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("hides a column via the column picker", async () => {
    const fetcher = vi.fn().mockResolvedValue(page(ROWS));
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r) => r.id, fetcher }} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));

    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
  });

  describe("with a lifted table (bare mode)", () => {
    function LiftedDataTable() {
      const table = useDataTable({ endpoint: "/api/v1/orgs", columns: COLUMNS, rowKey: (r: Row) => r.id, fetcher: vi.fn().mockResolvedValue(page(ROWS)) });
      return <DataTable table={table} />;
    }

    it("renders no toolbar (search/Columns) or Pagination - the caller owns that chrome", async () => {
      render(<LiftedDataTable />);
      await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

      expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
    });
  });

  it("clamps every cell by default, titles long text, and lets a column opt out", async () => {
    const long = "A very long name ".repeat(10).trim();
    const fetcher = vi.fn().mockResolvedValue(page([{ id: 1, name: long, status: "active" }]));
    const columns: DataTableColumn<Row>[] = [
      { key: "name", header: "Name" },
      { key: "status", header: "Status", clamp: false },
    ];
    render(<DataTable config={{ endpoint: "/api/v1/orgs", columns, rowKey: (r) => r.id, fetcher }} />);

    const name = await screen.findByText(long);
    expect(name).toHaveClass("td-clamp");
    expect(name.style.webkitLineClamp).toBe("2");
    expect(name.closest("td")).toHaveAttribute("title", long);
    const status = screen.getByText("active");
    expect(status.tagName).toBe("TD");
    expect(status).not.toHaveAttribute("title");
  });
});

