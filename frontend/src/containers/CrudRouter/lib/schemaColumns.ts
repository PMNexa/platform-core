import type { DataTableColumn } from "../../DataTable";
import { formatFieldValue } from "./format";
import { rowLabel } from "./relationOptions";
import type { Schema, SchemaField } from "./schema";

function isDisplayable(field: SchemaField): boolean {
  if (field.name === "id") return false;
  // A to-many relation can't render sensibly in one flat cell (and is
  // deferred by default anyway - see Schema's own docstring), unlike a
  // to-one relation, which is one related row.
  if (field.type === "relation" && field.many) return false;
  return true;
}

/** The to-one relation fields a list can sideload (`?include[]=`) to label their cells - those with a registered related endpoint. */
export function toOneRelationFields(schema: Schema): SchemaField[] {
  return schema.fields.filter((field) => field.type === "relation" && !field.many && field.related_endpoint && isDisplayable(field));
}

/**
 * `endpoint` plus `include[]=<to-one relations>`, so each such relation
 * arrives as its nested row (see `core_api.serializers.DynamicRelationField`)
 * instead of a bare id - one request for the whole page's labels.
 * `skip` leaves out relations with no column (e.g. a relation tab's
 * back-pointing FK).
 */
export function withRelationIncludes(endpoint: string, schema: Schema, skip: string[] = []): string {
  const names = toOneRelationFields(schema)
    .map((field) => field.name)
    .filter((name) => !skip.includes(name));
  if (names.length === 0) return endpoint;
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}include[]=${names.join(",")}`;
}

/** A relation cell's value: a sideloaded row shows its `display_field` (falling back to its id), a bare id its label from `bareLabels` if known, else as is. */
function relationValue(value: unknown, displayField?: string, bareLabel?: string): string {
  if (value && typeof value === "object") return rowLabel(value as Record<string, unknown>, displayField);
  return value == null || value === "" ? "—" : (bareLabel ?? String(value));
}

/**
 * Builds `DataTable`'s columns straight from a `BaseViewSet.schema()`
 * response, one column per displayable field (see `isDisplayable`) -
 * `CrudListScreen`'s whole reason for loading the schema first. A to-one
 * relation column shows the related row's `display_field` when the list
 * was fetched with `withRelationIncludes` - `displayFields` maps each
 * related endpoint to its schema's `display_field` (see
 * `useRelatedDisplayFields`); a bare cross-module id shows its label from
 * `bareLabels` (`useBareRelationLabels`); until either loads, the cell shows the id.
 */
export function createSchemaColumns<T>(
  schema: Schema,
  displayFields: Record<string, string | undefined> = {},
  bareLabels: Record<string, string> = {},
): DataTableColumn<T>[] {
  return schema.fields.filter(isDisplayable).map(
    (field): DataTableColumn<T> => ({
      key: field.name,
      header: field.label,
      ...(field.help_text ? { hint: field.help_text } : {}),
      sortable: field.type !== "relation",
      // An opaque read-only id (e.g. `owner_id`) or long text is noise in
      // a row - still available through the column picker.
      hidden: (field.format === "uuid" && field.read_only && field.type !== "relation") || Boolean(field.multiline),
      truncate: field.multiline,
      render: (row) => {
        const value = (row as Record<string, unknown>)[field.name];
        if (field.type === "relation")
          return relationValue(
            value,
            field.related_endpoint ? displayFields[field.related_endpoint] : undefined,
            field.related_endpoint && value != null ? bareLabels[`${field.related_endpoint}/${String(value)}`] : undefined,
          );
        return formatFieldValue(field, value);
      },
    }),
  );
}
