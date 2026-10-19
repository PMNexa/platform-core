import { describe, expect, it } from "vitest";
import { formatFieldValue } from "./format";
import type { SchemaField } from "./schema";

const field = (overrides: Partial<SchemaField>): SchemaField => ({
  name: "x",
  type: "string",
  required: false,
  read_only: false,
  label: "X",
  ...overrides,
});

describe("formatFieldValue", () => {
  it("shows an em dash for empty values", () => {
    expect(formatFieldValue(field({}), null)).toBe("—");
    expect(formatFieldValue(field({}), "")).toBe("—");
  });

  it("shows a choice's label", () => {
    const status = field({ choices: [{ value: "in_progress", label: "In progress" }] });
    expect(formatFieldValue(status, "in_progress")).toBe("In progress");
  });

  it("formats booleans and plain dates", () => {
    expect(formatFieldValue(field({ type: "boolean" }), false)).toBe("No");
    expect(formatFieldValue(field({ type: "date" }), "2026-01-31")).toContain("31");
  });

  it("spells out a structured value as key: value pairs", () => {
    expect(formatFieldValue(field({}), { per: "day", in_period: true, done: 3, note: null })).toBe("Per: day · In period: Yes · Done: 3");
    expect(formatFieldValue(field({}), ["a", "b"])).toBe("a, b");
  });
});
