import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/organisms/Table";
import { formatFieldValue, listItemFields } from "../../lib/format";
import type { SchemaField } from "../../lib/schema";
import { useLocale } from "../../../../i18n";

/** Lines a cell of a nested row may take before it's cut (full text on hover). */
const CELL_LINES = 3;

/**
 * A `list` field on a detail page, readable instead of one run-on
 * paragraph: a list of objects (a script's segments, a quiz's questions)
 * is a compact table - one row per element, one column per sub-field
 * (opaque read-only ids left out), each cell clamped with its full value
 * on hover; a nested list inside a cell is one short line (`formatFieldValue`).
 * A list of plain values is a bulleted list.
 */
export function ListValue({ field, value }: { field: SchemaField; value: unknown[] }) {
  const locale = useLocale();
  if (value.length === 0) return <span className="text-secondary">—</span>;

  const columns = listItemFields(field);
  if (columns.length === 0)
    return (
      <ul className="mb-0 ps-3">
        {value.map((item, index) => (
          <li key={index}>{formatFieldValue({ ...field, type: "string", items: undefined }, item, locale)}</li>
        ))}
      </ul>
    );

  return (
    <Table responsive vcenter className="table-sm mb-0 border">
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableHeaderCell key={column.name}>{column.label}</TableHeaderCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {value.map((item, index) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return (
            <TableRow key={typeof row.id === "string" ? row.id : index}>
              {columns.map((column) => {
                const text = formatFieldValue(column, row[column.name], locale);
                return (
                  <TableCell key={column.name} clamp={CELL_LINES} title={text.length > 40 ? text : undefined}>
                    {text}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default ListValue;
