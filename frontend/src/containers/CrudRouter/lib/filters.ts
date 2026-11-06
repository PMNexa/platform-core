import { translator, type Locale } from "../../../i18n";
import messages from "../messages";
import type { Schema, SchemaField } from "./schema";

/**
 * A list's filters, one condition per row of `CrudFilterModal`, turned
 * into `core_api.filters`' own `?filter{[-]field[.lookup]}=value` params
 * (see its docstring - exact match by default, `-` negates, `.isnull`
 * etc. as lookups). Which operators a field offers depends on its schema
 * type; `operatorsFor` is the one place that decides.
 */
export type FilterOperator = "contains" | "is" | "is_not" | "gt" | "gte" | "lt" | "lte" | "empty" | "not_empty";

export interface FilterCondition {
  /** The schema field's `name`. */
  field: string;
  op: FilterOperator;
  /** As the input holds it: a string, `"true"`/`"false"` for a boolean, `YYYY-MM-DD` for a date or datetime. */
  value: string;
  /** What to show for `value` when it's an id or a choice key (a relation row's name, a choice's label). */
  valueLabel?: string;
}

export interface FilterOperatorOption {
  op: FilterOperator;
  label: string;
}


/** Fields a list can filter on: everything but the id and to-many relations (not one value per row). */
export function filterableFields(schema: Schema): SchemaField[] {
  return schema.fields.filter((field) => field.name !== "id" && !(field.type === "relation" && field.many));
}

/** The operators `field` offers, labelled in `locale` (default: the current UI language). */
export function operatorsFor(field: SchemaField, locale?: Locale): FilterOperatorOption[] {
  const t = translator(messages, locale);
  let ops: FilterOperatorOption[];
  if (field.type === "boolean") ops = [{ op: "is", label: t("opIs") }];
  else if (field.choices || field.type === "relation" || field.format === "uuid")
    ops = [
      { op: "is", label: t("opIs") },
      { op: "is_not", label: t("opIsNot") },
    ];
  else if (field.type === "integer" || field.type === "number")
    ops = [
      { op: "is", label: "=" },
      { op: "is_not", label: "≠" },
      { op: "gt", label: ">" },
      { op: "gte", label: "≥" },
      { op: "lt", label: "<" },
      { op: "lte", label: "≤" },
    ];
  else if (field.type === "date" || field.type === "datetime")
    ops = [
      { op: "is", label: t("opIsOn") },
      { op: "lt", label: t("opIsBefore") },
      { op: "gt", label: t("opIsAfter") },
      { op: "lte", label: t("opIsOnOrBefore") },
      { op: "gte", label: t("opIsOnOrAfter") },
    ];
  else
    ops = [
      { op: "contains", label: t("opContains") },
      { op: "is", label: t("opIs") },
      { op: "is_not", label: t("opIsNot") },
    ];
  // A to-one relation that isn't required can be unset - same as a nullable field.
  const canBeEmpty = field.nullable || (field.type === "relation" && !field.required);
  const emptyOps: FilterOperatorOption[] = [
    { op: "empty", label: t("opEmpty") },
    { op: "not_empty", label: t("opNotEmpty") },
  ];
  return canBeEmpty && field.type !== "boolean" ? [...ops, ...emptyOps] : ops;
}

export function needsValue(op: FilterOperator): boolean {
  return op !== "empty" && op !== "not_empty";
}

export function newCondition(field: SchemaField): FilterCondition {
  return { field: field.name, op: operatorsFor(field)[0].op, value: field.type === "boolean" ? "true" : "" };
}

function param(field: string, value: string, lookup?: string, negate = false): [string, string] {
  return [`filter{${negate ? "-" : ""}${field}${lookup ? `.${lookup}` : ""}}`, value];
}

/** Local midnight of a `YYYY-MM-DD` day, as the absolute timestamp a datetime field compares against. */
function dayStart(day: string, offsetDays = 0): string {
  const date = new Date(`${day}T00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

/** One condition's query params - none while it still needs a value. */
export function conditionParams(field: SchemaField, condition: FilterCondition): [string, string][] {
  const { op, value } = condition;
  const name = field.name;
  if (op === "empty") return [param(name, "true", "isnull")];
  if (op === "not_empty") return [param(name, "false", "isnull")];
  if (value === "") return [];

  if (field.type === "datetime") {
    // Days, not instants: "on" is the whole local day, "before" its start, "after" its end.
    switch (op) {
      case "is":
        return [param(name, dayStart(value), "gte"), param(name, dayStart(value, 1), "lt")];
      case "lt":
        return [param(name, dayStart(value), "lt")];
      case "lte":
        return [param(name, dayStart(value, 1), "lt")];
      case "gt":
        return [param(name, dayStart(value, 1), "gte")];
      case "gte":
        return [param(name, dayStart(value), "gte")];
    }
  }

  switch (op) {
    case "contains":
      return [param(name, value, "icontains")];
    case "is":
      return [param(name, value)];
    case "is_not":
      return [param(name, value, undefined, true)];
    default:
      return [param(name, value, op)];
  }
}

/** Every condition's params, in order - conditions on fields the schema doesn't have are dropped. */
export function filterParams(schema: Schema, conditions: FilterCondition[]): [string, string][] {
  const byName = new Map(schema.fields.map((field) => [field.name, field]));
  return conditions.flatMap((condition) => {
    const field = byName.get(condition.field);
    return field ? conditionParams(field, condition) : [];
  });
}

/** Whether a condition filters anything yet (has its value, or needs none). */
export function isComplete(condition: FilterCondition): boolean {
  return !needsValue(condition.op) || condition.value !== "";
}

/** A one-line summary for an active-filter chip, e.g. `Status is Done`. */
export function describeCondition(field: SchemaField, condition: FilterCondition, locale?: Locale): string {
  const t = translator(messages, locale);
  const op = operatorsFor(field, locale).find((option) => option.op === condition.op)?.label ?? condition.op;
  if (!needsValue(condition.op)) return t("conditionNoValue", { field: field.label, op });
  let value = condition.valueLabel ?? condition.value;
  if (field.type === "boolean") value = condition.value === "true" ? t("yesLower") : t("noLower");
  else if (field.choices) value = field.choices.find((choice) => choice.value === condition.value)?.label ?? value;
  return t("conditionWithValue", { field: field.label, op, value });
}
