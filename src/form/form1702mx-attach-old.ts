// The 1702MX (2013 layout) attachment copies' compute chain, ported under BIR's names (BIR-Form1702MX.hta, "Attachments
// Page 1m to 4m"). Each takes the copy's name ("EX1", "SP2") where BIR passes `attachNum`; every chain ends in the main
// form's Schedule 1 (computePg3Sc1I*), which now sums the copies. OldSim extends this.
import { BOX, copyId, type Box } from "./form1702mx-attach.ts";
import { BirDom, NegativeValue, NumWithComma, NumWithParenthesis, formatCurrencyWOC } from "./form1702mx-bir.ts";

const IPA_LIST = ["PEZA", "ECOZONE", "BCDA", "SBMA", "CDC", "PPMC", "JHSEZ", "MSEZ", "CEZA", "ZCSEZA", "APECO", "AFAB", "TEZ", "EPZA", "MEPZA"];
const LEGAL_BASIS_LIST = ["RA7227", "7227", "RA9400", "9400", "RA7916", "7916", "RA8748", "8748", "RA7922", "7922", "RA7903", "7903", "RA9490", "9490", "RA10083", "10083", "RA9728", "9728", "RA9593", "9593"];
const LEGAL_RA10693 = ["RA10693", "10693", "R.A.10693", "RA.10693", "R.A10693", "RA 10693", "R.A. 10693", "RA. 10693", "R.A 10693"];

export abstract class OldCopy extends BirDom {
  /** BIR's `tempVarForSc1I12` (also written by populatePg1AttachScBI11). */
  abstract tempVarForSc1I12: boolean;
  abstract product(param1: string, param2: string, out: string): void;
  abstract computePg3Sc1I1(): void;
  abstract computePg3Sc1I2(): void;
  abstract computePg3Sc1I4(): void;
  abstract computePg3Sc1I6(): void;
  abstract computePg3Sc1I7(): void;
  abstract computePg3Sc1I8(): void;
  abstract computePg3Sc1I12(): void;

  validateMonth(e: string): void {
    const n = Number(this.g(e)) * 1;
    if (this.g(e) !== "" && (n < 1 || n > 12)) this.set(e, "");
  }

  // Schedule B
  computePg1AttachScBI3(a: string): void {
    this.summationThenDifference(`txtPg1${a}ScBI1`, `txtPg1${a}ScBI2`, "hidden", `txtPg1${a}ScBI3`);
  }
  computePg1AttachScBI5(a: string): void {
    this.summationTo(`txtPg1${a}ScBI3,txtPg1${a}ScBI4`, `txtPg1${a}ScBI5`);
    this.computePg1AttachScBI10(a);
    this.computePg1AttachScBI12(a);
  }
  computePg1AttachScBI9(a: string): void {
    this.summationTo(`txtPg1${a}ScBI6,txtPg1${a}ScBI7,txtPg1${a}ScBI8`, `txtPg1${a}ScBI9`);
    this.computePg1AttachScBI10(a);
    this.computePg1AttachScBI12(a);
  }
  computePg1AttachScBI10(a: string): void {
    this.summationTo(`txtPg1${a}ScBI6,txtPg1${a}ScBI7,txtPg1${a}ScBI8`, `txtPg1${a}ScBI9`);
    this.summationThenDifference(`txtPg1${a}ScBI5`, `txtPg1${a}ScBI9`, "hidden", `txtPg1${a}ScBI10`);
    this.computePg1AttachScCI1(a);
  }
  populatePg1AttachScBI11(a: string): void {
    this.tempVarForSc1I12 = false;
    const item4 = this.g(`txtPg1${a}ScAI4`);
    const ipa = this.g(`txtPg1${a}ScAI1`).toUpperCase();
    const legal = this.g(`txtPg1${a}ScAI2`).toUpperCase().replace(/[. ]/g, "");
    const atc = this.g("drpPg1I5ATCR2");
    const isPEZABCDAorECOZONE5 = (IPA_LIST.includes(ipa) || LEGAL_BASIS_LIST.includes(legal)) && Number(item4) * 1 === 5;
    const isTaxCode10Percent = ipa.replace(/[. ]/g, "") === "TAXCODE" && Number(item4) * 1 === 10;
    const isIC030or031or101 = !!this.chk.chkPg1I5ATCR2 && ["IC030", "IC031", "IC101"].includes(atc);
    const isRA10693 = LEGAL_RA10693.includes(legal);
    const isIC010 = !!this.chk.chkPg1I5ATCR2 && atc === "IC010";
    const ipaBare = ipa.replace(/[. ]/g, "");
    const isRA9513and10Percent = (ipaBare === "RA9513" || ipaBare === "9513" || legal === "RA9513" || legal === "9513") && Number(item4) * 1 === 10;
    const special = a.includes("SP");
    if (isPEZABCDAorECOZONE5 && special) {
      this.set(`txtPg1${a}ScBI11`, item4);
    } else if (isTaxCode10Percent && isIC030or031or101 && special) {
      this.set(`txtPg1${a}ScBI11`, item4);
      this.openScheduleI(a);
    } else if (isRA9513and10Percent && isIC010 && special) {
      this.set(`txtPg1${a}ScBI11`, item4);
      this.openScheduleI(a);
    } else if (isRA10693) {
      this.set(`txtPg1${a}ScAI4`, "2.0");
      this.set(`txtPg1${a}ScBI11`, this.g(`txtPg1${a}ScAI4`));
    } else {
      this.set(`txtPg1${a}ScBI11`, item4);
      this.closeScheduleI(a);
    }
    this.blur(`txtPg1${a}ScBI11`);
    this.computePg1AttachScBI12(a);
  }
  /** $("#<copy>ScheduleI :input") / ScheduleIA of copy `a`: its boxes, in DOM order. */
  private scheduleBox(a: string, part: "I" | "IA"): Box[] {
    return BOX["1702MX"].filter((b) => b.inside.includes(`AttMSchedule${part}`)).map((b) => ({ ...b, id: copyId(b.id, a) }));
  }
  /** The else branch of populatePg1AttachScBI11: every Schedule I / IA box zeroed (IA text boxes blanked) and disabled. */
  closeScheduleI(a: string): void {
    for (const b of this.scheduleBox(a, "I")) this.set(b.id, "0");
    const ia = this.scheduleBox(a, "IA");
    for (const b of ia) this.set(b.id, "0");
    for (const b of ia) if (!b.numbertext) this.set(b.id, "");
    for (const b of [...this.scheduleBox(a, "I"), ...ia]) this.dis[b.id] = true;
  }
  /** Schedule I / IA boxes (except the ones BIR marks `notenabled`) are enabled for a special-rate copy. */
  openScheduleI(a: string): void {
    for (const b of [...this.scheduleBox(a, "I"), ...this.scheduleBox(a, "IA")]) if (!b.notenabled) this.dis[b.id] = false;
  }
  computePg1AttachScBI12(a: string): void {
    this.set("hidden", String((Number(this.g(`txtPg1${a}ScBI11`)) * 1) / 100));
    const legal = this.g(`txtPg1${a}ScAI2`).toUpperCase().replace(/[. ]/g, "");
    const bi10 = NumWithComma(NumWithParenthesis(this.g(`txtPg1${a}ScBI10`)));
    const pezaAnd5 = IPA_LIST.includes(this.g(`txtPg1${a}ScAI1`).toUpperCase()) && Number(this.g(`txtPg1${a}ScAI4`)) * 1 === 5;
    const isRA10693 = LEGAL_RA10693.includes(legal);
    if (pezaAnd5 && a.includes("SP")) this.product(`txtPg1${a}ScBI5`, "hidden", `txtPg1${a}ScBI12`);
    else if (isRA10693) this.product(`txtPg1${a}ScBI1`, "hidden", `txtPg1${a}ScBI12`);
    else if (bi10 > 0) this.product(`txtPg1${a}ScBI10`, "hidden", `txtPg1${a}ScBI12`);
    else this.set(`txtPg1${a}ScBI12`, "0");
    this.set("hidden", "0");
    this.computePg3Sc1I12();
  }

  // Schedule C
  computePg1AttachScCI1(a: string): void {
    const bi10 = NumWithComma(NumWithParenthesis(this.g(`txtPg1${a}ScBI10`)));
    if (bi10 > 0) this.product(`txtPg1${a}ScBI10`, "hidden30", `txtPg1${a}ScCI1`);
    else this.set(`txtPg1${a}ScCI1`, "0");
    this.computePg1AttachScCI3(a);
  }
  computePg1AttachScCI2(a: string): void {
    this.product(`txtPg4${a}ScHI5`, "hidden30", `txtPg1${a}ScCI2`);
    this.computePg1AttachScCI3(a);
  }
  computePg1AttachScCI3(a: string): void {
    this.summationTo(`txtPg1${a}ScCI1,txtPg1${a}ScCI2`, `txtPg1${a}ScCI3`);
    this.populatePg1AttachScCI5(a);
  }
  populatePg1AttachScCI4(a: string): void {
    this.set(`txtPg1${a}ScCI4`, this.g(`txtPg1${a}ScBI12`));
    this.populatePg1AttachScCI5(a);
  }
  populatePg1AttachScCI5(a: string): void {
    this.summationThenDifference(`txtPg1${a}ScCI3`, `txtPg1${a}ScCI4`, "hidden", `txtPg1${a}ScCI5`);
    this.computePg1AttachScCI7(a);
  }
  computePg1AttachScCI7(a: string): void {
    this.getSum(`txtPg1${a}ScCI5,txtPg1${a}ScCI6`, `txtPg1${a}ScCI7`);
  }

  // Schedule D
  computePg2AttachScDI6(a: string): void {
    const sum = `txtPg2${a}ScDI1,txtPg2${a}ScDI2,txtPg2${a}ScDI3`;
    this.summationThenDifference(sum, `txtPg2${a}ScDI5`, `txtPg2${a}ScDI4`, `txtPg2${a}ScDI6`);
    this.summationThenDifference(sum, `txtPg2${a}ScDI5`, `txtPg2${a}ScDI4`, `txtPg1${a}ScBI1`);
    this.computePg1AttachScBI3(a);
    this.computePg1AttachScBI5(a);
    this.computePg3Sc1I1();
  }

  // Schedule E
  computePg2AttachScE1I5(a: string): void {
    this.summationThenDifference(`txtPg2${a}ScE1I1,txtPg2${a}ScE1I2`, `txtPg2${a}ScE1I4`, `txtPg2${a}ScE1I3`, `txtPg2${a}ScE1I5`);
  }
  computePg2AttachScE2I19(a: string): void {
    this.summationThenDifference(`txtPg2${a}ScE2I6,txtPg2${a}ScE2I7`, `txtPg2${a}ScE2I9`, `txtPg2${a}ScE2I8`, `txtPg2${a}ScE2I10`);
    this.summationTo(`txtPg2${a}ScE2I10,txtPg2${a}ScE2I11,txtPg2${a}ScE2I12`, `txtPg2${a}ScE2I13`);
    this.summationThenDifference(`txtPg2${a}ScE2I13,txtPg2${a}ScE2I14`, `txtPg2${a}ScE2I15`, "hidden", `txtPg2${a}ScE2I16`);
    this.summationThenDifference(`txtPg2${a}ScE2I16,txtPg2${a}ScE2I17`, `txtPg2${a}ScE2I18`, "hidden", `txtPg2${a}ScE2I19`);
  }
  computePg2AttachScE3I26(a: string): void {
    this.summationTo([20, 21, 22, 23, 24, 25].map((n) => `txtPg2${a}ScE3I${n}`).join(","), `txtPg2${a}ScE3I26`);
  }
  computePg2AttachScE3I27(a: string): void {
    this.computePg2AttachScE1I5(a);
    this.computePg2AttachScE2I19(a);
    this.computePg2AttachScE3I26(a);
    const part = `txtPg2${a}ScE1I5,txtPg2${a}ScE2I19,txtPg2${a}ScE3I26`;
    this.summationTo(part, `txtPg2${a}ScE3I27`);
    this.summationTo(part, `txtPg1${a}ScBI2`);
    this.computePg1AttachScBI3(a);
    this.computePg1AttachScBI5(a);
    this.computePg3Sc1I2();
  }

  // Schedules F, G, H, I, IA
  computePg3AttachScFI4(a: string): void {
    const part = `txtPg3${a}ScFI1C1,txtPg3${a}ScFI2C1,txtPg3${a}ScFI3C1`;
    this.summationTo(part, `txtPg3${a}ScFI4C1`);
    this.getSum(part, `txtPg1${a}ScBI4`);
    this.computePg1AttachScBI5(a);
    this.computePg3Sc1I4();
  }
  computePg4AttachScGI40(a: string): void {
    const id = [`txtPg3${a}ScGI1`, `txtPg3${a}ScGI2C1`, `txtPg3${a}ScGI3C1`, `txtPg3${a}ScGI4C1`];
    for (let n = 5; n <= 29; n++) id.push(`txtPg3${a}ScGI${n}`);
    for (let n = 30; n <= 35; n++) id.push(`txtPg4${a}ScGI${n}`);
    for (let n = 36; n <= 39; n++) id.push(`txtPg4${a}ScGI${n}C1`);
    this.summationTo(id.join(","), `txtPg4${a}ScGI40`);
    this.summationTo(id.join(","), `txtPg1${a}ScBI6`);
    this.computePg1AttachScBI9(a);
    this.computePg3Sc1I6();
  }
  computePg4AttachScHI5(a: string): void {
    const part = [1, 2, 3, 4].map((n) => `txtPg4${a}ScHI${n}C3`).join(",");
    this.summationTo(part, `txtPg4${a}ScHI5`);
    this.summationTo(part, `txtPg1${a}ScBI7`);
    this.computePg1AttachScBI9(a);
    this.computePg1AttachScCI2(a);
    this.computePg3Sc1I7();
  }
  computePg4AttachScIAI4(a: string): void {
    this.set(`txtPg4${a}ScIAI4year`, 2000 + Number(this.g("txtPg1I2YearEnd")) * 1);
    const netLoss = NumWithComma(NumWithParenthesis(this.g(`txtPg4${a}ScII3`)));
    if (netLoss < 0) this.set(`txtPg4${a}ScIAI4CA`, formatCurrencyWOC(Math.abs(netLoss)));
    else {
      this.set(`txtPg4${a}ScIAI4CA`, "0");
      this.set(`txtPg4${a}ScIAI4CD`, "0");
    }
    this.computePg4AttachScIAI8(a);
  }
  computePg4AttachScII3(a: string): void {
    this.getDifference(`txtPg4${a}ScII1`, `txtPg4${a}ScII2`, `txtPg4${a}ScII3`);
    this.computePg4AttachScIAI4(a);
  }
  computePg4AttachScIAI4CE(a: string): void {
    const columnA = NumWithComma(NumWithParenthesis(this.g(`txtPg4${a}ScIAI4CA`)));
    const columnD = NumWithComma(NumWithParenthesis(this.g(`txtPg4${a}ScIAI4CD`)));
    if (columnD > columnA) this.set(`txtPg4${a}ScIAI4CD`, "0");
    else this.getDifference(`txtPg4${a}ScIAI4CA`, `txtPg4${a}ScIAI4CB,txtPg4${a}ScIAI4CC,txtPg4${a}ScIAI4CD`, `txtPg4${a}ScIAI4CE`);
    this.computePg4AttachScIAI4(a);
  }
  private computeIACE(n: 5 | 6 | 7, a: string): void {
    const p = `txtPg4${a}ScIAI${n}`;
    const columnA = NumWithComma(NumWithParenthesis(this.g(`${p}CA`)));
    const columnD = NumWithComma(NumWithParenthesis(this.g(`${p}CD`)));
    const totalBCD = this.getSum(`${p}CB,${p}CC,${p}CD`, "hidden");
    if (columnD > columnA) this.set(`${p}CD`, "0");
    else if (totalBCD > columnA) for (const c of ["CB", "CC", "CD"]) this.set(`${p}${c}`, "0");
    else this.getDifference(`${p}CA`, `${p}CB,${p}CC,${p}CD`, `${p}CE`);
    this.computePg4AttachScIAI4(a);
    this.set("hidden", "0");
  }
  computePg4AttachScIAI5CE(_e: string, a: string): void {
    this.computeIACE(5, a);
  }
  computePg4AttachScIAI6CE(_e: string, a: string): void {
    this.computeIACE(6, a);
  }
  computePg4AttachScIAI7CE(_e: string, a: string): void {
    this.computeIACE(7, a);
  }
  computePg4AttachScIAI8(a: string): void {
    const part = [4, 5, 6, 7].map((n) => `txtPg4${a}ScIAI${n}CD`).join(",");
    this.summationTo(part, `txtPg4${a}ScIAI8CD`);
    this.summationTo(part, `txtPg1${a}ScBI8`);
    this.computePg1AttachScBI9(a);
    this.computePg3Sc1I8();
  }
}

export { NegativeValue };
