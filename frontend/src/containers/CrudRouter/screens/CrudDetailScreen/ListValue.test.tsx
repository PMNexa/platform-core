import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SchemaField } from "../../lib/schema";
import ListValue from "./ListValue";

const field = (overrides: Partial<SchemaField>): SchemaField => ({ name: "x", type: "string", required: false, read_only: false, label: "X", ...overrides });

const segments = field({
  name: "segments",
  type: "list",
  label: "Segments",
  items: {
    type: "object",
    fields: [
      field({ name: "id", label: "Id", read_only: true, format: "uuid" }),
      field({ name: "kind", label: "Kind", choices: [{ value: "hook", label: "Hook" }] }),
      field({ name: "text", label: "Text" }),
      field({ name: "citations", label: "Citations", type: "list", items: { type: "object", fields: [field({ name: "chunk" })] } }),
    ],
  },
});

describe("ListValue", () => {
  it("renders a list of objects as a table, one row per element, ids left out", () => {
    const long = "Scrum is a lightweight framework ".repeat(5).trim();
    render(<ListValue field={segments} value={[{ id: "u1", kind: "hook", text: long, citations: [{ chunk: "S1-C02-001" }, { chunk: "S1-C08-002" }] }]} />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Kind", "Text", "Citations"]);
    expect(screen.getByText("Hook")).toBeInTheDocument();
    const text = screen.getByText(long);
    expect(text).toHaveClass("td-clamp");
    expect(text.closest("td")).toHaveAttribute("title", long);
    expect(screen.getByText("S1-C02-001, S1-C08-002")).toBeInTheDocument();
  });

  it("renders plain values as a bulleted list and an empty list as a dash", () => {
    const { rerender } = render(<ListValue field={field({ type: "list", items: { type: "string", required: true, read_only: false, label: "item" } })} value={["A", "B"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["A", "B"]);
    rerender(<ListValue field={segments} value={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
