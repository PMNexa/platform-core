import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi } from "../../lib/baseApi";
import type { Schema, SchemaField } from "../../lib/schema";
import CrudRelationSection from "./CrudRelationSection";

vi.mock("../../lib/baseApi");

type Row = Record<string, unknown>;

const CHILD_SCHEMA: Schema = {
  label: "metric",
  label_plural: "metrics",
  display_field: "name",
  searchable: true,
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name" },
    { name: "goal", type: "relation", required: false, read_only: true, label: "Goal", many: false, related_model: "Goal", related_endpoint: "/api/v1/goals" },
  ],
};

function api(overrides: Partial<BaseApi<Row>> = {}): BaseApi<Row> {
  return {
    endpoint: "/api/v1/metrics",
    schema: vi.fn().mockResolvedValue(CHILD_SCHEMA),
    list: vi.fn().mockResolvedValue({ items: [{ id: "m1", name: "Revenue", goal: "g1" }], total: 1, page: 1, page_size: 10 }),
    read: vi.fn().mockResolvedValue({ id: "m1", name: "Revenue", goal: "g1" }),
    create: vi.fn().mockResolvedValue({ id: "m2", name: "Churn" }),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    file: vi.fn().mockResolvedValue(new Blob()),
    ...overrides,
  };
}

const request = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

function relation(overrides: Partial<SchemaField>): SchemaField {
  return {
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
    ...overrides,
  };
}

function setup(rel: SchemaField, relatedDetailPath: ((id: string | number) => string) | null = (id) => `metrics/${id}`) {
  const related = api();
  const parent = api({ endpoint: "/api/v1/goals" });
  vi.mocked(createBaseApi).mockReturnValue(related);
  const onChanged = vi.fn();
  render(
    <CrudRelationSection
      relation={rel}
      parentApi={parent as BaseApi<unknown>}
      parentId="g1"
      request={request}
      relatedDetailPath={relatedDetailPath ?? undefined}
      onChanged={onChanged}
    />,
  );
  return { related, parent, onChanged };
}

afterEach(() => vi.clearAllMocks());

describe("CrudRelationSection (one_to_many)", () => {
  it("hides the back-pointing column and links rows to their detail page", async () => {
    setup(relation({}));
    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Goal" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Revenue" })).toHaveAttribute("href", "metrics/m1");
  });

  it("has no View link when the related resource has no detail page", async () => {
    setup(relation({}), null);
    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Revenue" })).not.toBeInTheDocument();
  });

  it("shows an empty state with the create action when nothing is related yet", async () => {
    vi.mocked(createBaseApi).mockReturnValue(api({ list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 }) }));
    render(
      <CrudRelationSection relation={relation({})} parentApi={api() as BaseApi<unknown>} parentId="g1" request={request} />,
    );
    expect(await screen.findByText("No metrics yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New metric" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("creates a child with the parent preset, not asked for", async () => {
    const { related, onChanged } = setup(relation({}));
    fireEvent.click(await screen.findByRole("button", { name: "New metric" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.queryByLabelText("Goal")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Churn" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(related.create).toHaveBeenCalledWith({ name: "Churn", goal: "g1" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  it("edits a child in a modal", async () => {
    const { related } = setup(relation({}));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Revenue" }));
    const input = await screen.findByLabelText("Name");
    await waitFor(() => expect(input).toHaveValue("Revenue"));
    fireEvent.change(input, { target: { value: "ARR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(related.update).toHaveBeenCalledWith("m1", { name: "ARR" }));
  });

  it("deletes a child", async () => {
    const { related } = setup(relation({}));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Revenue" }));
    await waitFor(() => expect(related.remove).toHaveBeenCalledWith("m1"));
  });
});

describe("CrudRelationSection (many_to_many)", () => {
  const m2m = relation({ name: "tags", label: "Tags", kind: "many_to_many", back_filter: "goals", through_fields: [] });

  it("unlinks instead of deleting", async () => {
    const { related, parent } = setup(m2m);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(await screen.findByRole("button", { name: "Unlink Revenue" }));
    await waitFor(() => expect(parent.unlink).toHaveBeenCalledWith("g1", "tags", ["m1"]));
    expect(related.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Edit Revenue" })).not.toBeInTheDocument();
  });

  it("creates a row and links it, splitting through fields off", async () => {
    const withThrough = {
      ...m2m,
      through_fields: [{ name: "name", type: "string" as const, required: false, read_only: false, label: "Link note" }],
    };
    const { related, parent } = setup(withThrough);
    fireEvent.click(await screen.findByRole("button", { name: "New metric" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Churn" } });
    fireEvent.change(screen.getByLabelText("Link note"), { target: { value: "why" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and link" }));
    await waitFor(() => expect(parent.link).toHaveBeenCalledWith("g1", "tags", ["m2"], { name: "why" }));
    expect(related.create).toHaveBeenCalledWith({ name: "Churn" });
  });
});
