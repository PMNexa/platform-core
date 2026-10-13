import type { CrudField } from "./types";

/** A failed API call: the server's `message`, plus its per-field reasons (`field_errors`, `"__root__"` = not about one field). */
export class RequestError extends Error {
  readonly fieldErrors: Record<string, string[]> | null;

  constructor(message: string, fieldErrors: Record<string, string[]> | null = null) {
    super(message);
    this.name = "RequestError";
    this.fieldErrors = fieldErrors && Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
  }
}

/** `error`'s per-field reasons, for `CrudFormFields`'s `errors`. */
export function fieldErrorsOf(error: Error | null | undefined): Record<string, string[]> | undefined {
  return error instanceof RequestError ? (error.fieldErrors ?? undefined) : undefined;
}

/**
 * A form's error line: each reason, named by its field's label ("Check-ins
 * are for: Can't be longer than ...") - not just "Request failed
 * validation." - including fields the form doesn't show.
 */
export function formErrorMessage<T>(error: Error, fields: CrudField<T>[]): string {
  const reasons = fieldErrorsOf(error);
  if (!reasons) return error.message;
  return Object.entries(reasons)
    .map(([key, messages]) => {
      const label = key === "__root__" || key === "non_field_errors" ? "" : (fields.find((f) => f.key === key)?.label ?? key.replace(/_/g, " "));
      return `${label ? `${label}: ` : ""}${messages.join(" ")}`;
    })
    .join(" ");
}
