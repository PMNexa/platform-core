import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { Button, Card, CardBody, CardFooter } from "../../../../components";
import { createBaseApi } from "../../lib/baseApi";
import type { BaseApi, BaseApiRequest } from "../../lib/baseApi";
import { pickFieldValues } from "../../lib/fields";
import { useRelationFields } from "../../lib/relationOptions";
import { createRequest } from "../../lib/request";
import type { Schema } from "../../lib/schema";
import type { FormLayout } from "../../lib/types";
import { createSchemaFields } from "../../lib/schemaFields";
import { useCrudForm } from "../../lib/useCrudForm";
import CrudFormFields from "../CrudFormFields";
import { fieldErrorsOf, formErrorMessage } from "../../lib/requestError";

export interface CrudEditScreenProps<T> {
  /** The resource's own base URL, e.g. `"/api/v1/goals"` - see `CrudListScreen`'s own docstring on `baseApi` being built internally from this plus `accessToken`. */
  baseUrl: string;
  accessToken: string;
  /** The record's id - a prop, not read from a router param: same "routing-dependent value passed in" rule this screen already follows for `baseUrl`/`accessToken` (see `createCrudRouter`'s own docstring). The host reads its own `:id` param and passes it here. */
  id: string | number;
  onUpdated?: (row: T) => void;
  /** Fires after a successful delete - the host still owns navigating away. */
  onDeleted?: () => void;
  /** Overrides the schema's `form_layout` (sections, order, show-when rules) for this screen. */
  formLayout?: FormLayout;
}

/**
 * Loads the resource's OWN schema first (`baseApi.schema()`), same
 * "schema before anything else" rule `CrudListScreen`/`CrudCreateScreen`
 * follow - split into this outer component (owns only the schema fetch)
 * and `CrudEditForm` (mounted only once schema is ready, and which THEN
 * loads the record itself via `baseApi.read(id)` - schema, then record,
 * never the other way or in parallel).
 */
function CrudEditScreen<T>({ baseUrl, accessToken, id, onUpdated, onDeleted, formLayout }: CrudEditScreenProps<T>) {
  const request = useMemo(() => createRequest(accessToken), [accessToken]);
  const baseApi = useMemo(() => createBaseApi<T>(baseUrl, request), [baseUrl, request]);
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

  if (error)
    return (
      <Card>
        <CardBody>
          <p className="text-danger mb-0" role="alert">
            {error.message}
          </p>
        </CardBody>
      </Card>
    );
  if (!schema)
    return (
      <Card>
        <CardBody>
          <p className="text-secondary mb-0">Loading…</p>
        </CardBody>
      </Card>
    );

  return <CrudEditForm baseApi={baseApi} schema={schema} request={request} id={id} onUpdated={onUpdated} onDeleted={onDeleted} formLayout={formLayout} />;
}

interface CrudEditFormProps<T> extends Omit<CrudEditScreenProps<T>, "baseUrl" | "accessToken"> {
  baseApi: BaseApi<T>;
  schema: Schema;
  request: BaseApiRequest;
}

/**
 * The "U" (and an optional "D") of `CrudRouter`'s three screens - loads
 * the record via `baseApi.read(id)`, then the same `Card`-framed field
 * form `CrudCreateForm` uses (`createSchemaFields(schema)` +
 * `useRelationFields`), prefilled (Save + Delete both in `CardFooter`).
 */
function CrudEditForm<T>({ baseApi, schema, request, id, onUpdated, onDeleted, formLayout }: CrudEditFormProps<T>) {
  const baseFields = useMemo(() => createSchemaFields<T>(schema), [schema]);
  const fields = useRelationFields(baseFields, request);
  const form = useCrudForm<T>();
  const { setValues } = form;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Synchronizing with an external system (the network) - see
    // useDataTable's own fetch effect for the same rule applied there.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true);
    // oxlint-disable-next-line react/set-state-in-effect
    setLoadError(null);

    baseApi
      .read(id)
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
  }, [baseApi, id, setValues]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const row = await form.submit((values) => baseApi.update(id, pickFieldValues(values, fields)));
    if (row) onUpdated?.(row);
  }

  async function handleDelete() {
    if (!window.confirm("Delete this item?")) return;
    setDeleting(true);
    try {
      await baseApi.remove(id);
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  if (loading)
    return (
      <Card>
        <CardBody>
          <p className="text-secondary mb-0">Loading…</p>
        </CardBody>
      </Card>
    );
  if (loadError)
    return (
      <Card>
        <CardBody>
          <p className="text-danger mb-0" role="alert">
            {loadError.message}
          </p>
        </CardBody>
      </Card>
    );

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardBody>
          <CrudFormFields fields={fields} values={form.values} onChange={form.setValue} errors={fieldErrorsOf(form.error)} layout={formLayout ?? schema.form_layout} />
          {form.error && (
            <p className="text-danger mb-0" role="alert">
              {formErrorMessage(form.error, fields)}
            </p>
          )}
        </CardBody>
        <CardFooter className="d-flex gap-2">
          <Button type="submit" variant="primary" disabled={form.submitting}>
            {form.submitting ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="danger" outline disabled={deleting} onClick={handleDelete}>
            Delete
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export default CrudEditScreen;
