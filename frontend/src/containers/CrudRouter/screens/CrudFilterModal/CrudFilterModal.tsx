import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../components/atoms/Button";
import FormControl from "../../../../components/atoms/FormControl";
import Icon from "../../../../components/atoms/Icon";
import Modal from "../../../../components/organisms/Modal";
import type { BaseApiRequest } from "../../lib/baseApi";
import { filterableFields, isComplete, needsValue, newCondition, operatorsFor, type FilterCondition, type FilterOperator } from "../../lib/filters";
import { fetchRelationOptions } from "../../lib/relationOptions";
import type { Schema, SchemaField } from "../../lib/schema";
import type { CrudFieldOption } from "../../lib/types";

export interface CrudFilterModalProps {
  schema: Schema;
  /** For a relation field's options (`fetchRelationOptions`). */
  request: BaseApiRequest;
  /** The filters currently applied - the modal edits a copy (mount it only while open, so each opening starts from these). */
  conditions: FilterCondition[];
  onApply: (conditions: FilterCondition[]) => void;
  onClose: () => void;
}

interface ValueInputProps {
  field: SchemaField;
  condition: FilterCondition;
  options?: CrudFieldOption[];
  onChange: (value: string, valueLabel?: string) => void;
}

/** The value input for one condition, shaped by the field's type. */
function ValueInput({ field, condition, options, onChange }: ValueInputProps) {
  const label = `${field.label} value`;
  if (field.type === "boolean") {
    return (
      <select className="form-select form-select-sm" aria-label={label} value={condition.value} onChange={(event) => onChange(event.target.value)}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  const choices = field.choices ?? (field.type === "relation" && field.related_endpoint ? options : undefined);
  if (choices) {
    return (
      <select
        className="form-select form-select-sm"
        aria-label={label}
        value={condition.value}
        onChange={(event) => {
          const picked = choices.find((choice) => choice.value === event.target.value);
          onChange(event.target.value, field.type === "relation" ? picked?.label : undefined);
        }}
      >
        <option value="" disabled>
          {options || field.choices ? "Select…" : "Loading…"}
        </option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    );
  }
  const type =
    field.type === "date" || field.type === "datetime"
      ? "date"
      : field.type === "integer" || field.type === "number"
        ? "number"
        : "text";
  return <FormControl type={type} aria-label={label} value={condition.value} onChange={(event) => onChange(event.target.value)} />;
}

/**
 * `CrudListScreen`'s filter builder: conditions are added one field at a
 * time ("Add filter" picks the field), each row then offering that
 * field's own operators and value input (`operatorsFor` - text contains,
 * number/date comparisons, a choice/relation/boolean select, "is empty"
 * for a nullable one). Conditions combine with AND. Nothing reaches the
 * list until Apply; a condition still missing its value is dropped then.
 */
function CrudFilterModal({ schema, request, conditions, onApply, onClose }: CrudFilterModalProps) {
  const [draft, setDraft] = useState<FilterCondition[]>(conditions);
  const [optionsByEndpoint, setOptionsByEndpoint] = useState<Record<string, CrudFieldOption[]>>({});
  const fields = useMemo(() => filterableFields(schema), [schema]);
  const byName = useMemo(() => new Map(fields.map((field) => [field.name, field])), [fields]);

  // Each relation in the draft loads its options once, when first added.
  const endpoints = useMemo(
    () =>
      Array.from(
        new Set(draft.map((condition) => byName.get(condition.field)?.related_endpoint).filter((endpoint): endpoint is string => Boolean(endpoint))),
      ),
    [draft, byName],
  );
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const endpoint of endpoints) {
      if (requested.current.has(endpoint)) continue;
      requested.current.add(endpoint);
      fetchRelationOptions(endpoint, request)
        .then((options) => setOptionsByEndpoint((prev) => ({ ...prev, [endpoint]: options })))
        // A relation that fails to load keeps its "Loading…" select; its "is empty" operators still work.
        .catch(() => {});
    }
  }, [endpoints, request]);

  function update(index: number, patch: Partial<FilterCondition>) {
    setDraft((prev) => prev.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)));
  }

  function addField(name: string) {
    const field = byName.get(name);
    if (field) setDraft((prev) => [...prev, newCondition(field)]);
  }

  return (
    <Modal
      open
      title="Filter"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="link" className="me-auto" disabled={draft.length === 0} onClick={() => setDraft([])}>
            Clear all
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => onApply(draft.filter(isComplete))}>
            Apply
          </Button>
        </>
      }
    >
      {draft.length === 0 && <p className="text-secondary">No filters yet - add one to narrow the list.</p>}
      {draft.map((condition, index) => {
        const field = byName.get(condition.field);
        if (!field) return null;
        return (
          <div key={index} className="row g-2 align-items-center mb-2">
            <div className="col-3 fw-medium text-truncate" title={field.label}>
              {field.label}
            </div>
            <div className="col-3">
              <select
                className="form-select form-select-sm"
                aria-label={`${field.label} operator`}
                value={condition.op}
                onChange={(event) => update(index, { op: event.target.value as FilterOperator })}
              >
                {operatorsFor(field).map((option) => (
                  <option key={option.op} value={option.op}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col">
              {needsValue(condition.op) && (
                <ValueInput
                  field={field}
                  condition={condition}
                  options={field.related_endpoint ? optionsByEndpoint[field.related_endpoint] : undefined}
                  onChange={(value, valueLabel) => update(index, { value, valueLabel })}
                />
              )}
            </div>
            <div className="col-auto">
              <Button
                type="button"
                icon
                className="btn-ghost-secondary"
                aria-label={`Remove ${field.label} filter`}
                onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
              >
                <Icon name="x" />
              </Button>
            </div>
          </div>
        );
      })}
      <select
        className="form-select form-select-sm mt-3"
        aria-label="Add filter"
        value=""
        onChange={(event) => addField(event.target.value)}
        style={{ maxWidth: 240 }}
      >
        <option value="" disabled>
          + Add filter…
        </option>
        {fields.map((field) => (
          <option key={field.name} value={field.name}>
            {field.label}
          </option>
        ))}
      </select>
    </Modal>
  );
}

export default CrudFilterModal;
