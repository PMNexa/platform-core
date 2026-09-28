import { useCallback, useEffect, useMemo, useState, type ReactNode, type SubmitEvent } from "react";
import Button from "../../../../components/atoms/Button";
import Icon from "../../../../components/atoms/Icon";
import Breadcrumb from "../../../../components/organisms/Breadcrumb";
import { Card, CardBody, CardFooter, CardHeader } from "../../../../components/organisms/Card";
import { DefaultLink } from "../../../../components/types";
import type { LinkComponent } from "../../../../components/types";
import type { DataTablePage } from "../../../DataTable";
import { createBaseApi } from "../../lib/baseApi";
import { pickFieldValues } from "../../lib/fields";
import type { BaseApi, BaseApiRequest } from "../../lib/baseApi";
import { formatFieldValue } from "../../lib/format";
import { createCrudPaths } from "../../lib/paths";
import { rowLabel, useRelationFields } from "../../lib/relationOptions";
import { createRequest } from "../../lib/request";
import { canDo, type Schema, type SchemaField } from "../../lib/schema";
import { loadSchema } from "../../lib/schemaCache";
import { createSchemaFields } from "../../lib/schemaFields";
import { useCrudForm } from "../../lib/useCrudForm";
import CrudFormFields from "../CrudFormFields";
import CrudRelationSection from "../CrudRelationSection";

type Row = Record<string, unknown>;

function lastSegment(url: string): string {
  return url.split("/").filter(Boolean).pop() ?? url;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface CrudDetailScreenProps {
  /** The resource's own base URL, e.g. `"/api/v1/goals"`. */
  baseUrl: string;
  accessToken: string;
  /** The record's id - a prop, not a router param (same rule as `CrudEditScreen`). */
  id: string | number;
  /** This resource's UI mount path when it isn't the bare resource name (e.g. `"platform-org/orgs"`) - same as `CrudListScreen`'s. Used for the breadcrumb. */
  basePath?: string;
  linkComponent?: LinkComponent;
  /**
   * Where ANOTHER resource's pages are mounted, from its API base URL -
   * for links to related rows' detail pages; `null` = it has no detail
   * page in this app (shown as a plain label). The generic route file
   * resolves this from the host's registered routes (`useResourcePath`);
   * the default is the URL's last segment (`"/api/v1/metrics"` ->
   * `"metrics"`).
   */
  resourcePath?: (endpoint: string) => string | null;
  /** Fires after a successful delete - the host owns navigating away. */
  onDeleted?: () => void;
}

/**
 * One record and its relationships. Same outer/inner split as the other
 * CRUD screens (schema first, then the record - see `CrudListScreen`'s
 * docstring). Layout: a Tabler page header, then ONE full-width card
 * whose tabs are "Details" (first, selected on load) and one per
 * relation - so a relation's table gets the page's whole width:
 * - page header: breadcrumb back to the list (`label_plural`), the
 *   resource `label` as pretitle, the row's `display_field` as title,
 *   Edit/Delete. Edit switches the "Details" tab to the schema-driven
 *   form in place (Save/Cancel) - no trip to the edit page, so it works
 *   the same inside a host's drawer; the relation tabs wait meanwhile;
 * - "Details" tab: every other scalar/to-one field in a responsive grid
 *   (`formatFieldValue`; a choice as a badge; `multiline` text as its own
 *   full-width block). A read-only `format: "uuid"` field that isn't a
 *   relation (an internal id like `owner_id`) is left out. A to-one
 *   relation shows the related row's `display_field` (related schema via
 *   `loadSchema`), linked to its detail page wherever `resourcePath` says
 *   it's mounted;
 * - one tab per to-many relation the schema marks with a `kind`, each
 *   with its row count (`?filter{back}=<id>&page_size=1`'s
 *   `total`), and the active one's `CrudRelationSection` (in-place CRUD
 *   for `one_to_many`, link/unlink for `many_to_many`).
 */
function CrudDetailScreen({ baseUrl, accessToken, ...rest }: CrudDetailScreenProps) {
  const request = useMemo(() => createRequest(accessToken), [accessToken]);
  const baseApi = useMemo(() => createBaseApi<Row>(baseUrl, request), [baseUrl, request]);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A new client (new token or resource) retries from scratch - a
    // failed earlier attempt (e.g. a 401 on a just-expired token) must
    // not keep hiding a schema that now loads fine.
    // oxlint-disable-next-line react/set-state-in-effect
    setError(null);
    baseApi
      .schema()
      .then((result) => {
        if (!cancelled) setSchema(result);
      })
      .catch((thrown: unknown) => {
        if (!cancelled) setError(thrown instanceof Error ? thrown : new Error(String(thrown)));
      });
    return () => {
      cancelled = true;
    };
  }, [baseApi]);

  if (error) return <Message error={error} />;
  if (!schema) return <Message />;
  return <CrudDetailView {...rest} baseApi={baseApi} schema={schema} request={request} />;
}

function Message({ error }: { error?: Error }) {
  return (
    <Card>
      <CardBody>
        {error ? (
          <p className="text-danger mb-0" role="alert">
            {error.message}
          </p>
        ) : (
          <div className="d-flex align-items-center gap-2 text-secondary">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            Loading…
          </div>
        )}
      </CardBody>
    </Card>
  );
}

interface CrudDetailViewProps extends Omit<CrudDetailScreenProps, "baseUrl" | "accessToken"> {
  baseApi: BaseApi<Row>;
  schema: Schema;
  request: BaseApiRequest;
}

/** The fields tab's key - not a valid field name, so it can't collide with a relation's. */
const DETAILS_TAB = "__details";

function isShownDetail(field: SchemaField, displayField: string | undefined): boolean {
  if (field.name === "id" || field.name === displayField || field.many) return false;
  // An opaque internal id (e.g. `owner_id`, set server-side) says nothing to a reader.
  if (field.format === "uuid" && field.read_only && field.type !== "relation") return false;
  return true;
}

function CrudDetailView({ baseApi, schema, request, id, basePath, linkComponent, resourcePath = lastSegment, onDeleted }: CrudDetailViewProps) {
  const Link = linkComponent ?? DefaultLink;
  const paths = createCrudPaths(basePath ?? lastSegment(baseApi.endpoint));
  const [record, setRecord] = useState<Row | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  const detailFields = useMemo(() => schema.fields.filter((field) => isShownDetail(field, schema.display_field)), [schema]);
  const relations = useMemo(
    () => schema.fields.filter((field) => field.many && field.kind && field.related_endpoint && field.back_filter),
    [schema],
  );
  const [activeTab, setActiveTab] = useState(DETAILS_TAB);

  const load = useCallback(() => {
    let cancelled = false;
    baseApi
      .read(id)
      .then((row) => {
        if (!cancelled) setRecord(row);
      })
      .catch((thrown: unknown) => {
        if (!cancelled) setLoadError(thrown instanceof Error ? thrown : new Error(String(thrown)));
      });
    return () => {
      cancelled = true;
    };
  }, [baseApi, id]);

  useEffect(() => load(), [load]);

  const relationLabels = useRelationLabels(detailFields, record, request);
  const [counts, refreshCounts] = useRelationCounts(relations, id, request);

  async function handleDelete() {
    if (!window.confirm(`Delete this ${schema.label ?? "item"}?`)) return;
    setDeleting(true);
    try {
      await baseApi.remove(id);
      onDeleted?.();
    } catch (thrown) {
      window.alert(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setDeleting(false);
    }
  }

  if (loadError) return <Message error={loadError} />;
  if (!record) return <Message />;

  const title = rowLabel(record, schema.display_field);

  function renderValue(field: SchemaField): ReactNode {
    const value = record?.[field.name];
    if (value == null || value === "") return <span className="text-secondary">—</span>;
    if (field.choices?.length) return <span className="badge bg-blue-lt">{formatFieldValue(field, value)}</span>;
    if (field.type === "boolean")
      return <span className={`badge ${value ? "bg-green-lt" : "bg-secondary-lt"}`}>{formatFieldValue(field, value)}</span>;
    if (field.type !== "relation") return formatFieldValue(field, value);
    const label = relationLabels[`${field.related_endpoint}/${value}`] ?? String(value);
    const mount = field.related_endpoint ? resourcePath(field.related_endpoint) : null;
    return mount == null ? label : <Link to={`${mount}/${value}`}>{label}</Link>;
  }

  const active = relations.find((relation) => relation.name === activeTab);
  const activeMount = active?.related_endpoint ? resourcePath(active.related_endpoint) : null;

  function handleRelationChanged() {
    load();
    refreshCounts();
  }

  return (
    <>
      <div className="page-header d-print-none mt-0 mb-3">
        <Breadcrumb
          items={[{ label: capitalize(schema.label_plural ?? lastSegment(baseApi.endpoint)), to: paths.listPath }, { label: title }]}
          linkComponent={linkComponent}
        />
        <div className="row g-2 align-items-center mt-1">
          <div className="col">
            {schema.label && <div className="page-pretitle">{schema.label}</div>}
            <h2 className="page-title text-break">{title}</h2>
          </div>
          <div className="col-auto ms-auto d-flex gap-2">
            {canDo(schema, "update") && !editing && (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveTab(DETAILS_TAB);
                  setEditing(true);
                }}
              >
                <Icon name="pencil" />
                Edit
              </Button>
            )}
            {canDo(schema, "delete") && (
              <Button variant="danger" outline disabled={deleting} onClick={handleDelete}>
                <Icon name="trash" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <ul className="nav nav-pills card-header-pills gap-1" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={!active}
                className={`nav-link${active ? "" : " active"}`}
                onClick={() => setActiveTab(DETAILS_TAB)}
              >
                Details
              </button>
            </li>
            {relations.map((relation) => {
              const selected = relation.name === active?.name;
              const count = counts[relation.name];
              return (
                <li key={relation.name} className="nav-item" role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`nav-link${selected ? " active" : ""}`}
                    disabled={editing}
                    onClick={() => setActiveTab(relation.name)}
                  >
                    {relation.label}
                    {count !== undefined && (
                      <span className={`badge badge-pill ms-2 ${selected ? "bg-primary text-primary-fg" : "bg-secondary-lt text-secondary"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </CardHeader>
        {active ? (
          // Keyed so switching tabs mounts a fresh section (its own schema + table state).
          <CrudRelationSection
            key={active.name}
            relation={active}
            parentApi={baseApi as BaseApi<unknown>}
            parentId={id}
            request={request}
            linkComponent={linkComponent}
            relatedDetailPath={activeMount == null ? undefined : (rowId) => `${activeMount}/${rowId}`}
            onChanged={handleRelationChanged}
            parentCanUpdate={canDo(schema, "update")}
          />
        ) : editing ? (
          <DetailEditForm
            id={id}
            schema={schema}
            record={record}
            baseApi={baseApi}
            request={request}
            onSaved={(row) => {
              setRecord(row);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <CardBody>
            {detailFields.length === 0 ? (
              <p className="text-secondary mb-0">Nothing else to show.</p>
            ) : (
              <dl className="row g-3 mb-0">
                {detailFields.map((field) => (
                  <div key={field.name} className={field.multiline ? "col-12" : "col-12 col-sm-6 col-lg-4 col-xl-3"}>
                    <dt className="text-secondary fw-normal small mb-1">{field.label}</dt>
                    <dd className="mb-0 text-break" style={field.multiline ? { whiteSpace: "pre-wrap" } : undefined}>
                      {renderValue(field)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        )}
      </Card>
    </>
  );
}

/**
 * The "Details" tab in edit mode: the same fields and form state as
 * `CrudEditScreen` (`createSchemaFields` + `useRelationFields`,
 * `pickFieldValues` on save), prefilled from the record already on screen.
 */
function DetailEditForm({
  id,
  schema,
  record,
  baseApi,
  request,
  onSaved,
  onCancel,
}: {
  id: string | number;
  schema: Schema;
  record: Row;
  baseApi: BaseApi<Row>;
  request: BaseApiRequest;
  onSaved: (row: Row) => void;
  onCancel: () => void;
}) {
  const baseFields = useMemo(() => createSchemaFields<Row>(schema), [schema]);
  const fields = useRelationFields(baseFields, request);
  const form = useCrudForm<Row>(record);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const row = await form.submit((values) => baseApi.update(id, pickFieldValues(values, fields)));
    if (row) onSaved(row);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <CardBody>
        <CrudFormFields fields={fields} values={form.values} onChange={form.setValue} />
        {form.error && (
          <p className="text-danger mb-0" role="alert">
            {form.error.message}
          </p>
        )}
      </CardBody>
      <CardFooter className="d-flex gap-2">
        <Button type="submit" variant="primary" disabled={form.submitting}>
          {form.submitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={form.submitting}>
          Cancel
        </Button>
      </CardFooter>
    </form>
  );
}

/**
 * Display labels for the record's to-one relation values, keyed
 * `"<related_endpoint>/<id>"` - the related schema's `display_field`
 * (cached) of one `GET` per distinct value, fetched in parallel after the
 * record loads. A failed lookup just leaves the bare id showing.
 */
function useRelationLabels(fields: SchemaField[], record: Row | null, request: BaseApiRequest): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const keys = useMemo(() => {
    if (!record) return [];
    const found = new Map<string, string>();
    for (const field of fields) {
      const value = record[field.name];
      if (field.type === "relation" && field.related_endpoint && value != null && value !== "")
        found.set(`${field.related_endpoint}/${value}`, field.related_endpoint);
    }
    return [...found];
  }, [fields, record]);

  useEffect(() => {
    let cancelled = false;
    for (const [key, endpoint] of keys) {
      Promise.all([loadSchema(endpoint, request), request<Row>(key)])
        .then(([schema, row]) => {
          if (!cancelled) setLabels((prev) => ({ ...prev, [key]: rowLabel(row, schema.display_field) }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [keys, request]);

  return labels;
}

/** Each relation's row count for the tab badges - one `page_size=1` list call per relation; `refresh` re-counts after a change. A failed count just shows no badge. */
function useRelationCounts(relations: SchemaField[], id: string | number, request: BaseApiRequest): [Record<string, number>, () => void] {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    for (const relation of relations) {
      const url = `${relation.related_endpoint}?filter{${relation.back_filter}}=${encodeURIComponent(String(id))}&page_size=1`;
      request<DataTablePage<Row>>(url)
        .then((page) => {
          if (!cancelled && typeof page?.total === "number") setCounts((prev) => ({ ...prev, [relation.name]: page.total }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [relations, id, request, nonce]);

  return [counts, useCallback(() => setNonce((value) => value + 1), [])];
}

export default CrudDetailScreen;
