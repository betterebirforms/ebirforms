import type { NativeForm } from "../registry.ts";
import { FORM_2552V2018, LABEL_2552V2018, validate2552v2018 } from "../form2552v2018.ts";

const P = "frm2552:";
const entry: NativeForm = {
  schema: FORM_2552V2018,
  validate: validate2552v2018,
  label: LABEL_2552V2018,
  // createXMLFileName: month + day + year, e.g. "06152023"
  periodName: (s) => `${s[`${P}txtPg1I1Month`] ?? ""}${s[`${P}txtPg1I1Day`] ?? ""}${s[`${P}txtPg1I1Year`] ?? ""}`,
  prefill: {
    [`${P}txtPg1TIN1`]: "tin1", [`${P}txtPg1TIN2`]: "tin2", [`${P}txtPg1TIN3`]: "tin3", [`${P}txtPg1TIN4`]: "tin4",
    [`${P}txtPg1I5RDO`]: "rdo", [`${P}rdoPg1Pt1I5RDO`]: "rdo", [`${P}txtPg1Pt1I6Name`]: "fn", [`${P}txtPg1Pt1I7RegisteredAddress`]: "regAddr",
    [`${P}txPg1I7ZipCode`]: "zip", [`${P}txtPg1Pt1I8ContactNumber`]: "telNo", [`${P}txtLOB`]: "lob",
    // No email: loadData always overwrites item 9 with the profile's email (globalEmail), whatever the file says.
  },
};
export default entry;
