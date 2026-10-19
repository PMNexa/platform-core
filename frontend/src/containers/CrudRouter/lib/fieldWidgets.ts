import type { ComponentType } from "react";
import type { CrudField } from "./types";

type AnyRecord = Record<string, unknown>;

/** What a field widget gets: its own field, the layout's `with` fields (by key), the form's values and the server's refusals. */
export interface FieldWidgetProps {
  /** The input's id (its label's `htmlFor`). */
  id: string;
  field: CrudField<AnyRecord>;
  /** The `with` fields the form has, by key (a preset or read-only one is missing). */
  fields: Partial<Record<string, CrudField<AnyRecord>>>;
  values: AnyRecord;
  /** Set one field's value (any field of the form; the value goes to the API as given). */
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string[]>;
}

const widgets = new Map<string, ComponentType<FieldWidgetProps>>();

/**
 * Draw every form field a layout gives `widget: name` with `component`
 * (with its `with` fields) - in every generic form. The host registers
 * the widgets its modules export, once, before forms render.
 */
export function registerFieldWidget(name: string, component: ComponentType<FieldWidgetProps>): void {
  widgets.set(name, component);
}

export function fieldWidget(name: string | undefined): ComponentType<FieldWidgetProps> | undefined {
  return name ? widgets.get(name) : undefined;
}
