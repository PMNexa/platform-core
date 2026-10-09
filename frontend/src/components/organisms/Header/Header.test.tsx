import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

const user = { name: "Dev User", email: "dev@example.com" };

describe("Header", () => {
  it("renders no log out button when onLogout is omitted", () => {
    render(<Header />);
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("shows the account button when a user is given", () => {
    render(<Header user={user} />);
    expect(screen.getByRole("button", { name: "Account menu for Dev User" })).toBeInTheDocument();
  });

  it("calls onLogout from a bare button when there is no user", () => {
    const onLogout = vi.fn();
    render(<Header onLogout={onLogout} />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("puts log out inside the user dropdown", () => {
    const onLogout = vi.fn();
    render(<Header user={user} onLogout={onLogout} />);
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Account menu for Dev User" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });
});
