import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "./Badge";

describe("Badge", () => {
  it("renders the light tint of its color by default", () => {
    render(<Badge color="green">ready</Badge>);
    expect(screen.getByText("ready")).toHaveClass("badge", "bg-green-lt");
  });

  it("is the neutral grey when no color is given", () => {
    render(<Badge>default</Badge>);
    expect(screen.getByText("default")).toHaveClass("bg-secondary-lt");
  });

  it("renders the solid fill with its foreground color when not light", () => {
    render(
      <Badge color="primary" light={false} pill>
        3
      </Badge>,
    );
    expect(screen.getByText("3")).toHaveClass("bg-primary", "text-primary-fg", "badge-pill");
  });

  it("lets a long label wrap and passes a title through", () => {
    render(
      <Badge wrap title="What this means">
        A long choice label
      </Badge>,
    );
    const badge = screen.getByTitle("What this means");
    expect(badge).toHaveClass("text-wrap");
  });
});
