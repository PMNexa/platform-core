import { useEffect, useMemo, useState } from "react";
import Button from "../../../../components/atoms/Button";
import Icon from "../../../../components/atoms/Icon";
import FormControl from "../../../../components/atoms/FormControl";
import { CardFooter } from "../../../../components/organisms/Card";
import Pagination from "../../../../components/organisms/Pagination";
import { DefaultLink } from "../../../../components/types";
import type { LinkComponent } from "../../../../components/types";
import { ColumnPicker, DataTable, useDataTable } from "../../../DataTable";
import type { DataTableColumn } from "../../../DataTable";
import { createBaseApi } from "../../lib/baseApi";
import { rowLabel, useBareRelationLabels, useRelatedDisplayFields } from "../../lib/relationOptions";
import type { BaseApi, BaseApiRequest } from "../../lib/baseApi";
import { canDo, type Schema, type SchemaField } from "../../lib/schema";
import { createSchemaColumns, toOneRelationFields, withRelationIncludes } from "../../lib/schemaColumns";
import { createSchemaFields } from "../../lib/schemaFields";
import type { CrudField } from "../../lib/types";
import CrudFormModal from "../CrudFormModal";
import CrudLinkModal from "../CrudLinkModal";

type Row = Record<string, unknown>;

/** Prefix for a through model's own fields when they share one form with the related row's fields ("New" on a many-to-many) - keeps e.g. a through `name` apart from the row's own `name`. */
const THROUGH_PREFIX = "through__";

export interface CrudRelationSectionProps {
  /** A to-many schema field of the parent resource with `kind` and `related_endpoint` set. */
  relation: SchemaField;
  parentApi: BaseApi<unknown>;
  parentId: string | number;
  request: BaseApiRequest;
  linkComponent?: LinkComponent;
  /** The UI path of a related row's own detail page; omitted = the related resource has none in this app (no View link). */
  relatedDetailPath?: (id: string | number) => string;
  /** Fires after any change to the relation's rows - a parent may show values derived from them (e.g. a metric's current value, from its check-ins). */
  onChanged?: () => void;
  /** Whether the caller may update the parent row - linking/unlinking a many-to-many row is an update of the parent (the parent schema's `can.update`). @default true */
  parentCanUpdate?: boolean;
}

/**
 * One to-many relation's rows on a detail screen, managed in place. Loads
 * the RELATED resource's own schema first (same "schema before the
 * table" rule as `CrudListScreen` - see its docstring), then lists
 * `<related_endpoint>?filter{<back_filter>}=<parentId>`:
 * - `one_to_many`: the rows are children. New/Edit open `CrudFormModal`
 *   with the back-pointing FK left out of the form and preset to the
 *   parent on create; Delete deletes the child.
 * - `many_to_many`: the rows are linked. "Link" opens `CrudLinkModal`,
 *   "New" creates a related row and links it in one go (a custom through
 *   model's fields are part of the same form), Unlink removes only the
 *   link.
 * Renders a toolbar, the bare `DataTable` and its pagination - meant to
 * sit inside a card, under the detail screen's relation tabs.
 */
function CrudRelationSection(props: CrudRelationSectionProps) {
  const { relation, request } = props;
  const relatedApi = useMemo(() => createBaseApi<Row>(relation.related_endpoint ?? "", request), [relation, request]);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    relatedApi
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
  }, [relatedApi]);

  if (error)
    return (
      <div className="card-body">
        <p className="text-danger mb-0" role="alert">
          {error.message}
        </p>
      </div>
    );
  if (!schema)
    return (
      <div className="card-body d-flex align-items-center gap-2 text-secondary">
        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        Loading…
      </div>
    );
  return <CrudRelationTable {...props} relatedApi={relatedApi} schema={schema} />;
}

interface CrudRelationTableProps extends CrudRelationSectionProps {
  relatedApi: BaseApi<Row>;
  schema: Schema;
}

type ModalState = { type: "new" } | { type: "edit"; id: string | number } | { type: "link" } | null;

function CrudRelationTable({
  relation,
  parentApi,
  parentId,
  request,
  linkComponent,
  relatedDetailPath,
  onChanged,
  relatedApi,
  schema,
  parentCanUpdate = true,
}: CrudRelationTableProps) {
  const Link = linkComponent ?? DefaultLink;
  const isManyToMany = relation.kind === "many_to_many";
  const backFilter = relation.back_filter ?? "";
  const rowKey = (row: Row) => row.id as string | number;
  const [modal, setModal] = useState<ModalState>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  // Only actions that can succeed (schema `can` - see `canDo`).
  const canLink = isManyToMany && parentCanUpdate;
  const canCreate = canDo(schema, "create") && (!isManyToMany || parentCanUpdate);
  const canEdit = !isManyToMany && canDo(schema, "update");
  const canRemove = isManyToMany ? parentCanUpdate : canDo(schema, "delete");

  // The back-pointing FK is the same on every child row (it's the
  // parent) - no column, and not a form field either (preset on create).
  const rowFields = useMemo(
    () => createSchemaFields<Row>(schema).filter((field) => field.key !== backFilter),
    [schema, backFilter],
  );
  const throughFields = useMemo<CrudField<Row>[]>(
    () =>
      createSchemaFields<Row>({ fields: relation.through_fields ?? [] }).map((field) => ({
        ...field,
        key: `${THROUGH_PREFIX}${field.key}`,
      })),
    [relation],
  );
  const relationFields = useMemo(() => toOneRelationFields(schema).filter((field) => field.name !== backFilter), [schema, backFilter]);
  const displayFields = useRelatedDisplayFields(relationFields, request);
  const [bareLabels, setLabelledRows] = useBareRelationLabels(relationFields, request);
  const schemaColumns = useMemo(
    () => createSchemaColumns<Row>(schema, displayFields, bareLabels).filter((column) => column.key !== backFilter),
    [schema, backFilter, displayFields, bareLabels],
  );

  function changed() {
    table.refetch();
    onChanged?.();
  }

  async function handleRemove(row: Row) {
    const id = rowKey(row);
    if (!window.confirm(isManyToMany ? "Unlink this item? The item itself is kept." : "Delete this item?")) return;
    setBusyId(id);
    try {
      if (isManyToMany) await parentApi.unlink(parentId, relation.name, [id]);
      else await relatedApi.remove(id);
      changed();
    } catch (thrown) {
      window.alert(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(values: Row) {
    if (!isManyToMany) {
      await relatedApi.create({ ...values, [backFilter]: parentId });
      changed();
      return;
    }
    const rowValues: Row = {};
    const through: Row = {};
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith(THROUGH_PREFIX)) through[key.slice(THROUGH_PREFIX.length)] = value;
      else rowValues[key] = value;
    }
    const created = await relatedApi.create(rowValues);
    // Refresh even if the link below fails - the row itself now exists.
    try {
      await parentApi.link(parentId, relation.name, [rowKey(created)], throughFields.length > 0 ? through : undefined);
    } finally {
      changed();
    }
  }

  const columns: DataTableColumn<Row>[] = [
    ...schemaColumns.map((column) => ({
      ...column,
      className: ["position-relative", column.className].filter(Boolean).join(" "),
      render: (row: Row) => (
        <>
          {/* Same per-cell `.stretched-link` decoy as CrudListScreen - see its docstring. */}
          {relatedDetailPath && <Link to={relatedDetailPath(rowKey(row))} tabIndex={-1} aria-hidden="true" className="stretched-link" />}
          {column.render ? column.render(row) : String(row[column.key] ?? "")}
        </>
      ),
    })),
    {
      key: "__relation_actions",
      header: "",
      className: "w-1",
      render: (row) => {
        const id = rowKey(row);
        const name = rowLabel(row, schema.display_field);
        return (
          <div className="d-flex gap-1 justify-content-end text-nowrap">
            {relatedDetailPath && (
              <Link to={relatedDetailPath(id)} className="btn btn-ghost-secondary btn-icon btn-sm" aria-label={`View ${name}`}>
                <Icon name="eye" />
              </Link>
            )}
            {canEdit && (
              <Button icon className="btn-ghost-secondary" aria-label={`Edit ${name}`} title="Edit" onClick={() => setModal({ type: "edit", id })}>
                <Icon name="pencil" />
              </Button>
            )}
            {canRemove && (
              <Button
                icon
                className="btn-ghost-danger"
                aria-label={`${isManyToMany ? "Unlink" : "Delete"} ${name}`}
                title={isManyToMany ? "Unlink" : "Delete"}
                disabled={busyId === id}
                onClick={() => handleRemove(row)}
              >
                <Icon name={isManyToMany ? "unlink" : "trash"} />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const table = useDataTable<Row>({
    endpoint: withRelationIncludes(`${relatedApi.endpoint}?filter{${backFilter}}=${encodeURIComponent(String(parentId))}`, schema, [backFilter]),
    columns,
    rowKey,
    fetcher: relatedApi.list,
    defaultPageSize: 10,
    searchable: Boolean(schema.searchable),
  });
  useEffect(() => setLabelledRows(table.items), [table.items, setLabelledRows]);

  const singular = schema.label ?? "item";
  const plural = schema.label_plural ?? relation.label.toLowerCase();
  // Nothing related yet (not a search that matched nothing): one empty
  // state with the actions, instead of a bare header row + "No results."
  const unfiltered = !table.search && table.page === 1;
  const isEmpty = !table.loading && !table.error && table.items.length === 0 && unfiltered;
  // First fetch still in flight: neither the toolbar nor the empty state
  // yet, so one doesn't flash and get swapped for the other.
  const isFirstLoad = table.loading && table.items.length === 0 && unfiltered;

  const actions = (
    <>
      {canLink && (
        <Button variant="primary" outline onClick={() => setModal({ type: "link" })}>
          <Icon name="link" />
          Link existing
        </Button>
      )}
      {canCreate && (
        <Button variant="primary" onClick={() => setModal({ type: "new" })}>
          <Icon name="plus" />
          New {singular}
        </Button>
      )}
    </>
  );

  return (
    <>
      {isFirstLoad ? (
        <div className="card-body d-flex align-items-center gap-2 text-secondary">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading…
        </div>
      ) : isEmpty ? (
        <div className="empty py-5">
          <p className="empty-title">No {plural} yet</p>
          <p className="empty-subtitle text-secondary">
            {canLink && canCreate
              ? `Link existing ${plural} or create a new one.`
              : canLink
                ? `Link existing ${plural}.`
                : canCreate
                  ? `Add the first ${singular}.`
                  : `Nothing here yet.`}
          </p>
          <div className="empty-action d-flex gap-2 justify-content-center">{actions}</div>
        </div>
      ) : (
        <>
          <div className="card-body border-bottom py-2 d-flex align-items-center gap-2 flex-wrap">
            {schema.searchable && (
              <FormControl
                type="search"
                aria-label={`Search ${plural}`}
                placeholder={`Search ${plural}…`}
                value={table.search}
                onChange={(event) => table.setSearch(event.target.value)}
                style={{ maxWidth: 240 }}
              />
            )}
            <div className="d-flex align-items-center gap-2 ms-auto">
              <ColumnPicker
                columns={table.orderedColumns}
                hiddenColumns={table.hiddenColumns}
                onToggleColumn={table.toggleColumn}
                onMoveColumn={table.moveColumn}
              />
              {actions}
            </div>
          </div>
          <DataTable table={table} />
          {table.pageCount > 1 && (
            <CardFooter>
              <Pagination page={table.page} pageCount={table.pageCount} onPageChange={table.setPage} />
            </CardFooter>
          )}
        </>
      )}

      <CrudFormModal
        open={modal?.type === "new"}
        title={`New ${singular}`}
        fields={[...rowFields, ...throughFields]}
        request={request}
        submitLabel={isManyToMany ? "Create and link" : "Create"}
        onSubmit={handleCreate}
        onClose={() => setModal(null)}
      />
      <CrudFormModal
        open={modal?.type === "edit"}
        title={`Edit ${singular}`}
        fields={rowFields}
        request={request}
        load={() => relatedApi.read(modal?.type === "edit" ? modal.id : "")}
        onSubmit={async (values) => {
          if (modal?.type !== "edit") return;
          await relatedApi.update(modal.id, values);
          changed();
        }}
        onClose={() => setModal(null)}
      />
      {isManyToMany && (
        <CrudLinkModal
          open={modal?.type === "link"}
          relation={relation}
          parentApi={parentApi}
          parentId={parentId}
          request={request}
          onLinked={changed}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

export default CrudRelationSection;
