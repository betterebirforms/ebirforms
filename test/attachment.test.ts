// BIR's attachments on the web: deleting a copy moves the later copies down one, as BIR's deleteAttachment does.
import { describe, expect, it } from "vitest";
import { deleteCopy } from "@/form/attachment.ts";
import type { AttachmentSpec, FieldSpec } from "@/form/schema.ts";

const spec: AttachmentSpec = {
  template: "attachmentPages_TEMP",
  token: "TYPE",
  max: 3,
  kind: [{ code: "EX", container: "attachmentEX", count_field: "totalEX", add_button: "addEX" }],
};
const field: FieldSpec[] = [1, 2, 3].map((n) => ({ id: `f:txtPg1mEX${n}Name`, kind: "text" }) as FieldSpec);

describe("deleteCopy", () => {
  it("drops copy 1 of 3: 2 and 3 move down, the count drops", () => {
    const state = { totalEX: "3", "f:txtPg1mEX1Name": "A", "f:txtPg1mEX2Name": "B", "f:txtPg1mEX3Name": "C", other: "x" };
    expect(deleteCopy(state, field, spec, "EX", 1)).toEqual({ totalEX: "2", "f:txtPg1mEX1Name": "B", "f:txtPg1mEX2Name": "C", other: "x" });
  });
  it("drops the last copy only", () => {
    const state = { totalEX: "2", "f:txtPg1mEX1Name": "A", "f:txtPg1mEX2Name": "B" };
    expect(deleteCopy(state, field, spec, "EX", 2)).toEqual({ totalEX: "1", "f:txtPg1mEX1Name": "A" });
  });
  it("ignores a copy that is not in use", () => {
    const state = { totalEX: "1", "f:txtPg1mEX1Name": "A" };
    expect(deleteCopy(state, field, spec, "EX", 2)).toBe(state);
  });
});

describe("BIR's shared counter (1701 txtAttachmentTypes)", () => {
  const shared: AttachmentSpec = { ...spec, kind: [
    { code: "EX", container: "attachmentEX", count_field: "types", add_button: "a" },
    { code: "SP", container: "attachmentSP", count_field: "types", add_button: "b" },
  ] };
  it("reads and writes \"EX<n>,SP<m>\" as attachmentTypes_Update does", async () => {
    const { copyCount, withCount } = await import("@/form/attachment.ts");
    expect(copyCount(shared, { types: "EX2,SP1" }, "SP")).toBe(1);
    expect(withCount(shared, {}, "EX", 1)).toEqual({ types: "EX1,SP0" });
    expect(withCount(shared, { types: "EX1,SP0" }, "SP", 1)).toEqual({ types: "EX1,SP1" });
  });
});
