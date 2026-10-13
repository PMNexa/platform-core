import type { CrudField, CrudFieldType } from "./types";
import type { Schema, SchemaField, SchemaFieldType } from "./schema";

function isWritable(field: SchemaField): boolean {
  // A relation field is ALWAYS `read_only` on the serializer by design
  // (`DynamicRelationField.__init__` defaults it - see core_api's own
  // docstring): every writable relation in this platform is actually
  // resolved out-of-band from the raw request body by the owning
  // ViewSet (e.g. `GoalViewSet._resolve_parent`), never through the
  // serializer's own `validated_data`. So `read_only` alone can't be
  // used to decide writability for a relation - only "is it to-one"
  // matters (a to-many relation still isn't a single scalar value a
  // plain form control can hold, see createSchemaColumns's own note on
  // the same exclusion).
  if (field.type === "relation") return !field.many;
  if (field.read_only) return false;
  return true;
}

const TYPE_MAP: Partial<Record<SchemaFieldType, CrudFieldType>> = {
  boolean: "checkbox",
  integer: "number",
  number: "number",
  email: "email",
  date: "date",
  datetime: "datetime",
};

function crudFieldType(field: SchemaField): CrudFieldType {
  // A ChoiceField (e.g. a TextChoices status) always gets a real select,
  // regardless of its own base `type` (schema.ts reports the CHOICE
  // field's underlying type as "string", not something choice-specific).
  if (field.choices && field.choices.length > 0) return "select";
  // A to-one relation with a known related endpoint gets a real select
  // too - CrudCreateForm/CrudEditForm fill its `options` in asynchronously
  // (fetchRelationOptions) once mounted, keyed off `relatedEndpoint`
  // below. One with no registered endpoint has no way to fetch a picker
  // list at all - falls back to a bare text input for the id itself.
  if (field.type === "relation") return field.related_endpoint ? "select" : "text";
  if (field.multiline) return "textarea";
  return TYPE_MAP[field.type] ?? "text";
}

/**
 * Builds `CrudCreateScreen`/`CrudEditScreen`'s form fields straight from
 * a `BaseViewSet.schema()` response - `CrudListScreen`'s
 * `createSchemaColumns` for the write side. Skips anything not writable
 * (a genuinely read-only scalar, or a to-many relation - see
 * `isWritable`), maps a schema field's own `type`/`choices` to the
 * closest `CrudField` `type`. A to-one relation with a registered
 * `related_endpoint` becomes a `select` whose `options` this function
 * leaves EMPTY (`relatedEndpoint` tells the caller where to fetch them
 * from instead - see `relationOptions.ts` and `CrudCreateForm`/
 * `CrudEditForm`, which is where that fetch actually happens). A
 * `date`/`datetime` field gets a native date / `datetime-local` picker
 * (see `CrudFormFields` for the timezone conversion).
 */
export function createSchemaFields<T>(schema: Schema): CrudField<T>[] {
  return schema.fields.filter(isWritable).map((field): CrudField<T> => {
    const type = crudFieldType(field);
    return {
      key: field.name as keyof T & string,
      label: field.label,
      type,
      required: field.required,
      nullable: field.nullable,
      ...(field.help_text ? { helpText: field.help_text } : {}),
      ...(type === "select" && field.choices ? { options: field.choices } : {}),
      ...(type === "select" && field.default !== undefined ? { defaultValue: field.default } : {}),
      ...(type === "select" && field.type === "relation" && field.related_endpoint
        ? { options: [], relatedEndpoint: field.related_endpoint }
        : {}),
    };
  });
}
