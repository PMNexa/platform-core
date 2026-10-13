import type { ReactNode } from "react";

export type CrudFieldType = "text" | "textarea" | "email" | "tel" | "password" | "number" | "checkbox" | "select" | "date" | "datetime";

export interface CrudFieldOption {
  value: string;
  label: string;
}

/**
 * One form field for `CrudFormFields` (`CrudCreateScreen`/`CrudEditScreen`).
 * Auto-built from a `Schema` field now, not hand-written - see
 * `schemaFields.ts`'s `createSchemaFields` for what maps to what.
 */
export interface CrudField<T> {
  key: keyof T & string;
  label: ReactNode;
  /** @default "text" */
  type?: CrudFieldType;
  required?: boolean;
  /** What an emptied `date`/`datetime` input submits: `true` -> `null` (clear it), otherwise the key is left out of the payload entirely so the server's own default applies (e.g. a check-in time defaulting to now). */
  nullable?: boolean;
  /** Shown under the input (`.form-hint`) - from the schema's `help_text`. */
  helpText?: string;
  autoComplete?: string;
  /** Only meaningful when `type === "select"` - the `<option>` list. Populated synchronously from a `SchemaField`'s own `choices` (an enum) by `createSchemaFields`; for a relation field (see `relatedEndpoint`) it starts empty and is filled in asynchronously by `CrudCreateForm`/`CrudEditForm` once `fetchRelationOptions` resolves. */
  options?: CrudFieldOption[];
  /** Only on a `select` field - the choice a new row gets when it's left out (`SchemaField.default`), shown preselected until one is picked. Display only: an untouched field is still omitted, so the server's own default applies. */
  defaultValue?: string;
  /** Only present on a relation `select` field - the related resource's own base URL (`SchemaField.related_endpoint`) `fetchRelationOptions` fetches `options` from. Its absence on a relation field (a related model with no `core_api.registry` entry) is why that field falls back to a bare text input instead - see `schemaFields.ts`. */
  relatedEndpoint?: string;
}

/** When a laid-out field shows: the form's current value of `field` is one of `in` / none of `not_in` ("" stands for empty). */
export interface FormShowIf {
  field: string;
  in?: unknown[];
  not_in?: unknown[];
}

/** One field in a `FormSection` - a bare name, or with a show-when rule. */
export type FormLayoutField = string | { name: string; show_if?: FormShowIf };

/** A titled group of form fields; `collapsed` = folded away ("Advanced") until opened. */
export interface FormSection {
  title?: string;
  description?: string;
  collapsed?: boolean;
  fields: FormLayoutField[];
}

/**
 * How a form is laid out: sections in order. From the resource's schema
 * (`Schema.form_layout`, the serializer's `Meta.form_layout`), or a screen's
 * `formLayout` prop, which wins. Fields it doesn't name still show, last.
 */
export type FormLayout = FormSection[];
