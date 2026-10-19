import type { SchemaField } from "./schema";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * One field's value as display text - `CrudDetailScreen`'s read-only view.
 * A choice shows its label (not the stored value), a date/datetime is
 * formatted in the browser's own locale/timezone (a bare `YYYY-MM-DD` is
 * read as a LOCAL date, not UTC midnight, so it never shifts a day), a
 * boolean is Yes/No, and an empty value is an em dash.
 */
export function formatFieldValue(field: SchemaField, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  const choice = field.choices?.find((option) => option.value === value);
  if (choice) return choice.label;
  if (field.type === "datetime" && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMAT.format(date);
  }
  if (field.type === "date" && typeof value === "string") {
    const [year, month, day] = value.split("-").map(Number);
    return year && month && day ? DATE_FORMAT.format(new Date(year, month - 1, day)) : value;
  }
  if (typeof value === "object") return plainValue(value);
  return String(value);
}

/** "per_day" -> "Per day". */
function humanize(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A structured value (an object or list the schema has no type for) as "Key: value · ..." text. */
function plainValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(plainValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item != null && item !== "")
      .map(([key, item]) => `${humanize(key)}: ${typeof item === "object" ? JSON.stringify(item) : plainValue(item)}`)
      .join(" · ");
  }
  return String(value);
}
