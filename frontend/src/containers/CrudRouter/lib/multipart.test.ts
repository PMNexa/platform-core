import { describe, expect, it } from "vitest";
import { encodeBody, hasFile, toFormData } from "./multipart";

describe("encodeBody", () => {
  it("sends JSON when no file is among the values", () => {
    expect(encodeBody({ title: "Dune", year: 1965 })).toBe(JSON.stringify({ title: "Dune", year: 1965 }));
    expect(hasFile({ title: "Dune" })).toBe(false);
  });

  it("switches to multipart once a File is present", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" });
    const body = encodeBody({ title: "Dune", cover: file, shelf: null, skipped: undefined, tags: [1, 2], flag: true });
    expect(body).toBeInstanceOf(FormData);
    const data = body as FormData;
    expect(data.get("title")).toBe("Dune");
    expect((data.get("cover") as File).name).toBe("cover.png");
    expect(data.get("shelf")).toBe("");
    expect(data.has("skipped")).toBe(false);
    expect(data.getAll("tags")).toEqual(["1", "2"]);
    expect(data.get("flag")).toBe("true");
  });

  it("keeps an object value as one JSON part", () => {
    const data = toFormData({ through: { role: "editor" }, cover: new Blob(["x"]) });
    expect(data.get("through")).toBe(JSON.stringify({ role: "editor" }));
  });
});
