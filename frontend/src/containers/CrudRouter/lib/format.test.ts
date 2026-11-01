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
  it("shows a file by its name, not its stored path", () => {
    expect(formatFieldValue(field({ type: "file" }), "sources/abc/pmbok.pdf")).toBe("pmbok.pdf");
  });

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

  it("shows a list as one short line", () => {
    expect(formatFieldValue(field({ type: "list", items: { type: "string", required: true, read_only: false, label: "item" } }), ["A", "B"])).toBe("A, B");
    const citations = segments.items?.type === "object" ? segments.items.fields[3] : segments;
    expect(formatFieldValue(citations, [{ chunk: "S1-C02-001", chunk_id: "u1" }, { chunk: "S1-C08-002", chunk_id: "u2" }])).toBe("S1-C02-001, S1-C08-002");
    expect(formatFieldValue(citations, [])).toBe("—");
  });
});

const segments = field({
  name: "segments",
  type: "list",
  items: {
    type: "object",
    fields: [
      field({ name: "id", read_only: true, format: "uuid" }),
      field({ name: "kind", choices: [{ value: "hook", label: "Hook" }] }),
      field({ name: "text", label: "Text" }),
      field({ name: "citations", type: "list", items: { type: "object", fields: [field({ name: "chunk" }), field({ name: "chunk_id", read_only: true, format: "uuid" })] } }),
    ],
  },
});

