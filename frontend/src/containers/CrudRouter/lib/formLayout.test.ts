import { describe, expect, it } from "vitest";
import { layoutSections, matches } from "./formLayout";
import type { CrudField, FormLayout } from "./types";

type Row = Record<string, unknown>;

const FIELDS: CrudField<Row>[] = [
  { key: "name", label: "Name" },
  { key: "target_per", label: "Target is for", type: "select", defaultValue: "" },
  { key: "count_days", label: "Count days", type: "select" },
  { key: "position", label: "Position" },
];

const LAYOUT: FormLayout = [
  { title: "Target", fields: ["target_per", { name: "count_days", show_if: { field: "target_per", in: ["day", "week"] } }] },
  { title: "Basics", fields: ["name", "missing"] },
];

describe("layoutSections", () => {
  it("keeps the layout's order, skips unknown names and puts the rest last", () => {
    const sections = layoutSections(LAYOUT, FIELDS);
    expect(sections.map((s) => s.title)).toEqual(["Target", "Basics", undefined]);
    expect(sections.map((s) => s.fields.map(({ field }) => field.key))).toEqual([["target_per", "count_days"], ["name"], ["position"]]);
  });
});

describe("matches", () => {
  const rule = { field: "target_per", in: ["day", "week"] };
  it("tests the form's value, else the select's default", () => {
    expect(matches(rule, FIELDS, { target_per: "week" })).toBe(true);
    expect(matches(rule, FIELDS, { target_per: "month" })).toBe(false);
    expect(matches(rule, FIELDS, {})).toBe(false);
    expect(matches({ field: "target_per", not_in: [""] }, FIELDS, { target_per: null })).toBe(false);
  });

  it("shows a field whose rule names a field the form doesn't have", () => {
    expect(matches({ field: "org_id", not_in: [""] }, FIELDS, {})).toBe(true);
  });
});
