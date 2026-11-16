// Generates src/form/attachment/1702mx-<edition>.ts (2018, 2018c, 2018cxx): BIR's own attachment compute functions
// (computeToMain* and the computePg*Attach* family of BIR-Form1702MXv2018*.hta), moved statement by statement into
// TypeScript on the form's simulation (this.g / this.set / this.chk / this.dis stand for $_Id(...).value / .checked /
// .disabled). The ~2,600 lines of computeToMain* are one pattern repeated plus the irregular cases; generating them
// keeps BIR's per-copy arrays and its sc5count / countEX state exactly as BIR wrote them. The three editions' code
// differs (2018 and Cxx keep BIR's older splice-based arrays), so each gets its own file. Needs BIR's tree
// (vendor/original, built by `npm run extract`); the generated files are committed so the gate does not.
//   node tool/gen-1702mx-attach.mjs            # writes the three files
//   node tool/gen-1702mx-attach.mjs --check    # exit 1 when a committed file is stale
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const EDITION = { "2018": "1702MXv2018", "2018c": "1702MXv2018C", "2018cxx": "1702MXv2018Cxx" };
const edition = process.env.EDITION;
if (!edition) {
  let stale = false;
  for (const e of Object.keys(EDITION)) {
    try {
      execFileSync(process.execPath, [new URL(import.meta.url).pathname, ...process.argv.slice(2)], { env: { ...process.env, EDITION: e }, stdio: "inherit" });
    } catch {
      stale = true;
    }
  }
  process.exit(stale ? 1 : 0);
}
const HTA = `vendor/original/forms/BIR-Form${EDITION[edition]}.hta`;
const OUT = `src/form/attachment/1702mx-${edition}.ts`;
const src = fs.readFileSync(HTA, "latin1");

// ── the script text, comments removed ──
const scriptText = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
function stripComment(text) {
  let out = "";
  let i = 0;
  let quote = "";
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === quote) quote = "";
      i++;
    } else if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else {
      if (c === "'" || c === '"') quote = c;
      out += c;
      i++;
    }
  }
  return out;
}
// automatic semicolon insertion: `x.value = y.value` then a call on the next line
const code = stripComment(scriptText).replace(/(\.value)[ \t]*\n(\s*[A-Za-z_]\w*\()/g, "$1;\n$2");

// ── functions by name ──
function bodyOf(from) {
  let depth = 0;
  let quote = "";
  for (let i = from; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  throw new Error("unbalanced");
}
const fn = new Map();
for (const m of code.matchAll(/(?:^|\n)[ \t]*function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g)) {
  const start = m.index + m[0].length - 1;
  fn.set(m[1], { param: m[2].split(",").map((x) => x.trim()).filter(Boolean), body: code.slice(start, bodyOf(start)) });
}
const WANT = new Set(["computeToMain", "computeToMainScD", "computeToMainScE", "computeToMainScF", "computeToMainScF1", "computeToMainI14", "computePg2mAttachScDI18", "isVarious", "initialAmount", "getFieldValue"]);
for (const name of fn.keys()) if (/^(computePg\d?m?Attach\w*|populatePg1AttachSc(CI4|CI5))$/.test(name)) WANT.add(name);
// the ones the form ports by hand (jQuery / DOM work)
const HAND = new Set(["populatePg1AttachScBI13"]);
for (const name of HAND) WANT.delete(name);

// ── BIR's globals the functions keep state in ──
const globalName = new Set();
const globalInit = new Map();
for (const m of code.matchAll(/^[ \t]*var\s+((?:arr[A-Z]|sc5count|countEX|countSP)\w*)\s*=\s*([^;\n]+);?/gm)) {
  globalName.add(m[1]);
  globalInit.set(m[1], m[2].trim());
}

// ── names that are not methods ──
const IMPORTED = new Set(["NumWithComma", "NumWithParenthesis", "NegativeValue", "formatCurrencyWOC", "formatCurrency", "removeCommaParenthesis", "convertToNumber", "isNumeric", "WholeNumWithComma"]);
const RENAME = { summation: "summationTo" };
const GLOBAL_FN = new Set(["parseInt", "parseFloat", "isNaN", "Number", "String", "Math", "Array", "Object", "if", "for", "while", "switch", "return", "typeof", "function", "catch"]);

const problem = [];
const called = new Set();
function lower(name, param, body) {
  let t = body;
  // element reads / writes by id: "frm1702MX:" + rest
  const idOf = (expr) => {
    const e = expr.trim();
    const m = /^(["'])frm1702MX:([^"']*)\1\s*(?:\+\s*([^]*))?$/.exec(e);
    if (m) return m[3] ? (m[2] ? `"${m[2]}" + ${m[3]}` : m[3]) : `"${m[2]}"`;
    const bare = /^(["'])([^"']*)\1$/.exec(e);
    if (bare) return `"${bare[2]}"`;
    problem.push(`${name}: element id ${e}`);
    return e;
  };
  const elem = String.raw`(?:\$_Id|d\.getElementById|document\.getElementById)\(([^()]*)\)`;
  // focus work has no effect on a value
  t = t.replace(new RegExp(`${elem}\\.select\\(\\);?`, "g"), "");
  t = t.replace(/\b(?:elem|fieldID)\.select\(\);?/g, "");
  // an element passed as an argument is its id here
  t = t.replace(/\b(fieldID)\.value\s*=(?!=)\s*([^;]*);/g, (_, id, rhs) => `this.set(${id}, ${rhs.trim()});`);
  // writes: $_Id(x).value = rhs;
  t = t.replace(new RegExp(`${elem}\\.value\\s*=(?!=)\\s*([^;]*);`, "g"), (_, id, rhs) => `this.set(${idOf(id)}, ${rhs.trim()});`);
  t = t.replace(new RegExp(`\\(\\s*${elem}\\.value\\s*\\)\\s*=(?!=)\\s*\\(?([^;]*?)\\)?\\s*(?=\\n|;|\\})`, "g"), (_, id, rhs) => `this.set(${idOf(id)}, ${rhs.trim()});`);
  t = t.replace(new RegExp(`${elem}\\.checked\\s*=(?!=)\\s*([^;]*);`, "g"), (_, id, rhs) => `this.chk[${idOf(id)}] = ${rhs.trim()};`);
  t = t.replace(new RegExp(`${elem}\\.disabled\\s*=(?!=)\\s*([^;]*);`, "g"), (_, id, rhs) => `this.dis[${idOf(id)}] = ${rhs.trim()};`);
  // reads
  t = t.replace(new RegExp(`${elem}\\.value`, "g"), (_, id) => (/attachTypeView/.test(id) ? "this.attachTypeView" : `this.g(${idOf(id)})`));
  t = t.replace(new RegExp(`${elem}\\.checked`, "g"), (_, id) => `!!this.chk[${idOf(id)}]`);
  t = t.replace(new RegExp(`${elem}\\.disabled`, "g"), (_, id) => `!!this.dis[${idOf(id)}]`);
  // an element passed on as an argument is its id
  t = t.replace(new RegExp(`${elem}(?!\\s*\\.)`, "g"), (_, id) => idOf(id));
  // globals and calls
  t = t.replace(/(?<![.\w$])([A-Za-z_]\w*)(\s*\()?/g, (all, id, paren) => {
    if (param.includes(id)) return all;
    if (globalName.has(id)) return `this.${id}${paren ?? ""}`;
    if (!paren) return all;
    if (GLOBAL_FN.has(id) || IMPORTED.has(id)) return all;
    if (/^function$/.test(id)) return all;
    const to = RENAME[id] ?? id;
    called.add(to);
    return `this.${to}${paren}`;
  });
  return t;
}

// BIR's markup left tabs and trailing space everywhere: keep the statements, tidy the whitespace
const tidy = (t) =>
  t
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\t+/gm, (x) => "  ".repeat(x.length));
const emit = [];
const defined = new Set([...WANT]);
for (const name of [...WANT].sort((a, b) => code.indexOf(`function ${a}`) - code.indexOf(`function ${b}`))) {
  const f = fn.get(name);
  if (!f) {
    problem.push(`no such function ${name}`);
    continue;
  }
  const body = lower(name, f.param, f.body);
  emit.push(`  ${name}(${["this: any", ...f.param.map((p) => `${p}: any`)].join(", ")}): any ${tidy(body).replace(/\n/g, "\n  ")},`);
}
// functions called but not generated: the form (Sim) provides them
const supplied = new Set(["summationTo", "alert", "getSum", "getDifference", "product1", "product2", "summationThenDifference"]);
const external = [...called].filter((n) => !defined.has(n) && !supplied.has(n)).sort();

const leftover = emit.join("\n").match(/\$_|\$\(|\bd\.|\bdocument\b|\.onblur|\.value\b|\.checked\b|\.disabled\b|\bconfirm\(/g);
if (leftover) problem.push(`leftover DOM: ${[...new Set(leftover)].join(" ")}`);

const text = `// GENERATED by tool/gen-1702mx-attach.mjs from BIR-Form${EDITION[edition]}.hta: do not edit by hand.
// BIR's attachment compute functions (computeToMain*, computePg*Attach*, initialAmount) and the per-copy arrays and
// counters they keep state in. They run on the form's simulation (\`this\`): this.g / this.set / this.chk / this.dis
// stand for $_Id(...).value / .checked / .disabled, and the helpers they call are the simulation's own.
// Calls into the form's own code: ${external.join(", ")}.
/* eslint-disable */
// @ts-nocheck
import { NegativeValue, NumWithComma, NumWithParenthesis, WholeNumWithComma, convertToNumber, formatCurrency, formatCurrencyWOC, removeCommaParenthesis } from "../form1702mx-bir.ts";
void [WholeNumWithComma, NegativeValue, NumWithComma, NumWithParenthesis, convertToNumber, formatCurrency, formatCurrencyWOC, removeCommaParenthesis];

/** BIR's page-level variables (the per-copy arrays and counters), fresh for each page. */
export const attachState = (): Record<string, any> => ({
${[...globalName].sort().map((g) => `  ${g}: ${globalInit.get(g)},`).join("\n")}
});

export const attachFunction: Record<string, (this: any, ...arg: any[]) => any> = {
${emit.join("\n\n")}
};
`;
if (problem.length) console.error(`${edition}: ${problem.join("\n")}`);
if (process.argv.includes("--check")) process.exit(fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === text ? 0 : 1);
fs.writeFileSync(OUT, text);
console.log(`${OUT}: ${emit.length} functions, ${globalName.size} globals`);
