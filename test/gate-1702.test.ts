// When BIR turns on the "(Add more...)" buttons of the 1702-RT / 1702-EX families (src/form/gate1702.ts).
//   unit   : each button's condition, from its own boxes (trim for text, zero test for amounts) and its group's rows;
//   oracle : the same condition against BIR's page. Every box of a button's gate is typed in DOM order, as a filer
//            would, and after each blur the button's `disabled` must equal !on(). Then the last amount is zeroed and
//            the last text blanked. Needs BIR's tree (vendor/original) and WebKit; skips otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_FORM } from "@/form/registry.ts";
import { BUTTON_GROUP } from "@/form/picker.ts";
import { GATE_EX, GATE_EX2018, GATE_RT, GATE_RT2018, type Gate } from "@/form/gate1702.ts";
import type { FormState, GroupState } from "@/form/schema.ts";
import { hasForm, startOracle } from "./oracle.ts";

const TABLE: Record<string, Record<string, Gate>> = {
  "1702RT": GATE_RT,
  "1702RTv2018": GATE_RT2018,
  "1702RTv2018C": GATE_RT2018,
  "1702EX": GATE_EX,
  "1702EXv2018": GATE_EX2018,
  "1702EXv2018C": GATE_EX2018,
};
/** Never greyed out in BIR's markup. */
const ALWAYS = new Set(["btnPg8Sc12I4More", "Pg7S9Pt1More"]);
const on = (code: string, button: string) => BUTTON_GROUP[code]![button]!.on!;

describe.each(Object.keys(TABLE))("%s: every button has BIR's gate, every box of it is a real field", (code) => {
  const schema = NATIVE_FORM[code]!.schema;
  const field = new Set(schema.field.map((f) => f.id));
  it("the gate table covers the buttons and names only fields of the schema", () => {
    for (const button of Object.keys(BUTTON_GROUP[code]!)) expect(button in TABLE[code]! || ALWAYS.has(button), button).toBe(true);
    for (const [button, gate] of Object.entries(TABLE[code]!)) {
      expect(button in BUTTON_GROUP[code]!, button).toBe(true);
      for (const id of [...gate.text, ...gate.amount]) expect(field.has(id), `${button}: ${id}`).toBe(true);
    }
  });
  it("greyed out on a blank form, except the two buttons BIR never greys", () => {
    for (const button of Object.keys(BUTTON_GROUP[code]!)) expect(on(code, button)({}, {}), button).toBe(ALWAYS.has(button));
  });
});

describe.each(Object.keys(TABLE))("%s gate rules", (code) => {
  const [button, gate] = Object.entries(TABLE[code]!).find(([, g]) => g.keep !== false && g.amount.length >= 1)!;
  const name = BUTTON_GROUP[code]![button]!.group;
  const full: FormState = { ...Object.fromEntries(gate.text.map((id) => [id, "ITEM"])), ...Object.fromEntries(gate.amount.map((id) => [id, "1,000"])) };
  const test = on(code, button);
  it("on once every text is filled and every amount is not zero", () => expect(test({}, full)).toBe(true));
  it("off when one text is blank or only spaces (BIR trims)", () => {
    for (const id of gate.text) expect(test({}, { ...full, [id]: "  " }), id).toBe(false);
  });
  it("off when one amount is zero, 0.00 or blank", () => {
    for (const id of gate.amount) for (const v of ["0", "0.00", ""]) expect(test({}, { ...full, [id]: v }), `${id} ${v}`).toBe(false);
  });
  it("stays on once the pop-up holds a row, whatever the boxes say", () => {
    const rows: GroupState = { [name]: [{}] };
    expect(test(rows, {})).toBe(true);
    expect(test({ [name]: [] }, {})).toBe(false);
  });
});

describe("edition specifics", () => {
  it("RT: a negative amount in brackets counts (NumWithParenthesis), a comma amount counts, 0,000 does not", () => {
    const [button, gate] = ["btnPg4Sc3I3More", GATE_RT.btnPg4Sc3I3More!] as const;
    const t = (v: string) => on("1702RT", button)({}, { [gate.text[0]!]: "X", [gate.amount[0]!]: v });
    expect([t("(5)"), t("1,234"), t("0,000"), t("0")]).toEqual([true, true, false, false]);
  });
  it("EX: `value * 1 == 0`: a comma amount is NaN, so it counts as filled in", () => {
    const gate = GATE_EX.btnPg5S6I3More!;
    const state: FormState = { ...Object.fromEntries(gate.text.map((id) => [id, "X"])), ...Object.fromEntries(gate.amount.map((id) => [id, "1,000"])) };
    expect(on("1702EX", "btnPg5S6I3More")({}, state)).toBe(true);
    expect(on("1702EX", "btnPg5S6I3More")({}, { ...state, [gate.amount[0]!]: "0.00" })).toBe(false);
  });
  it("EX 2013 Schedule 9 / 10: two text boxes and nothing else, and the rows do not keep it on", () => {
    const gate = GATE_EX.btnPg7S9Pt2More!;
    const state: FormState = Object.fromEntries(gate.text.map((id) => [id, "X"]));
    expect(on("1702EX", "btnPg7S9Pt2More")({}, state)).toBe(true);
    expect(on("1702EX", "btnPg7S9Pt2More")({ sc9_2: [{}] }, {})).toBe(false);
  });
});

describe.skipIf(!Object.keys(TABLE).every(hasForm))("the gate against BIR's page", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
  });

  it.each(Object.keys(TABLE))("%s: BIR's button follows on() box by box", async (code) => {
    const schema = NATIVE_FORM[code]!.schema;
    const miss: string[] = [];
    const open = async () => (await oracle.openSaved(schema, {}, `84653210700000-${code}-gate.xml`, {})).page;
    let page = await open();
    for (const button of Object.keys(BUTTON_GROUP[code]!)) {
      page = await (async () => (await page.close(), open()))();
      const gate = TABLE[code]![button];
      const ids = gate ? [...gate.text, ...gate.amount] : [];
      const trace: Array<{ at: string; disabled: boolean; value: Record<string, string> }> = await page.evaluate(
        ([button, ids, text]) => {
          const btn = document.getElementById(button!) as HTMLInputElement;
          const box = ids!.map((i) => document.getElementById(i) as HTMLInputElement).filter(Boolean);
          const read = () => Object.fromEntries(box.map((e) => [e.id, e.value]));
          const out = [{ at: "blank", disabled: btn.disabled, value: read() }];
          box.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
          const put = (e: HTMLInputElement, v: string, at: string) => {
            e.disabled = false;
            e.value = v;
            e.dispatchEvent(new FocusEvent("blur"));
            out.push({ at, disabled: btn.disabled, value: read() });
          };
          for (const e of box) put(e, text!.includes(e.id) ? (/Date/.test(e.id) ? "03/15/2017" : e.maxLength === 4 ? "2015" : "ITEM") : "1000", e.id);
          const amount = box.filter((e) => !text!.includes(e.id));
          const word = box.filter((e) => text!.includes(e.id));
          if (amount.length) put(amount[amount.length - 1]!, "0", "last amount zero");
          if (amount.length) put(amount[amount.length - 1]!, "1000", "last amount back");
          // the 2018 text boxes do not re-test the link when they blur (only the amount box does), so blur the amount after
          if (word.length) put(word[word.length - 1]!, "  ", "last text blank");
          if (word.length && amount.length) put(amount[amount.length - 1]!, "1000", "last text blank, amount blurred");
          return out;
        },
        [button, ids, gate?.text ?? []] as const,
      );
      for (const step of trace.filter((t) => !(/2018/.test(code) && t.at === "last text blank"))) {
        const expected = on(code, button)({}, step.value);
        if (step.disabled === expected) miss.push(`${button} after ${step.at}: BIR ${step.disabled ? "off" : "on"}, native ${expected ? "on" : "off"}`);
      }
    }
    await page.close();
    expect(miss).toEqual([]);
  }, 600_000);
});
