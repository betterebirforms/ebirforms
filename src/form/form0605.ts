// BIR Form 0605 (Payment Form), rewritten as a typed schema + compute graph (the P3 pattern).
// Compute (exact centavo, fixing BIR's float math): 20D = 20A+20B+20C, 21 = 19+20D.
// Fields and their order match the legacy form's `saveXML`, so a file saved here loads in the legacy 0605
// and uploads to BIR unchanged. The legacy form stays as the compatibility oracle (test/form0605.test.ts).

import { parseMoney } from "./money.ts";
import { validate as validateRequired, type FieldSpec, type FormSchema, type FormState, type Problem } from "./schema.ts";
import { validateTin, TinStatus } from "@/lib/tin.ts";

const f = (id: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ id, kind: "text", ...extra });
const money = (id: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ id, kind: "money", ...extra });
const radio = (id: string): FieldSpec => ({ id, kind: "radio" });

const sum = (...id: string[]) => (read: (id: string) => string) => id.map((i) => parseMoney(read(i))).reduce((a, b) => a + b, 0);

export const FORM_0605: FormSchema = {
  form_code: "0605",
  title: "Payment Form",
  field: [
    radio("frm0605:itemFiscalStartMonth:_1"),
    radio("frm0605:itemFiscalStartMonth:_2"),
    f("frm0605:txtDueDateMonth"),
    f("frm0605:txtDueDateDay"),
    f("frm0605:txtDueDateYear"),
    f("frm0605:txtNoOfSheets"),
    { id: "frm0605:itemYearEndMonth", kind: "select" },
    f("frm0605:txtYearEnded"),
    f("frm0605:txtReturnPeriodMonth", { required: true }),
    f("frm0605:txtReturnPeriodDay", { required: true }),
    f("frm0605:txtReturnPeriodYear", { required: true }),
    f("frm0605:txtTIN1", { required: true }),
    f("frm0605:txtTIN2", { required: true }),
    f("frm0605:txtTIN3", { required: true }),
    f("frm0605:txtBranchCode", { required: true }),
    { id: "frm0605:txtRDOCode", kind: "select", required: true },
    radio("frm0605:txtClassification:_1"),
    radio("frm0605:txtClassification:_2"),
    f("frm0605:txtLineBus", { escaped: true }),
    f("frm0605:txtTaxPayerName", { escaped: true, required: true }),
    f("frm0605:txtTelNum"),
    f("frm0605:txtAddress", { escaped: true }),
    f("frm0605:txtZipCode"),
    radio("frm0605:itemModeOfPayment:_1"),
    f("frm0605:txtNumOfInstallment"),
    radio("frm0605:itemModeOfPayment:_2"),
    radio("frm0605:itemModeOfPayment:_3"),
    radio("frm0605:itemMannerOfPayment:_1"),
    radio("frm0605:itemMannerOfPayment:_2"),
    radio("frm0605:itemMannerOfPayment:_3"),
    radio("frm0605:itemMannerOfPayment:_4"),
    radio("frm0605:itemMannerOfPayment:_5"),
    f("frm0605:txtOthersName"),
    radio("frm0605:itemMannerOfPaymentB:_1"),
    radio("frm0605:itemMannerOfPaymentB:_2"),
    money("frm0605:txtTax19"),
    money("frm0605:txtTax20A"),
    money("frm0605:txtTax20B"),
    money("frm0605:txtTax20C"),
    money("frm0605:txtTax20D", { compute: sum("frm0605:txtTax20A", "frm0605:txtTax20B", "frm0605:txtTax20C") }),
    money("frm0605:txtTax21", { compute: sum("frm0605:txtTax19", "frm0605:txtTax20D") }),
    radio("frm0605:itemApprovedYN:_1"),
    radio("frm0605:itemApprovedYN:_2"),
    f("txtFinalFlag"),
    f("txtEnroll"),
    // the eBIRForms-Online credential fields exist in the legacy form but we never persist them
    { id: "ebirOnlineConfirmUsername", kind: "text", secret: true },
    { id: "ebirOnlineConfirmPassword", kind: "text", secret: true },
    { id: "ebirOnlineUsername", kind: "text", secret: true },
    { id: "ebirOnlinePassword", kind: "text", secret: true },
    { id: "ebirOnlineSecret", kind: "text", secret: true },
  ],
};

/** Form-specific validation: required fields plus the TIN check digit. */
export function validate0605(state: FormState): Problem[] {
  const problem = validateRequired(FORM_0605, state);
  const tin = `${state["frm0605:txtTIN1"] ?? ""}${state["frm0605:txtTIN2"] ?? ""}${state["frm0605:txtTIN3"] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: "frm0605:txtTIN1", message: "The TIN's check digit doesn't match." });
  }
  return problem;
}
