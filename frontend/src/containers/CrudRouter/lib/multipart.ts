/**
 * How a form's values travel: JSON, unless one of them is a `File`/`Blob`
 * (a `file` field) - then `multipart/form-data`, which is the only way a
 * browser sends a file. In multipart every value is text: `null` becomes
 * an empty part (DRF reads "" as null for a nullable non-text field),
 * a list repeats the key, an object is JSON in one part, `undefined`
 * is left out (the server's default applies - same as the JSON case).
 */
export function hasFile(values: Record<string, unknown>): boolean {
  if (typeof Blob === "undefined") return false;
  return Object.values(values).some((value) => value instanceof Blob);
}

export function toFormData(values: Record<string, unknown>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value instanceof Blob) {
      data.append(key, value, value instanceof File ? value.name : undefined);
    } else if (value === null) {
      data.append(key, "");
    } else if (Array.isArray(value)) {
      for (const item of value) data.append(key, typeof item === "object" ? JSON.stringify(item) : String(item));
    } else if (typeof value === "object") {
      data.append(key, JSON.stringify(value));
    } else {
      data.append(key, String(value));
    }
  }
  return data;
}

/** The request body for `values`: a `FormData` when a file is among them, else JSON text. */
export function encodeBody(values: unknown): FormData | string {
  const record = values as Record<string, unknown>;
  return hasFile(record) ? toFormData(record) : JSON.stringify(values);
}
