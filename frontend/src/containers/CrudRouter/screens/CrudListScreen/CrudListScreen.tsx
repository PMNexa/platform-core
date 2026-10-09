import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardFooter, CardHeader, DefaultLink, FormControl, Icon, Pagination } from "../../../../components";
import type { LinkComponent } from "../../../../components";
import { ColumnPicker, DataTable, useDataTable } from "../../../DataTable";
import type { DataTableColumn } from "../../../DataTable";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi, BaseApiRequest } from "../../lib/baseApi";
import { describeCondition, filterParams, type FilterCondition } from "../../lib/filters";
import { createCrudPaths } from "../../lib/paths";
import { rowLabel, useBareRelationLabels, useRelatedDisplayFields } from "../../lib/relationOptions";
import { createRequest } from "../../lib/request";
import { canDo, type Schema } from "../../lib/schema";
import { createSchemaColumns, toOneRelationFields, withRelationIncludes } from "../../lib/schemaColumns";
import CrudFilterModal from "../CrudFilterModal";

export interface CrudListScreenProps<T> {
  /** The resource's own base URL, e.g. `"/api/v1/goals"` - the only resource-shaped input this screen needs; `createBaseApi`/`createRequest` (see their own docstrings) build the actual client internally from this plus `accessToken`. */
  baseUrl: string;
  /** This platform's own Bearer-token convention (see `createRequest`'s own docstring) - a host passes whatever it already has (e.g. from `platform-auth-frontend`'s `LoginScreen`/`SignupScreen` `onSuccess` callback). */
  accessToken: string;
  /**
   * The UI's own mount path for this resource's list/new/edit pages
   * (e.g. `"platform-org/orgs"`, when a host nests a resource under its
   * own prefix - see `createCrudRoutes`'s `prefix()` note) - only needed
   * when that differs from the resource's bare name (the default,
   * derived from `baseUrl`'s own last segment - see `CrudListScreenTable`'s
   * own docstring). Threaded straight into `createCrudPaths` for the
   * New/Edit link hrefs this screen builds internally; a route file that
   * already knows its own real mounted `location.pathname` (e.g.
   * `crud-list.tsx`) is what computes and passes this.
   */
  basePath?: string;
  /** Same convention as every other `components`/`containers` piece - defaults to a plain `<a>` (`DefaultLink`) when the host doesn't pass its own router's `Link`. */
  linkComponent?: LinkComponent;
  /** Shows the `CardHeader` search box (only if the schema says the resource is `searchable`), wired to the same `DataTable` state as everything else on the list. @default true */
  searchable?: boolean;
  /** Fires after a row is successfully deleted - e.g. to show a toast. The list refetches itself either way. */
  onDeleted?: (row: T) => void;
}

/**
 * Loads the resource's OWN schema first (`baseApi.schema()`), THEN the
 * list - not in parallel. `useDataTable`'s `columnOrder`/`hiddenColumns`
 * state is a LAZY `useState` initializer, computed once from `columns`
 * at mount (see its own source) - a `columns` array that changes on a
 * LATER render (e.g. once an async schema fetch resolves) would leave
 * that initial state stale, silently hiding/misordering columns that
 * didn't exist yet the first time. Splitting into this outer component
 * (owns only the schema fetch) and `CrudListScreenTable` (mounted only
 * once schema is ready, calls `useDataTable` exactly once with its
 * FINAL columns from the start) sidesteps that rather than fighting it.
 *
 * `baseApi` itself is built HERE (`useMemo`, not per-render) from
 * `baseUrl`/`accessToken` - a caller hands over just the resource's URL
 * and a token, not a pre-built client object.
 */
function CrudListScreen<T>({ baseUrl, accessToken, basePath, linkComponent, searchable, onDeleted }: CrudListScreenProps<T>) {
  const request = useMemo(() => createRequest(accessToken), [accessToken]);
  const baseApi = useMemo(() => createBaseApi<T>(baseUrl, request), [baseUrl, request]);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Synchronizing with an external system (the network) - see
    // useDataTable's own fetch effect for the same rule applied there.
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

  if (error)
    return (
      <p className="text-danger" role="alert">
        {error.message}
      </p>
    );
  if (!schema) return <p className="text-secondary">Loading…</p>;

  return (
    <CrudListScreenTable
      baseApi={baseApi}
      request={request}
      schema={schema}
      basePath={basePath}
      linkComponent={linkComponent}
      searchable={searchable}
      onDeleted={onDeleted}
    />
  );
}

interface CrudListScreenTableProps<T> extends Omit<CrudListScreenProps<T>, "baseUrl" | "accessToken"> {
  baseApi: BaseApi<T>;
  /** For the related schemas that label to-one relation cells (`useRelatedDisplayFields`). */
  request: BaseApiRequest;
  schema: Schema;
}

/**
 * The actual `DataTable` plus a "New" link and a per-row Edit/Delete
 * column, framed in a `Card` - the "R" (and the delete half of "D") of
 * `CrudRouter`'s three screens. Edit is a `linkComponent` link (routing,
 * not a callback - same "host's router owns navigation" rule the whole
 * package follows), Delete is a real action (`baseApi.remove`, confirms
 * first). `columns` come from `createSchemaColumns(schema)` - see its
 * own docstring for what it includes/excludes.
 *
 * `resource` (for the "New"/edit link paths - `createCrudPaths`) is
 * read off `baseApi.endpoint`'s own last `/`-segment (`"/api/v1/goals"`
 * -> `"goals"`) by default - true for every ROOT-mounted resource in
 * this platform (a `BaseViewSet`'s registered URL segment always
 * matches its own standalone `config/urls.py` path, which this
 * platform's own convention keeps in sync with the host's mount point -
 * see root AGENTS.md) - `basePath` overrides it for a resource nested
 * under its own host prefix instead (e.g. `platform-org-frontend`'s own
 * `orgs` under `"platform-org/"`). `rowKey` is hardcoded to `row.id` the same way -
 * every model here uses `id` as its primary key, no exceptions, so
 * there's nothing left for a caller to actually configure.
 *
 * `useDataTable` is called HERE, not left to `DataTable`'s own default:
 * this screen owns the whole card's chrome (search + `ColumnPicker` in
 * `CardHeader`, `Pagination` in `CardFooter`) instead of `DataTable`'s
 * own bundled toolbar/pagination (`<DataTable table={table}>` renders in
 * BARE mode once given a lifted `table` - see its own docstring), so
 * every piece needs to read/write the SAME state, not independent
 * instances. After a delete, `table.refetch()` gets the list back in
 * sync with the server.
 *
 * "Filter" opens `CrudFilterModal` (conditions built field by field,
 * typed per field - see `lib/filters.ts`); the applied ones show as
 * removable chips under the header and reach the list as
 * `?filter{...}=` params through `table.setFilters`.
 *
 * To-one relation columns show the related row's name, not its id: the
 * list is fetched with `?include[]=` for them (`withRelationIncludes`),
 * and each related schema's `display_field` picks the label.
 *
 * Every DATA cell in the row opens the detail screen, not just the "View"
 * link - each gets its own invisible `.stretched-link` decoy anchor
 * (`tabIndex={-1}`/`aria-hidden`, no visible content, no `.btn` or any
 * other class carrying its OWN `position`) filling that cell's
 * `position-relative` box. Deliberately NOT one stretched-link spanning
 * the whole `<tr>`: verified against a real browser that `position:
 * relative` on a `<tr>` does not reliably act as the containing block
 * for an absolutely-positioned descendant (`::after` collapsed to the
 * anchor's own tiny content box instead of the row) - `<td>` does,
 * reliably. It's ALSO why the decoy can't just be the visible "Edit"
 * link with `.stretched-link` added: `.btn` itself sets `position:
 * relative`, which becomes the `::after`'s containing block INSTEAD of
 * the cell (same failure, one ancestor level closer) - a real Bootstrap
 * gotcha, not obvious from the docs.
 *
 * The ACTIONS cell (Edit/Delete themselves) deliberately does NOT get
 * this decoy, unlike every other cell - also verified against a real
 * browser, not assumed: `.btn`'s own `position: relative` on Edit/Delete
 * does NOT reliably paint over a same-cell decoy's `::after` the way
 * "later positioned sibling wins" suggests it should (confirmed by an
 * actual click on Delete hitting the decoy instead). Rather than fight
 * that stacking interaction, this cell just stays as it was - a small,
 * mostly-full-of-controls cell, so losing "click blank space here too"
 * costs little, in exchange for Delete definitely still working.
 */
function CrudListScreenTable<T>({ baseApi, request, schema, basePath, linkComponent, searchable, onDeleted }: CrudListScreenTableProps<T>) {
  const Link = linkComponent ?? DefaultLink;
  const resource = baseApi.endpoint.split("/").filter(Boolean).pop() ?? baseApi.endpoint;
  const paths = createCrudPaths(basePath ?? resource);
  const rowKey = (row: T) => (row as { id: string | number }).id;
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const fieldsByName = useMemo(() => new Map(schema.fields.map((field) => [field.name, field])), [schema]);

  const relationFields = useMemo(() => toOneRelationFields(schema), [schema]);
  const displayFields = useRelatedDisplayFields(relationFields, request);
  const [bareLabels, setLabelledRows] = useBareRelationLabels(relationFields, request);
  const schemaColumns = useMemo(() => createSchemaColumns<T>(schema, displayFields, bareLabels), [schema, displayFields, bareLabels]);

  async function handleDelete(row: T) {
    if (!window.confirm("Delete this item?")) return;
    const id = rowKey(row);
    setDeletingId(id);
    try {
      await baseApi.remove(id);
      table.refetch();
      onDeleted?.(row);
    } finally {
      setDeletingId(null);
    }
  }

  function rowLink(row: T) {
    return <Link to={paths.detailPath(rowKey(row))} tabIndex={-1} aria-hidden="true" className="stretched-link" />;
  }

  const columns: DataTableColumn<T>[] = [
    ...schemaColumns.map((column) => ({
      ...column,
      className: ["position-relative", column.className].filter(Boolean).join(" "),
      render: (row: T) => (
        <>
          {rowLink(row)}
          {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
        </>
      ),
    })),
    {
      key: "__crud_actions",
      header: "",
      className: "w-1",
      render: (row) => {
        const id = rowKey(row);
        const name = rowLabel(row as Record<string, unknown>, schema.display_field);
        return (
          <div className="d-flex gap-1 justify-content-end text-nowrap">
            <Link to={paths.detailPath(id)} className="btn btn-ghost-secondary btn-icon btn-sm" aria-label={`View ${name}`}>
              <Icon name="eye" />
            </Link>
            {canDo(schema, "update") && (
              <Link to={paths.editPath(id)} className="btn btn-ghost-secondary btn-icon btn-sm" aria-label={`Edit ${name}`}>
                <Icon name="pencil" />
              </Link>
            )}
            {canDo(schema, "delete") && (
              <Button
                type="button"
                icon
                className="btn-ghost-danger"
                aria-label={`Delete ${name}`}
                title="Delete"
                disabled={deletingId === id}
                onClick={() => handleDelete(row)}
              >
                <Icon name="trash" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  // Only where `?q=` actually searches something (the schema says so).
  const showSearch = searchable !== false && Boolean(schema.searchable);
  const table = useDataTable({ endpoint: withRelationIncludes(baseApi.endpoint, schema), columns, rowKey, fetcher: baseApi.list, searchable: showSearch });
  useEffect(() => setLabelledRows(table.items), [table.items, setLabelledRows]);

  function applyFilters(next: FilterCondition[]) {
    setConditions(next);
    table.setFilters(filterParams(schema, next));
  }

  return (
    <Card>
      <CardHeader className="d-flex align-items-center gap-2">
        {canDo(schema, "create") && (
          <Link to={paths.createPath} className="btn btn-primary btn-sm">
            <Icon name="plus" />
            New{schema.label ? ` ${schema.label}` : ""}
          </Link>
        )}
        <div className="d-flex align-items-center gap-2 ms-auto">
          {showSearch && (
            <FormControl
              type="search"
              aria-label="Search"
              placeholder="Search…"
              value={table.search}
              onChange={(event) => table.setSearch(event.target.value)}
              style={{ maxWidth: 240 }}
            />
          )}
          <Button type="button" variant="secondary" outline className="flex-shrink-0 text-nowrap" onClick={() => setFiltering(true)}>
            <Icon name="filter" />
            Filter
            {conditions.length > 0 && <span className="badge bg-primary text-primary-fg ms-1">{conditions.length}</span>}
          </Button>
          <ColumnPicker
            columns={table.orderedColumns}
            hiddenColumns={table.hiddenColumns}
            onToggleColumn={table.toggleColumn}
            onMoveColumn={table.moveColumn}
          />
        </div>
      </CardHeader>
      {conditions.length > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom">
          {conditions.map((condition, index) => {
            const field = fieldsByName.get(condition.field);
            if (!field) return null;
            const text = describeCondition(field, condition);
            return (
              <span key={index} className="badge bg-secondary-lt d-inline-flex align-items-center gap-1">
                {text}
                <button
                  type="button"
                  className="btn-close ms-1"
                  style={{ width: "0.5rem", height: "0.5rem" }}
                  aria-label={`Remove filter ${text}`}
                  onClick={() => applyFilters(conditions.filter((_, i) => i !== index))}
                />
              </span>
            );
          })}
          <Button type="button" variant="link" className="p-0" onClick={() => applyFilters([])}>
            Clear
          </Button>
        </div>
      )}
      {filtering && (
        <CrudFilterModal
          schema={schema}
          request={request}
          conditions={conditions}
          onClose={() => setFiltering(false)}
          onApply={(next) => {
            applyFilters(next);
            setFiltering(false);
          }}
        />
      )}
      <DataTable table={table} />
      <CardFooter>
        <Pagination
          page={table.page}
          pageCount={table.pageCount}
          onPageChange={table.setPage}
          pageSize={table.pageSize}
          pageSizeOptions={table.pageSizeOptions}
          onPageSizeChange={table.setPageSize}
        />
      </CardFooter>
    </Card>
  );
}

export default CrudListScreen;
