import { describe, expect, it } from "vitest";
import { layoutOrder, layoutSections, matches, recordMatches } from "./formLayout";
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

  it("places a widget's `with` fields with it, not again on their own", () => {
    const layout: FormLayout = [
      { fields: [{ name: "target_per", widget: "period", with: [{ name: "count_days", show_if: { field: "target_per", in: ["day"] } }, "missing"] }] },
    ];
    const [section, rest] = layoutSections(layout, FIELDS);
    expect(section.fields).toHaveLength(1);
    expect(section.fields[0].widget).toBe("period");
    expect(section.fields[0].with?.map(({ field, showIf }) => [field.key, showIf?.in])).toEqual([["count_days", ["day"]]]);
    expect(rest.fields.map(({ field }) => field.key)).toEqual(["name", "position"]);
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

describe("layoutOrder / recordMatches", () => {
  it("lists every named field in order, a widget's `with` fields after it", () => {
    const layout: FormLayout = [{ fields: ["name", { name: "target_per", widget: "w", with: [{ name: "count_days", show_if: { field: "target_per", in: ["day"] } }] }] }];
    expect(layoutOrder(layout).map(({ name }) => name)).toEqual(["name", "target_per", "count_days"]);
  });
  it("tests a saved record's value, null as empty", () => {
    expect(recordMatches({ field: "target_per", not_in: [""] }, { target_per: null })).toBe(false);
    expect(recordMatches({ field: "target_per", in: ["day"] }, { target_per: "day" })).toBe(true);
    expect(recordMatches({ field: "missing", in: ["day"] }, {})).toBe(true);
  });
});
