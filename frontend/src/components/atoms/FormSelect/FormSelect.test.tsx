import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FormSelect from "./FormSelect";

describe("FormSelect", () => {
  it("renders a small form-select with its options", () => {
    render(
      <FormSelect aria-label="Cycle" defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </FormSelect>,
    );
    const select = screen.getByLabelText("Cycle");
    expect(select).toHaveClass("form-select", "form-select-sm");
    expect(select).toHaveValue("b");
  });

  it("supports md/lg sizes and a caller className", () => {
    const { rerender } = render(<FormSelect aria-label="Cycle" size="md" className="w-auto" />);
    expect(screen.getByLabelText("Cycle")).not.toHaveClass("form-select-sm", "form-select-lg");
    expect(screen.getByLabelText("Cycle")).toHaveClass("w-auto");
    rerender(<FormSelect aria-label="Cycle" size="lg" />);
    expect(screen.getByLabelText("Cycle")).toHaveClass("form-select-lg");
  });
});
