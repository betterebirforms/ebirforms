// An amount typed into a 1702-RT / 1702-EX "(Add more...)" row is saved as BIR's page holds it after its own onblur
// (checkNumValue + addCommas on the RT editions, toComma / round on the EX ones), through saveXML (the EX editions
// strip the commas of a maxlength-12/15 box). Every row amount of every group is typed in BIR's own pop-up, and the
// native row, typed through FormSchema.typed and saved by formRecords, must hold the same text.
// Needs BIR's tree (vendor/original) and WebKit; skips otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_FORM } from "@/form/registry.ts";
import { BUTTON_GROUP } from "@/form/picker.ts";
import { formRecords, rowFieldId, typedMoney } from "@/form/schema.ts";
import { hasForm, startOracle } from "./oracle.ts";

const FORM = ["1702RT", "1702RTv2018", "1702RTv2018C", "1702EX", "1702EXv2018", "1702EXv2018C"];
// round and non-round amounts, a pasted decimal, a negative, parentheses, zero, blank
const RAW = ["100000", "1234567", "1234.56", "50", "1000.5", "0", "-5", "(5)", ""];

describe.skipIf(!FORM.every(hasForm))("1702-RT / 1702-EX group amounts are saved as BIR saves them", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
  });

  it.each(FORM)("%s", async (code) => {
    const schema = NATIVE_FORM[code]!.schema;
    const miss: string[] = [];
    let checked = 0;
    const none: string[] = [];
    const open = async () => (await oracle.openSaved(schema, {}, `84653210700000-${code}-typed.xml`, {})).page;
    let page = await open();
    for (const [button, { group: name }] of Object.entries(BUTTON_GROUP[code] ?? {})) {
      // the 2013 EX pop-ups share one dialog, which keeps the last table: a fresh page for each
      if (code === "1702EX" && button !== Object.keys(BUTTON_GROUP[code]!)[0]) (await page.close(), (page = await open()));
      const group = schema.group!.find((g) => g.name === name)!;
      const money = group.row.filter((s) => s.kind === "money");
      const id = money.map((s) => rowFieldId(s.id, group.first_index));
      // BIR's pop-up opens with the box its Add makes: one fresh row, typed into as a filer would
      const legacy: Record<string, Record<string, string>> = await page.evaluate(async ([button, id, raw]) => {
        const w = window as unknown as Record<string, unknown> & { currentModal?: string };
        const b = document.getElementById(button!) as HTMLInputElement;
        b.disabled = false;
        const before = new Set(Array.from(document.querySelectorAll("input")));
        b.click();
        await new Promise((r) => setTimeout(r, 200));
        const div = (w as Record<string, unknown>)["AddRow_modalTable" + button!.replace(/.*btnModal/, "")];
        if (/btnModal/.test(button!) && typeof div === "function") (div as () => void)();
        else if (/^btnPg/.test(button!) && !/^btnPg7/.test(button!) && w.currentModal && typeof w.addRowModalTable === "function") (w.addRowModalTable as () => void)();
        else Array.from(document.querySelectorAll<HTMLInputElement>("input[type=button]")).find((e) => e.offsetParent !== null && /^\s*add/i.test(e.value) && !/\.\.\./.test(e.value))?.click();
        await new Promise((r) => setTimeout(r, 200));
        const out: Record<string, Record<string, string>> = {};
        for (const i of id!) {
          const el = document.getElementById(i) as HTMLInputElement | null;
          if (!el || before.has(el) || el.disabled) continue; // a computed column (Sch 6A C6) is greyed out in BIR
          // EX 2013 Sch 9 Part III's number-of-shares box has no amount blur (BIR keeps the digits as typed)
          if (!/toComma|checkNumValue|round/.test(el.getAttribute("onblur") ?? "")) continue;
          out[i] = {};
          for (const r of raw!) {
            el.value = r;
            el.dispatchEvent(new FocusEvent("blur"));
            let v = el.value;
            // saveXML's maxlength-12/15 branch (the EX editions): no commas, parentheses as a minus sign
            if (/EX/.test(location.href) && (el.maxLength === 12 || el.maxLength === 15)) {
              v = v.replace(/,/g, "");
              if (v.includes("(") && v.includes(")")) v = v.replace("(", "-").replace(")", "");
            }
            out[i]![r] = v;
          }
        }
        for (const c of Array.from(document.querySelectorAll<HTMLInputElement>("input[type=button]")).filter((e) => e.offsetParent !== null && /^\s*(close|cancel)\s*$/i.test(e.value))) c.click();
        return out;
      }, [button, id, RAW] as const);
      for (const sub of money) {
        const key = rowFieldId(sub.id, group.first_index);
        const typed = legacy[key];
        if (!typed) {
          if (!money.some((m) => legacy[rowFieldId(m.id, group.first_index)])) none.push(button);
          continue;
        }
        for (const raw of RAW) {
          const row = Object.fromEntries(group.row.map((s) => [s.id, s.kind === "money" ? "0" : "X"]));
          row[sub.id] = typedMoney(schema, raw);
          const saved = formRecords(schema, {}, { [name]: [row] }).find((r) => r.key === key)?.value;
          checked++;
          if (saved !== typed[raw]) miss.push(`${key} typed ${JSON.stringify(raw)}: native ${JSON.stringify(saved)} vs BIR ${JSON.stringify(typed[raw])}`);
        }
      }
    }
    await page.close();
    expect([...new Set(none)], "pop-ups with no amount box found").toEqual([]);
    expect(miss).toEqual([]);
  }, 600_000);
});
