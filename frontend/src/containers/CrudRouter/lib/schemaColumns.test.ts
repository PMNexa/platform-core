import { describe, expect, it } from "vitest";
import type { Schema } from "./schema";
import { createSchemaColumns, withRelationIncludes } from "./schemaColumns";

const SCHEMA: Schema = {
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name" },
    { name: "goal", type: "relation", required: true, read_only: true, label: "Goal", many: false, related_endpoint: "/api/v1/goals" },
    { name: "org", type: "relation", required: false, read_only: true, label: "Org", many: false, related_endpoint: null },
    { name: "check_ins", type: "relation", required: false, read_only: true, label: "Check-ins", many: true, related_endpoint: "/api/v1/check-ins" },
  ],
};

describe("withRelationIncludes", () => {
  it("sideloads to-one relations with a registered endpoint", () => {
    expect(withRelationIncludes("/api/v1/metrics", SCHEMA)).toBe("/api/v1/metrics?include[]=goal");
  });

  it("appends to an existing query and skips named relations", () => {
    expect(withRelationIncludes("/api/v1/metrics?filter{x}=1", SCHEMA)).toBe("/api/v1/metrics?filter{x}=1&include[]=goal");
    expect(withRelationIncludes("/api/v1/metrics", SCHEMA, ["goal"])).toBe("/api/v1/metrics");
  });
});

describe("createSchemaColumns", () => {
  it("labels a sideloaded relation with the related display field", () => {
    const goal = createSchemaColumns(SCHEMA, { "/api/v1/goals": "title" }).find((column) => column.key === "goal");
    expect(goal?.render?.({ goal: { id: "g1", title: "Run a marathon" } })).toBe("Run a marathon");
    expect(goal?.render?.({ goal: { id: "g1", title: "" } })).toBe("g1");
    expect(goal?.render?.({ goal: "g1" })).toBe("g1");
    expect(goal?.render?.({ goal: null })).toBe("—");
  });

  it("labels a bare cross-module id from the looked-up labels", () => {
    const owner = { name: "org_id", type: "relation", required: false, read_only: false, label: "Org", many: false, related_model: null, related_endpoint: "/api/v1/orgs" } as const;
    const column = createSchemaColumns({ fields: [owner] }, {}, { "/api/v1/orgs/o1": "Acme" })[0];
    expect(column.render?.({ org_id: "o1" })).toBe("Acme");
    expect(column.render?.({ org_id: "o2" })).toBe("o2");
  });

  it("leaves out id and to-many relations", () => {
    expect(createSchemaColumns(SCHEMA).map((column) => column.key)).toEqual(["name", "goal", "org"]);
  });
});
