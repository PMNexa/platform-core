import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Alert from "./Alert";

describe("Alert", () => {
  it("announces a danger alert at once", () => {
    render(<Alert variant="danger">Could not save.</Alert>);
    expect(screen.getByRole("alert")).toHaveClass("alert", "alert-danger");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save.");
  });

  it("announces any other variant politely", () => {
    render(<Alert variant="success">Saved.</Alert>);
    expect(screen.getByRole("status")).toHaveClass("alert-success");
  });

  it("renders a title above the body", () => {
    render(
      <Alert variant="warning" title="Nothing is being sent">
        EMAIL_URL is not set.
      </Alert>
    );
    expect(screen.getByRole("heading", { name: "Nothing is being sent" })).toHaveClass("alert-title");
    expect(screen.getByText("EMAIL_URL is not set.")).toBeInTheDocument();
  });

  it("offers a close button only with onDismiss", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Alert variant="info">Hi</Alert>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    rerender(
      <Alert variant="info" onDismiss={onDismiss}>
        Hi
      </Alert>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveClass("alert-dismissible");
  });
});
