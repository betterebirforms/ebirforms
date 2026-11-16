// The drop-down lists of BIR's pop-up row tables (the web version's row editor draws them as <select>s).
// BIR builds each list in script, so these are ported from that script and its reference data (xml/treatyCodes.xml,
// xml/rdo.xml via tool/row-option-extract.mjs, and the ATC pick lists in atc.ts). The value is what BIR saves.
import type { RowOption } from "./schema.ts";
import { atcInfo, atcPickList } from "./atc.ts";
import data from "./row-option.json";

const list = data as { treaty: string[][]; rdo: string[][] };

/** PS / CS, as the share-sale tables of 1700, 1701, 1702EX and 1702RT list them (PS is BIR's first, selected). */
export const PS_CS_OPTION: RowOption[] = [{ value: "PS" }, { value: "CS" }];

/** A pop-up's treaty-code box: "-", an optional "NA - Not Applicable" BIR writes itself, then the treaty list of the
 *  form's code (BIR keeps a record when its form field CONTAINS the code, so 1601F takes 1601FQ-only ones). */
export const treatyOption = (form: string, with_na: boolean): RowOption[] => [
  { value: "-", label: "-" },
  ...(with_na ? [{ value: "NA", label: "NA - Not Applicable" }] : []),
  ...list.treaty.filter(([, , f = ""]) => f.includes(form)).map(([code = "", desc = ""]) => ({ value: code, label: `${code} - ${desc}` })),
];

/** BIR's rate text once an ATC is picked: the list rate as a two-decimal number, "0.00" for "-" / "NA". */
export const atcRateText = (rate: string): string => (Number(rate) || 0).toFixed(2);

/** A pop-up's ATC box: "-", "NA - Not Applicable", then the form's pick list for the withholding-agent category in BIR's
 *  order (a repeated code keeps its first rate, as BIR's rate lookup does). Picking one fills the row's rate box. */
export const atcOption = (form: string, category: string, rate_id: string): RowOption[] => {
  const seen = new Set<string>(["-", "NA"]);
  return [
    { value: "-", label: "-", fill: { [rate_id]: "0.00" } },
    { value: "NA", label: "NA - Not Applicable", fill: { [rate_id]: "0.00" } },
    ...atcPickList(form, category).flatMap((a) => {
      if (seen.has(a.atc_code)) return [];
      seen.add(a.atc_code);
      return [{ value: a.atc_code, label: `${a.atc_code} - ${atcInfo(a.atc_code)?.desc ?? ""}`, fill: { [rate_id]: atcRateText(a.rate) } }];
    }),
  ];
};

/** The RDO list of a form's pop-up (blank "000" first, then every RDO whose record names the form). */
export const rdoOption = (form: string): RowOption[] => [
  { value: "000", label: "" },
  ...list.rdo.filter(([, , f = ""]) => f.includes(form)).map(([code = "", desc = ""]) => ({ value: code, label: desc })),
];
