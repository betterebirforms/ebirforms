// The registry of natively-rewritten forms. Each entry drives the generic schema renderer (FormView).
import type { FormSchema, FormState, GroupState, Problem } from "./schema.ts";
import { FORM_0605, validate0605 } from "./form0605.ts";
import { FORM_0619E, validate0619E } from "./form0619e.ts";
import { FORM_0619F, validate0619F } from "./form0619f.ts";
import { FORM_1601E, validate1601E } from "./form1601e.ts";
import { FORM_1600WP, validate1600WP } from "./form1600wp.ts";
import { FORM_1600, validate1600 } from "./form1600.ts";
import { FORM_1601Cv2018, validate1601Cv2018 } from "./form1601cv2018.ts";
import { FORM_1601F, validate1601F } from "./form1601f.ts";
import { FORM_1601EQ, validate1601EQ } from "./form1601eq.ts";
import { FORM_0620, validate0620 } from "./form0620.ts";
import { FORM_1603Q, validate1603Q } from "./form1603q.ts";
import { FORM_2553, validate2553 } from "./form2553.ts";
import { FORM_2551, validate2551 } from "./form2551.ts";
import { FORM_1603, validate1603 } from "./form1603.ts";
import { FORM_1604F, validate1604F } from "./form1604f.ts";
import { FORM_2551Q, validate2551Q } from "./form2551q.ts";
import { FORM_1604C, validate1604C } from "./form1604c.ts";
import { FORM_1604CF, validate1604CF } from "./form1604cf.ts";
import { FORM_1704, validate1704 } from "./form1704.ts";
import { FORM_2550DS, validate2550DS } from "./form2550ds.ts";
import { FORM_2200AN, validate2200AN } from "./form2200an.ts";
import { FORM_1707A, validate1707A } from "./form1707a.ts";
import { FORM_1707Av2021, validate1707Av2021 } from "./form1707av2021.ts";
import { FORM_2550DS_OLD, validate2550DSOld } from "./form2550ds-old.ts";
import { FORM_1602, validate1602 } from "./form1602.ts";
import { FORM_2000OT, validate2000OT } from "./form2000ot.ts";
import { FORM_1604E, validate1604E } from "./form1604e.ts";
import { FORM_2200T, validate2200T } from "./form2200t.ts";
import { FORM_1706, validate1706 } from "./form1706.ts";
import { FORM_1606, validate1606 } from "./form1606.ts";
import { FORM_1702Q, validate1702Q } from "./form1702q.ts";
import { FORM_1702Qv2008C, validate1702Qv2008C } from "./form1702qv2008c.ts";
import { FORM_1701Q, validate1701Q } from "./form1701q.ts";
import { FORM_1701A, validate1701A } from "./form1701a.ts";
import { FORM_1621, validate1621 } from "./form1621.ts";
import { FORM_1707, validate1707 } from "./form1707.ts";
import { FORM_1800, validate1800 } from "./form1800.ts";
import { FORM_1800V2018, validate1800v2018 } from "./form1800v2018.ts";
import { FORM_2551M, validate2551m } from "./form2551m.ts";
import { FORM_1601C, validate1601c } from "./form1601c.ts";
import { FORM_2552, validate2552 } from "./form2552.ts";
import { FORM_1602QV2018, validate1602qv2018 } from "./form1602qv2018.ts";
import { FORM_1601FQ, validate1601FQ } from "./form1601fq.ts";

export interface NativeForm {
  schema: FormSchema;
  /** Form rules; schedule-row checks (ATC on the list, row order) need the rows, so they are passed too. */
  validate: (state: FormState, groups?: GroupState) => Problem[];
  /** Friendly labels by field id; unlisted fields fall back to a cleaned id. */
  label: Record<string, string>;
  /** Period segment of the savefile name, built from the form's period fields the way BIR's createXMLFileName
   *  builds it; `hhmmss` is the time of saving, which BIR's 0605/2000/2200* names end with. */
  periodName: (state: FormState, hhmmss: string) => string;
  /** The form code BIR's file name carries, when it isn't the registry key. */
  name_code?: string;
  /** Fields to prefill from the taxpayer profile: field id → profile key. */
  prefill: Record<string, keyof import("@/lib/savefile.ts").Profile>;
}

const pad = (s: string | undefined, n: number) => (s ?? "").padStart(n, "0");

export const NATIVE_FORM: Record<string, NativeForm> = {
  "0605": {
    schema: FORM_0605,
    validate: validate0605,
    label: {
      "frm0605:txtReturnPeriodMonth": "Return period — month (MM)",
      "frm0605:txtReturnPeriodDay": "day (DD)",
      "frm0605:txtReturnPeriodYear": "year (YYYY)",
      "frm0605:txtRDOCode": "RDO code",
      "frm0605:txtZipCode": "ZIP",
      "frm0605:txtTelNum": "Telephone",
      "frm0605:txtTaxPayerName": "Taxpayer / registered name",
      "frm0605:txtLineBus": "Line of business",
      "frm0605:txtAddress": "Registered address",
      "frm0605:txtTax19": "19 — Basic tax / deposit",
      "frm0605:txtTax20A": "20A — Surcharge",
      "frm0605:txtTax20B": "20B — Interest",
      "frm0605:txtTax20C": "20C — Compromise",
      "frm0605:txtTax20D": "20D — Total penalties",
      "frm0605:txtTax21": "21 — Total amount payable",
    },
    periodName: (s, hhmmss) =>
      `${pad(s["frm0605:txtReturnPeriodMonth"], 2)}${pad(s["frm0605:txtReturnPeriodDay"], 2)}${s["frm0605:txtReturnPeriodYear"] ?? ""}${hhmmss}`,
    prefill: {
      "frm0605:txtTIN1": "tin1",
      "frm0605:txtTIN2": "tin2",
      "frm0605:txtTIN3": "tin3",
      "frm0605:txtBranchCode": "tin4",
      "frm0605:txtRDOCode": "rdo",
      "frm0605:txtTaxPayerName": "fn",
      "frm0605:txtLineBus": "lob",
      "frm0605:txtAddress": "regAddr",
      "frm0605:txtZipCode": "zip",
      "frm0605:txtTelNum": "telNo",
    },
  },
  "0619E": {
    schema: FORM_0619E,
    validate: validate0619E,
    label: {
      "frm0619E:txtMonth": "Month (MM)",
      "frm0619E:txtYear": "Year (YYYY)",
      "frm0619E:txtRDOCode": "RDO code",
      "frm0619E:txtZipCode": "ZIP",
      "frm0619E:txtTaxpayerName": "Taxpayer / registered name",
      "frm0619E:txtLineBus": "Line of business",
      "frm0619E:txtAddress": "Registered address",
      "frm0619E:txtTax14": "14 — Tax withheld for the month",
      "frm0619E:txtTax15": "15 — Adjustment (over-remittance)",
      "frm0619E:txtTax16": "16 — Net amount remittable",
      "frm0619E:txtTax17A": "17A — Surcharge",
      "frm0619E:txtTax17B": "17B — Interest",
      "frm0619E:txtTax17C": "17C — Compromise",
      "frm0619E:txtTax17D": "17D — Total penalties",
      "frm0619E:txtTax18": "18 — Total amount still due",
    },
    periodName: (s) => `${pad(s["frm0619E:txtMonth"], 2)}${s["frm0619E:txtYear"] ?? ""}`,
    prefill: {
      "frm0619E:txtTIN1": "tin1",
      "frm0619E:txtTIN2": "tin2",
      "frm0619E:txtTIN3": "tin3",
      "frm0619E:txtBranchCode": "tin4",
      "frm0619E:txtRDOCode": "rdo",
      "frm0619E:txtTaxpayerName": "fn",
      "frm0619E:txtLineBus": "lob",
      "frm0619E:txtAddress": "regAddr",
      "frm0619E:txtZipCode": "zip",
      "frm0619E:txtTelNum": "telNo",
    },
  },
  "0619F": {
    schema: FORM_0619F,
    validate: validate0619F,
    label: {
      "frm0619F:txtMonth": "Month (MM)",
      "frm0619F:txtYear": "Year (YYYY)",
      "frm0619F:txtRDOCode": "RDO code",
      "frm0619F:txtZipCode": "ZIP",
      "frm0619F:txtTaxpayerName": "Taxpayer / registered name",
      "frm0619F:txtLineBus": "Line of business",
      "frm0619F:txtAddress": "Registered address",
      "frm0619F:txtTax13": "13 — Tax withheld",
      "frm0619F:txtTax14": "14 — Add: tax still due",
      "frm0619F:txtTax15": "15 — Total tax due",
      "frm0619F:txtTax16": "16 — Less: remitted",
      "frm0619F:txtTax17": "17 — Net amount remittable",
      "frm0619F:txtTax18A": "18A — Surcharge",
      "frm0619F:txtTax18B": "18B — Interest",
      "frm0619F:txtTax18C": "18C — Compromise",
      "frm0619F:txtTax18D": "18D — Total penalties",
      "frm0619F:txtTax19": "19 — Total amount still due",
    },
    periodName: (s) => `${pad(s["frm0619F:txtMonth"], 2)}${s["frm0619F:txtYear"] ?? ""}`,
    prefill: {
      "frm0619F:txtTIN1": "tin1",
      "frm0619F:txtTIN2": "tin2",
      "frm0619F:txtTIN3": "tin3",
      "frm0619F:txtBranchCode": "tin4",
      "frm0619F:txtRDOCode": "rdo",
      "frm0619F:txtTaxpayerName": "fn",
      "frm0619F:txtLineBus": "lob",
      "frm0619F:txtAddress": "regAddr",
      "frm0619F:txtZipCode": "zip",
      "frm0619F:txtTelNum": "telNo",
    },
  },
  "1601E": {
    schema: FORM_1601E,
    validate: validate1601E,
    label: {
      "frm1601E:txtYear": "Year (YYYY)",
      "frm1601E:txtRDOCode": "RDO code",
      "frm1601E:txtZipCode": "ZIP",
      "frm1601E:txtTaxpayerName": "Taxpayer / registered name",
      "frm1601E:txtLineBus": "Line of business",
      "frm1601E:txtAddress": "Registered address",
      "frm1601E:txtTax14": "14 — Tax required to be withheld",
      "frm1601E:txtTax15A": "15A — Over-remittance (prior)",
      "frm1601E:txtTax15B": "15B — Other adjustments",
      "frm1601E:txtTax15C": "15C — Total adjustments",
      "frm1601E:txtTax16": "16 — Tax still due",
      "frm1601E:txtTax17A": "17A — Surcharge",
      "frm1601E:txtTax17B": "17B — Interest",
      "frm1601E:txtTax17C": "17C — Compromise",
      "frm1601E:txtTax17D": "17D — Total penalties",
      "frm1601E:txtTax18": "18 — Total amount still due",
    },
    periodName: (s) => `${(s["frm1601E:j_id201"] ?? "").padStart(2, "0")}${s["frm1601E:txtYear"] ?? ""}`,
    prefill: {
      "frm1601E:txtTIN1": "tin1",
      "frm1601E:txtTIN2": "tin2",
      "frm1601E:txtTIN3": "tin3",
      "frm1601E:txtBranchCode": "tin4",
      "frm1601E:txtRDOCode": "rdo",
      "frm1601E:txtTaxpayerName": "fn",
      "frm1601E:txtLineBus": "lob",
      "frm1601E:txtAddress": "regAddr",
      "frm1601E:txtZipCode": "zip",
      "frm1601E:txtTelNum": "telNo",
    },
  },
  "1600WP": {
    schema: FORM_1600WP,
    validate: validate1600WP,
    label: {
      "frm1600WP:DateWithholdingMonth": "Withholding month (MM)",
      "frm1600WP:DateWithholdingYear": "year (YYYY)",
      "frm1600WP:txtRDOCode": "RDO code",
      "frm1600WP:txtZipCode": "ZIP",
      "frm1600WP:txtTaxpayerName": "Taxpayer / registered name",
      "frm1600WP:txtAddress": "Registered address",
      "frm1600WP:txtTax12": "12 — Total tax withheld (schedule)",
      "frm1600WP:txtTax13": "13 — Less: tax remitted",
      "frm1600WP:txtTax14": "14 — Tax still due",
      "frm1600WP:txtTax15A": "15A — Surcharge",
      "frm1600WP:txtTax15B": "15B — Interest",
      "frm1600WP:txtTax15C": "15C — Compromise",
      "frm1600WP:txtTax15D": "15D — Total penalties",
      "frm1600WP:txtTax16": "16 — Total amount still due",
    },
    periodName: (s) => `${(s["frm1600WP:DateWithholdingMonth"] ?? "").padStart(2, "0")}${s["frm1600WP:DateWithholdingYear"] ?? ""}`,
    prefill: {
      "frm1600WP:txtTIN1": "tin1", "frm1600WP:txtTIN2": "tin2", "frm1600WP:txtTIN3": "tin3",
      "frm1600WP:txtBranchCode": "tin4", "frm1600WP:txtRDOCode": "rdo", "frm1600WP:txtTaxpayerName": "fn",
      "frm1600WP:txtLineBus": "lob", "frm1600WP:txtAddress": "regAddr", "frm1600WP:txtZipCode": "zip", "frm1600WP:txtTelNum": "telNo",
    },
  },
  "1600": {
    schema: FORM_1600,
    validate: validate1600,
    label: {
      "frm1600:txtYear": "Year (YYYY)", "frm1600:txtRDOCode": "RDO code", "frm1600:txtZipCode": "ZIP",
      "frm1600:txtPayerName": "Taxpayer / registered name", "frm1600:txtLineBus": "Line of business", "frm1600:txtAddress": "Registered address",
      "frm1600:txtTax14": "14 — Total tax withheld (schedule)", "frm1600:txtTax15": "15 — Less: remitted",
      "frm1600:txtTax16": "16 — Tax still due", "frm1600:txtTax17A": "17A — Surcharge", "frm1600:txtTax17B": "17B — Interest",
      "frm1600:txtTax17C": "17C — Compromise", "frm1600:txtTax17D": "17D — Total penalties", "frm1600:txtTax18": "18 — Total amount still due",
    },
    periodName: (s) => `${(s["frm1600:j_id201"] ?? "").padStart(2, "0")}${s["frm1600:txtYear"] ?? ""}`,
    prefill: {
      "frm1600:txtTIN1": "tin1", "frm1600:txtTIN2": "tin2", "frm1600:txtTIN3": "tin3", "frm1600:txtBranchCode": "tin4",
      "frm1600:txtRDOCode": "rdo", "frm1600:txtPayerName": "fn", "frm1600:txtLineBus": "lob", "frm1600:txtAddress": "regAddr",
      "frm1600:txtZipCode": "zip", "frm1600:txtTelNum": "telNo",
    },
  },
  "1601Cv2018": {
    schema: FORM_1601Cv2018,
    validate: validate1601Cv2018,
    label: {
      "frm1601c:txtMonth": "Month (MM)", "frm1601c:txtYear": "Year (YYYY)", "frm1601c:txtRDOCode": "RDO code",
      "frm1601c:txtZipCode": "ZIP", "frm1601c:txtTaxpayerName": "Taxpayer / registered name", "frm1601c:txtLineBus": "Line of business", "frm1601c:txtAddress": "Registered address",
      "frm1601c:txtTax14": "14 — Taxes withheld", "frm1601c:txtTax21": "21 — Total adjustments", "frm1601c:txtTax22": "22 — Tax still due",
      "frm1601c:txtTax31": "31 — Net tax still due", "frm1601c:txtTax35": "35 — Total penalties", "frm1601c:txtTax36": "36 — Total amount still due",
    },
    periodName: (s) => `${(s["frm1601c:txtMonth"] ?? "").padStart(2, "0")}${s["frm1601c:txtYear"] ?? ""}`,
    prefill: {
      "frm1601c:txtTIN1": "tin1", "frm1601c:txtTIN2": "tin2", "frm1601c:txtTIN3": "tin3", "frm1601c:txtBranchCode": "tin4",
      "frm1601c:txtRDOCode": "rdo", "frm1601c:txtTaxpayerName": "fn", "frm1601c:txtLineBus": "lob", "frm1601c:txtAddress": "regAddr",
      "frm1601c:txtZipCode": "zip", "frm1601c:txtTelNum": "telNo",
    },
  },
  "1601F": {
    schema: FORM_1601F,
    validate: validate1601F,
    label: {
      "frm1601F:txtYear": "Year (YYYY)", "frm1601F:txtRDOCode": "RDO code", "frm1601F:txtZipCode": "ZIP",
      "frm1601F:txtTaxpayerName": "Taxpayer / registered name", "frm1601F:txtLineBus": "Line of business", "frm1601F:txtAddress": "Registered address",
      "frm1601F:txtTax14": "14 — Total tax withheld (ATC)", "frm1601F:txtTax15": "15 — Schedule I total",
      "frm1601F:txtTax16": "16 — Total", "frm1601F:txtTax17": "17 — Less: remitted", "frm1601F:txtTax18": "18 — Tax still due",
      "frm1601F:txtTax19A": "19A — Surcharge", "frm1601F:txtTax19B": "19B — Interest", "frm1601F:txtTax19C": "19C — Compromise",
      "frm1601F:txtTax19D": "19D — Total penalties", "frm1601F:txtTax20": "20 — Total amount still due",
      "txtAmtIncomePay": "Amount of income payment", "txtRate": "Rate %", "txtReqWithheld": "Tax required to be withheld",
    },
    periodName: (s) => `${(s["frm1601F:j_id201"] ?? "").padStart(2, "0")}${s["frm1601F:txtYear"] ?? ""}`,
    prefill: {
      "frm1601F:txtTIN1": "tin1", "frm1601F:txtTIN2": "tin2", "frm1601F:txtTIN3": "tin3", "frm1601F:txtBranchCode": "tin4",
      "frm1601F:txtRDOCode": "rdo", "frm1601F:txtTaxpayerName": "fn", "frm1601F:txtLineBus": "lob", "frm1601F:txtAddress": "regAddr",
      "frm1601F:txtZipCode": "zip", "frm1601F:txtTelNum": "telNo",
    },
  },
  "1601EQ": {
    schema: FORM_1601EQ,
    validate: validate1601EQ,
    label: {
      "frm1601EQ:txtYear": "Year (YYYY)", "frm1601EQ:txtRDOCode": "RDO code", "frm1601EQ:txtZipCode": "ZIP",
      "frm1601EQ:txtTaxpayerName": "Taxpayer / registered name", "frm1601EQ:txtLineBus": "Line of business", "frm1601EQ:txtAddress": "Registered address",
      "frm1601EQ:txtTax19": "19 — Total tax withheld (schedule)", "frm1601EQ:txtTax24": "24 — Total adjustments",
      "frm1601EQ:txtTax25": "25 — Tax still due", "frm1601EQ:txtTax29": "29 — Total penalties", "frm1601EQ:txtTax30": "30 — Total amount still due",
      "frm1601EQ:txtAtcCd": "ATC", "frm1601EQ:txtTaxBase": "Tax base", "frm1601EQ:txtTaxRate": "Rate %", "frm1601EQ:txtTaxbeWithHeld": "Tax withheld",
    },
    periodName: (s) => `${s["frm1601EQ:txtYear"] ?? ""}`,
    prefill: {
      "frm1601EQ:txtTIN1": "tin1", "frm1601EQ:txtTIN2": "tin2", "frm1601EQ:txtTIN3": "tin3", "frm1601EQ:txtBranchCode": "tin4",
      "frm1601EQ:txtRDOCode": "rdo", "frm1601EQ:txtTaxpayerName": "fn", "frm1601EQ:txtLineBus": "lob", "frm1601EQ:txtAddress": "regAddr",
      "frm1601EQ:txtZipCode": "zip", "frm1601EQ:txtTelNum": "telNo",
    },
  },
  "0620": {
    schema: FORM_0620,
    validate: validate0620,
    label: {
      "frm0620:txtMonth": "Month (MM)", "frm0620:txtYear": "Year (YYYY)", "frm0620:txtRDOCode": "RDO code", "frm0620:txtZipCode": "ZIP",
      "frm0620:txtTaxpayerName": "Taxpayer / registered name", "frm0620:txtLineBus": "Line of business", "frm0620:txtAddress": "Registered address",
      "frm0620:txtTax14": "14 — Tax still due (amended return)", "frm0620:txtTax15": "15 — Tax paid in previously filed return",
      "frm0620:txtTax16": "16 — Tax still due / (overpayment)", "frm0620:txtTax17A": "17A — Surcharge", "frm0620:txtTax17B": "17B — Interest",
      "frm0620:txtTax17C": "17C — Compromise", "frm0620:txtTax17D": "17D — Total penalties", "frm0620:txtTax18": "18 — Total amount still due",
      "frm0620:AmendedRtn": "Amended return?", "frm0620:AmendedRtn_1": "Yes", "frm0620:AmendedRtn_2": "No",
      "frm0620:TaxWithheld": "Any taxes withheld?", "frm0620:TaxWithheld_1": "Yes", "frm0620:TaxWithheld_2": "No",
      "frm0620:CatAgent": "Category of withholding agent", "frm0620:CatAgent_P": "Private", "frm0620:CatAgent_G": "Government",
    },
    periodName: (s) => `${pad(s["frm0620:txtMonth"], 2)}${s["frm0620:txtYear"] ?? ""}`,
    prefill: {
      "frm0620:txtTIN1": "tin1", "frm0620:txtTIN2": "tin2", "frm0620:txtTIN3": "tin3", "frm0620:txtBranchCode": "tin4",
      "frm0620:txtRDOCode": "rdo", "frm0620:txtTaxpayerName": "fn", "frm0620:txtLineBus": "lob", "frm0620:txtAddress": "regAddr",
      "frm0620:txtZipCode": "zip", "frm0620:txtTelNum": "telNo",
    },
  },
  "1603Qv2018": {
    schema: FORM_1603Q,
    validate: validate1603Q,
    label: {
      "frm1603Q:txtYear": "Year (YYYY)", "frm1603Q:rdoCode": "RDO code", "frm1603Q:txtZipCode": "ZIP",
      "frm1603Q:txtTaxpayerName": "Taxpayer / registered name", "frm1603Q:txtLineBus": "Line of business", "frm1603Q:txtAddress": "Registered address",
      "frm1603Q:Sched1:txtValue1": "Sched 1 — WF360 monetary value", "frm1603Q:Sched1:txtDivisor1": "WF360 divisor %", "frm1603Q:Sched1:txtTaxBase1": "WF360 grossed-up base",
      "frm1603Q:Sched1:txtTaxRate1": "WF360 rate %", "frm1603Q:Sched1:txtTaxWithheld1": "WF360 tax withheld",
      "frm1603Q:Sched1:txtValue2": "Sched 1 — WF330 monetary value", "frm1603Q:Sched1:txtDivisor2": "WF330 divisor %", "frm1603Q:Sched1:txtTaxBase2": "WF330 grossed-up base",
      "frm1603Q:Sched1:txtTaxRate2": "WF330 rate %", "frm1603Q:Sched1:txtTaxWithheld2": "WF330 tax withheld", "frm1603Q:Sched1:txtTotalTax": "Schedule 1 total",
      "frm1603Q:txtTax14": "14 — Total tax withheld (schedule)", "frm1603Q:txtTax15": "15 — Tax paid in previously filed return (amended)",
      "frm1603Q:txtTax16": "16 — Other remittances", "frm1603Q:txtTax17": "17 — Total tax paid",
      "frm1603Q:txtTax18": "18 — Tax still due", "frm1603Q:txtTax19": "19 — Surcharge", "frm1603Q:txtTax20": "20 — Interest",
      "frm1603Q:txtTax21": "21 — Compromise", "frm1603Q:txtTax22": "22 — Total penalties", "frm1603Q:txtTax23": "23 — Total amount still due",
      "frm1603Q:AmendedRtn": "Amended return?", "frm1603Q:AmendedRtn_1": "Yes", "frm1603Q:AmendedRtn_2": "No",
      "frm1603Q:optQuarter": "Quarter", "frm1603Q:optQuarter1": "1st", "frm1603Q:optQuarter2": "2nd", "frm1603Q:optQuarter3": "3rd", "frm1603Q:optQuarter4": "4th",
    },
    periodName: (s) => `${s["frm1603Q:txtYear"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm1603Q:optQuarter${n}`] === "true") ?? ""}`,
    prefill: {
      "frm1603Q:txtTIN1": "tin1", "frm1603Q:txtTIN2": "tin2", "frm1603Q:txtTIN3": "tin3", "frm1603Q:txtBranchCode": "tin4",
      "frm1603Q:rdoCode": "rdo", "frm1603Q:txtTaxpayerName": "fn", "frm1603Q:txtLineBus": "lob", "frm1603Q:txtAddress": "regAddr",
      "frm1603Q:txtZipCode": "zip", "frm1603Q:txtTelNum": "telNo",
    },
  },
  "2553": {
    schema: FORM_2553,
    validate: validate2553,
    label: {
      "frm2553:itemYearEndMonth": "Year-end month (MM)", "frm2553:txtYearEnded": "Year ended (YYYY)", "frm2553:txtRDOCode": "RDO code",
      "frm2553:txtZipCode": "ZIP", "frm2553:txtTPName": "Taxpayer / registered name", "frm2553:txtAddress": "Registered address",
      "frm2553:txt19": "19 — Total tax due", "frm2553:txt20A": "20A — Creditable tax withheld", "frm2553:txt20B": "20B — Other credits/payments",
      "frm2553:txt20C": "20C — Total tax credits/payments", "frm2553:txt21": "21 — Tax still due / (overpayment)",
      "frm2553:txt22A": "22A — Surcharge", "frm2553:txt22B": "22B — Interest", "frm2553:txt22C": "22C — Compromise",
      "frm2553:txt22D": "22D — Total penalties", "frm2553:txt23": "23 — Total amount payable",
      "frm2553:optQtr": "Quarter", "frm2553:optQtr:_1": "1st", "frm2553:optQtr:_2": "2nd", "frm2553:optQtr:_3": "3rd", "frm2553:optQtr:_4": "4th",
    },
    periodName: (s) => `${s["frm2553:itemYearEndMonth"] ?? ""}${s["frm2553:txtYearEnded"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm2553:optQtr:_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm2553:txtTIN1": "tin1", "frm2553:txtTIN2": "tin2", "frm2553:txtTIN3": "tin3", "frm2553:txtBranchCode": "tin4",
      "frm2553:txtRDOCode": "rdo", "frm2553:txtTPName": "fn", "frm2553:txtAddress": "regAddr",
      "frm2553:txtZipCode": "zip", "frm2553:txtTelNum": "telNo",
    },
  },
  "2551": {
    schema: FORM_2551,
    validate: validate2551,
    label: {
      "frm2551:rtnMonth": "Return month (MM)", "frm2551:txtYear": "Year (YYYY)", "frm2551:txtRDOCode": "RDO code",
      "frm2551:zipCode": "ZIP", "frm2551:registeredName": "Taxpayer / registered name", "frm2551:txtLineofBus": "Line of business", "frm2551:registeredAddress": "Registered address",
      "frm2551:txtTax19": "19 — Total tax due", "frm2551:txtTax20A": "20A — Creditable tax withheld", "frm2551:txtTax20B": "20B — Other credits/payments",
      "frm2551:txtTax20C": "20C — Total tax credits/payments", "frm2551:txtTax21": "21 — Tax still due / (overpayment)",
      "frm2551:txtTax22A": "22A — Surcharge", "frm2551:txtTax22B": "22B — Interest", "frm2551:txtTax22C": "22C — Compromise",
      "frm2551:txtTax22D": "22D — Total penalties", "frm2551:txtTax23": "23 — Total amount payable",
      "frm2551:qtr": "Quarter", "frm2551:qtr_1": "1st", "frm2551:qtr_2": "2nd", "frm2551:qtr_3": "3rd", "frm2551:qtr_4": "4th",
    },
    periodName: (s) => `${s["frm2551:rtnMonth"] ?? ""}${s["frm2551:txtYear"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm2551:qtr_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm2551:txtTIN1": "tin1", "frm2551:txtTIN2": "tin2", "frm2551:txtTIN3": "tin3", "frm2551:txtBranchCode": "tin4",
      "frm2551:txtRDOCode": "rdo", "frm2551:registeredName": "fn", "frm2551:txtLineofBus": "lob", "frm2551:registeredAddress": "regAddr",
      "frm2551:zipCode": "zip", "frm2551:telNo": "telNo",
    },
  },
  "1603": {
    schema: FORM_1603,
    validate: validate1603,
    label: {
      "frm1603:txtYear": "Year (YYYY)", "frm1603:rdoCode": "RDO code", "frm1603:zipCode": "ZIP",
      "frm1603:registeredName": "Taxpayer / registered name", "frm1603:registeredAddress": "Registered address",
      "frm1603:txtFringe320": "WF320 fringe benefit (÷85)", "frm1603:txtBase320": "WF320 grossed-up base", "frm1603:txtReq320": "WF320 tax (15%)",
      "frm1603:txtFringe330": "WF330 fringe benefit (÷75)", "frm1603:txtBase330": "WF330 grossed-up base", "frm1603:txtReq330": "WF330 tax (25%)",
      "frm1603:txtFringe360": "WF360 fringe benefit (÷65)", "frm1603:txtBase360": "WF360 grossed-up base", "frm1603:txtReq360": "WF360 tax (35%)",
      "frm1603:txt18A": "18A — Total fringe benefits", "frm1603:txt18B": "18B — Total tax withheld",
      "frm1603:txt19": "19 — Tax remitted in previously filed return (amended)", "frm1603:txt20": "20 — Tax still due",
      "frm1603:txt21A": "21A — Surcharge", "frm1603:txt21B": "21B — Interest", "frm1603:txt21C": "21C — Compromise",
      "frm1603:txt21D": "21D — Total penalties", "frm1603:txt22": "22 — Total amount still due",
      "frm1603:j_id217": "Amended return?", "frm1603:j_id217:_1": "Yes", "frm1603:j_id217:_2": "No",
      "frm1603:optQrtr": "Quarter", "frm1603:optQrtr:_1": "1st", "frm1603:optQrtr:_2": "2nd", "frm1603:optQrtr:_3": "3rd", "frm1603:optQrtr:_4": "4th",
    },
    periodName: (s) => `${s["frm1603:txtYear"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm1603:optQrtr:_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm1603:tinPart1": "tin1", "frm1603:tinPart2": "tin2", "frm1603:tinPart3": "tin3", "frm1603:branchCode": "tin4",
      "frm1603:rdoCode": "rdo", "frm1603:registeredName": "fn", "frm1603:registeredAddress": "regAddr",
      "frm1603:zipCode": "zip", "frm1603:telephoneNumber": "telNo",
    },
  },
  "1604F": {
    schema: FORM_1604F,
    validate: validate1604F,
    label: {
      "frm1604f:txtYear": "Year (YYYY)", "frm1604f:rdoCode": "RDO code", "frm1604f:zipCode": "ZIP",
      "frm1604f:registeredName": "Taxpayer / registered name", "frm1604f:txtLineBus": "Line of business", "frm1604f:registeredAddress": "Registered address",
      "frm1604f:txtSched1Total": "Schedule 1 — total", "frm1604f:txtSched2Total": "Schedule 2 — total", "frm1604f:txtSched3Total": "Schedule 3 — total",
      "frm1604f:txtSched1TaxWheldTotal": "Sched 1 — tax withheld total", "frm1604f:txtSched1PenTotal": "Sched 1 — penalties total",
      "frm1604f:txtSched2TaxWheldTotal": "Sched 2 — tax withheld total", "frm1604f:txtSched2PenTotal": "Sched 2 — penalties total",
      "frm1604f:txtSched3TaxWheldTotal": "Sched 3 — tax withheld total", "frm1604f:txtSched3PenTotal": "Sched 3 — penalties total",
    },
    periodName: (s) => `${s["frm1604f:txtYear"] ?? ""}`,
    prefill: {
      "frm1604f:tinA": "tin1", "frm1604f:tinB": "tin2", "frm1604f:tinC": "tin3", "frm1604f:branchCode": "tin4",
      "frm1604f:rdoCode": "rdo", "frm1604f:registeredName": "fn", "frm1604f:txtLineBus": "lob", "frm1604f:registeredAddress": "regAddr",
      "frm1604f:zipCode": "zip", "frm1604f:telephoneNumber": "telNo",
    },
  },
  "2551Qv2018": {
    schema: FORM_2551Q,
    validate: validate2551Q,
    label: {
      "frm2551Qv2018:rtnMonth": "Return month (MM)", "frm2551Qv2018:txtYear": "Year (YYYY)", "frm2551Qv2018:txtRDOCode": "RDO code",
      "frm2551Qv2018:registeredName": "Taxpayer / registered name",
      "txtATCAmt1": "ATC 1 — taxable amount", "txtATCRate1": "ATC 1 — rate %", "txtATCDue1": "ATC 1 — tax due",
      "txtTotalSched1": "Schedule 1 — total tax due",
      "frm2551Qv2018:txt14": "14 — Total tax due (Schedule 1)", "frm2551Qv2018:txt15": "15 — Creditable percentage tax withheld",
      "frm2551Qv2018:txt16": "16 — Tax paid in previously filed return (amended)", "frm2551Qv2018:txt17": "17 — Other tax credits/payments",
      "frm2551Qv2018:txt18": "18 — Total tax credits/payments", "frm2551Qv2018:txt19": "19 — Tax still due / (overpayment)",
      "frm2551Qv2018:txt20": "20 — Surcharge", "frm2551Qv2018:txt21": "21 — Interest", "frm2551Qv2018:txt22": "22 — Compromise",
      "frm2551Qv2018:txt23": "23 — Total penalties", "frm2551Qv2018:txt24": "24 — Total amount payable",
      "frm2551Qv2018:taxRate": "Tax-rate option", "frm2551Qv2018:taxRate1": "Percentage tax", "frm2551Qv2018:taxRate2": "8% income tax (compliance)",
      "frm2551Qv2018:amendedRtn": "Amended return?", "frm2551Qv2018:amendedRtn_1": "Yes", "frm2551Qv2018:amendedRtn_2": "No",
      "frm2551Qv2018:qtr": "Quarter", "frm2551Qv2018:qtr_1": "1st", "frm2551Qv2018:qtr_2": "2nd", "frm2551Qv2018:qtr_3": "3rd", "frm2551Qv2018:qtr_4": "4th",
    },
    periodName: (s) => `${s["frm2551Qv2018:rtnMonth"] ?? ""}${s["frm2551Qv2018:txtYear"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm2551Qv2018:qtr_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm2551Qv2018:txtTIN1": "tin1", "frm2551Qv2018:txtTIN2": "tin2", "frm2551Qv2018:txtTIN3": "tin3", "frm2551Qv2018:txtBranchCode": "tin4",
      "frm2551Qv2018:txtRDOCode": "rdo", "frm2551Qv2018:registeredName": "fn",
    },
  },
  "1604C": {
    schema: FORM_1604C,
    validate: validate1604C,
    label: {
      "frm1604c:txtYear": "Year (YYYY)", "frm1604c:rdoCode": "RDO code", "frm1604c:zipCode": "ZIP",
      "frm1604c:registeredName": "Taxpayer / registered name", "frm1604c:registeredAddress": "Registered address",
      "frm1604c:txtSched1TaxWheldTotal": "Schedule 1 — tax withheld total", "frm1604c:txtSched1PenTotal": "Schedule 1 — penalties total",
      "frm1604c:txtSched1AdjTotal": "Schedule 1 — adjustments total", "frm1604c:txtSched1Total": "Schedule 1 — total remittance",
      "frm1604c:categoryAgent": "Category of withholding agent", "frm1604c:categoryAgent_1": "Private", "frm1604c:categoryAgent_2": "Government",
    },
    periodName: (s) => `${s["frm1604c:txtYear"] ?? ""}`,
    prefill: {
      "frm1604c:tinA": "tin1", "frm1604c:tinB": "tin2", "frm1604c:tinC": "tin3", "frm1604c:branchCode": "tin4",
      "frm1604c:rdoCode": "rdo", "frm1604c:registeredName": "fn", "frm1604c:registeredAddress": "regAddr",
      "frm1604c:zipCode": "zip", "frm1604c:telephoneNumber": "telNo",
    },
  },
  "1604CF": {
    schema: FORM_1604CF,
    validate: validate1604CF,
    label: {
      "frm1604cf:txtYear": "Year (YYYY)", "frm1604cf:rdoCode": "RDO code", "frm1604cf:zipCode": "ZIP",
      "frm1604cf:registeredName": "Taxpayer / registered name", "frm1604cf:registeredAddress": "Registered address",
      "frm1604cf:txtSched1Total": "Schedule 1 — total", "frm1604cf:txtSched2Total": "Schedule 2 — total",
      "frm1604cf:txtSched3Total": "Schedule 3 — total", "frm1604cf:txtSched4Total": "Schedule 4 — total",
      "frm1604cf:txtSched1AdjTotal": "Schedule 1 — adjustments total",
      "frm1604cf:categoryAgent": "Category of withholding agent", "frm1604cf:categoryAgent_1": "Private", "frm1604cf:categoryAgent_2": "Government",
    },
    periodName: (s) => `${s["frm1604cf:txtYear"] ?? ""}`,
    prefill: {
      "frm1604cf:tinA": "tin1", "frm1604cf:tinB": "tin2", "frm1604cf:tinC": "tin3", "frm1604cf:branchCode": "tin4",
      "frm1604cf:rdoCode": "rdo", "frm1604cf:registeredName": "fn", "frm1604cf:registeredAddress": "regAddr",
      "frm1604cf:zipCode": "zip", "frm1604cf:telephoneNumber": "telNo",
    },
  },
  "1704": {
    schema: FORM_1704,
    validate: validate1704,
    label: {
      "frm1704:txtYearEnded": "Year ended (YYYY)", "frm1704:monthEnd": "Month ended", "frm1704:txtRDOCode": "RDO code", "frm1704:txtZipCode": "ZIP",
      "frm1704:txtName": "Taxpayer / registered name", "frm1704:txtLineBus": "Line of business", "frm1704:txtAddress": "Registered address",
      "frm1704:txt13": "13 — Taxable income", "frm1704:txt17B": "17B — Total additions", "frm1704:txt18": "18 — Total",
      "frm1704:txt21A": "21A — Schedule 1 total", "frm1704:txt21B": "21B — Total deductions", "frm1704:txt22": "22 — Improperly accumulated taxable income",
      "frm1704:txt23": "23 — IAET rate %", "frm1704:txt24": "24 — IAET due", "frm1704:txt25": "25 — Less: tax paid",
      "frm1704:txt26": "26 — Tax still due", "frm1704:txt27D": "27D — Total penalties", "frm1704:txt28": "28 — Total amount payable",
    },
    periodName: (s) => `${s["frm1704:monthEnd"] ?? ""}${s["frm1704:txtYearEnded"] ?? ""}`,
    prefill: {
      "frm1704:txtTin1": "tin1", "frm1704:txtTin2": "tin2", "frm1704:txtTin3": "tin3", "frm1704:txtBranch": "tin4",
      "frm1704:txtRDOCode": "rdo", "frm1704:txtName": "fn", "frm1704:txtLineBus": "lob", "frm1704:txtAddress": "regAddr",
      "frm1704:txtZipCode": "zip", "frm1704:txtTelNum": "telNo",
    },
  },
  "2550DS": {
    schema: FORM_2550DS,
    validate: validate2550DS,
    label: {
      "frm2550ds:selectedMonthNo2": "Return month (MM)", "frm2550ds:txtYearNo2": "Year (YYYY)", "frm2550ds:rdoCode": "RDO code",
      "frm2550ds:taxpayerName": "Taxpayer / registered name", "frm2550ds:address": "Registered address",
      "frm2550ds:grossSaleForTheQuarter": "Gross sales for the quarter", "frm2550ds:lessGrossSaleSubjectedToWithHoldingTax": "Less: gross sales withheld at source",
      "frm2550ds:balanceSubjectToVAT": "Balance subject to VAT", "frm2550ds:vatRate": "VAT rate %", "frm2550ds:vatPayable": "VAT payable",
      "frm2550ds:vatPaidInReturn": "VAT paid in previously filed return", "frm2550ds:excessPaymentCarriedOver": "Excess payment carried over",
      "frm2550ds:advancePaymentOrDepositMadeThisQuarter": "Advance payment/deposit this quarter", "frm2550ds:otherPaymentCreditAmount": "Other payments/credits",
      "frm2550ds:totalPaymentsCredits": "Total payments/credits", "frm2550ds:vatStillPayable": "VAT still payable / (overpayment)",
      "frm2550ds:addPenaltiesSurcharge": "Surcharge", "frm2550ds:addPenaltiesInterest": "Interest", "frm2550ds:addPenaltiesTotal": "Total penalties",
      "frm2550ds:totalAmountPayable": "Total amount payable",
      "frm2550ds:OptQuarter": "Quarter", "frm2550ds:OptQuarter1": "1st", "frm2550ds:OptQuarter2": "2nd", "frm2550ds:OptQuarter3": "3rd", "frm2550ds:OptQuarter4": "4th",
    },
    periodName: (s) => `${s["frm2550ds:selectedMonthNo2"] ?? ""}${s["frm2550ds:txtYearNo2"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm2550ds:OptQuarter${n}`] === "true") ?? ""}`,
    prefill: {
      "frm2550ds:txtTIN1": "tin1", "frm2550ds:txtTIN2": "tin2", "frm2550ds:txtTIN3": "tin3", "frm2550ds:branchCode": "tin4",
      "frm2550ds:rdoCode": "rdo", "frm2550ds:taxpayerName": "fn", "frm2550ds:address": "regAddr", "frm2550ds:telephoneNum": "telNo",
    },
  },
  "2200ANv2018": {
    schema: FORM_2200AN,
    validate: validate2200AN,
    label: {
      "frm2200ANv2018:txtMonth": "Return month (MM)", "frm2200ANv2018:txtDate": "Day (DD)", "frm2200ANv2018:txtYear": "Year (YYYY)",
      "frm2200ANv2018:txtRDOCode": "RDO code", "frm2200ANv2018:txtTaxpayerName": "Taxpayer / registered name", "frm2200ANv2018:txtAddress": "Registered address",
      "frm2200ANv2018:txtBasicExciseTaxDue": "Basic excise tax (automobiles)", "frm2200ANv2018:txtBasicExciseTaxDueNonEssentialGoods": "Basic excise tax (non-essential goods)",
      "frm2200ANv2018:txtSchedule1C": "Total basic excise tax", "frm2200ANv2018:txt16": "16 — Total excise tax due",
      "frm2200ANv2018:txt17A": "17A — Tax paid in return previously filed", "frm2200ANv2018:txt17B": "17B — Advance payments",
      "frm2200ANv2018:txt17C": "17C — Total credits", "frm2200ANv2018:txt18": "18 — Tax still due", "frm2200ANv2018:txt19": "19 — Other adjustments",
      "frm2200ANv2018:txt20": "20 — Net tax still due", "frm2200ANv2018:txt21A": "21A — Surcharge", "frm2200ANv2018:txt21B": "21B — Interest",
      "frm2200ANv2018:txt21C": "21C — Compromise", "frm2200ANv2018:txt21D": "21D — Total penalties",
      "frm2200ANv2018:txt22": "22 — Total amount due", "frm2200ANv2018:txt24": "24 — Total amount payable",
    },
    periodName: (s) => `${s["frm2200ANv2018:txtMonth"] ?? ""}${s["frm2200ANv2018:txtDate"] ?? ""}${s["frm2200ANv2018:txtYear"] ?? ""}`,
    prefill: {
      "frm2200ANv2018:txtTIN1": "tin1", "frm2200ANv2018:txtTIN2": "tin2", "frm2200ANv2018:txtTIN3": "tin3", "frm2200ANv2018:txtBranchCode": "tin4",
      "frm2200ANv2018:txtRDOCode": "rdo", "frm2200ANv2018:txtTaxpayerName": "fn", "frm2200ANv2018:txtAddress": "regAddr",
      "frm2200ANv2018:txtZipCode": "zip", "frm2200ANv2018:txtTelNum": "telNo",
    },
  },
  "1707A": {
    schema: FORM_1707A,
    validate: validate1707A,
    label: {
      "frm1707A:txtI1YearEndMonth": "Year-end month (MM)", "frm1707A:txtI1YearEndDay": "day (DD)", "frm1707A:txtI1YearEndYear": "year (YYYY)",
      "frm1707A:rdoI6RDO": "RDO code", "frm1707A:txtI8RegisteredName": "Taxpayer / registered name", "frm1707A:txtI9RegisteredAddress": "Registered address",
      "frm1707A:txtI10ZipCode": "ZIP", "frm1707A:txtLineOfBusiness": "Line of business",
      "frm1707A:txtI12TotalCapitalGains": "12 — Total capital gains", "frm1707A:txtI13TotalCapitalLoss": "13 — Total capital loss",
      "frm1707A:txtI14NetCapitalGainLoss": "14 — Net capital gain / (loss)", "frm1707A:txtI15TaxDue": "15 — Tax due",
      "frm1707A:txtI16ATotalTaxPaid": "16A — Tax paid (per schedule)", "frm1707A:txtI16BTotalTaxPaid": "16B — Other tax paid",
      "frm1707A:txtI16CTotalTaxPaid": "16C — Total tax paid", "frm1707A:txtI17TaxStillPayable": "17 — Tax still payable / (overpayment)",
      "frm1707A:txtI18ASurcharge": "18A — Surcharge", "frm1707A:txtI18BInterest": "18B — Interest", "frm1707A:txtI18CCompromise": "18C — Compromise",
      "frm1707A:txtI18DPenalties": "18D — Total penalties", "frm1707A:txtI19TotalAmountPayable": "19 — Total amount payable",
    },
    periodName: (s) => `${s["frm1707A:txtI1YearEndMonth"] ?? ""}${s["frm1707A:txtI1YearEndDay"] ?? ""}${s["frm1707A:txtI1YearEndYear"] ?? ""}`,
    prefill: {
      "frm1707A:txtI5TIN1": "tin1", "frm1707A:txtI5TIN2": "tin2", "frm1707A:txtI5TIN3": "tin3", "frm1707A:txtI5BranchMask": "tin4",
      "frm1707A:rdoI6RDO": "rdo", "frm1707A:txtI8RegisteredName": "fn", "frm1707A:txtI9RegisteredAddress": "regAddr",
      "frm1707A:txtI10ZipCode": "zip", "frm1707A:txtI7TelNo": "telNo", "frm1707A:txtLineOfBusiness": "lob",
    },
  },
  "1707Av2021": {
    schema: FORM_1707Av2021,
    validate: validate1707Av2021,
    label: {
      "frm1707Av2021:txtI1YearEndMonth": "Year-end month (MM)", "frm1707Av2021:txtI1YearEndDay": "day (DD)", "frm1707Av2021:txtI1YearEndYear": "year (YYYY)",
      "frm1707Av2021:rdoI6RDO": "RDO code", "frm1707Av2021:txtI8RegisteredName": "Taxpayer / registered name", "frm1707Av2021:txtI9RegisteredAddress": "Registered address",
      "frm1707Av2021:txtI12TotalCapitalGains": "12 — Total capital gains", "frm1707Av2021:txtI13TotalCapitalLoss": "13 — Total capital loss",
      "frm1707Av2021:txtI14NetCapitalGainLoss": "14 — Net capital gain / (loss)", "frm1707Av2021:txtI16ApplicableTaxRate": "Applicable tax rate %",
      "frm1707Av2021:txtI15TaxDue": "15 — Tax due", "frm1707Av2021:txtI16ATotalTaxPaid": "16A — Tax paid (per schedule)",
      "frm1707Av2021:txtI16CTotalTaxPaid": "16C — Total tax paid", "frm1707Av2021:txtI17TaxStillPayable": "17 — Tax still payable / (overpayment)",
      "frm1707Av2021:txtI18ASurcharge": "18A — Surcharge", "frm1707Av2021:txtI18BInterest": "18B — Interest", "frm1707Av2021:txtI18CCompromise": "18C — Compromise",
      "frm1707Av2021:txtI18DPenalties": "18D — Total penalties", "frm1707Av2021:txtI19TotalAmountPayable": "19 — Total amount payable",
    },
    periodName: (s) => `${s["frm1707Av2021:txtI1YearEndMonth"] ?? ""}${s["frm1707Av2021:txtI1YearEndDay"] ?? ""}${s["frm1707Av2021:txtI1YearEndYear"] ?? ""}`,
    prefill: {
      "frm1707Av2021:txtI5TIN1": "tin1", "frm1707Av2021:txtI5TIN2": "tin2", "frm1707Av2021:txtI5TIN3": "tin3", "frm1707Av2021:txtI5BranchMask": "tin4",
      "frm1707Av2021:rdoI6RDO": "rdo", "frm1707Av2021:txtI8RegisteredName": "fn", "frm1707Av2021:txtI9RegisteredAddress": "regAddr",
      "frm1707Av2021:txtI10ZipCode": "zip", "frm1707Av2021:txtI7TelNo": "telNo", "frm1707Av2021:txtLineOfBusiness": "lob",
    },
  },
  "2550DS-old": {
    schema: FORM_2550DS_OLD,
    validate: validate2550DSOld,
    label: {
      "frm2550ds:selectedMonthNo2": "Return month (MM)", "frm2550ds:txtYearNo2": "Year (YYYY)", "frm2550ds:rdoCode": "RDO code",
      "frm2550ds:taxpayerName": "Taxpayer / registered name", "frm2550ds:address": "Registered address",
      "frm2550ds:grossSaleForTheQuarter": "Gross sales for the quarter", "frm2550ds:balanceSubjectToVAT": "Balance subject to VAT",
      "frm2550ds:vatRate": "VAT rate %", "frm2550ds:vatPayable": "VAT payable", "frm2550ds:totalPaymentsCredits": "Total payments/credits",
      "frm2550ds:vatStillPayable": "VAT still payable / (overpayment)", "frm2550ds:totalAmountPayable": "Total amount payable",
    },
    periodName: (s) => `${s["frm2550ds:selectedMonthNo2"] ?? ""}${s["frm2550ds:txtYearNo2"] ?? ""}Q${[1, 2, 3, 4].find((n) => s[`frm2550ds:OptQuarter${n}`] === "true") ?? ""}`,
    prefill: {
      "frm2550ds:txtTIN1": "tin1", "frm2550ds:txtTIN2": "tin2", "frm2550ds:txtTIN3": "tin3", "frm2550ds:branchCode": "tin4",
      "frm2550ds:rdoCode": "rdo", "frm2550ds:taxpayerName": "fn", "frm2550ds:address": "regAddr", "frm2550ds:telephoneNum": "telNo",
    },
  },
  "1602": {
    schema: FORM_1602,
    validate: validate1602,
    label: {
      "frm1602:MonthEnd": "Month (MM)", "frm1602:txtYear": "Year (YYYY)", "frm1602:txtRDOCode": "RDO code",
      "frm1602:txtTaxpayerName": "Taxpayer / registered name", "frm1602:txtAddress": "Registered address",
      "frm1602:txt26": "26 — Total final tax withheld", "frm1602:txt29": "29 — Adjustment", "frm1602:txt32": "32 — Other adjustments",
      "frm1602:txt33": "33 — Total tax due", "frm1602:txt34": "34 — Less: tax remitted", "frm1602:txt35": "35 — Tax still due",
      "frm1602:txt36A": "36A — Surcharge", "frm1602:txt36B": "36B — Interest", "frm1602:txt36C": "36C — Compromise",
      "frm1602:txt36D": "36D — Total penalties", "frm1602:txt37": "37 — Total amount still due",
      "frm1602:txtTotalA": "Schedule 1 — total regular", "frm1602:txtTotalB": "Schedule 1 — total foreign",
      "frm1602:txtTotalC": "Schedule 1 — grand total", "frm1602:txtTotalD": "Schedule 1 — total installment",
    },
    periodName: (s) => `${s["frm1602:MonthEnd"] ?? ""}${s["frm1602:txtYear"] ?? ""}`,
    prefill: {
      "frm1602:txtTIN1": "tin1", "frm1602:txtTIN2": "tin2", "frm1602:txtTIN3": "tin3", "frm1602:txtBranchCode": "tin4",
      "frm1602:txtRDOCode": "rdo", "frm1602:txtTaxpayerName": "fn", "frm1602:txtAddress": "regAddr",
      "frm1602:txtZipCode": "zip", "frm1602:txtTelNum": "telNo",
    },
  },
  "2000OT": {
    schema: FORM_2000OT,
    validate: validate2000OT,
    label: {
      "frm2000_OT:txtDateMonth": "Transaction month (MM)", "frm2000_OT:txtDateDay": "day (DD)", "frm2000_OT:txtDateYear": "year (YYYY)",
      "frm2000OT:txtRDOCode": "RDO code", "frm2000OT:txtTaxpayerName": "Taxpayer / registered name",
      "frm2000OT:txt12F": "12F — Taxable base (FMV)", "frm2000OT:txtTax13": "13 — Consideration (property)", "frm2000OT:txtTax14": "14 — Par/selling value (shares)",
      "frm2000OT:txtTax15": "15 — ATC rate code", "frm2000OT:txtTax16": "16 — Tax due", "frm2000OT:txtLess": "Less: tax paid",
      "frm2000OT:txtTaxDue": "Tax still due", "frm2000OT:txtTax19A": "19A — Surcharge", "frm2000OT:txtTax19B": "19B — Interest",
      "frm2000OT:txtTax19C": "19C — Compromise", "frm2000OT:txtTax19D": "19D — Total penalties", "frm2000OT:txtTax20": "20 — Total amount payable",
    },
    periodName: (s) => `${s["frm2000_OT:txtDateMonth"] ?? ""}${s["frm2000_OT:txtDateDay"] ?? ""}${s["frm2000_OT:txtDateYear"] ?? ""}`,
    prefill: {
      "frm2000OT:txtTIN1": "tin1", "frm2000OT:txtTIN2": "tin2", "frm2000OT:txtTIN3": "tin3", "frm2000OT:txtBranchCode": "tin4",
      "frm2000OT:txtRDOCode": "rdo", "frm2000OT:txtTaxpayerName": "fn", "frm2000OT:txtAddress": "regAddr",
      "frm2000OT:txtZipCode": "zip", "frm2000OT:txtTelNum": "telNo",
    },
  },
  "1604E": {
    schema: FORM_1604E,
    validate: validate1604E,
    label: {
      "frm1604e:txtYear": "Year (YYYY)", "frm1604e:txtRDOCode": "RDO code", "frm1604e:txtZipCode": "ZIP",
      "frm1604e:txtAgentname": "Withholding agent / registered name", "frm1604e:txtLineBus": "Line of business", "frm1604e:txtAddress": "Registered address",
      "frm1604e:txtSched1TaxWheldTotal": "Sched 1 — tax withheld total", "frm1604e:txtSched1PenTotal": "Sched 1 — penalties total", "frm1604e:txtSched1Total": "Schedule 1 — total",
      "frm1604e:txtSched2TaxWheldTotal": "Sched 2 — tax withheld total", "frm1604e:txtSched2PenTotal": "Sched 2 — penalties total", "frm1604e:txtSched2Total": "Schedule 2 — total",
    },
    periodName: (s) => `${s["frm1604e:txtYear"] ?? ""}`,
    prefill: {
      "frm1604e:txtTIN1": "tin1", "frm1604e:txtTIN2": "tin2", "frm1604e:txtTIN3": "tin3", "frm1604e:txtBranchCode": "tin4",
      "frm1604e:txtRDOCode": "rdo", "frm1604e:txtAgentname": "fn", "frm1604e:txtLineBus": "lob", "frm1604e:txtAddress": "regAddr",
      "frm1604e:txtZipCode": "zip", "frm1604e:txtTelNum": "telNo",
    },
  },
  "2200Tv2020": {
    schema: FORM_2200T,
    validate: validate2200T,
    label: {
      "frm2200Tv2020:txtDateMonth": "Return month (MM)", "frm2200Tv2020:txtDateDay": "day (DD)", "frm2200Tv2020:txtDateYear": "year (YYYY)",
      "frm2200Tv2020:rdoCode": "RDO code", "frm2200Tv2020:registeredName": "Taxpayer / registered name", "frm2200Tv2020:registeredAddress": "Registered address",
      "frm2200Tv2020:txtExciseDue": "Total excise tax due", "frm2200Tv2020:txtNetTaxDue": "Net tax due", "frm2200Tv2020:txtAmtPayable": "Total amount payable",
    },
    periodName: (s) => `${s["frm2200Tv2020:txtDateMonth"] ?? ""}${s["frm2200Tv2020:txtDateDay"] ?? ""}${s["frm2200Tv2020:txtDateYear"] ?? ""}`,
    prefill: {
      "frm2200Tv2020:tinA": "tin1", "frm2200Tv2020:tinB": "tin2", "frm2200Tv2020:tinC": "tin3", "frm2200Tv2020:branchCode": "tin4",
      "frm2200Tv2020:rdoCode": "rdo", "frm2200Tv2020:registeredName": "fn", "frm2200Tv2020:registeredAddress": "regAddr", "frm2200Tv2020:zipCode": "zip",
    },
  },
  "1706": {
    schema: FORM_1706,
    validate: validate1706,
    label: {
      "frm1706:txtDateMonth": "Transaction month (MM)", "frm1706:txtDateDay": "day (DD)", "frm1706:txtDateYear": "year (YYYY)",
      "frm1706:txtRDOCode": "RDO code", "frm1706:txtSellerName": "Seller / transferor name",
      "frm1706:txtFMVLand": "FMV — land", "frm1706:txtFMVImprovements": "FMV — improvements", "frm1706:txtFMVZonal": "FMV — zonal value", "frm1706:txtFMVBIR": "FMV — BIR assessed",
      "frm1706:txtFMVLI": "FMV (land & improvements)", "frm1706:txtGross": "Gross selling price", "frm1706:txtBid": "Bid price (auction)",
      "frm1706:txtInstallment": "Installment amount", "frm1706:txtOthers30F": "Other consideration", "frm1706:txtOthers30E": "Other (specify)",
      "frm1706:txtTax": "Taxable base", "frm1706:txtRate": "Tax due (6%)", "frm1706:txtLess": "Less: tax paid", "frm1706:txtTaxDue": "Tax still due",
      "frm1706:txtSurcharge": "Surcharge", "frm1706:txtInterest": "Interest", "frm1706:txtCompromise": "Compromise",
      "frm1706:txtTotalPenalties": "Total penalties", "frm1706:txtTotal": "Total amount payable",
    },
    periodName: (s) => `${s["frm1706:txtDateMonth"] ?? ""}${s["frm1706:txtDateDay"] ?? ""}${s["frm1706:txtDateYear"] ?? ""}`,
    prefill: {
      "frm1706:txtTIN1": "tin1", "frm1706:txtTIN2": "tin2", "frm1706:txtTIN3": "tin3", "frm1706:txtBranchCode": "tin4",
      "frm1706:txtRDOCode": "rdo", "frm1706:txtSellerName": "fn",
    },
  },
  "1606": {
    schema: FORM_1606,
    validate: validate1606,
    label: {
      "frm1606:txtDateMonth": "Transaction month (MM)", "frm1606:txtDateDay": "day (DD)", "frm1606:txtDateYear": "year (YYYY)",
      "frm1606:txtRDOCode": "RDO code", "frm1606:txtBuyerName": "Buyer / withholding agent name",
      "frm1606:txtFMVLand": "FMV — land", "frm1606:txtFMVImprovements": "FMV — improvements", "frm1606:txtFMVZonal": "FMV — zonal value", "frm1606:txtFMVBIR": "FMV — BIR assessed",
      "frm1606:txtFMVLI": "FMV (land & improvements)", "frm1606:txtGross": "Gross selling price", "frm1606:txtBid": "Bid price (auction)",
      "frm1606:txtInstallment": "Installment amount", "frm1606:txtOthers28E": "Other consideration",
      "frm1606:txtTax": "Taxable base", "frm1606:txtTaxRate": "Tax rate %", "frm1606:txtTaxR": "Tax required to be withheld",
      "frm1606:txtLess": "Less: tax paid", "frm1606:txtTaxDue": "Tax still due",
      "frm1606:txtSurcharge": "Surcharge", "frm1606:txtInterest": "Interest", "frm1606:txtCompromise": "Compromise",
      "frm1606:txtTotalPenalties": "Total penalties", "frm1606:txtTotal": "Total amount payable",
    },
    periodName: (s) => `${s["frm1606:txtDateMonth"] ?? ""}${s["frm1606:txtDateDay"] ?? ""}${s["frm1606:txtDateYear"] ?? ""}`,
    prefill: {
      "frm1606:txtTIN1": "tin1", "frm1606:txtTIN2": "tin2", "frm1606:txtTIN3": "tin3", "frm1606:txtBranchCode": "tin4",
      "frm1606:txtRDOCode": "rdo", "frm1606:txtBuyerName": "fn",
    },
  },
  "1702Q": {
    schema: FORM_1702Q,
    validate: validate1702Q,
    label: {
      "frm1702q:txtYearEnded": "Year ended (YYYY)", "frm1702q:itemYearEndMonth": "Year-end month (MM)", "frm1702q:txtRdoCode": "RDO code",
      "frm1702q:txtTaxpayerName": "Taxpayer / registered name",
      "txt1st": "MCIT — 1st qtr gross", "txt2nd": "MCIT — 2nd qtr gross", "txt3rd": "MCIT — 3rd qtr gross",
      "txtMinCorpIncomeTax": "Minimum Corporate Income Tax (2%)",
      "frm1702q:txt28": "28 — MCIT", "frm1702q:txt29A": "29A — Income tax due", "frm1702q:txt30": "30 — Total income tax due",
      "frm1702q:txt31H": "31H — Total tax credits/payments", "frm1702q:txt32": "32 — Tax still due",
      "frm1702q:txt33D": "33D — Total penalties", "frm1702q:txt34": "34 — Total amount payable",
      "frm1702q:optQtr:_1": "1st quarter", "frm1702q:optQtr:_2": "2nd quarter", "frm1702q:optQtr:_3": "3rd quarter",
      "1702q:OptMethodDeduct_1": "Itemized deductions", "1702q:OptMethodDeduct_2": "Optional Standard Deduction (40%)",
    },
    periodName: (s) => `${s["frm1702q:txtYearEnded"] ?? ""}Q${[1, 2, 3].find((n) => s[`frm1702q:optQtr:_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm1702q:txtTin1": "tin1", "frm1702q:txtTin2": "tin2", "frm1702q:txtTin3": "tin3", "frm1702q:txtBranchCode": "tin4",
      "frm1702q:txtRdoCode": "rdo", "frm1702q:txtTaxpayerName": "fn",
    },
  },
  "1702Qv2008C": {
    schema: FORM_1702Qv2008C,
    validate: validate1702Qv2008C,
    label: {
      "frm1702q:txtYearEnded": "Year ended (YYYY)", "frm1702q:txtRdoCode": "RDO code", "frm1702q:txtTaxpayerName": "Taxpayer / registered name",
      "frm1702q:txt28": "28 — MCIT", "frm1702q:txt29A": "29A — Income tax due", "frm1702q:txt30": "30 — Total income tax due",
      "frm1702q:txt32": "32 — Tax still due", "frm1702q:txt34": "34 — Total amount payable",
      "frm1702q:optQtr:_1": "1st quarter", "frm1702q:optQtr:_2": "2nd quarter", "frm1702q:optQtr:_3": "3rd quarter",
      "1702q:OptMethodDeduct_1": "Itemized deductions", "1702q:OptMethodDeduct_2": "Optional Standard Deduction (40%)",
    },
    periodName: (s) => `${s["frm1702q:txtYearEnded"] ?? ""}Q${[1, 2, 3].find((n) => s[`frm1702q:optQtr:_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm1702q:txtTin1": "tin1", "frm1702q:txtTin2": "tin2", "frm1702q:txtTin3": "tin3", "frm1702q:txtBranchCode": "tin4",
      "frm1702q:txtRdoCode": "rdo", "frm1702q:txtTaxpayerName": "fn",
    },
  },
  "1701Q": {
    schema: FORM_1701Q,
    validate: validate1701Q,
    label: {
      "frm1701q:txtYear": "Year (YYYY)", "frm1701q:txt5RDOCode": "RDO code", "frm1701q:txtTaxPayername": "Taxpayer name", "frm1701q:txtSpousename": "Spouse name",
      "frm1701q:txt37A": "37A — Tax due (taxpayer)", "frm1701q:txt37B": "37B — Tax due (spouse)",
      "frm1701q:txt39A": "39A — Net tax due (taxpayer)", "frm1701q:txt39B": "39B — Net tax due (spouse)",
      "frm1701q:txt41A": "41A — Amount payable (taxpayer)", "frm1701q:txt41B": "41B — Amount payable (spouse)", "frm1701q:txt41C": "41C — Total amount payable",
      "frm1701q:DateQuarter_1": "1st quarter", "frm1701q:DateQuarter_2": "2nd quarter", "frm1701q:DateQuarter_3": "3rd quarter",
      "frm1701:optMethodOfDeduction23:_1": "Taxpayer — itemized", "frm1701:optMethodOfDeduction23:_2": "Taxpayer — OSD (40%)",
      "frm1701:optMethodOfDeduction24:_1": "Spouse — itemized", "frm1701:optMethodOfDeduction24:_2": "Spouse — OSD (40%)",
    },
    periodName: (s) => `${s["frm1701q:txtYear"] ?? ""}Q${[1, 2, 3].find((n) => s[`frm1701q:DateQuarter_${n}`] === "true") ?? ""}`,
    prefill: {
      "frm1701q:txt5TIN1": "tin1", "frm1701q:txt5TIN2": "tin2", "frm1701q:txt5TIN3": "tin3", "frm1701q:txt5BranchCode": "tin4",
      "frm1701q:txt5RDOCode": "rdo", "frm1701q:txtTaxPayername": "fn",
    },
  },
  "1701A": {
    schema: FORM_1701A,
    validate: validate1701A,
    label: {
      "frm1701A:txtMonth": "Year-end month (MM)", "frm1701A:txtYear": "Year (YYYY)", "frm1701A:txtRDOCode": "RDO code",
      "frm1701A:txtTaxpayerName": "Taxpayer name", "frm1701A:txtSpouseName": "Spouse name",
      "frm1701A:txt46A": "46A — Graduated tax (taxpayer)", "frm1701A:txt56A": "56A — 8% tax (taxpayer)",
      "frm1701A:txt20A": "20A — Tax due (taxpayer)", "frm1701A:txt22A": "22A — Net tax still due (taxpayer)",
      "frm1701A:txt29A": "29A — Amount payable (taxpayer)", "frm1701A:txt29B": "29B — Amount payable (spouse)",
      "frm1701A:txt30": "30 — Total amount payable",
      "frm1701A:optTaxRate_1": "Taxpayer — graduated rates", "frm1701A:optTaxRate_2": "Taxpayer — 8%",
      "frm1701A:optSpouseTaxRate_1": "Spouse — graduated rates", "frm1701A:optSpouseTaxRate_2": "Spouse — 8%",
    },
    periodName: (s) => `${s["frm1701A:txtMonth"] ?? ""}${s["frm1701A:txtYear"] ?? ""}`,
    prefill: {
      "frm1701A:txtTIN1": "tin1", "frm1701A:txtTIN2": "tin2", "frm1701A:txtTIN3": "tin3", "frm1701A:txtBranchCode": "tin4",
      "frm1701A:txtRDOCode": "rdo", "frm1701A:txtTaxpayerName": "fn",
    },
  },
  "1621": {
    schema: FORM_1621,
    validate: validate1621,
    label: {
      "frm1621:txtYear": "Year (YYYY)", "frm1621:rdoCode": "RDO code", "frm1621:registeredName": "Taxpayer / registered name",
      "frm1621:txtTaxRate": "Tax rate", "frm1621:txtTaxBase": "Total amount withdrawn", "frm1621:txtTaxWithheld": "Total tax withheld",
      "frm1621:txtSched1_{i}_Withdrawn": "Amount withdrawn", "frm1621:txtSched1_{i}_Withheld": "Tax withheld",
      "frm1621:txtRemittance_1": "Remittance — 1st month", "frm1621:txtRemittance_2": "Remittance — 2nd month", "frm1621:txtRemittance_Prev": "Remittance — previously filed",
      "frm1621:txtRemittance_Tot": "Total remittance", "frm1621:txtStillDue": "Tax still due / (overremittance)",
      "frm1621:txtPen_Surcharge": "Surcharge", "frm1621:txtPen_Interest": "Interest", "frm1621:txtPen_Compromise": "Compromise",
      "frm1621:txtPen_Tot": "Total penalties", "frm1621:txtStillDue_tot": "Total amount still due",
    },
    periodName: (s) => `${s["frm1621:txtYear"] ?? ""}`,
    prefill: {
      "frm1621:tinA": "tin1", "frm1621:tinB": "tin2", "frm1621:tinC": "tin3", "frm1621:branchCode": "tin4",
      "frm1621:rdoCode": "rdo", "frm1621:registeredName": "fn",
    },
  },
  "1707": {
    schema: FORM_1707,
    validate: validate1707,
    label: {
      "frm1707:txtDateMonth": "Transaction month (MM)", "frm1707:txtDateDay": "day (DD)", "frm1707:txtDateYear": "year (YYYY)",
      "frm1707:txtRDOCode": "RDO code", "txtSched1TaxableBase": "Net capital gain", "txtSched2Amt": "Tax credit/payment",
      "frm1707:txtTax": "Total net capital gain", "frm1707:txtLess": "Total tax credits", "frm1707:txtNetCap": "Net capital gain (taxable)",
      "frm1707:txtTaxDue": "Tax due", "frm1707:txtLess2": "Less: tax paid", "frm1707:txtTaxPayable": "Tax still payable",
      "frm1707:txtSurcharge": "Surcharge", "frm1707:txtInterest": "Interest", "frm1707:txtCompromise": "Compromise",
      "frm1707:txtTotalPenalties": "Total penalties", "frm1707:txtTotal": "Total amount payable",
    },
    periodName: (s) => `${s["frm1707:txtDateMonth"] ?? ""}${s["frm1707:txtDateDay"] ?? ""}${s["frm1707:txtDateYear"] ?? ""}`,
    prefill: {
      "frm1707:txtTIN1": "tin1", "frm1707:txtTIN2": "tin2", "frm1707:txtTIN3": "tin3", "frm1707:txtBranchCode": "tin4",
      "frm1707:txtRDOCode": "rdo",
    },
  },
  "1800": {
    schema: FORM_1800,
    validate: validate1800,
    label: {
      "frm1800:txtDateMonth": "Transaction month (MM)", "frm1800:txtDateDay": "day (DD)", "frm1800:txtDateYear": "year (YYYY)",
      "frm1800:txtRDOCode": "RDO code", "frm1800:txtDonorName": "Donor name",
      "txtSchedAStranger": "Gift to stranger", "txtSchedARelative": "Gift to relative",
      "frm1800:txt18A": "18A — Gifts to strangers", "frm1800:txt18B": "18B — Gifts to relatives",
      "frm1800:txt24A": "24A — Net gifts (strangers)", "frm1800:txt24B": "24B — Net gifts (relatives)",
      "frm1800:txt25A": "25A — Donor's tax (strangers, 30%)", "frm1800:txt25B": "25B — Donor's tax (relatives, graduated)",
      "frm1800:txt25C": "25C — Total donor's tax", "frm1800:txt27": "27 — Tax still due",
      "frm1800:txtTotalPenalties": "Total penalties", "frm1800:txt29": "29 — Total amount payable",
    },
    periodName: (s) => `${s["frm1800:txtDateMonth"] ?? ""}${s["frm1800:txtDateDay"] ?? ""}${s["frm1800:txtDateYear"] ?? ""}`,
    prefill: {
      "frm1800:txtDonorTIN1": "tin1", "frm1800:txtDonorTIN2": "tin2", "frm1800:txtDonorTIN3": "tin3", "frm1800:txtDonorBranchCode": "tin4",
      "frm1800:txtRDOCode": "rdo", "frm1800:txtDonorName": "fn",
    },
  },
  "1800v2018": {
    schema: FORM_1800V2018,
    validate: validate1800v2018,
    label: {
      "frm1800v2018:txtYear": "Transaction year (YYYY)", "frm1800v2018:txtRDOCode": "RDO code", "frm1800v2018:txtDonorName": "Donor name",
      "frm1800v2018:schedA:txtFairMarketValue": "Personal property FMV", "frm1800v2018:schedB2:txtFairMarketValue": "Real property FMV",
      "frm1800v2018:TotalGifts": "27 — Total gifts", "frm1800v2018:TotalDeductionsAllowed": "33 — Total deductions allowed",
      "frm1800v2018:TotalNetGiftsSubjectToTax": "Net gifts subject to tax (after 250k exemption)",
      "frm1800v2018:DonorTaxDue": "16 — Donor's tax due (6%)", "frm1800v2018:txtTaxPayable": "Tax payable",
      "frm1800v2018:TotalPenalties": "Total penalties", "frm1800v2018:TotalAmountPayable": "Total amount payable",
    },
    periodName: (s) => `${s["frm1800v2018:txtMonth"] ?? ""}${s["frm1800v2018:txtDate"] ?? ""}${s["frm1800v2018:txtYear"] ?? ""}`,
    prefill: {
      "frm1800v2018:txtTIN1": "tin1", "frm1800v2018:txtTIN2": "tin2", "frm1800v2018:txtTIN3": "tin3", "frm1800v2018:txtBranchCode": "tin4",
      "frm1800v2018:txtRDOCode": "rdo", "frm1800v2018:txtDonorName": "fn",
    },
  },
  "2551M": {
    schema: FORM_2551M,
    validate: validate2551m,
    label: {
      "frm2551m:txtYear": "Return year (YYYY)", "frm2551m:txtRDOCode": "RDO code", "frm2551m:txtTaxPayerName": "Taxpayer name",
      "txtTaxableAmount": "ATC taxable amount", "txtTaxRate": "ATC rate (%)",
      "frm2551m:txtApplied": "Tax credit applied",
      "frm2551m:txtTotalTaxDue": "Total tax due", "frm2551m:txt20A": "20A — Tax withheld credits", "frm2551m:txt21": "21 — Total credits",
      "frm2551m:txt22": "22 — Tax still due", "frm2551m:txt23D": "23D — Total penalties",
      "frm2551m:txtTotalAmountPayable_24": "24 — Total amount payable",
    },
    periodName: (s) => `${s["frm2551m:ReturnMonth"] ?? ""}${s["frm2551m:txtYear"] ?? ""}`,
    prefill: {
      "frm2551m:txtTIN1": "tin1", "frm2551m:txtTIN2": "tin2", "frm2551m:txtTIN3": "tin3", "frm2551m:txtBranchCode": "tin4",
      "frm2551m:txtRDOCode": "rdo", "frm2551m:txtTaxPayerName": "fn",
    },
  },
  "1601C": {
    schema: FORM_1601C,
    validate: validate1601c,
    label: {
      "frm1601c:txtYear": "Return year (YYYY)", "frm1601c:txtRDOCode": "RDO code", "frm1601c:txtPayerName": "Withholding agent",
      "frm1601c:txtTax15": "15 — Total taxes withheld", "frm1601c:txtTax17": "17 — Taxes withheld (adjusted)",
      "frm1601c:txtTax18": "18 — Tax required to be withheld", "frm1601c:txtTax19": "19 — Prior-month adjustments",
      "frm1601c:txtTax20": "20 — Total tax due", "frm1601c:txtTax22": "22 — Total credits", "frm1601c:txtTax23": "23 — Tax still due",
      "frm1601c:txtTax24D": "24D — Total penalties", "frm1601c:txtTax25": "25 — Total amount still due",
    },
    periodName: (s) => `${s["frm1601c:j_id201"] ?? ""}${s["frm1601c:txtYear"] ?? ""}`,
    prefill: {
      "frm1601c:txtTIN1": "tin1", "frm1601c:txtTIN2": "tin2", "frm1601c:txtTIN3": "tin3", "frm1601c:txtBranchCode": "tin4",
      "frm1601c:txtRDOCode": "rdo", "frm1601c:txtPayerName": "fn",
    },
  },
  "2552": {
    schema: FORM_2552,
    validate: validate2552,
    label: {
      "frm2552:txtForYr": "For the year (YYYY)", "frm2552:txtRDOCode": "RDO code", "frm2552:txtNameStockBrocker": "Taxpayer / stockbroker",
      "txtTaxableBase": "Transaction taxable base", "selTaxRate": "Rate (0.6 / 4 / 2 / 1 %)",
      "frm2552:txtTaxDue12D": "12D — IPO tax (0.6%)", "frm2552:txt15": "15 — Total tax due",
      "frm2552:txt16C": "16C — Total tax credits", "frm2552:txt17": "17 — Tax still due",
      "frm2552:txt18D": "18D — Total penalties", "frm2552:txt19": "19 — Total amount payable",
    },
    periodName: (s) => `${s["frm2552:txtMonth1"] ?? ""}${s["frm2552:txtForYr"] ?? ""}`,
    prefill: {
      "frm2552:txtTIN1": "tin1", "frm2552:txtTIN2": "tin2", "frm2552:txtTIN3": "tin3", "frm2552:txtBranchCode": "tin4",
      "frm2552:txtRDOCode": "rdo", "frm2552:txtNameStockBrocker": "fn",
    },
  },
  "1602Qv2018": {
    schema: FORM_1602QV2018,
    validate: validate1602qv2018,
    label: {
      "frm1602Q:txtYear": "Return year (YYYY)", "frm1602Q:txtRDOCode": "RDO code", "frm1602Q:txtTaxpayerName": "Withholding agent",
      "frm1602Q:txtSched1Amount13": "Sched1 row 13 amount (BSP)", "frm1602Q:txtSched2Interest1": "Sched2 interest",
      "frm1602Q:txt14": "14 — Sched 1 total", "frm1602Q:txt15": "15 — Sched 2 total", "frm1602Q:txt16": "16 — Sched 3 total",
      "frm1602Q:txt17": "17 — Total taxes withheld", "frm1602Q:txt23": "23 — Tax still due",
      "frm1602Q:txt27": "27 — Total penalties", "frm1602Q:txt28": "28 — Total amount still due",
    },
    periodName: (s) => `${s["frm1602Q:txtYear"] ?? ""}${[1, 2, 3, 4].filter((q) => s[`frm1602Q:qtr_${q}`] === "true").map((q) => `Q${q}`).pop() ?? ""}`,
    prefill: {
      "frm1602Q:txtTIN1": "tin1", "frm1602Q:txtTIN2": "tin2", "frm1602Q:txtTIN3": "tin3", "frm1602Q:txtBranchCode": "tin4",
      "frm1602Q:txtRDOCode": "rdo", "frm1602Q:txtTaxpayerName": "fn",
    },
  },
  "1601FQ": {
    schema: FORM_1601FQ,
    validate: validate1601FQ,
    label: {
      "frm1601FQ:txtYear": "Year (YYYY)", "frm1601FQ:txtRDOCode": "RDO code", "frm1601FQ:txtZipCode": "ZIP",
      "frm1601FQ:txtTaxpayerName": "Withholding agent", "frm1601FQ:txtLineBus": "Line of business", "frm1601FQ:txtAddress": "Registered address",
      "frm1601FQ:OptQuarter": "Quarter", "frm1601FQ:OptQuarter1": "1st", "frm1601FQ:OptQuarter2": "2nd", "frm1601FQ:OptQuarter3": "3rd", "frm1601FQ:OptQuarter4": "4th",
      "frm1601FQ:AmendedRtn": "Amended return?", "frm1601FQ:AmendedRtn_1": "Yes", "frm1601FQ:AmendedRtn_2": "No",
      "frm1601FQ:TaxWithheld": "Any taxes withheld?", "frm1601FQ:TaxWithheld_1": "Yes", "frm1601FQ:TaxWithheld_2": "No",
      "frm1601FQ:CatAgent": "Category of withholding agent", "frm1601FQ:CatAgent_P": "Private", "frm1601FQ:CatAgent_G": "Government",
      "frm1601FQ:SpecialTax": "Tax treaty / special law relief?", "frm1601FQ:SpecialTax_1": "Yes", "frm1601FQ:SpecialTax_2": "No",
      "frm1601FQ:txtAtcCode": "ATC", "frm1601FQ:txtTaxBase": "Tax base", "frm1601FQ:txtTaxRate": "Rate %", "frm1601FQ:txtTaxbeWithHeld": "Tax withheld",
      "frm1601FQ:txtTotalOtherTax": "Other taxes withheld (rows 7+)", "txtDvTotalSchedI": "Schedule I total",
      "frm1601FQ:txtTax20": "20 — Total taxes withheld (Part II)", "frm1601FQ:txtTax21": "21 — Schedule I (treaty) taxes",
      "frm1601FQ:txtTax22": "22 — Total taxes required to be withheld", "frm1601FQ:txtTax26": "26 — Total remittances",
      "frm1601FQ:txtTax27": "27 — Tax still due", "frm1601FQ:txtTax31": "31 — Total penalties", "frm1601FQ:txtTax32": "32 — Total amount still due",
    },
    periodName: (s) => `${s["frm1601FQ:txtYear"] ?? ""}Q${[1, 2, 3, 4].find((q) => s[`frm1601FQ:OptQuarter${q}`] === "true") ?? ""}`,
    prefill: {
      "frm1601FQ:txtTIN1": "tin1", "frm1601FQ:txtTIN2": "tin2", "frm1601FQ:txtTIN3": "tin3", "frm1601FQ:txtBranchCode": "tin4",
      "frm1601FQ:txtRDOCode": "rdo", "frm1601FQ:txtTaxpayerName": "fn", "frm1601FQ:txtLineBus": "lob", "frm1601FQ:txtAddress": "regAddr",
      "frm1601FQ:txtZipCode": "zip", "frm1601FQ:txtTelNum": "telNo",
    },
  },
};

// Forms registered by file: src/form/entry/<CODE>.ts default-exports its NativeForm. New forms register this
// way so parallel rewrites never edit this file; the key is the file name (BIR's form code).
for (const [path, mod] of Object.entries(import.meta.glob<{ default: NativeForm }>("./entry/*.ts", { eager: true }))) {
  NATIVE_FORM[path.slice("./entry/".length, -".ts".length)] = mod.default;
}

export const isNativeForm = (form_code: string) => form_code in NATIVE_FORM;
