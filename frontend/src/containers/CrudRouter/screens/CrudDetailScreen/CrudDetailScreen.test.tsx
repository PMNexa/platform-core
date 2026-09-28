import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi } from "../../lib/baseApi";
import { createRequest } from "../../lib/request";
import type { Schema } from "../../lib/schema";
import CrudDetailScreen from "./CrudDetailScreen";

vi.mock("../../lib/baseApi");
vi.mock("../../lib/request");

type Row = Record<string, unknown>;

const GOAL_SCHEMA: Schema = {
  label: "goal",
  display_field: "title",
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "title", type: "string", required: true, read_only: false, label: "Title" },
    {
      name: "status",
      type: "string",
      required: false,
      read_only: false,
      label: "Status",
      choices: [{ value: "in_progress", label: "In progress" }],
    },
    { name: "parent", type: "relation", required: false, read_only: true, label: "Parent", many: false, related_model: "Goal", related_endpoint: "/api/v1/goals" },
    { name: "org_id", type: "relation", required: false, read_only: false, label: "Org", many: false, related_model: null, related_endpoint: "/api/v1/orgs" },
    {
      name: "metrics",
      type: "relation",
      required: false,
      read_only: true,
      label: "Metrics",
      many: true,
      related_model: "Metric",
      related_endpoint: "/api/v1/metrics",
      kind: "one_to_many",
      back_filter: "goal",
    },
    {
      name: "tags",
      type: "relation",
      required: false,
      read_only: true,
      label: "Tags",
      many: true,
      related_model: "Tag",
      related_endpoint: "/api/v1/tags",
      kind: "many_to_many",
      back_filter: "goals",
      through_fields: [],
    },
  ],
};

const RELATED_SCHEMA: Schema = {
  label: "metric",
  display_field: "name",
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name" },
  ],
};

function api(endpoint: string, overrides: Partial<BaseApi<Row>> = {}): BaseApi<Row> {
  return {
    endpoint,
    schema: vi.fn().mockResolvedValue(RELATED_SCHEMA),
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 }),
    read: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({ id: "new" }),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setup() {
  const goals = api("/api/v1/goals", {
    schema: vi.fn().mockResolvedValue(GOAL_SCHEMA),
    read: vi.fn().mockResolvedValue({ id: "g1", title: "Ship v1", status: "in_progress", parent: "g0", org_id: "o1" }),
  });
  const apis: Record<string, BaseApi<Row>> = {
    "/api/v1/goals": goals,
    "/api/v1/metrics": api("/api/v1/metrics"),
    "/api/v1/tags": api("/api/v1/tags"),
  };
  vi.mocked(createBaseApi).mockImplementation(((endpoint: string) => apis[endpoint]) as typeof createBaseApi);
  const request = vi.fn().mockImplementation(async (path: string) => {
    if (path === "/api/v1/goals/schema") return GOAL_SCHEMA;
    if (path === "/api/v1/orgs/schema") return { display_field: "name", fields: [] };
    if (path === "/api/v1/goals/g0") return { id: "g0", title: "Company OKRs" };
    if (path === "/api/v1/orgs/o1") return { id: "o1", name: "Acme" };
    throw new Error(`unexpected ${path}`);
  });
  vi.mocked(createRequest).mockReturnValue(request as never);
  return { goals, apis };
}

afterEach(() => vi.clearAllMocks());

const PROPS = { baseUrl: "/api/v1/goals", accessToken: "token", id: "g1" };

describe("CrudDetailScreen", () => {
  it("shows the record's fields read-only, with choice labels", async () => {
    setup();
    render(<CrudDetailScreen {...PROPS} />);
    expect(await screen.findByRole("heading", { name: "Ship v1" })).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("edits in place: Edit turns Details into the form, Save updates and shows the saved record", async () => {
    const { goals } = setup();
    vi.mocked(goals.update).mockResolvedValue({ id: "g1", title: "Ship v2", status: "in_progress", parent: "g0", org_id: "o1" });
    render(<CrudDetailScreen {...PROPS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText(/Title/);
    expect(title).toHaveValue("Ship v1");
    expect(screen.getByRole("tab", { name: /Metrics/ })).toBeDisabled();
    fireEvent.change(title, { target: { value: "Ship v2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Ship v2" })).toBeInTheDocument();
    expect(vi.mocked(goals.update).mock.calls[0][0]).toBe("g1");
    expect(vi.mocked(goals.update).mock.calls[0][1]).toMatchObject({ title: "Ship v2" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("Cancel leaves edit mode without saving", async () => {
    const { goals } = setup();
    render(<CrudDetailScreen {...PROPS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Ship v1" })).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(goals.update).not.toHaveBeenCalled();
  });

  it("labels to-one relations by the related schema's display field, linked where they're mounted", async () => {
    setup();
    const resourcePath = (endpoint: string) => (endpoint === "/api/v1/orgs" ? "platform-org/orgs" : "goals");
    render(<CrudDetailScreen {...PROPS} resourcePath={resourcePath} />);
    expect(await screen.findByRole("link", { name: "Company OKRs" })).toHaveAttribute("href", "goals/g0");
    expect(await screen.findByRole("link", { name: "Acme" })).toHaveAttribute("href", "platform-org/orgs/o1");
  });

  it("shows a relation without a detail page as a plain label", async () => {
    setup();
    render(<CrudDetailScreen {...PROPS} resourcePath={(endpoint) => (endpoint === "/api/v1/orgs" ? null : "goals")} />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Acme" })).not.toBeInTheDocument();
  });

  it("opens on a Details tab, then one tab per to-many relation listing its rows by back filter", async () => {
    const { apis } = setup();
    render(<CrudDetailScreen {...PROPS} />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Details", "Metrics", "Tags"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(apis["/api/v1/metrics"].list).not.toHaveBeenCalled();

    fireEvent.click(tabs[1]);
    await waitFor(() => expect(apis["/api/v1/metrics"].list).toHaveBeenCalled());
    expect(vi.mocked(apis["/api/v1/metrics"].list).mock.calls[0][0]).toMatch(/^\/api\/v1\/metrics\?filter\{goal\}=g1&/);
    expect(screen.queryByText("In progress")).not.toBeInTheDocument();

    fireEvent.click(tabs[2]);
    expect(await screen.findByRole("button", { name: "Link existing" })).toBeInTheDocument();
    await waitFor(() => expect(apis["/api/v1/tags"].list).toHaveBeenCalled());
    expect(vi.mocked(apis["/api/v1/tags"].list).mock.calls[0][0]).toMatch(/filter\{goals\}=g1/);
  });

  it("deletes the record after confirming", async () => {
    const { goals } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleted = vi.fn();
    render(<CrudDetailScreen {...PROPS} onDeleted={onDeleted} />);
    const header = (await screen.findByRole("heading", { name: "Ship v1" })).closest(".page-header") as HTMLElement;
    fireEvent.click(within(header).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(goals.remove).toHaveBeenCalledWith("g1");
  });
});
