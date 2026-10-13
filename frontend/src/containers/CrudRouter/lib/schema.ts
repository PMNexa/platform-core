/**
 * The shape `core_api.viewsets.BaseViewSet.schema` (`GET <resource>/schema`)
 * returns - see its own docstring (platform-core backend) for exactly
 * how each field gets built. Kept as its own file (not folded into
 * `types.ts`) since this is the SERVER's OWN description of a resource,
 * while `CrudField` (`types.ts`) describes ONE FORM FIELD `CrudFormFields`
 * actually renders - `schemaColumns.ts`/`schemaFields.ts` are the two
 * places a `Schema` turns into the latter (`DataTableColumn`/`CrudField`
 * respectively).
 */

export interface SchemaFieldChoice {
  value: string;
  label: string;
}

export type SchemaFieldType = "string" | "integer" | "number" | "boolean" | "date" | "datetime" | "email" | "relation";

export interface SchemaField {
  name: string;
  type: SchemaFieldType;
  required: boolean;
  read_only: boolean;
  label: string;
  /** Whether the field accepts an explicit `null` (DRF's `allow_null`). */
  nullable?: boolean;
  /** `"uuid"` for a UUID field - still `type: "string"`, but an opaque id rather than human text (a detail page hides a read-only one, a list hides its column by default). */
  format?: "uuid";
  /** A model `TextField` - long text: a textarea in forms, a full-width block on a detail page. */
  multiline?: boolean;
  /** The model field's `help_text`, when it has one. */
  help_text?: string;
  /** Only present on a `ChoiceField` (e.g. a model's `TextChoices` status). */
  choices?: SchemaFieldChoice[];
  /** Only on a `ChoiceField` whose default is known - what a new row gets when the field is left out. */
  default?: string;
  /** Only present when `type === "relation"`. */
  many?: boolean;
  related_model?: string | null;
  /** Only present when `type === "relation"` - the related resource's own base URL (e.g. `"/api/v1/goals"`), from the backend's `core_api.registry`. `null` if that model was never registered there - `schemaFields.ts` falls back to a bare text input for the id in that case. */
  related_endpoint?: string | null;
  /** Only present when `type === "relation"` - whether this field is left off a plain response unless `?include[]=`'d (a to-many relation always is - see `core_api.serializers.BaseSerializer`'s own docstring; a to-one relation never is). */
  deferred?: boolean;
  /** Only on a to-many relation (`many: true`) backed by a real model relation - how a detail screen manages its rows: `one_to_many` (a reverse FK - the related rows are children, created/edited/deleted in place) or `many_to_many` (rows are linked/unlinked via `BaseApi.link`/`unlink`). See core_api/relations.py. */
  kind?: RelationKind;
  /** With `kind` - the lookup on `related_endpoint` pointing back at the row being viewed: `?filter{<back_filter>}=<id>` lists exactly its related rows. For `one_to_many` it's also the child's own FK field, preset when creating a child. */
  back_filter?: string;
  /** Only with `kind: "many_to_many"` - a custom through model's own fields, asked for on link (e.g. a membership's `role`). Empty for a plain M2M. */
  through_fields?: SchemaField[];
}

export interface SchemaCapabilities {
  create: boolean;
  update: boolean;
  delete: boolean;
}

/** `schema.can[action]`, defaulting to allowed for a server that doesn't report it. The API enforces regardless - this only hides what would fail. */
export function canDo(schema: Pick<Schema, "can">, action: keyof SchemaCapabilities): boolean {
  return schema.can?.[action] ?? true;
}

export type RelationKind = "one_to_many" | "many_to_many";

export interface Schema {
  /** The model's `verbose_name`, lowercase as Django keeps it (e.g. `"check-in"`). */
  label?: string;
  /** The model's `verbose_name_plural`. */
  label_plural?: string;
  /** The field whose value names a row - a picker option, a detail page title, a link to it (see `rowLabel`). */
  display_field?: string;
  /** Whether `?q=` searches anything on this resource (its viewset has `search_fields`); a UI hides its search box otherwise. */
  searchable?: boolean;
  /** What the caller may do here - the viewset serves it AND the host's access policy (e.g. RBAC) allows it somewhere. A UI hides the rest; absent = everything (see `canDo`). */
  can?: SchemaCapabilities;
  fields: SchemaField[];
}
