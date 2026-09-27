import { describe, expect, it } from "vitest";
import { conditionParams, describeCondition, filterParams, filterableFields, operatorsFor } from "./filters";
import type { Schema, SchemaField } from "./schema";

const TITLE: SchemaField = { name: "title", type: "string", required: true, read_only: false, label: "Title" };
const STATUS: SchemaField = {
  name: "status",
  type: "string",
  required: false,
  read_only: false,
  label: "Status",
  choices: [
    { value: "done", label: "Done" },
    { value: "todo", label: "To do" },
  ],
};
const TARGET: SchemaField = { name: "target_value", type: "number", required: true, read_only: false, label: "Target" };
const DUE: SchemaField = { name: "target_date", type: "date", required: false, read_only: false, label: "Due", nullable: true };
const AT: SchemaField = { name: "checked_in_at", type: "datetime", required: false, read_only: false, label: "At" };
const PARENT: SchemaField = { name: "parent", type: "relation", required: false, read_only: false, label: "Parent", related_endpoint: "/api/v1/goals" };
const TAGS: SchemaField = { name: "tags", type: "relation", required: false, read_only: false, label: "Tags", many: true };
const SCHEMA: Schema = {
  fields: [{ name: "id", type: "string", required: false, read_only: true, label: "Id" }, TITLE, STATUS, TARGET, DUE, AT, PARENT, TAGS],
};

describe("filters", () => {
  it("offers every field but the id and to-many relations", () => {
    expect(filterableFields(SCHEMA).map((field) => field.name)).toEqual(["title", "status", "target_value", "target_date", "checked_in_at", "parent"]);
  });

  it("picks operators by field type, adding empty checks for nullable fields and optional relations", () => {
    expect(operatorsFor(TITLE).map((o) => o.op)).toEqual(["contains", "is", "is_not"]);
    expect(operatorsFor(STATUS).map((o) => o.op)).toEqual(["is", "is_not"]);
    expect(operatorsFor(TARGET).map((o) => o.op)).toEqual(["is", "is_not", "gt", "gte", "lt", "lte"]);
    expect(operatorsFor(DUE).map((o) => o.op)).toContain("empty");
    expect(operatorsFor(PARENT).map((o) => o.op)).toEqual(["is", "is_not", "empty", "not_empty"]);
  });

  it("builds core_api filter params", () => {
    expect(conditionParams(TITLE, { field: "title", op: "contains", value: "run" })).toEqual([["filter{title.icontains}", "run"]]);
    expect(conditionParams(STATUS, { field: "status", op: "is_not", value: "done" })).toEqual([["filter{-status}", "done"]]);
    expect(conditionParams(TARGET, { field: "target_value", op: "gte", value: "10" })).toEqual([["filter{target_value.gte}", "10"]]);
    expect(conditionParams(DUE, { field: "target_date", op: "empty", value: "" })).toEqual([["filter{target_date.isnull}", "true"]]);
    expect(conditionParams(TITLE, { field: "title", op: "is", value: "" })).toEqual([]);
  });

  it("filters a datetime by whole local days", () => {
    const start = new Date("2026-09-26T00:00").toISOString();
    const end = new Date("2026-09-27T00:00").toISOString();
    expect(conditionParams(AT, { field: "checked_in_at", op: "is", value: "2026-09-26" })).toEqual([
      ["filter{checked_in_at.gte}", start],
      ["filter{checked_in_at.lt}", end],
    ]);
    expect(conditionParams(AT, { field: "checked_in_at", op: "gt", value: "2026-09-26" })).toEqual([["filter{checked_in_at.gte}", end]]);
  });

  it("combines conditions and skips unknown fields", () => {
    expect(
      filterParams(SCHEMA, [
        { field: "title", op: "contains", value: "a" },
        { field: "gone", op: "is", value: "x" },
        { field: "parent", op: "is", value: "7" },
      ]),
    ).toEqual([
      ["filter{title.icontains}", "a"],
      ["filter{parent}", "7"],
    ]);
  });

  it("describes a condition with readable values", () => {
    expect(describeCondition(STATUS, { field: "status", op: "is", value: "done" })).toBe("Status is Done");
    expect(describeCondition(PARENT, { field: "parent", op: "is", value: "7", valueLabel: "Q3 OKRs" })).toBe("Parent is Q3 OKRs");
    expect(describeCondition(DUE, { field: "target_date", op: "empty", value: "" })).toBe("Due is empty");
  });
});
