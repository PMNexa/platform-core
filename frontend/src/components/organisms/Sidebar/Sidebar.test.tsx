import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DefaultLink } from "../../types";
import Sidebar from "./Sidebar";

const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Organizations", to: "/orgs" },
];

describe("Sidebar", () => {
  it("renders every nav item", () => {
    render(<Sidebar brand="GoalNexa" navItems={NAV_ITEMS} currentPath="/orgs" linkComponent={DefaultLink} />);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Organizations" })).toBeInTheDocument();
  });

  it("marks only the item matching currentPath active", () => {
    render(<Sidebar brand="GoalNexa" navItems={NAV_ITEMS} currentPath="/orgs" linkComponent={DefaultLink} />);
    expect(screen.getByRole("link", { name: "Organizations" }).closest("li")).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Home" }).closest("li")).not.toHaveClass("active");
  });

  it("folds to Tabler's icon rail: first-letter fallback icon + label tooltip", () => {
    render(<Sidebar brand="GoalNexa" navItems={NAV_ITEMS} currentPath="/" linkComponent={DefaultLink} folded />);
    expect(document.querySelector("aside")).toHaveClass("navbar-folded");
    const item = screen.getByRole("link", { name: /Organizations/ }).closest("li");
    expect(item).toHaveAttribute("title", "Organizations");
    expect(item?.querySelector(".nav-link-icon")).toHaveTextContent("O");
  });

  it("is expanded by default, with no tooltip or fallback icon", () => {
    render(<Sidebar brand="GoalNexa" navItems={NAV_ITEMS} currentPath="/" linkComponent={DefaultLink} />);
    expect(document.querySelector("aside")).not.toHaveClass("navbar-folded");
    const item = screen.getByRole("link", { name: "Home" }).closest("li");
    expect(item).not.toHaveAttribute("title");
    expect(item?.querySelector(".nav-link-icon")).toBeNull();
  });

  it("opens the menu in a left drawer from the mobile toggler, and closes it on navigation", () => {
    const { rerender } = render(<Sidebar brand="GoalNexa" navItems={NAV_ITEMS} currentPath="/" linkComponent={DefaultLink} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveClass("offcanvas-start");
    expect(within(drawer).getByRole("link", { name: "Organizations" })).toBeInTheDocument();
    rerender(<Sidebar brand="GoalNexa" navItems={NAV_ITEMS} currentPath="/orgs" linkComponent={DefaultLink} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
