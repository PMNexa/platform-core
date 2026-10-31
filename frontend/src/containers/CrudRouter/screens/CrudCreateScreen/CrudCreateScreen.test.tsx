import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi } from "../../lib/baseApi";
import type { Schema } from "../../lib/schema";
import CrudCreateScreen from "./CrudCreateScreen";

vi.mock("../../lib/baseApi");
vi.mock("../../lib/request");

interface Org {
  id: number;
  name: string;
  active: boolean;
}

const SCHEMA: Schema = {
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name" },
    { name: "active", type: "boolean", required: false, read_only: false, label: "Active" },
  ],
};

function mockApi(overrides: Partial<BaseApi<Org>> = {}): BaseApi<Org> {
  const api: BaseApi<Org> = {
    endpoint: "/api/v1/orgs",
    schema: vi.fn().mockResolvedValue(SCHEMA),
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 }),
    read: vi.fn().mockResolvedValue({ id: 1, name: "Acme", active: true }),
    create: vi.fn().mockResolvedValue({ id: 1, name: "Acme", active: true }),
    update: vi.fn().mockResolvedValue({ id: 1, name: "Acme", active: true }),
    remove: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    file: vi.fn().mockResolvedValue(new Blob()),
    ...overrides,
  };
  vi.mocked(createBaseApi).mockReturnValue(api);
  return api;
}

const PROPS = { baseUrl: "/api/v1/orgs", accessToken: "token" };

describe("CrudCreateScreen", () => {
  it("submits the entered field values and calls onCreated", async () => {
    const create = vi.fn().mockResolvedValue({ id: 1, name: "Acme", active: true });
    const onCreated = vi.fn();
    mockApi({ create });

    render(<CrudCreateScreen {...PROPS} onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Active" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Acme", active: true }));
    expect(onCreated).toHaveBeenCalledWith({ id: 1, name: "Acme", active: true });
  });

  it("shows the error and does not call onCreated when create rejects", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Name already taken"));
    const onCreated = vi.fn();
    mockApi({ create });

    render(<CrudCreateScreen {...PROPS} onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Name already taken"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("offers a file picker for a file field and submits the picked File", async () => {
    const create = vi.fn().mockResolvedValue({ id: 1, name: "Acme" });
    const schema: Schema = {
      fields: [
        { name: "id", type: "string", required: false, read_only: true, label: "Id" },
        { name: "name", type: "string", required: true, read_only: false, label: "Name" },
        { name: "cover", type: "file", required: false, read_only: false, label: "Cover", accept: ".png,.jpg" },
      ],
    };
    mockApi({ create, schema: vi.fn().mockResolvedValue(schema) });

    render(<CrudCreateScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText("Cover")).toBeInTheDocument());
    const picker = screen.getByLabelText("Cover") as HTMLInputElement;
    expect(picker.type).toBe("file");
    expect(picker.accept).toBe(".png,.jpg");

    const file = new File(["png"], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.change(picker, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Acme", cover: file }));
  });

  it("marks a required field as required", async () => {
    mockApi();
    render(<CrudCreateScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeRequired());
  });

  it("frames the fields and submit button in a Card", async () => {
    mockApi();
    render(<CrudCreateScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(screen.getByLabelText("Name").closest(".card-body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" }).closest(".card-footer")).toBeInTheDocument();
  });

  it("loads the schema before rendering the form", async () => {
    const calls: string[] = [];
    mockApi({
      schema: vi.fn().mockImplementation(async () => {
        calls.push("schema");
        return SCHEMA;
      }),
    });
    render(<CrudCreateScreen {...PROPS} />);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(calls).toEqual(["schema"]);
  });

  it("excludes read-only fields (id) from the form", async () => {
    mockApi();
    render(<CrudCreateScreen {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(screen.queryByLabelText("Id")).not.toBeInTheDocument();
  });
});
