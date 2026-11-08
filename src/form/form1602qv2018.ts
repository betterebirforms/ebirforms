// BIR Form 1602Q v2018 (Quarterly Remittance Return of Final Income Taxes Withheld on interest paid on
// deposits / deposit substitutes / trusts, etc.), P3. A FIXED-schedule form — no dynamic rows, no reload
// reconstruction (the first such form in a while).
//   Schedule 1: 15 fixed ATC rows. taxWithheld = amount × rate/100.
//     • Rows 1–12 read their rate from an empty `<font id=fntSched1TaxRate{i}>` element — a BIR data-wiring bug:
//       the statutory per-ATC rate was never populated, so `getElementById(rate).value` is undefined → NaN →
//       formatCurrency(NaN) = "0.00". We reproduce that exactly (tax = 0 for these rows). DOCUMENTED, not fixed:
//       BIR's server expects this value, and "correcting" it with the real rates would break byte-compatibility.
//     • Rows 13–14 are BSP-rate rows: taxWithheld = amount × taxRate/100 × bspRate (editable rate + BSP factor).
//     • Row 15's amount is disabled and its onblur passes the literal `6` as an element id (another bug) → 0.
//   Schedule 2 (2 rows) and Schedule 3 (2 rows) have editable rate inputs and work normally.
//   txt14 = Sched1Total ; txt15 = Sched2Total ; txt16 = Sched3Total ; 17 = 14+15+16 ;
//   22 = 18+19+20+21 ; 23 = 17−22 ; 27 = 24+25+26 ; 28 = 23+27.

import fieldJson from "./fields/1602qv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1602Q:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`)); // centavos
const numv = (r: Read, id: string): number => parseFloat((r(`${P}${id}`) || "0").replace(/,/g, "")) || 0; // plain number (a %)
// amount(centavos) × rate% → tax(centavos), round-half-up like formatCurrency
const taxOf = (amountCents: number, ratePct: number): number => parseMoney((amountCents / 100) * (ratePct / 100));

const sched1Bsp = (r: Read, i: number): number => parseMoney((m(r, `txtSched1Amount${i}`) / 100) * (numv(r, `txtSched1TaxRate${i}`) / 100) * numv(r, `txtSched1Rate${i}`));
const sched2Tw = (r: Read, i: number): number => taxOf(m(r, `txtSched2Interest${i}`), numv(r, `txtSched2TaxRate${i}`));
const sched3Tw = (r: Read, i: number): number => taxOf(m(r, `txtSched3TotInterest${i}`), numv(r, `txtSched3TaxRate${i}`));
// Schedule totals derived straight from base inputs — the summary items (txt14..17) sit on page 1, BEFORE the
// schedule rows in DOM order, so a single-pass compute must not read the per-row computed cells (they're not
// ready yet). Rows 1–12 and 15 of Schedule 1 contribute 0 (the documented empty-rate bug).
const sched1TotalVal = (r: Read): number => sched1Bsp(r, 13) + sched1Bsp(r, 14);
const sched2TotalVal = (r: Read): number => sched2Tw(r, 1) + sched2Tw(r, 2);
const sched3TotalVal = (r: Read): number => sched3Tw(r, 1) + sched3Tw(r, 2);

const moneyIds = [
  ...Array.from({ length: 15 }, (_, k) => `txtSched1Amount${k + 1}`),
  "txtSched1Rate13", "txtSched1Rate14", // the BSP factors: BIR's round(this,2) formats them as money
  ...Array.from({ length: 15 }, (_, k) => `txtSched1Tax${k + 1}`),
  "txtSched1Total", "txtSched2Interest1", "txtSched2Interest2", "txtSched2TaxesWithheld1", "txtSched2TaxesWithheld2", "txtSched2Total",
  "txtSched3TotInterest1", "txtSched3TotInterest2", "txtSched3TaxWithheld1", "txtSched3TaxWithheld2", "txtSched3Total",
  ...Array.from({ length: 15 }, (_, k) => `txt${k + 14}`), // txt14..28
];
const moneyField = new Set(moneyIds.map((s) => `${P}${s}`));
const scalarField = (fieldJson as FieldJson[]).map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

// "Were there taxes withheld this quarter? — No" (OptTaxWithheld1 unchecked) makes the legacy disable and zero
// every schedule field on load. We mirror that by gating the computed schedule totals/cells on the Yes radio.
const withheld = { on: `${P}OptTaxWithheld1`, equals: "true" } as const;

// TaxWithhelOption() on "No" (on click, and on every reload) zeroes Schedule 1 amounts 1-15 and the BSP factors
// 13-14, then THROWS at row 15: its onblur is computeSched1(this.value, 6, ...) and getElementById(6) is null (BIR
// bug). The throw aborts the function before it reaches Schedules 2 and 3, so BIR keeps their inputs as entered;
// we do the same (only Schedule 1 inputs are gated). The same throw fires whenever row 15 is blurred under "Yes".
const sched1Input = [...Array.from({ length: 15 }, (_, k) => `txtSched1Amount${k + 1}`), "txtSched1Rate13", "txtSched1Rate14"];
// Item 29 (over-remittance: refund / TCC / carry over) is live only while item 28 is negative: computeItem28 calls
// disableOverRemittanceOpts(), which unchecks all three, whenever 28 >= 0.
const overRemitted = { when: (r: Read) => m(r, "txt28") < 0 };

const override: Record<string, Partial<FieldSpec>> = {
  ...Object.fromEntries(sched1Input.map((id) => [`${P}${id}`, { kind: "money", gate: withheld } as Partial<FieldSpec>])),
  ...Object.fromEntries([1, 2, 3].map((n) => [`${P}OverRemittance${n}`, { gate: overRemitted } as Partial<FieldSpec>])),
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtYear`]: { required: true },
  // Schedule 1 tax rows: 1–12 and 15 are BIR-broken (empty/invalid rate) → 0.00 ; 13–14 are BSP-rate rows.
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15].map((i) => [`${P}txtSched1Tax${i}`, { kind: "money", compute: () => 0 } as Partial<FieldSpec>]),
  ),
  [`${P}txtSched1Tax13`]: { kind: "money", gate: withheld, compute: (r) => sched1Bsp(r, 13) },
  [`${P}txtSched1Tax14`]: { kind: "money", gate: withheld, compute: (r) => sched1Bsp(r, 14) },
  [`${P}txtSched1Total`]: { kind: "money", gate: withheld, compute: sched1TotalVal },
  [`${P}txt14`]: { kind: "money", gate: withheld, compute: sched1TotalVal },
  // Schedule 2
  [`${P}txtSched2TaxesWithheld1`]: { kind: "money", gate: withheld, compute: (r) => sched2Tw(r, 1) },
  [`${P}txtSched2TaxesWithheld2`]: { kind: "money", gate: withheld, compute: (r) => sched2Tw(r, 2) },
  [`${P}txtSched2Total`]: { kind: "money", gate: withheld, compute: sched2TotalVal },
  [`${P}txt15`]: { kind: "money", gate: withheld, compute: sched2TotalVal },
  // Schedule 3
  [`${P}txtSched3TaxWithheld1`]: { kind: "money", gate: withheld, compute: (r) => sched3Tw(r, 1) },
  [`${P}txtSched3TaxWithheld2`]: { kind: "money", gate: withheld, compute: (r) => sched3Tw(r, 2) },
  [`${P}txtSched3Total`]: { kind: "money", gate: withheld, compute: sched3TotalVal },
  [`${P}txt16`]: { kind: "money", gate: withheld, compute: sched3TotalVal },
  // Main chain — read the (gated) totals txt14/15/16, which precede txt17 in DOM order, so the withheld gate propagates
  [`${P}txt17`]: { kind: "money", compute: (r) => m(r, "txt14") + m(r, "txt15") + m(r, "txt16") },
  [`${P}txt22`]: { kind: "money", compute: (r) => m(r, "txt18") + m(r, "txt19") + m(r, "txt20") + m(r, "txt21") },
  [`${P}txt23`]: { kind: "money", compute: (r) => m(r, "txt17") - m(r, "txt22") },
  [`${P}txt27`]: { kind: "money", compute: (r) => m(r, "txt24") + m(r, "txt25") + m(r, "txt26") },
  [`${P}txt28`]: { kind: "money", compute: (r) => m(r, "txt23") + m(r, "txt27") },
};

export const FORM_1602QV2018 = buildSchema("1602Qv2018", "Quarterly Remittance Return — Final Income Taxes Withheld", scalarField, override);

export function validate1602qv2018(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1602QV2018, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
