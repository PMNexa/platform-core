import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBaseApi } from "./lib/baseApi";
import type { BaseApi } from "./lib/baseApi";
import type { Schema } from "./lib/schema";
import { createCrudRouter } from "./CrudRouter";

vi.mock("./lib/baseApi");
vi.mock("./lib/request");

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

describe("createCrudRouter", () => {
  it("builds paths from the base URL's own last segment", () => {
    const router = createCrudRouter<Org>("/api/v1/orgs");
    expect(router.paths).toEqual({
      basePath: "orgs",
      listPath: "orgs",
      createPath: "orgs/new",
      detailPath: expect.any(Function),
      editPath: expect.any(Function),
    });
    expect(router.paths.editPath(1)).toBe("orgs/1/edit");
  });

  it("List/Create/Edit render with baseUrl already bound - a caller never passes it again", async () => {
    mockApi();
    const router = createCrudRouter<Org>("/api/v1/orgs");
    const List = router.List;
    const Create = router.Create;

    const { unmount } = render(<List accessToken="token" />);
    await waitFor(() => expect(screen.getByRole("link", { name: "New" })).toBeInTheDocument());
    expect(vi.mocked(createBaseApi).mock.calls.at(-1)?.[0]).toBe("/api/v1/orgs");
    unmount();

    render(<Create accessToken="token" />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(vi.mocked(createBaseApi).mock.calls.at(-1)?.[0]).toBe("/api/v1/orgs");
  });
});
