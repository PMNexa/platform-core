import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefaultLink } from "../../types";
import SidebarNavGroup from "./SidebarNavGroup";

const GROUP = { label: "Access", children: [{ label: "Users", to: "/users" }, { label: "Roles", to: "/roles" }] };

function renderGroup(props: Partial<Parameters<typeof SidebarNavGroup>[0]> = {}) {
  return render(
    <ul>
      <SidebarNavGroup
        group={GROUP}
        isActive={(to) => to === "/roles"}
        linkComponent={DefaultLink}
        open
        onToggle={() => {}}
        {...props}
      />
    </ul>,
  );
}

describe("SidebarNavGroup", () => {
  it("shows its links when open and marks the group and the current link active", () => {
    const { container } = renderGroup();
    expect(container.querySelector(".dropdown-menu")).toHaveClass("show");
    expect(container.querySelector("li")).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Roles" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveClass("active");
  });

  it("hides its links when closed and asks the caller to toggle", () => {
    const onToggle = vi.fn();
    const { container } = renderGroup({ open: false, onToggle });
    expect(container.querySelector(".dropdown-menu")).not.toHaveClass("show");
    fireEvent.click(screen.getByRole("button", { name: "Access" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("folded: opens as a flyout on hover only, ignoring the remembered state", () => {
    const onToggle = vi.fn();
    const { container } = renderGroup({ folded: true, open: true, onToggle });
    const menu = container.querySelector(".dropdown-menu");
    expect(menu).not.toHaveClass("show");
    fireEvent.mouseEnter(container.querySelector("li") as HTMLElement);
    expect(menu).toHaveClass("show");
    vi.useFakeTimers();
    try {
      fireEvent.mouseLeave(container.querySelector("li") as HTMLElement);
      // Closes a moment later, so the pointer can cross onto the flyout.
      expect(menu).toHaveClass("show");
      act(() => vi.advanceTimersByTime(400));
      expect(menu).not.toHaveClass("show");
    } finally {
      vi.useRealTimers();
    }
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("folded: stays open when the pointer comes back before it closes", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderGroup({ folded: true });
      const li = container.querySelector("li") as HTMLElement;
      fireEvent.mouseEnter(li);
      fireEvent.mouseLeave(li);
      act(() => vi.advanceTimersByTime(100));
      fireEvent.mouseEnter(li);
      act(() => vi.advanceTimersByTime(400));
      expect(container.querySelector(".dropdown-menu")).toHaveClass("show");
    } finally {
      vi.useRealTimers();
    }
  });
});
