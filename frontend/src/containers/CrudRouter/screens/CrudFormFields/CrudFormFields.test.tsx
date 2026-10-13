import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CrudField } from "../../lib/types";
import CrudFormFields from "./CrudFormFields";

interface Org {
  id: number;
  name: string;
  seats: number;
  active: boolean;
  plan: string;
}

const FIELDS: CrudField<Org>[] = [
  { key: "name", label: "Name", required: true },
  { key: "seats", label: "Seats", type: "number" },
  { key: "active", label: "Active", type: "checkbox" },
  {
    key: "plan",
    label: "Plan",
    type: "select",
    options: [
      { value: "free", label: "Free" },
      { value: "pro", label: "Pro" },
    ],
  },
];

describe("CrudFormFields", () => {
  it("renders a FormControl per non-checkbox field, prefilled from values", () => {
    render(<CrudFormFields fields={FIELDS} values={{ name: "Acme", seats: 5 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Acme");
    expect(screen.getByLabelText("Seats")).toHaveValue(5);
  });

  it("renders a checkbox field as FormCheck", () => {
    render(<CrudFormFields fields={FIELDS} values={{ active: true }} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Active" })).toBeChecked();
  });

  it("renders a select field with its options, prefilled from values", () => {
    render(<CrudFormFields fields={FIELDS} values={{ plan: "pro" }} onChange={vi.fn()} />);
    const select = screen.getByLabelText("Plan");
    expect(select).toHaveValue("pro");
    expect(screen.getByRole("option", { name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pro" })).toBeInTheDocument();
  });

  it("calls onChange with the field key and the new value", () => {
    const onChange = vi.fn();
    render(<CrudFormFields fields={FIELDS} values={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Globex" } });
    expect(onChange).toHaveBeenCalledWith("name", "Globex");

    fireEvent.change(screen.getByLabelText("Seats"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith("seats", 12);

    fireEvent.click(screen.getByRole("checkbox", { name: "Active" }));
    expect(onChange).toHaveBeenCalledWith("active", true);

    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "pro" } });
    expect(onChange).toHaveBeenCalledWith("plan", "pro");
  });

  it("lets an optional select be cleared back to null", () => {
    const onChange = vi.fn();
    render(<CrudFormFields fields={FIELDS} values={{ plan: "pro" }} onChange={onChange} />);

    const select = screen.getByLabelText("Plan") as HTMLSelectElement;
    expect(select.querySelector('option[value=""]')).not.toBeDisabled();
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("plan", null);
  });

  it("doesn't offer a re-selectable empty option on a required select", () => {
    const requiredFields: CrudField<Org>[] = [{ ...FIELDS[3], required: true }];
    render(<CrudFormFields fields={requiredFields} values={{}} onChange={vi.fn()} />);
    const select = screen.getByLabelText("Plan") as HTMLSelectElement;
    expect(select.querySelector('option[value=""]')).toBeDisabled();
  });

  it("offers no re-selectable None on a select that refuses null (schema says nullable: false)", () => {
    render(<CrudFormFields fields={[{ ...FIELDS[3], nullable: false }]} values={{}} onChange={vi.fn()} />);
    const select = screen.getByLabelText("Plan") as HTMLSelectElement;
    expect(select.querySelector('option[value=""]')).toBeDisabled();
    expect(select.querySelector('option[value=""]')?.textContent).toBe("Select…");
  });

  it("lays fields out in sections, folds a collapsed one and hides a field whose rule fails", () => {
    const { container } = render(
      <CrudFormFields
        fields={FIELDS}
        values={{ plan: "free" }}
        onChange={vi.fn()}
        layout={[
          { title: "Plan", fields: ["plan", { name: "seats", show_if: { field: "plan", in: ["pro"] } }] },
          { title: "Advanced", collapsed: true, fields: ["active"] },
        ]}
      />,
    );
    expect(screen.getByText("Plan", { selector: "legend" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Seats")).toBeNull();
    expect(container.querySelector("details summary")?.textContent).toBe("Advanced");
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    // Not named by the layout: still shown, after it.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  describe("date/datetime fields", () => {
    interface Entry {
      when: string | null;
      due: string | null;
    }
    const DATE_FIELDS: CrudField<Entry>[] = [
      { key: "when", label: "When", type: "datetime", helpText: "Leave blank for now." },
      { key: "due", label: "Due", type: "date", nullable: true },
    ];

    it("renders native pickers prefilled from API values, with help text", () => {
      const iso = new Date(2026, 8, 23, 9, 30).toISOString();
      render(<CrudFormFields fields={DATE_FIELDS} values={{ when: iso, due: "2026-10-01" }} onChange={vi.fn()} />);
      expect(screen.getByLabelText("When")).toHaveAttribute("type", "datetime-local");
      expect(screen.getByLabelText("When")).toHaveValue("2026-09-23T09:30");
      expect(screen.getByLabelText("Due")).toHaveValue("2026-10-01");
      expect(screen.getByText("Leave blank for now.")).toBeInTheDocument();
    });

    it("emits an ISO timestamp, and on clear: undefined (non-nullable) vs null (nullable)", () => {
      const onChange = vi.fn();
      const iso = new Date(2026, 8, 23, 9, 30).toISOString();
      render(<CrudFormFields fields={DATE_FIELDS} values={{ when: iso, due: "2026-10-01" }} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("When"), { target: { value: "2026-09-24T10:15" } });
      expect(onChange).toHaveBeenLastCalledWith("when", new Date(2026, 8, 24, 10, 15).toISOString());
      fireEvent.change(screen.getByLabelText("When"), { target: { value: "" } });
      expect(onChange).toHaveBeenLastCalledWith("when", undefined);
      fireEvent.change(screen.getByLabelText("Due"), { target: { value: "" } });
      expect(onChange).toHaveBeenLastCalledWith("due", null);
    });
  });
});
