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

export interface CrudCreateScreenProps<T> {
  /** The resource's own base URL, e.g. `"/api/v1/goals"` - see `CrudListScreen`'s own docstring on `baseApi` being built internally from this plus `accessToken`. */
  baseUrl: string;
  accessToken: string;
  /** Fires after a successful create - typically the host navigates back to the list. Router-agnostic on purpose (see `createCrudRouter`'s docstring): this screen never navigates itself. */
  onCreated?: (row: T) => void;
  /** Overrides the schema's `form_layout` (sections, order, show-when rules) for this screen. */
  formLayout?: FormLayout;
}

/**
 * Loads the resource's OWN schema first (`baseApi.schema()`), same
 * "schema before anything else" rule `CrudListScreen` follows (see its
 * own docstring) - split into this outer component (owns only the
 * schema fetch) and `CrudCreateForm` (mounted only once schema is
 * ready), same shape as `CrudListScreen`/`CrudListScreenTable`, for the
 * same reason: a screen shouldn't render a form with the WRONG fields
 * (none, until schema arrives) even briefly.
 */
function CrudCreateScreen<T>({ baseUrl, accessToken, onCreated, formLayout }: CrudCreateScreenProps<T>) {
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

  return <CrudCreateForm baseApi={baseApi} schema={schema} request={request} onCreated={onCreated} formLayout={formLayout} />;
}

interface CrudCreateFormProps<T> extends Omit<CrudCreateScreenProps<T>, "baseUrl" | "accessToken"> {
  baseApi: BaseApi<T>;
  schema: Schema;
  request: BaseApiRequest;
}

/**
 * The "C" of `CrudRouter`'s three screens - `createSchemaFields(schema)`
 * (plus `useRelationFields`, filling in a relation field's own picker
 * options) rendered via `CrudFormFields`, submitting to `baseApi.create`.
 * The `<form>` wraps the whole `Card` (fields in `CardBody`, submit in
 * `CardFooter`) rather than living inside it, so the submit button in
 * the footer still triggers the same native form submission.
 */
function CrudCreateForm<T>({ baseApi, schema, request, onCreated, formLayout }: CrudCreateFormProps<T>) {
  const baseFields = useMemo(() => createSchemaFields<T>(schema), [schema]);
  const fields = useRelationFields(baseFields, request);
  const form = useCrudForm<T>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const row = await form.submit((values) => baseApi.create(pickFieldValues(values, fields)));
    if (row) onCreated?.(row);
  }

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
        <CardFooter>
          <Button type="submit" variant="primary" disabled={form.submitting}>
            {form.submitting ? "Saving…" : "Create"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export default CrudCreateScreen;
