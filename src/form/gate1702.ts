// When BIR turns on the "(Add more...)" / "(more...)" buttons of the 1702-RT and 1702-EX families. Every button is
// disabled in BIR's page until the item's own fixed rows are filled in, and stays on once its pop-up holds a row.
//
//   1702-RT (all editions)  enableCompleteRows(text, amount, button): every text box not blank after $.trim, every amount
//       box not zero through NumWithComma(NumWithParenthesis(v)) == 0. The page runs it on each blur of the item's last
//       row (the earlier rows are greyed out until the one before is complete). Saving the pop-up turns the button on
//       with one row or more and off with none (loadData does the same from the saved row counter).
//   1702-EX (all editions)  Check_<item>: every listed text box not blank after $.trim, every amount box with
//       `value * 1 != 0`, over all the item's fixed rows. Save_<item> turns the button on with one row or more.
//       The 2013 Schedule 9 / 10 buttons (checkPg7AddMore) want the two text boxes of the item filled in, nothing else.
//   Never greyed out in BIR's markup: RT 2013 Schedule 12 item 4's button, EX 2013 Schedule 9 Part I's.
//
// What this does not model: BIR's Validate, which turns every "(Add more...)" button back on while the form is locked
// for review (the web version has no such lock).
import type { FormState, GroupState } from "./schema.ts";

export interface Gate {
  /** Text boxes that must not be blank (BIR trims them). */
  text: string[];
  /** Amount boxes that must not be zero. */
  amount: string[];
  /** Schedule rows kept on once the pop-up holds a row (BIR's Save and loadData). Defaults to true. */
  keep?: boolean;
}

/** BIR's NumWithComma(NumWithParenthesis(v)) == 0 on an amount box. A blank box is the page's "0". */
const zeroRT = (raw: string): boolean => {
  const v = raw.trim();
  if (v === "") return true;
  const n = parseFloat(v.replace("(", "-").replace(")", "").replace(/,/g, ""));
  return n === 0;
};
/** BIR's `value * 1 == 0` (a value with a comma is NaN, so it counts as filled in). */
const zeroEX = (raw: string): boolean => Number(raw) === 0;

const filled = (state: FormState, id: string): boolean => (state[id] ?? "").trim() !== "";

/** The `on` of a button: the gate holds, or its group already has rows. */
export function gateOn(gate: Gate, group: string, edition: "RT" | "EX"): (groups: GroupState, state: FormState) => boolean {
  const zero = edition === "RT" ? zeroRT : zeroEX;
  return (groups, state) => {
    if (gate.keep !== false && (groups[group] ?? []).length > 0) return true;
    return gate.text.every((id) => filled(state, id)) && gate.amount.every((id) => !zero(state[id] ?? ""));
  };
}

const RT = "frm1702RT:";
const EX = "frm1702EX:";
const id = (prefix: string, ...stem: string[]) => stem.map((s) => `${prefix}${s}`);

/** 1702-RT, pre-2018 layout. The Sch 12 / 13 pop-ups need both columns (A and B) of the page's fixed rows. */
export const GATE_RT: Record<string, Gate> = {
  btnPg4Sc3I3More: { text: id(RT, "txtPg4Sc3I3C1"), amount: id(RT, "txtPg4Sc3I3C2") },
  btnPg4Sc4I4More: { text: id(RT, "txtPg4Sc4I4C1"), amount: id(RT, "txtPg4Sc4I4C2") },
  btnPg5Sc4I39More: { text: id(RT, "txtPg5Sc4I39C1"), amount: id(RT, "txtPg5Sc4I39C2") },
  btnPg5Sc5I4More: { text: id(RT, "txtPg5Sc5I4C1", "txtPg5Sc5I4C2"), amount: id(RT, "txtPg5Sc5I4C3") },
  btnPg6Sc7I11More: { text: id(RT, "txtPg6Sc7I11C1"), amount: id(RT, "txtPg6Sc7I11C2") },
  btnPg6Sc9I3More: { text: id(RT, "txtPg6Sc9I3C1"), amount: id(RT, "txtPg6Sc9I3C2") },
  btnPg6Sc9I6More: { text: id(RT, "txtPg6Sc9I6C1"), amount: id(RT, "txtPg6Sc9I6C2") },
  btnPg6Sc9I8More: { text: id(RT, "txtPg6Sc9I8C1"), amount: id(RT, "txtPg6Sc9I8C2") },
  btnPg5Sc6AI7More: { text: id(RT, "txtPg5Sc6AI7C1"), amount: id(RT, "txtPg5Sc6AI7C2") },
  "frm1702RT:btnModalPg8Sc12II": {
    text: id(RT, "txtPg8Sc12I5C1", "txtPg8Sc12I6C1", "txtPg8Sc12I7C1", "txtPg8Sc12I5C2", "txtPg8Sc12I6C2", "txtPg8Sc12I7C2"),
    amount: id(RT, "txtPg8Sc12I8C1", "txtPg8Sc12I9C1", "txtPg8Sc12I8C2", "txtPg8Sc12I9C2"),
  },
  "frm1702RT:btnModalPg8Sc12III": {
    text: id(RT, "txtPg8Sc12I10C1", "txtPg8Sc12I11C1", "txtPg8Sc12I13C1Date", "txtPg8Sc12I10C2", "txtPg8Sc12I11C2", "txtPg8Sc12I13C2Date"),
    amount: id(RT, "txtPg8Sc12I12C1", "txtPg8Sc12I14C1", "txtPg8Sc12I15C1", "txtPg8Sc12I12C2", "txtPg8Sc12I14C2", "txtPg8Sc12I15C2"),
  },
  "frm1702RT:btnModalPg8Sc12IV": {
    text: id(RT, "txtPg8Sc12I16C1", "txtPg8Sc12I16C2"),
    amount: id(RT, "txtPg8Sc12I17C1", "txtPg8Sc12I18C1", "txtPg8Sc12I17C2", "txtPg8Sc12I18C2"),
  },
  "frm1702RT:btnModalPg8Sc13I": {
    text: id(RT, "txtPg8Sc13I2C1", "txtPg8Sc13I3C1", "txtPg8Sc13I4C1", "txtPg8Sc13I2C2", "txtPg8Sc13I3C2", "txtPg8Sc13I4C2"),
    amount: id(RT, "txtPg8Sc13I5C1", "txtPg8Sc13I5C2"),
  },
  "frm1702RT:btnModalPg8Sc13II": {
    text: id(RT, "txtPg8Sc13I6C1", "txtPg8Sc13I6C2"),
    amount: id(RT, "txtPg8Sc13I7C1", "txtPg8Sc13I7C2"),
  },
};

/** 1702-RT 2018 editions (the superseded and the current one carry the same ids and conditions). */
export const GATE_RT2018: Record<string, Gate> = {
  btnPg2Pt4I54More: { text: id(RT, "txtPg2Pt4I54C1"), amount: id(RT, "txtPg2Pt4I54C2") },
  btnPg3Sc1I17iMore: { text: id(RT, "txtPg3Sc1I17iC1"), amount: id(RT, "txtPg3Sc1I17iC2") },
  btnPg3Sc2I4More: { text: id(RT, "txtPg3Sc2I4C1", "txtPg3Sc2I4C2"), amount: id(RT, "txtPg3Sc2I4C3") },
  btnPg4Sc5I3More: { text: id(RT, "txtPg4Sc5I3C1"), amount: id(RT, "txtPg4Sc5I3C2") },
  btnPg4Sc5I6More: { text: id(RT, "txtPg4Sc5I6C1"), amount: id(RT, "txtPg4Sc5I6C2") },
  btnPg4Sc5I8More: { text: id(RT, "txtPg4Sc5I8C1"), amount: id(RT, "txtPg4Sc5I8C2") },
};

const ex = (text: string[], amount: string[]): Gate => ({ text: text.map((s) => `${EX}txt${s}`), amount: amount.map((s) => `${EX}txt${s}`) });

/** 1702-EX 2013: Check_Pg4S3I3 ... Check_Pg5S6I8, over every fixed row of the item. */
export const GATE_EX: Record<string, Gate> = {
  btnPg4S3I3More: ex(["Pg4S3I1Col1", "Pg4S3I2Col1", "Pg4S3I3Col1"], ["Pg4S3I1Col2", "Pg4S3I2Col2", "Pg4S3I3Col2"]),
  btnPg4S4I4More: ex(["Pg4S4I2Col1", "Pg4S4I3Col1", "Pg4S4I4Col1"], ["Pg4S4I2Col2", "Pg4S4I3Col2", "Pg4S4I4Col2"]),
  btnPg5S4I39More: ex(["Pg5S4I39Col1", "Pg5S4I38Col1", "Pg5S4I37Col1", "Pg5S4I36Col1"], ["Pg5S4I39Col2", "Pg5S4I38Col2", "Pg5S4I37Col2", "Pg5S4I36Col2"]),
  btnPg5S5I4More: ex(
    ["Pg5S5I4Col1", "Pg5S5I4Col2", "Pg5S5I3Col1", "Pg5S5I3Col2", "Pg5S5I2Col1", "Pg5S5I2Col2", "Pg5S5I1Col1", "Pg5S5I1Col2"],
    ["Pg5S5I4Col3", "Pg5S5I3Col3", "Pg5S5I2Col3", "Pg5S5I1Col3"],
  ),
  btnPg5S6I3More: ex(["Pg5S6I3Col1", "Pg5S6I2Col1"], ["Pg5S6I3Col2", "Pg5S6I2Col2"]),
  btnPg5S6I6More: ex(["Pg5S6I6Col1", "Pg5S6I5Col1"], ["Pg5S6I6Col2", "Pg5S6I5Col2"]),
  btnPg5S6I8More: ex(["Pg5S6I8Col1", "Pg5S6I7Col1"], ["Pg5S6I8Col2", "Pg5S6I7Col2"]),
  // checkPg7AddMore: both text boxes of the item, no amount, and no "keep" (BIR only checks the two boxes)
  btnPg7S9Pt2More: { text: id(EX, "txtPg7Sc9I5DescriptionofPropertyC1", "txtPg7Sc9I5DescriptionofPropertyC2"), amount: [], keep: false },
  btnPg7S9Pt3More: { text: id(EX, "txtPg7Sc9I10PSCSC1", "txtPg7Sc9I10PSCSC2"), amount: [], keep: false },
  btnPg7S9Pt4More: { text: id(EX, "txtPg7Sc9I16OtherIncomeC1", "txtPg7Sc9I16OtherIncomeC2"), amount: [], keep: false },
  btnPg7S9Pt5More: { text: id(EX, "txtPg7Sc10I2DescriptionofPropertyC1", "txtPg7Sc10I2DescriptionofPropertyC2"), amount: [], keep: false },
  btnPg7S9Pt6More: { text: id(EX, "txtPg7Sc10I6OtherExemptC1", "txtPg7Sc10I6OtherExemptC2"), amount: [], keep: false },
};

/** 1702-EX 2018 editions (the superseded and the current one carry the same ids and conditions). */
export const GATE_EX2018: Record<string, Gate> = {
  btnPg3Pt6S1I17More: ex(
    ["Pg3Pt6I17OthersDDesc", "Pg3Pt6I17OthersEDesc", "Pg3Pt6I17OthersFDesc", "Pg3Pt6I17OthersGDesc", "Pg3Pt6I17OthersHDesc", "Pg3Pt6I17OthersIDesc"],
    ["Pg3Pt6I17OthersDAmt", "Pg3Pt6I17OthersEAmt", "Pg3Pt6I17OthersFAmt", "Pg3Pt6I17OthersGAmt", "Pg3Pt6I17OthersHAmt", "Pg3Pt6I17OthersIAmt"],
  ),
  btnPg3Pt6S2I4More: ex(
    ["Pg3Pt6S2I1Description", "Pg3Pt6S2I1LegalBasis", "Pg3Pt6S2I2Description", "Pg3Pt6S2I2LegalBasis", "Pg3Pt6S2I3Description", "Pg3Pt6S2I3LegalBasis", "Pg3Pt6S2I4Description", "Pg3Pt6S2I4LegalBasis"],
    ["Pg3Pt6S2I1Amount", "Pg3Pt6S2I2Amount", "Pg3Pt6S2I3Amount", "Pg3Pt6S2I4Amount"],
  ),
  btnPg3Pt6S3I3More: ex(["Pg3Pt6S3I2NonDeductExpenseOtherIncomeDesc", "Pg3Pt6S3I3NonDeductExpenseOtherIncomeDesc"], ["Pg3Pt6S3I2NonDeductExpenseOtherIncomeAmt", "Pg3Pt6S3I3NonDeductExpenseOtherIncomeAmt"]),
  btnPg3Pt6S3I6More: ex(["Pg3Pt6S3I5NonTaxIncomeAndIncomeSubjectToFinTaxDesc", "Pg3Pt6S3I6NonTaxIncomeAndIncomeSubjectToFinTaxDesc"], ["Pg3Pt6S3I5NonTaxIncomeAndIncomeSubjectToFinTaxAmt", "Pg3Pt6S3I6NonTaxIncomeAndIncomeSubjectToFinTaxAmt"]),
  btnPg3Pt6S3I8More: ex(["Pg3Pt6S3I7SpecialDeductDesc", "Pg3Pt6S3I8SpecialDeductDesc"], ["Pg3Pt6S3I7SpecialDeductAmt", "Pg3Pt6S3I8SpecialDeductAmt"]),
};
