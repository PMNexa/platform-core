import { useEffect, useId, useMemo, useState, type SubmitEvent } from "react";
import Button from "../../../../components/atoms/Button";
import FormControl from "../../../../components/atoms/FormControl";
import FormCheck from "../../../../components/molecules/FormCheck";
import Fieldset from "../../../../components/organisms/Fieldset";
import Modal from "../../../../components/organisms/Modal";
import type { DataTablePage } from "../../../DataTable";
import type { BaseApi, BaseApiRequest } from "../../lib/baseApi";
import { pickFieldValues } from "../../lib/fields";
import { rowLabel, useRelationFields } from "../../lib/relationOptions";
import type { Schema, SchemaField } from "../../lib/schema";
import { loadSchema } from "../../lib/schemaCache";
import { createSchemaFields } from "../../lib/schemaFields";
import { useCrudForm } from "../../lib/useCrudForm";
import CrudFormFields from "../CrudFormFields";
import { fieldErrorsOf, formErrorMessage } from "../../lib/requestError";

type Row = Record<string, unknown>;

const CANDIDATE_PAGE_SIZE = 20;

export interface CrudLinkModalProps {
  open: boolean;
  /** A `many_to_many` schema field of the parent resource. */
  relation: SchemaField;
  parentApi: BaseApi<unknown>;
  parentId: string | number;
  request: BaseApiRequest;
  onLinked: () => void;
  onClose: () => void;
}

/**
 * "Link existing" for a many-to-many relation: pick rows of the related
 * resource that AREN'T linked yet (`?filter{-<back_filter>}=<parentId>`,
 * searchable via `?q=` when its schema says so, labelled by its
 * `display_field`), fill in a custom through model's own fields if
 * it has any (`relation.through_fields` - applied to every picked row),
 * then `parentApi.link`. Shows the first `CANDIDATE_PAGE_SIZE` matches;
 * searching narrows it rather than paging. Body only mounts while open.
 */
function CrudLinkModal(props: CrudLinkModalProps) {
  return props.open ? <CrudLinkModalBody {...props} /> : null;
}

function CrudLinkModalBody({ relation, parentApi, parentId, request, onLinked, onClose }: CrudLinkModalProps) {
  const formId = useId();
  const [search, setSearch] = useState("");
  const [relatedSchema, setRelatedSchema] = useState<Schema | null>(null);
  const [candidates, setCandidates] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const baseThroughFields = useMemo(() => createSchemaFields<Row>({ fields: relation.through_fields ?? [] }), [relation]);
  const throughFields = useRelationFields(baseThroughFields, request);
  const form = useCrudForm<Row>();

  useEffect(() => {
    let cancelled = false;
    loadSchema(relation.related_endpoint ?? "", request)
      .then((schema) => {
        if (!cancelled) setRelatedSchema(schema);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [relation, request]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page_size: String(CANDIDATE_PAGE_SIZE) });
    if (search) params.set("q", search);
    const url = `${relation.related_endpoint}?filter{-${relation.back_filter}}=${encodeURIComponent(String(parentId))}&${params}`;
    request<DataTablePage<Row>>(url)
      .then((page) => {
        if (cancelled) return;
        setCandidates(page.items);
        setTotal(page.total);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [relation, parentId, request, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const linked = await form.submit(async (values) => {
      const through = throughFields.length > 0 ? pickFieldValues(values, throughFields) : undefined;
      await parentApi.link(parentId, relation.name, [...selected], through);
      return values;
    });
    if (linked) {
      onLinked();
      onClose();
    }
  }

  return (
    <Modal
      open
      title={`Link ${relatedSchema?.label_plural ?? relation.label.toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={selected.size === 0 || form.submitting}>
            {form.submitting ? "Linking…" : selected.size > 0 ? `Link ${selected.size}` : "Link"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        {relatedSchema?.searchable && (
          <FormControl
            type="search"
            aria-label="Search"
            placeholder="Search…"
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            className="mb-2"
          />
        )}
        {candidates === null && <p className="text-secondary mb-0">Loading…</p>}
        {candidates?.length === 0 && <p className="text-secondary mb-0">Nothing left to link.</p>}
        {candidates && candidates.length > 0 && (
          <div className="list-group list-group-flush overflow-auto mb-2" style={{ maxHeight: 280 }}>
            {candidates.map((row) => {
              const id = String(row.id);
              return (
                <div key={id} className="list-group-item py-1 px-0">
                  <FormCheck label={rowLabel(row, relatedSchema?.display_field)} checked={selected.has(id)} onChange={() => toggle(id)} className="mb-0" />
                </div>
              );
            })}
          </div>
        )}
        {candidates && total > candidates.length && (
          <p className="text-secondary small">
            Showing {candidates.length} of {total}
            {relatedSchema?.searchable ? " - search to narrow it down." : "."}
          </p>
        )}
        {throughFields.length > 0 && (
          <Fieldset legend="Link details" className="mt-3 mb-0">
            <CrudFormFields fields={throughFields} values={form.values} onChange={form.setValue} errors={fieldErrorsOf(form.error)} />
          </Fieldset>
        )}
        {form.error && (
          <p className="text-danger mb-0" role="alert">
            {formErrorMessage(form.error, throughFields)}
          </p>
        )}
      </form>
    </Modal>
  );
}

export default CrudLinkModal;
