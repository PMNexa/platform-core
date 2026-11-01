import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Spinner from "./Spinner";

describe("Spinner", () => {
  it("is a status region reading Loading… by default", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(document.querySelector(".spinner-border-sm")).toBeInTheDocument();
  });

  it("keeps a hidden label for assistive tech", () => {
    render(<Spinner label="Saving" hideLabel />);
    expect(screen.getByText("Saving")).toHaveClass("visually-hidden");
  });

  it("renders Tabler's plain size on md", () => {
    render(<Spinner size="md" />);
    expect(document.querySelector(".spinner-border")).not.toHaveClass("spinner-border-sm");
  });
});
