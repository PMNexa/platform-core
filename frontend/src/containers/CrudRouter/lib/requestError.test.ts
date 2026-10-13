import { describe, expect, it } from "vitest";
import { fieldErrorsOf, formErrorMessage, RequestError } from "./requestError";
import type { CrudField } from "./types";

const FIELDS: CrudField<{ snap_to: string }>[] = [{ key: "snap_to", label: "Check-ins are for", type: "select" }];

describe("formErrorMessage", () => {
  it("names each reason by its field's label, and others by their key", () => {
    const error = new RequestError("Request failed validation.", {
      snap_to: ["Can't be longer than the target's period."],
      one_per: ["Bad."],
      __root__: ["Locked."],
    });
    expect(formErrorMessage(error, FIELDS)).toBe("Check-ins are for: Can't be longer than the target's period. one per: Bad. Locked.");
    expect(fieldErrorsOf(error)?.snap_to).toEqual(["Can't be longer than the target's period."]);
  });

  it("falls back to the message", () => {
    expect(formErrorMessage(new Error("Request failed."), FIELDS)).toBe("Request failed.");
    expect(formErrorMessage(new RequestError("Not found.", null), FIELDS)).toBe("Not found.");
  });
});
