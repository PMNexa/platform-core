import { useEffect, useMemo, useState } from "react";
import type { DataTablePage } from "../../DataTable";
import type { BaseApiRequest } from "./baseApi";
import type { SchemaField } from "./schema";
import { loadSchema } from "./schemaCache";
import type { CrudField, CrudFieldOption } from "./types";

/**
 * A row's display label: its schema's `display_field` value (see
 * `core_api.viewsets._display_field` - chosen server-side, per resource),
 * or the row's id if that's empty or unknown.
 */
export function rowLabel(row: Record<string, unknown>, displayField?: string): string {
  const value = displayField ? row[displayField] : undefined;
  if (value != null && value !== "") return String(value);
  return String(row.id);
}

/**
 * `CrudCreateForm`/`CrudEditForm`'s own relation-picker fetch - the related
 * resource's schema (for its `display_field`, cached) plus a plain
 * `GET <relatedEndpoint>?page_size=<max>` (the same `request` they
 * already build `baseApi` from, so it carries the same auth) turned into
 * a `CrudField.options` list. Capped at `EnvelopePageNumberPagination`'s
 * own `max_page_size` (100, see core_api/pagination.py) - a relation
 * with more rows than that has no picker UI yet beyond "the first 100",
 * a known gap, not solved here.
 */
export async function fetchRelationOptions(endpoint: string, request: BaseApiRequest): Promise<CrudFieldOption[]> {
  const [schema, page] = await Promise.all([
    loadSchema(endpoint, request),
    request<DataTablePage<Record<string, unknown>>>(`${endpoint}?page_size=100`),
  ]);
  return page.items.map((row) => ({ value: String(row.id), label: rowLabel(row, schema.display_field) }));
}

/**
 * `CrudCreateForm`/`CrudEditForm`'s shared hook: takes the STATIC fields
 * `createSchemaFields` already built (structure/type/required never
 * change once `schema` is loaded) and layers in each relation field's
 * `options`, fetched once per distinct `relatedEndpoint` as they resolve
 * - each one independently, not blocking the others (a slow `?include[]=`-
 * heavy related resource shouldn't hold up a fast one). A field with no
 * `relatedEndpoint` (everything non-relation, plus a relation with no
 * registered endpoint - see `schemaFields.ts`) passes through untouched.
 */
export function useRelationFields<T>(baseFields: CrudField<T>[], request: BaseApiRequest): CrudField<T>[] {
  const [optionsByEndpoint, setOptionsByEndpoint] = useState<Record<string, CrudFieldOption[]>>({});
  const endpoints = useMemo(
    () => Array.from(new Set(baseFields.map((field) => field.relatedEndpoint).filter((value): value is string => Boolean(value)))),
    [baseFields],
  );

  useEffect(() => {
    let cancelled = false;
    for (const endpoint of endpoints) {
      fetchRelationOptions(endpoint, request)
        .then((options) => {
          if (!cancelled) setOptionsByEndpoint((prev) => ({ ...prev, [endpoint]: options }));
        })
        // A relation picker that fails to load just stays an empty
        // select (still submittable for an optional relation) rather
        // than breaking the whole form - not caught-and-surfaced like
        // the schema/record fetch errors above it.
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [endpoints, request]);

  return useMemo(
    () => baseFields.map((field) => (field.relatedEndpoint ? { ...field, options: optionsByEndpoint[field.relatedEndpoint] ?? field.options } : field)),
    [baseFields, optionsByEndpoint],
  );
}

/**
 * Each related endpoint's `display_field`, from its (cached) schema -
 * what a list needs to label sideloaded to-one relation cells (see
 * `createSchemaColumns`). Fills in as each schema resolves; a failed one
 * stays missing, so its cells fall back to the id.
 */
export function useRelatedDisplayFields(fields: SchemaField[], request: BaseApiRequest): Record<string, string | undefined> {
  const [displayFields, setDisplayFields] = useState<Record<string, string | undefined>>({});
  const endpoints = useMemo(
    () => Array.from(new Set(fields.map((field) => field.related_endpoint).filter((value): value is string => Boolean(value)))),
    [fields],
  );

  useEffect(() => {
    let cancelled = false;
    for (const endpoint of endpoints) {
      loadSchema(endpoint, request)
        .then((schema) => {
          if (!cancelled) setDisplayFields((prev) => ({ ...prev, [endpoint]: schema.display_field }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [endpoints, request]);

  return displayFields;
}

/**
 * Labels for to-one relations stored as a bare id of another module's
 * resource (`Meta.related_endpoints`, schema `related_model: null` - e.g. a
 * goal's `org_id`), which `?include[]=` can't sideload. Keyed
 * `"<related_endpoint>/<id>"`: one `GET <endpoint>?filter{id.in}=...` per
 * endpoint for the ids on screen not labelled yet, labelled with that
 * schema's `display_field`. A failed lookup leaves the bare id showing.
 * Returns the labels and a setter for the rows on screen - the columns
 * using the labels are built before the table that loads those rows.
 */
export function useBareRelationLabels(
  fields: SchemaField[],
  request: BaseApiRequest,
): [Record<string, string>, (rows: readonly unknown[]) => void] {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<readonly unknown[]>([]);
  const missing = useMemo(() => {
    const byEndpoint = new Map<string, Set<string>>();
    for (const field of fields) {
      if (field.type !== "relation" || field.many || field.related_model != null || !field.related_endpoint) continue;
      for (const row of rows) {
        const value = (row as Record<string, unknown>)[field.name];
        if (value == null || value === "" || typeof value === "object") continue;
        const id = String(value);
        if (`${field.related_endpoint}/${id}` in labels) continue;
        const ids = byEndpoint.get(field.related_endpoint) ?? new Set<string>();
        ids.add(id);
        byEndpoint.set(field.related_endpoint, ids);
      }
    }
    return [...byEndpoint].map(([endpoint, ids]) => [endpoint, [...ids].sort()] as const);
  }, [fields, rows, labels]);
  const missingKey = JSON.stringify(missing);

  useEffect(() => {
    let cancelled = false;
    for (const [endpoint, ids] of missing) {
      const query = new URLSearchParams({ "filter{id.in}": ids.join(","), page_size: String(ids.length) });
      Promise.all([loadSchema(endpoint, request), request<DataTablePage<Record<string, unknown>>>(`${endpoint}?${query}`)])
        .then(([schema, page]) => {
          if (cancelled) return;
          setLabels((prev) => {
            const next = { ...prev };
            // An id the caller can't see stays unlabelled (and isn't asked for again).
            for (const id of ids) next[`${endpoint}/${id}`] = id;
            for (const row of page.items) next[`${endpoint}/${String(row.id)}`] = rowLabel(row, schema.display_field);
            return next;
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `missingKey` stands for `missing`
  }, [missingKey, request]);

  return [labels, setRows];
}
