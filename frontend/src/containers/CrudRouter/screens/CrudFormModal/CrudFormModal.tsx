import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from "react";
import Button from "../../../../components/atoms/Button";
import Modal from "../../../../components/organisms/Modal";
import type { BaseApiRequest } from "../../lib/baseApi";
import { pickFieldValues } from "../../lib/fields";
import { useRelationFields } from "../../lib/relationOptions";
import type { CrudField, FormLayout } from "../../lib/types";
import { useCrudForm } from "../../lib/useCrudForm";
import CrudFormFields from "../CrudFormFields";
import { fieldErrorsOf, formErrorMessage } from "../../lib/requestError";

type Row = Record<string, unknown>;

export interface CrudFormModalProps {
  open: boolean;
  title: ReactNode;
  /** Already built (e.g. `createSchemaFields`, minus anything the caller presets itself). Relation `select`s get their options fetched here, same as the Create/Edit screens. */
  fields: CrudField<Row>[];
  request: BaseApiRequest;
  /** Loads the values to prefill - an edit. Omit for a blank create form. Called once per open. */
  load?: () => Promise<Row>;
  /** @default "Save" */
  submitLabel?: string;
  /** Gets exactly the `fields`' values (`pickFieldValues`). The modal closes once it resolves; a rejection is shown in the form instead. */
  onSubmit: (values: Row) => Promise<unknown>;
  onClose: () => void;
  /** Sections and show-when rules - typically the resource's `schema.form_layout`. */
  layout?: FormLayout;
}

/**
 * A schema-driven create/edit form in platform-core's `Modal` - the
 * detail screen's in-place CRUD for a relation's rows (`CrudRelationSection`),
 * so adding a child never leaves the parent's page. The form body only
 * mounts while open, so every open starts from fresh state.
 */
function CrudFormModal(props: CrudFormModalProps) {
  return props.open ? <CrudFormModalBody {...props} /> : null;
}

function CrudFormModalBody({ title, fields: baseFields, request, load, submitLabel = "Save", onSubmit, onClose, layout }: CrudFormModalProps) {
  const formId = useId();
  const fields = useRelationFields(baseFields, request);
  const form = useCrudForm<Row>();
  const { setValues } = form;
  const [loading, setLoading] = useState(Boolean(load));
  const [loadError, setLoadError] = useState<Error | null>(null);
  // Read once, on mount: a caller's inline `load` closure is a new
  // function every render, which would otherwise refetch forever.
  const loadRef = useRef(load);

  useEffect(() => {
    const loadValues = loadRef.current;
    if (!loadValues) return;
    let cancelled = false;
    loadValues()
      .then((row) => {
        if (!cancelled) setValues(row);
      })
      .catch((thrown: unknown) => {
        if (!cancelled) setLoadError(thrown instanceof Error ? thrown : new Error(String(thrown)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setValues]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await form.submit(async (values) => {
      await onSubmit(pickFieldValues(values, fields));
      return values;
    });
    if (saved) onClose();
  }

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={loading || form.submitting}>
            {form.submitting ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      {loading && <p className="text-secondary mb-0">Loading…</p>}
      {loadError && (
        <p className="text-danger mb-0" role="alert">
          {loadError.message}
        </p>
      )}
      {!loading && !loadError && (
        <form id={formId} onSubmit={handleSubmit} noValidate>
          <CrudFormFields fields={fields} values={form.values} onChange={form.setValue} errors={fieldErrorsOf(form.error)} layout={layout} />
          {form.error && (
            <p className="text-danger mb-0" role="alert">
              {formErrorMessage(form.error, fields)}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}

export default CrudFormModal;
