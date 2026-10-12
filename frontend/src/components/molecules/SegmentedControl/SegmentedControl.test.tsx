import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SegmentedControl from "./SegmentedControl";

const OPTIONS = [
  { value: "a", label: "Check in" },
  { value: "b", label: "Targets" },
] as const;

describe("SegmentedControl", () => {
  it("marks the picked option and reports a new one", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Mode" options={[...OPTIONS]} value="a" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Mode" })).toHaveClass("btn-group");
    const picked = screen.getByRole("button", { name: "Check in" });
    const other = screen.getByRole("button", { name: "Targets" });
    expect(picked).toHaveAttribute("aria-pressed", "true");
    expect(picked).toHaveClass("btn-primary", "btn-sm");
    expect(other).toHaveClass("btn-outline-primary");
    fireEvent.click(picked);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
