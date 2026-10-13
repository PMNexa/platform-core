import type { CrudField, FormLayout, FormSection, FormShowIf } from "./types";

export interface LaidOutSection<T> extends Omit<FormSection, "fields"> {
  fields: { field: CrudField<T>; showIf?: FormShowIf }[];
}

/**
 * `layout`'s sections with their `fields` resolved; names the form doesn't
 * have (read-only, preset by the caller) are skipped, and fields the layout
 * doesn't name go in a last, untitled section - so nothing goes missing.
 */
export function layoutSections<T>(layout: FormLayout, fields: CrudField<T>[]): LaidOutSection<T>[] {
  const byKey = new Map(fields.map((field) => [field.key as string, field]));
  const placed = new Set<string>();
  const sections: LaidOutSection<T>[] = layout.map(({ fields: names, ...section }) => ({
    ...section,
    fields: names.flatMap((entry) => {
      const name = typeof entry === "string" ? entry : entry.name;
      const field = byKey.get(name);
      if (!field || placed.has(name)) return [];
      placed.add(name);
      return [{ field, showIf: typeof entry === "string" ? undefined : entry.show_if }];
    }),
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
