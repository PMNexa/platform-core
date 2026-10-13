import FormControl from "../../../../components/atoms/FormControl";
import FormLabel from "../../../../components/atoms/FormLabel";
import FormCheck from "../../../../components/molecules/FormCheck";
import { isoToLocalInput, localInputToIso } from "../../lib/dateInput";
import type { CrudField } from "../../lib/types";

/** An emptied optional input: `null` clears a nullable field; `undefined` drops the key from the JSON payload so the server's default applies. */
function emptyValue<T>(field: CrudField<T>): null | undefined {
  return field.nullable ? null : undefined;
}

function Hint({ text }: { text?: string }) {
  return text ? <small className="form-hint">{text}</small> : null;
}

/** The server's reason this field was refused (`errors`). */
function FieldError({ messages }: { messages?: string[] }) {
  return messages?.length ? <div className="invalid-feedback d-block">{messages.join(" ")}</div> : null;
}

export interface CrudFormFieldsProps<T> {
  fields: CrudField<T>[];
  values: Partial<T>;
  onChange: <K extends keyof T>(key: K, value: T[K]) => void;
  /** The server's per-field reasons from a refused save (`fieldErrorsOf(form.error)`), shown under each field. */
  errors?: Record<string, string[]>;
}

/**
 * Shared by `CrudCreateScreen`/`CrudEditScreen` - one `FormField` per
 * `CrudField` (auto-built from a `Schema` - see `schemaFields.ts`), not
 * exported (an implementation detail of those two, not a `components/`
 * design-system piece: it has no meaning without a field list). A
 * `checkbox` field renders as `FormCheck`
 * (label INSIDE the clickable control); a `select` field renders a plain
 * native `<select>` (Tabler's `form-select` class, same `sm`-by-default
 * convention as `FormControl`) from `field.options` - no design-system
 * `Select` atom exists yet, and one native element doesn't earn it;
 * a `date`/`datetime` field is a native date / `datetime-local` picker -
 * form state holds the API's own format (`YYYY-MM-DD` / an absolute ISO
 * timestamp), converted to and from the picker's local wall time here,
 * so nothing upstream needs to know; everything else is a `FormLabel` +
 * `FormControl` pair, `type` passed straight to the native `input`.
 * Emptying an optional date/datetime submits `null` if the field is
 * `nullable`, otherwise drops it (server default applies - see
 * `CrudField.nullable`).
 */
function CrudFormFields<T>({ fields, values, onChange, errors }: CrudFormFieldsProps<T>) {
  return (
    <>
      {fields.map((field) => {
        if (field.type === "checkbox") {
          return (
            <div key={field.key} className="mb-3">
              <FormCheck
                label={field.label}
                required={field.required}
                checked={Boolean(values[field.key])}
                onChange={(event) => onChange(field.key, event.target.checked as T[typeof field.key])}
              />
              <FieldError messages={errors?.[field.key]} />
            </div>
          );
        }

        const fieldId = `crud-field-${field.key}`;

        if (field.type === "select") {
          // A choice whose value is "" ("Any time", "Every check-in counts") is a real value -
          // sent as "" (not null) and no extra "None" option next to it.
          const hasBlank = field.options?.some((option) => option.value === "") ?? false;
          return (
            <div key={field.key} className="mb-3">
              <FormLabel htmlFor={fieldId} required={field.required}>
                {field.label}
              </FormLabel>
              <select
                id={fieldId}
                className="form-select form-select-sm"
                required={field.required}
                value={
                  values[field.key] === undefined
                    ? (field.defaultValue ?? "")
                    : ((values[field.key] as string | null) ?? "")
                }
                onChange={(event) =>
                  onChange(field.key, (event.target.value || (hasBlank ? "" : null)) as T[typeof field.key])
                }
              >
                {/* Only disabled when required - an optional select (e.g. an optional parent/relation) needs this as a real, re-selectable choice, not just an unpicked placeholder, so a caller can clear a previous selection back to "none". */}
                {!hasBlank && (
                  <option value="" disabled={field.required}>
                    {field.required ? "Select…" : "None"}
                  </option>
                )}
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Hint text={field.helpText} />
              <FieldError messages={errors?.[field.key]} />
            </div>
          );
        }

        if (field.type === "textarea") {
          return (
            <div key={field.key} className="mb-3">
              <FormLabel htmlFor={fieldId} required={field.required}>
                {field.label}
              </FormLabel>
              <textarea
                id={fieldId}
                className="form-control form-control-sm"
                rows={3}
                required={field.required}
                value={(values[field.key] as string | undefined) ?? ""}
                onChange={(event) => onChange(field.key, event.target.value as T[typeof field.key])}
              />
              <Hint text={field.helpText} />
              <FieldError messages={errors?.[field.key]} />
            </div>
          );
        }

        if (field.type === "date" || field.type === "datetime") {
          const isDateTime = field.type === "datetime";
          const raw = values[field.key];
          return (
            <div key={field.key} className="mb-3">
              <FormLabel htmlFor={fieldId} required={field.required}>
                {field.label}
              </FormLabel>
              <FormControl
                id={fieldId}
                type={isDateTime ? "datetime-local" : "date"}
                required={field.required}
                value={isDateTime ? isoToLocalInput(raw) : typeof raw === "string" ? raw : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  const next = value === "" ? emptyValue(field) : isDateTime ? localInputToIso(value) : value;
                  onChange(field.key, next as T[typeof field.key]);
                }}
              />
              <Hint text={field.helpText} />
              <FieldError messages={errors?.[field.key]} />
            </div>
          );
        }

        return (
          <div key={field.key} className="mb-3">
            <FormLabel htmlFor={fieldId} required={field.required}>
              {field.label}
            </FormLabel>
            <FormControl
              id={fieldId}
              type={field.type ?? "text"}
              required={field.required}
              autoComplete={field.autoComplete}
              value={(values[field.key] as string | number | undefined) ?? ""}
              onChange={(event) => {
                const raw = field.type === "number" ? event.target.valueAsNumber : event.target.value;
                onChange(field.key, raw as T[typeof field.key]);
              }}
            />
            <Hint text={field.helpText} />
              <FieldError messages={errors?.[field.key]} />
          </div>
        );
      })}
    </>
  );
}

export default CrudFormFields;
