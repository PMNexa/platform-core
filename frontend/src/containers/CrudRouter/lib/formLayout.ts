import type { CrudField, FormLayout, FormLayoutField, FormSection, FormShowIf } from "./types";

export interface LaidOutField<T> {
  field: CrudField<T>;
  showIf?: FormShowIf;
  /** A registered field widget's name (`registerFieldWidget`) and the fields it draws too. */
  widget?: string;
  with?: LaidOutField<T>[];
}

export interface LaidOutSection<T> extends Omit<FormSection, "fields"> {
  fields: LaidOutField<T>[];
}

/**
 * `layout`'s sections with their `fields` resolved; names the form doesn't
 * have (read-only, preset by the caller) are skipped, and fields the layout
 * doesn't name go in a last, untitled section - so nothing goes missing.
 * A widget's `with` fields are placed with it, not again on their own.
 */
export function layoutSections<T>(layout: FormLayout, fields: CrudField<T>[]): LaidOutSection<T>[] {
  const byKey = new Map(fields.map((field) => [field.key as string, field]));
  const placed = new Set<string>();
  function resolve(entries: FormLayoutField[]): LaidOutField<T>[] {
    return entries.flatMap((entry) => {
      const name = typeof entry === "string" ? entry : entry.name;
      const field = byKey.get(name);
      if (!field || placed.has(name)) return [];
      placed.add(name);
      if (typeof entry === "string") return [{ field }];
      return [{ field, showIf: entry.show_if, widget: entry.widget, ...(entry.with ? { with: resolve(entry.with) } : {}) }];
    });
  }
  const sections: LaidOutSection<T>[] = layout.map(({ fields: names, ...section }) => ({
    ...section,
    fields: resolve(names),
  }));
  const rest = fields.filter((field) => !placed.has(field.key));
  if (rest.length) sections.push({ fields: rest.map((field) => ({ field })) });
  return sections;
}

/** The value a rule tests: the form's own, else the select's shown default; null/undefined = "". */
function currentValue<T>(key: string, fields: CrudField<T>[], values: Partial<T>): unknown {
  const value = (values as Record<string, unknown>)[key];
  if (value === undefined) return fields.find((field) => field.key === key)?.defaultValue ?? "";
  return value ?? "";
}

/**
 * Whether a field with `showIf` shows for these values (no rule = always).
 * A rule on a field the form doesn't have (preset by the caller, e.g. the
 * org a new goal goes in) can't be judged here, so the field shows.
 */
export function matches<T>(showIf: FormShowIf | undefined, fields: CrudField<T>[], values: Partial<T>): boolean {
  if (!showIf || !fields.some((field) => field.key === showIf.field)) return true;
  const value = currentValue(showIf.field, fields, values);
  if (showIf.in && !showIf.in.includes(value)) return false;
  if (showIf.not_in && showIf.not_in.includes(value)) return false;
  return true;
}

/** Every field `layout` names, in order (a widget's `with` fields right after it), with its show-when rule. */
export function layoutOrder(layout: FormLayout): { name: string; showIf?: FormShowIf }[] {
  const walk = (entries: FormLayoutField[]): { name: string; showIf?: FormShowIf }[] =>
    entries.flatMap((entry) =>
      typeof entry === "string" ? [{ name: entry }] : [{ name: entry.name, showIf: entry.show_if }, ...walk(entry.with ?? [])],
    );
  return layout.flatMap((section) => walk(section.fields));
}

/** Whether a saved record passes a show-when rule (no rule, or a field it doesn't have = shows); null = "". */
export function recordMatches(showIf: FormShowIf | undefined, record: Record<string, unknown>): boolean {
  if (!showIf || !(showIf.field in record)) return true;
  const value = record[showIf.field] ?? "";
  if (showIf.in && !showIf.in.includes(value)) return false;
  if (showIf.not_in && showIf.not_in.includes(value)) return false;
  return true;
}
