// BIR Form 1604-E v2018 (Annual Information Return of Creditable Income Taxes Withheld — Expanded / Income
// Payments Exempt from Withholding Tax), P3. Two STATIC remittance schedules (the older 1604E's shape):
//   • Schedule 1 — 4 rows (txtSched1…1–4), Schedule 2 — 12 rows (txtSched2…1–12). Per row: remittance date,
//     bank code, TRA/eROR/eAR no., tax withheld, penalties and the total amount remitted.
// Chain (computeSched1/2 + computeSched1Total/2Total, run on every amount's blur):
//   TotRemAmt<i> = TaxWithheld<i> + Penalties<i>
//   TaxWithheldTtl = Σ TaxWithheld   PenaltiesTtl = Σ Penalties   TotRemAmtTtl = Σ TotRemAmt
// Save format (saveXML): the agent name and address are escape()d; item 6 (address) is written as ONE key, the two
// address inputs concatenated (txtAddress2 is never saved itself); the line of business is escape()d too;
// txtCurrentPage is always saved as "1". The page-2 header (TIN, name) mirrors page 1 — loadBGData fills both
// from the taxpayer profile — and its name is saved RAW.
// BIR reload bug: loadData reads values back through jQuery .html(), so a raw "&" in the page-2 name returns as
// "&amp;" (the escape()d page-1 name is unaffected).

import fieldJson from "./fields/1604Ev2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1604e:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
/** Row count per schedule (Schedule 1 has 4 rows, Schedule 2 has 12). */
export const SCHED_ROW_1604EV2018: Record<1 | 2, number> = { 1: 4, 2: 12 };
const rowOf = (s: 1 | 2): number[] => Array.from({ length: SCHED_ROW_1604EV2018[s] }, (_, i) => i + 1);
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  // blockletterWithout2Decimal then validateYear on blur: parseFloat(...).toFixed(0) (non-numeric → ""), then a
  // year before 2018 (blank included — "" < 2018) becomes "2018" and one after the current year becomes the
  // current year. BIR never saves anything else in item 1.
  [`${P}txtYear`]: {
    required: true,
    derive: (_, v) => {
      const n = parseFloat(v);
      const year = Number.isNaN(n) ? 0 : Number(n.toFixed(0));
      const now = new Date().getFullYear();
      return String(year < 2018 ? 2018 : year > now ? now : year);
    },
  },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtWthhldngAgntsNme`]: { required: true },
  // saveXML always writes the page number as 1
  [`${P}txtCurrentPage`]: { derive: () => "1" },
  // page-2 header mirrors page 1 (loadBGData fills both from the profile)
  [`${P}txtPg2TIN1`]: { derive: (r) => r(`${P}txtTIN1`) },
  [`${P}txtPg2TIN2`]: { derive: (r) => r(`${P}txtTIN2`) },
  [`${P}txtPg2TIN3`]: { derive: (r) => r(`${P}txtTIN3`) },
  [`${P}txtPg2BranchCode`]: { derive: (r) => r(`${P}txtBranchCode`) },
  [`${P}txtPg2TaxpayerName`]: { derive: (r) => r(`${P}txtWthhldngAgntsNme`) },
};
for (const s of [1, 2] as const) {
  const row = rowOf(s);
  for (const i of row) {
    override[`${P}txtSched${s}TaxWithheld${i}`] = money;
    override[`${P}txtSched${s}Penalties${i}`] = money;
    override[`${P}txtSched${s}TotRemAmt${i}`] = { ...money, compute: (r) => m(r, `txtSched${s}TaxWithheld${i}`) + m(r, `txtSched${s}Penalties${i}`) };
  }
  override[`${P}txtSched${s}TaxWithheldTtl`] = { ...money, compute: (r) => row.reduce((t, i) => t + m(r, `txtSched${s}TaxWithheld${i}`), 0) };
  override[`${P}txtSched${s}PenaltiesTtl`] = { ...money, compute: (r) => row.reduce((t, i) => t + m(r, `txtSched${s}Penalties${i}`), 0) };
  override[`${P}txtSched${s}TotRemAmtTtl`] = { ...money, compute: (r) => row.reduce((t, i) => t + m(r, `txtSched${s}TotRemAmt${i}`), 0) };
}

export const FORM_1604Ev2018 = buildSchema(
  "1604Ev2018",
  "Annual Information Return of Creditable Income Taxes Withheld (Expanded)",
  fieldJson as FieldJson[],
  override,
);
// item 6 as saveXML writes it: both address inputs in the one txtAddress key; txtAddress2 itself is never saved
FORM_1604Ev2018.extra_record = (state): SaveRecord[] => [
  { key: `${P}txtAddress`, value: legacyEscape((state[`${P}txtAddress`] ?? "") + (state[`${P}txtAddress2`] ?? "")) },
  { key: `${P}txtAddress2`, value: "" },
];

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function validate1604Ev2018(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1604Ev2018, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const year = Number(state[`${P}txtYear`] ?? "");
  if (state[`${P}txtYear`] && year < 2018) problem.push({ id: `${P}txtYear`, message: "Item 1 cannot be earlier than 2018 (the effectivity of this form)." });
  for (const id of [`${P}WthldngAgntCtgry_1`, `${P}TpWthldngAgnt_1`]) {
    const stem = id.slice(0, -2);
    if (state[`${stem}_1`] !== "true" && state[`${stem}_2`] !== "true") problem.push({ id, message: `Choose an option for ${stem.slice(P.length)}.` });
  }
  // BIR's validateDate: MM/DD/YYYY, not in the future, not before 2018
  for (const s of [1, 2] as const) {
    for (const i of rowOf(s)) {
      const id = `${P}txtSched${s}RemDate${i}`;
      const v = state[id] ?? "";
      if (!v) continue;
      const d = DATE.exec(v);
      if (!d || Number(d[1]) < 1 || Number(d[1]) > 12 || Number(d[2]) < 1 || Number(d[2]) > 31 || Number(d[3]) < 2018) {
        problem.push({ id, message: "Enter a valid date (MM/DD/YYYY), 2018 or later." });
      }
    }
  }
  return problem;
}
