import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "./Table";

describe("Table", () => {
  it("wraps in .table-responsive when responsive is true", () => {
    const { container } = render(
      <Table responsive>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector(".table-responsive")).toBeInTheDocument();
  });

  it("uses a breakpoint-specific responsive class", () => {
    const { container } = render(
      <Table responsive="md">
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector(".table-responsive-md")).toBeInTheDocument();
  });

  it("applies vcenter/selectable on the table and variant on a row", () => {
    render(
      <Table vcenter selectable>
        <TableBody>
          <TableRow variant="danger">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("table")).toHaveClass("table-vcenter", "table-selectable");
    expect(screen.getByRole("row")).toHaveClass("table-danger");
  });

  it("renders a sortable header as a button wired to aria-sort", () => {
    const onSort = vi.fn();
    render(
      <table>
        <TableHead>
          <TableRow>
            <TableHeaderCell sort="asc" onSort={onSort} sortKey="name">
              Name
            </TableHeaderCell>
          </TableRow>
        </TableHead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
    screen.getByRole("button", { name: "Name" }).click();
    expect(onSort).toHaveBeenCalled();
  });

  it("renders a plain header cell with no button when onSort is omitted", () => {
    render(
      <table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
          </TableRow>
        </TableHead>
      </table>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader")).not.toHaveAttribute("aria-sort");
  });

  it("wraps truncated cell content and sets data-label", () => {
    render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell label="Name" truncate>
              A very long value
            </TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    const value = screen.getByText("A very long value");
    expect(value).toHaveClass("text-truncate");
    expect(value.closest("td")).toHaveClass("td-truncate");
    expect(value.closest("td")).toHaveAttribute("data-label", "Name");
  });

  it("clamps a long cell to N lines with its full value on hover", () => {
    render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell clamp={2} title="The whole long value">
              The whole long value
            </TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    const value = screen.getByText("The whole long value", { selector: "div" });
    expect(value).toHaveClass("td-clamp");
    expect(value.style.webkitLineClamp).toBe("2");
    expect(value.style.overflowWrap).toBe("anywhere");
    expect(value.closest("td")).toHaveAttribute("title", "The whole long value");
  });

  it("truncate wins over clamp", () => {
    render(
      <table>
        <TableBody>
          <TableRow>
            <TableCell clamp={2} truncate>
              Value
            </TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    expect(screen.getByText("Value")).toHaveClass("text-truncate");
    expect(document.querySelector(".td-clamp")).toBeNull();
  });
});
