import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi } from "../../lib/baseApi";
import type { Schema } from "../../lib/schema";
import CrudListScreen from "./CrudListScreen";

vi.mock("../../lib/baseApi");
vi.mock("../../lib/request");

interface Org {
  id: number;
  name: string;
}

const SCHEMA: Schema = {
  searchable: true,
  display_field: "name",
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name" },
  ],
};

function mockApi(overrides: Partial<BaseApi<Org>> = {}): BaseApi<Org> {
  const api: BaseApi<Org> = {
    endpoint: "/api/v1/orgs",
    schema: vi.fn().mockResolvedValue(SCHEMA),
    list: vi.fn().mockResolvedValue({ items: [{ id: 1, name: "Acme" }], total: 1, page: 1, page_size: 25 }),
    read: vi.fn().mockResolvedValue({ id: 1, name: "Acme" }),
    create: vi.fn().mockResolvedValue({ id: 1, name: "Acme" }),
    update: vi.fn().mockResolvedValue({ id: 1, name: "Acme" }),
    remove: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  vi.mocked(createBaseApi).mockReturnValue(api);
  return api;
}

const PROPS = { baseUrl: "/api/v1/orgs", accessToken: "token" };

describe("CrudListScreen", () => {
  it("hides the search box when the schema says the resource isn't searchable", async () => {
    mockApi({ schema: vi.fn().mockResolvedValue({ ...SCHEMA, searchable: false }) });
    render(<CrudListScreen {...PROPS} />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("hides New/Edit/Delete the schema's `can` says the caller can't use", async () => {
    mockApi({ schema: vi.fn().mockResolvedValue({ ...SCHEMA, can: { create: false, update: false, delete: false } }) });
    render(<CrudListScreen {...PROPS} />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit Acme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Acme" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Acme" })).toBeInTheDocument();
  });

  it("renders a New link to the create path and an Edit link per row", async () => {
    mockApi();
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("href", "orgs/new");
    expect(screen.getByRole("link", { name: "Edit Acme" })).toHaveAttribute("href", "orgs/1/edit");
    expect(screen.getByRole("link", { name: "View Acme" })).toHaveAttribute("href", "orgs/1");
  });

  it("frames the New link and search box in the Card header, table full-bleed in the Card", async () => {
    mockApi();
    const { container } = render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const card = container.querySelector(".card");
    expect(card).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New" }).closest(".card-header")).toBeInTheDocument();
    expect(screen.getByLabelText("Search").closest(".card-header")).toBeInTheDocument();
    // No .card-body padding wrapper around the table itself (Tabler's
    // own "toolbar in the header, table full-bleed below" card shape).
    expect(screen.getByRole("table").closest(".card-body")).not.toBeInTheDocument();
    expect(card?.contains(screen.getByRole("table"))).toBe(true);
  });

  it("puts the Columns picker in the Card header and Pagination in the Card footer", async () => {
    mockApi();
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Columns" }).closest(".card-header")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1").closest(".card-footer")).toBeInTheDocument();
  });

  it("aligns Edit and Delete as matching small link-styled buttons", async () => {
    mockApi();
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const edit = screen.getByRole("link", { name: "Edit Acme" });
    const del = screen.getByRole("button", { name: "Delete Acme" });
    expect(edit).toHaveClass("btn", "btn-ghost-secondary", "btn-icon", "btn-sm");
    expect(del).toHaveClass("btn", "btn-ghost-danger", "btn-icon", "btn-sm");
  });

  it("gives every DATA cell (not the actions cell) an invisible, unfocusable decoy link to the detail page", async () => {
    mockApi();
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const row = screen.getByText("Acme").closest("tr")!;
    const decoys = row.querySelectorAll("a.stretched-link");
    expect(decoys.length).toBeGreaterThan(0);
    for (const decoy of decoys) {
      expect(decoy).toHaveAttribute("href", "orgs/1");
      expect(decoy).toHaveAttribute("tabindex", "-1");
      expect(decoy).toHaveAttribute("aria-hidden", "true");
      // Every decoy's own cell (not the whole `<tr>`) is the positioned
      // container it stretches to fill - a `<tr>` doesn't reliably act
      // as one in real browsers, see this file's own docstring.
      expect(decoy.closest("td")).toHaveClass("position-relative");
    }

    // The actions cell (Edit/Delete) deliberately has none - see this
    // file's own docstring for why a same-cell decoy there blocked
    // Delete's clicks in a real browser.
    const actionsCell = screen.getByRole("button", { name: "Delete Acme" }).closest("td")!;
    expect(actionsCell.querySelector("a.stretched-link")).not.toBeInTheDocument();
  });

  it("hides the search box when searchable is false", async () => {
    mockApi();
    render(<CrudListScreen {...PROPS} searchable={false} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
  });

  it("refetches through the header's search box (shares state with DataTable, not a second instance)", async () => {
    const api = mockApi();
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "acme" } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.stringContaining("q=acme")));
  });

  it("loads the schema before the list (schema first, then list)", async () => {
    const calls: string[] = [];
    mockApi({
      schema: vi.fn().mockImplementation(async () => {
        calls.push("schema");
        return SCHEMA;
      }),
      list: vi.fn().mockImplementation(async () => {
        calls.push("list");
        return { items: [{ id: 1, name: "Acme" }], total: 1, page: 1, page_size: 25 };
      }),
    });
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(calls).toEqual(["schema", "list"]);
  });

  it("deletes a row after confirmation and calls onDeleted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleted = vi.fn();
    const api = mockApi();

    render(<CrudListScreen {...PROPS} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));
    expect(onDeleted).toHaveBeenCalledWith({ id: 1, name: "Acme" });
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = mockApi();
    render(<CrudListScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));
    expect(api.remove).not.toHaveBeenCalled();
  });
});

describe("CrudListScreen filters", () => {
  it("adds a filter field by field in the modal and refetches with its params", async () => {
    const api = mockApi();
    render(<CrudListScreen {...PROPS} />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Add filter" }), { target: { value: "name" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Name value" }), { target: { value: "ac" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.stringContaining("filter%7Bname.icontains%7D=ac")));
    expect(screen.getByText("Name contains ac")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove filter Name contains ac" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.not.stringContaining("filter")));
  });
});
