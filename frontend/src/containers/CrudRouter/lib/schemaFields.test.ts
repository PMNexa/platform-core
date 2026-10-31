import { describe, expect, it } from "vitest";
import { createSchemaFields } from "./schemaFields";
import type { Schema } from "./schema";

const SCHEMA: Schema = {

  label: "source concept",
  label_plural: "source concepts",
  display_field: "name",
  searchable: true,
  fields: [
    { name: "id", type: "string", required: false, read_only: true, label: "Id", nullable: false, format: "uuid" },
    { name: "name", type: "string", required: true, read_only: false, label: "Name", nullable: false },
    {
      name: "evidence",
      type: "list",
      required: true,
      read_only: false,
      label: "Evidence",
      nullable: false,
      items: {
        type: "object",
        fields: [{ name: "chunk", type: "string", required: true, read_only: false, label: "Chunk", nullable: false }],
      },
    },
  ],
};

describe("createSchemaFields", () => {
  it("leaves a list field out of the generic form (no control for it; a widget or the API writes it)", () => {
    expect(createSchemaFields(SCHEMA).map((field) => field.key)).toEqual(["name"]);
  });
});
