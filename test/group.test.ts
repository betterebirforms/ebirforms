import { describe, expect, it } from "vitest";
import { computeGroupRows, groupRecords, groupTotal, type GroupRow, type GroupSpec } from "@/form/schema.ts";
import { parseMoney } from "@/form/money.ts";

// Repeating-schedule support, shaped like 1600WP's ATC breakdown (the variable-row tables the heavy forms
// build at runtime): rows of {taxBase, taxRate, withheld}, withheld = base × rate ÷ 100, summed into txtTax12.
const SCHEDULE: GroupSpec = {
  name: "partII",
  size_field: "hPartIITableSize",
  first_index: 1,
  row: [
    { id: "frm1600WP:txtTaxBase", kind: "money" },
    { id: "frm1600WP:txtTaxRate", kind: "text" },
    {
      id: "frm1600WP:txtTaxbeWithHeld",
      kind: "money",
      row_compute: (read) => Math.round((parseMoney(read("frm1600WP:txtTaxBase")) * Number(read("frm1600WP:txtTaxRate") || 0)) / 100),
    },
  ],
  total: { into: "frm1600WP:txtTax12", of: "frm1600WP:txtTaxbeWithHeld" },
};

const rows: GroupRow[] = [
  { "frm1600WP:txtTaxBase": "1,000.00", "frm1600WP:txtTaxRate": "10" },
  { "frm1600WP:txtTaxBase": "500.00", "frm1600WP:txtTaxRate": "20" },
];

describe("repeating-schedule framework", () => {
  it("computes withheld per row = base × rate ÷ 100 (exact centavo)", () => {
    const computed = computeGroupRows(SCHEDULE, rows);
    expect(computed[0]!["frm1600WP:txtTaxbeWithHeld"]).toBe("100.00"); // 1000 × 10%
    expect(computed[1]!["frm1600WP:txtTaxbeWithHeld"]).toBe("100.00"); // 500 × 20%
  });

  it("aggregates the schedule total across rows", () => {
    expect(groupTotal(SCHEDULE, rows, "frm1600WP:txtTaxbeWithHeld")).toBe(20000); // 100.00 + 100.00 = ₱200.00 in centavos
  });

  it("serializes to BIR's exact indexed record format (txtTaxBase1, …, hPartIITableSize=N)", () => {
    const record = groupRecords(SCHEDULE, rows);
    expect(record[0]).toEqual({ key: "hPartIITableSize", value: "2" });
    expect(record).toContainEqual({ key: "frm1600WP:txtTaxBase1", value: "1,000.00" });
    expect(record).toContainEqual({ key: "frm1600WP:txtTaxRate1", value: "10" });
    expect(record).toContainEqual({ key: "frm1600WP:txtTaxbeWithHeld1", value: "100.00" });
    expect(record).toContainEqual({ key: "frm1600WP:txtTaxbeWithHeld2", value: "100.00" });
    // exactly one size record + 3 sub-fields × 2 rows
    expect(record).toHaveLength(1 + 3 * 2);
  });

  it("handles an empty schedule (size 0, no rows)", () => {
    expect(groupRecords(SCHEDULE, [])).toEqual([{ key: "hPartIITableSize", value: "0" }]);
    expect(groupTotal(SCHEDULE, [], "frm1600WP:txtTaxbeWithHeld")).toBe(0);
  });
});

describe("BIR's upper-casing (measured per form, src/form/upper-case.json)", () => {
  it("sweeps all text on 'all' forms, only the measured fields on field-level forms, nothing elsewhere", async () => {
    const { formRecords } = await import("@/form/schema.ts");
    const { FORM_1601FQ } = await import("@/form/form1601fq.ts");
    const { FORM_1707A } = await import("@/form/form1707a.ts");
    const { FORM_0619E } = await import("@/form/form0619e.ts");
    const value = (r: Array<{ key: string; value: string }>, key: string) => r.find((x) => x.key === key)?.value;
    const fq = formRecords(FORM_1601FQ, { "frm1601FQ:txtTaxpayerName": "dela cruz", txtEmail: "juan@example.com" }); // "all"
    expect(value(fq, "frm1601FQ:txtTaxpayerName")).toBe("DELA%20CRUZ");
    expect(value(fq, "txtEmail")).toBe("juan@example.com");
    const a = formRecords(FORM_1707A, { "frm1707A:txtI8RegisteredName": "dela cruz", "frm1707A:txtI10ZipCode": "abc" }); // field-level
    expect(value(a, "frm1707A:txtI8RegisteredName")).toBe("DELA%20CRUZ");
    expect(value(a, "frm1707A:txtI10ZipCode") ?? "abc").toBe("abc");
    const e = formRecords(FORM_0619E, { "frm0619E:txtTaxpayerName": "dela cruz" }); // BIR leaves text as typed
    expect(value(e, "frm0619E:txtTaxpayerName")).toBe("dela%20cruz");
  });
});
