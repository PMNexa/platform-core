import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title alone", () => {
    const { container } = render(<EmptyState title="No results." />);
    expect(screen.getByText("No results.")).toHaveClass("empty-title");
    expect(container.querySelector(".empty-subtitle")).not.toBeInTheDocument();
    expect(container.querySelector(".empty-action")).not.toBeInTheDocument();
  });

  it("renders the description and the action", () => {
    render(<EmptyState title="No sources yet." description="Upload a book to start." action={<a href="/sources/new">New source</a>} />);
    expect(screen.getByText("Upload a book to start.")).toHaveClass("empty-subtitle");
    expect(screen.getByRole("link", { name: "New source" }).closest(".empty-action")).toBeInTheDocument();
  });

  it("tightens its padding on sm", () => {
    const { container } = render(<EmptyState title="Nothing" size="sm" />);
    expect((container.firstChild as HTMLElement).style.padding).toBe("2rem 1rem");
  });
});
