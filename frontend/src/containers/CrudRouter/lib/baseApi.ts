import type { DataTablePage } from "../../DataTable";
import { encodeBody } from "./multipart";
import type { Schema } from "./schema";

/** A caller's own authenticated-fetch-and-parse function (Bearer token injection, error shaping - see `createRequest`) - `createBaseApi` only owns the URL-building/method wiring, never the fetch mechanism itself. */
export type BaseApiRequest = <R>(path: string, init?: RequestInit) => Promise<R>;

/**
 * One `BaseViewSet`-backed resource's whole client surface, mirroring
 * the backend abstraction 1:1: `schema` (the resource's own field
 * description), `list`/`read` (GET), `create` (POST), `update` (PATCH -
 * a partial update, not a full PUT replace), `remove` (DELETE).
 * `CrudListScreen`/`CrudCreateScreen`/`CrudEditScreen` all build one of
 * these internally (`useMemo`, from just `baseUrl`/`accessToken`) - see
 * their own docstrings.
 */
export interface BaseApi<T> {
  /** The resource's own base URL, e.g. `"/api/v1/goals"` - `CrudListScreen` derives its OWN "New"/edit link paths from this (its last `/`-segment), and `list`'s caller (`DataTable`) appends `?page=`/`?sort=`/etc directly onto it. */
  endpoint: string;
  /** `GET <endpoint>/schema` - see `core_api.viewsets.BaseViewSet.schema`. */
  schema: () => Promise<Schema>;
  /** `GET <url>` - `url` arrives fully built (`endpoint` + `?page=`/`?sort=`/`?q=`), same shape `DataTableFetcher` already expects, since this IS what gets passed as one. */
  list: (url: string) => Promise<DataTablePage<T>>;
  /** `GET <endpoint>/<id>` - a single row. */
  read: (id: string | number) => Promise<T>;
  /** `POST <endpoint>`. */
  create: (values: Partial<T>) => Promise<T>;
  /** `PATCH <endpoint>/<id>` - partial, not a full PUT replace. */
  update: (id: string | number, values: Partial<T>) => Promise<T>;
  /** `DELETE <endpoint>/<id>`. */
  remove: (id: string | number) => Promise<void>;
  /** `GET <endpoint>/<id>/files/<field>` - a `file` field's content (see `SchemaField.accept`), through the row's own scoping. */
  file: (id: string | number, field: string) => Promise<Blob>;
  /** `POST <endpoint>/<id>/relations/<relation>/link` - links a many-to-many relation's rows to this one; `through` carries a custom through model's own fields (see `SchemaField.through_fields`). */
  link: (id: string | number, relation: string, ids: (string | number)[], through?: Record<string, unknown>) => Promise<void>;
  /** `POST <endpoint>/<id>/relations/<relation>/unlink` - removes those links; the rows themselves stay. */
  unlink: (id: string | number, relation: string, ids: (string | number)[]) => Promise<void>;
}

export function createBaseApi<T>(endpoint: string, request: BaseApiRequest): BaseApi<T> {
  return {
    endpoint,
    schema: () => request<Schema>(`${endpoint}/schema`),
    list: (url) => request<DataTablePage<T>>(url),
    read: (id) => request<T>(`${endpoint}/${id}`),
    // JSON, or multipart once a `File` is among the values (a `file` field).
    create: (values) => request<T>(endpoint, { method: "POST", body: encodeBody(values) }),
    update: (id, values) => request<T>(`${endpoint}/${id}`, { method: "PATCH", body: encodeBody(values) }),
    remove: (id) => request<void>(`${endpoint}/${id}`, { method: "DELETE" }),
    file: (id, field) => request<Blob>(`${endpoint}/${id}/files/${field}`, { headers: { Accept: "application/octet-stream" } }),
    link: (id, relation, ids, through) =>
      request<void>(`${endpoint}/${id}/relations/${relation}/link`, {
        method: "POST",
        body: JSON.stringify(through ? { ids, through } : { ids }),
      }),
    unlink: (id, relation, ids) =>
      request<void>(`${endpoint}/${id}/relations/${relation}/unlink`, { method: "POST", body: JSON.stringify({ ids }) }),
  };
}
