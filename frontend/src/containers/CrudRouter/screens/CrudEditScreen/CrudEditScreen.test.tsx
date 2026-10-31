import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi } from "../../lib/baseApi";
import type { Schema } from "../../lib/schema";
import CrudEditScreen from "./CrudEditScreen";

vi.mock("../../lib/baseApi");
vi.mock("../../lib/request");

interface Org {
  id: number;
  name: string;
}

const SCHEMA: Schema = {
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name" },
  ],
};

function mockApi(overrides: Partial<BaseApi<Org>> = {}): BaseApi<Org> {
  const api: BaseApi<Org> = {
    endpoint: "/api/v1/orgs",
    schema: vi.fn().mockResolvedValue(SCHEMA),
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 }),
    read: vi.fn().mockResolvedValue({ id: 1, name: "Acme" }),
    create: vi.fn().mockResolvedValue({ id: 1, name: "Acme" }),
    update: vi.fn().mockResolvedValue({ id: 1, name: "Acme" }),
    remove: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    file: vi.fn().mockResolvedValue(new Blob()),
    ...overrides,
  };
  vi.mocked(createBaseApi).mockReturnValue(api);
  return api;
}

const PROPS = { baseUrl: "/api/v1/orgs", accessToken: "token", id: 1 };

describe("CrudEditScreen", () => {
  it("loads the schema, then the record, and prefills the form", async () => {
    const calls: string[] = [];
    const read = vi.fn().mockImplementation(async () => {
      calls.push("read");
      return { id: 1, name: "Acme" };
    });
    mockApi({
      schema: vi.fn().mockImplementation(async () => {
        calls.push("schema");
        return SCHEMA;
      }),
      read,
    });

    render(<CrudEditScreen {...PROPS} />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Acme"));
    expect(read).toHaveBeenCalledWith(1);
    expect(calls).toEqual(["schema", "read"]);
  });

  it("submits the edited values to update and calls onUpdated", async () => {
    const update = vi.fn().mockResolvedValue({ id: 1, name: "Acme Inc" });
    const onUpdated = vi.fn();
    mockApi({ update });

    render(<CrudEditScreen {...PROPS} onUpdated={onUpdated} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Acme"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { name: "Acme Inc" }));
    expect(onUpdated).toHaveBeenCalledWith({ id: 1, name: "Acme Inc" });
  });

  it("deletes after confirmation and calls onDeleted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleted = vi.fn();
    const api = mockApi();

    render(<CrudEditScreen {...PROPS} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Acme"));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("shows a load error instead of the form when read rejects", async () => {
    mockApi({ read: vi.fn().mockRejectedValue(new Error("Not found")) });
    render(<CrudEditScreen {...PROPS} id={999} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Not found"));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("shows a schema error instead of the form when schema rejects", async () => {
    mockApi({ schema: vi.fn().mockRejectedValue(new Error("Schema unavailable")) });
    render(<CrudEditScreen {...PROPS} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Schema unavailable"));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("frames the fields and Save/Delete buttons in a Card", async () => {
    mockApi();
    render(<CrudEditScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Acme"));

    expect(screen.getByLabelText("Name").closest(".card-body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" }).closest(".card-footer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" }).closest(".card-footer")).toBeInTheDocument();
  });
});
