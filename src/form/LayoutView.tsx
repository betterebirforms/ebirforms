// The web version's form screen: BIR's own page LAYOUT (captured by test/capture-layout.test.ts, no BIR code in it)
// inside a shadow root, so BIR's stylesheet can't touch the app and the app's can't touch BIR's page. The native
// engine (schema.ts) drives every field it knows by BIR's own id: values in, computed totals out, read-only where
// BIR's are. BIR's buttons do what they say: Validate (locks the form) and Edit (opens it again), Save, Print and
// File > Print Preview (BIR's printme(), then the browser's print), Prev / Next, File > Main Menu. Submit / Final
// Copy is BIR's online send, which a browser can't make: it makes BIR's offline final copy instead (the file BIR's
// app makes when there is no internet), locked, for the desktop app or BIR's app to send.
import { useEffect, useMemo, useRef, useState } from "react";
import { NATIVE_FORM } from "./registry.ts";
import { computeForm, computeGroupRows, formRecords, typedMoney, isGateOpen, radioGroupName, groupAggs, type Problem, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState } from "./schema.ts";
import { ScheduleTable } from "./FormView.tsx";
import { AtcPicker, natureOf } from "./AtcPicker.tsx";
import { LIST_COPY, POPUP_GROUP, pickerOf, rateText, type Picker } from "./picker.ts";
import { atcPickIndex } from "./atc.ts";
import { formatMoney, parseMoney } from "./money.ts";
import { SAVEFILE_ADAPTER } from "./export.ts";
import { IS_WEB, readText, writeText } from "@/lib/vfs";
import { parseSavefile } from "@/lib/savefile.ts";
import { openHelp } from "./help.ts";
import { webExport, webDownload } from "@/lib/web-store.ts";
import type { Profile } from "@/lib/savefile.ts";

const layoutFile = import.meta.glob("../../asset/bir/layout/*.html", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const imageFile = import.meta.glob("../../asset/bir/layout/img/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

// BIR's locked boxes: each box BIR greys out on a blank form, with the choices that open it (captured from BIR's
// pages by test/capture-lock.test.ts). A box not listed stays as the engine says.
const lockFile = import.meta.glob("./lock/*.json", { eager: true, import: "default" }) as Record<string, Record<string, string[]>>;
const lockOf = (form_code: string): Record<string, string[]> => lockFile[`./lock/${form_code}.json`] ?? {};

// BIR's print stylesheet (css/print.css, media="print" on every form page) and the paper-size message its Print
// Preview shows first on 15 forms (tool/print-extract.mjs)
import printCss from "../../asset/bir/print.css?raw";
import phoneCss from "./phone.css?raw";
import popupJson from "./popup.json";
import PAGE_LINK from "./page-link.json";

/** BIR's pop-ups per form: the button id → the divs its click shows and hides (tool/popup-extract.mjs). */
const POPUP = popupJson as Record<string, Record<string, { show: string[]; hide: string[] }>>;
import printNoteJson from "../../asset/bir/print-note.json";
const printNote = printNoteJson as Record<string, string>;

/** How a final copy made on the web reaches BIR: the web can't send (BIR's upload is a connection a web page is not
 *  allowed to open), the desktop app and BIR's own app can. */
export const WEB_SEND_STEP =
  "To file it, do one of these:\n" +
  "1. In the desktop app (Mac, Windows or Linux), put the file in its savefile folder (Go > Show Saved Returns), open it, and click Submit / Final Copy there.\n" +
  "2. In BIR's eBIRForms on Windows, put it in C:\\eBIRForms\\savefile, open it, and click Submit / Final Copy.\n" +
  "3. Print it, and file and pay at your bank or RDO.\n\n" +
  "The return is filed only when BIR's confirmation email arrives. Keep that email.";

/** What Submit / Final Copy asks on the web, before it makes the final copy. */
export const WEB_FINAL_COPY_ASK =
  "The web version can't send returns to BIR. Submit makes BIR's final copy instead: the same locked file BIR's eBIRForms makes when there is no internet, ready to send from the desktop app or BIR's app.\n\n" +
  "After this the return can't be edited. To change it later, file an amended return.\n\n" +
  "Make the final copy?";

/** What Submit / Final Copy says on a return that is already a final copy. */
export const WEB_SUBMIT_NOTE = `This return is a final copy, and the web version can't send returns to BIR.\n\n${WEB_SEND_STEP}`;

const layoutKey = (form_code: string) => `../../asset/bir/layout/${form_code}.html`;
/** Whether BIR's layout was captured for this form (else the web version shows the plain native form). */
export const hasLayout = (form_code: string): boolean => layoutKey(form_code) in layoutFile;

/** BIR's layout with its images pointed at the bundled copies. */
export async function loadLayout(name: string): Promise<string> {
  const raw = await layoutFile[layoutKey(name)]!();
  return raw.replace(/\{\{base\}\}(img\/[^"')\s]+)/g, (_, rel: string) => imageFile[`../../asset/bir/layout/${rel}`] ?? "");
}

/** BIR's main screen and help pages wrap to a phone's width (phone.css); its forms shrink to fit. */
const reflow = (name: string) => name === "main" || name.startsWith("help-");

/** A shadow root holding BIR's layout; resolves once it is in the page. */
export function useLayoutRoot(name: string): [React.RefObject<HTMLDivElement | null>, ShadowRoot | null] {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    let live = true;
    void loadLayout(name).then((html) => {
      if (!live || !host.current) return;
      const shadow = host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" });
      // BIR's page sizes itself against <body>; inside the shadow root that is the .bir-body wrapper.
      // BIR drew these pages for IE's defaults: black text, light controls. The app around them follows the
      // system's dark mode (style.css `color-scheme: light dark`), which a shadow root inherits: in dark mode the
      // labels went light on BIR's grey and typed text white on its white fields. The desktop never had this
      // (BIR's pages don't opt into dark mode there), so pin the layout to IE's defaults.
      // BIR's print stylesheet applies when printing, as on BIR's pages; the phone fit (zoom) is for the screen only
      shadow.innerHTML = `<style>:host{display:block;min-height:100vh;color-scheme:light only;color:#000;background:#fff} .bir-body{min-height:100vh}</style><style media="print">${printCss}\n:host{min-height:0} .bir-body{zoom:1 !important;min-height:0} .ebf-zoom{display:none !important}</style>${html}${reflow(name) ? `<style>${phoneCss}</style>` : ""}`;
      setRoot(shadow);
    });
    return () => {
      live = false;
    };
  }, [name]);
  // BIR's pages are laid out for an 800 px window: on a narrower screen (a phone) shrink the whole page to fit,
  // as a browser's "zoom out" would, instead of cutting off its right side. A shrunk page gets a Zoom button
  // (bottom left) that shows it at full size, scrolling sideways, and back.
  useEffect(() => {
    const el = host.current;
    if (!root || !el) return;
    const body = root.querySelector(".bir-body") as HTMLElement | null;
    if (!body) return;
    let full = false;
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "ebf-zoom";
    zoom.hidden = true;
    zoom.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:2000000;min-height:44px;padding:0 16px;border-radius:22px;border:1px solid #555;background:#f9f9f9;color:#000;font:600 15px Arial,sans-serif;box-shadow:0 2px 8px rgb(0 0 0/.3)";
    root.appendChild(zoom);
    const fit = () => {
      body.style.zoom = "";
      const need = body.scrollWidth;
      const have = el.clientWidth;
      const shrink = need > have && have > 0;
      zoom.hidden = !shrink;
      zoom.textContent = full ? "Fit to screen" : "Zoom in";
      el.style.overflowX = shrink && full ? "auto" : "";
      body.style.zoom = shrink && !full ? String(have / need) : "";
    };
    zoom.addEventListener("click", () => {
      full = !full;
      fit();
    });
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => {
      watch.disconnect();
      zoom.remove();
    };
  }, [root]);
  return [host, root];
}

const byId = (root: ShadowRoot, id: string) => root.getElementById(id) as HTMLInputElement | null;

/** BIR's File / Help menus: a top item opens its list; a list item runs `action[text]`; items named in `hide`
 *  have nothing to do on the web and are taken out; BIR's help pages aren't in the web version yet. */
/** BIR's File / Help menus. A Help item ("BIR Form <X>") calls `help` with its link, if given. */
export function wireMenu(root: ShadowRoot, on: (el: EventTarget, type: string, fn: (e: Event) => void) => void, action: Record<string, () => void>, hide: string[], help?: (label: string, href: string | null) => void) {
  for (const a of Array.from(root.querySelectorAll("a.toplevel, a.atoplevel")) as HTMLElement[]) {
    on(a, "click", (e) => {
      e.preventDefault();
      const sub = a.parentElement?.querySelector("ul") as HTMLElement | null;
      if (sub) sub.style.display = sub.style.display === "block" ? "none" : "block";
    });
  }
  for (const a of Array.from(root.querySelectorAll("ul.subnav a:not(.atoplevel)")) as HTMLAnchorElement[]) {
    const t = a.textContent?.trim() ?? "";
    if (hide.includes(t)) a.parentElement?.setAttribute("hidden", "");
    else
      on(a, "click", (e) => {
        e.preventDefault();
        (a.closest("ul.subnav") as HTMLElement | null)?.style.setProperty("display", "none");
        if (action[t]) action[t]();
        else if (help && /^BIR Form /.test(t)) help(t, a.getAttribute("href"));
      });
  }
}

export function LayoutView({ form_code, profile, initial, onClose, onSaved }: { form_code: string; profile: Profile; initial?: { state: FormState; groups: GroupState; is_final_copy?: boolean } | undefined; onClose: () => void; onSaved: () => void }) {
  const def = NATIVE_FORM[form_code]!;
  const { schema, validate } = def;
  // Validate and Submit also run the checks BIR leaves out of Save
  const validateFull = (c: FormState, g: GroupState) => [...validate(c, g), ...(def.validate_only?.(c, g) ?? [])];
  const [host, root] = useLayoutRoot(form_code);

  const [state, setState] = useState<FormState>(() => {
    if (initial) return initial.state;
    const seed: FormState = {};
    for (const [id, key] of Object.entries(def.prefill)) seed[id] = profile[key];
    return seed;
  });
  const [groups, setGroups] = useState<GroupState>(() => initial?.groups ?? Object.fromEntries((schema.group ?? []).map((g) => [g.name, [] as GroupRow[]])));
  const computed = useMemo(() => computeForm(schema, state, groups), [schema, state, groups]);
  // BIR's Validate locks the form and opens Edit, Print and Submit; Edit opens the form again
  // a final copy (made here, or opened from a savefile ending "...BIR 2012.0") stays locked: no Edit, no Save
  const [final, setFinal] = useState(initial?.is_final_copy ?? false);
  const [validated, setValidated] = useState(final);
  const isFinal = useRef(final);
  const latest = useRef({ state, computed, groups });
  const groupBox = useRef(new Map<Element, { group: GroupSpec; row: number; id: string }>());
  latest.current = { state, computed, groups };

  // the schedule pop-up open now (BIR's "Add more…" / "View Details"), with its column labels read off BIR's page
  const [openGroup, setOpenGroup] = useState<{ name: string; title: string; label: Record<string, string> } | null>(null);
  // BIR's ATC pick list open now (picker.ts), and the payee row it is for (-1: a Part II table)
  const [pick, setPick] = useState<{ picker: Picker; row: number; title: string } | null>(null);
  const setRow = (group: string, i: number, id: string, value: string) =>
    setGroups((g) => {
      const rows = [...(g[group] ?? [])];
      while (rows.length <= i) rows.push({});
      rows[i] = { ...rows[i], [id]: value };
      return { ...g, [group]: rows };
    });
  const addRow = (group: string) => setGroups((g) => ({ ...g, [group]: [...(g[group] ?? []), {}] }));
  const removeRow = (group: string, i: number) => setGroups((g) => ({ ...g, [group]: (g[group] ?? []).filter((_, j) => j !== i) }));

  const groupTotalTarget = useMemo(() => new Set((schema.group ?? []).flatMap((g) => groupAggs(g).map((a) => a.into))), [schema]);
  const readOnly = (f: FieldSpec, c: FormState) => ((Boolean(f.compute) && !f.is_editable) || groupTotalTarget.has(f.id)) || !isGateOpen(f, c);

  // wire BIR's inputs and buttons once the layout is in
  useEffect(() => {
    if (!root) return;
    const off: Array<() => void> = [];
    const on = (el: EventTarget, type: string, fn: (e: Event) => void) => {
      el.addEventListener(type, fn);
      off.push(() => el.removeEventListener(type, fn));
    };
    const set = (patch: FormState) => setState((s) => ({ ...s, ...patch }));

    for (const f of schema.field) {
      const el = byId(root, f.id);
      if (!el || f.secret) continue;
      if (f.kind === "radio") {
        on(el, "change", () => {
          const stem = radioGroupName(form_code, f.id);
          const sibling = schema.field.filter((g) => g.kind === "radio" && radioGroupName(form_code, g.id) === stem);
          set(Object.fromEntries(sibling.map((g) => [g.id, g.id === f.id ? "true" : "false"])));
        });
      } else if (f.kind === "checkbox") {
        on(el, "change", () => set({ [f.id]: String(el.checked) }));
      } else {
        on(el, f.kind === "select" ? "change" : "input", () => set({ [f.id]: el.value }));
        if (f.kind === "money") on(el, "blur", () => !el.readOnly && set({ [f.id]: typedMoney(schema, el.value) }));
      }
    }

    // pages: BIR shows one #Page<n>Content at a time, with Prev / Next and a page-number box
    // (the form's own pages only: Page<n>AttMContent and the like are attachment pages, not in the Prev / Next run)
    // (2551Q, 1602Q, 2200AN name theirs #Page<n>)
    const pageId = root.getElementById("Page1Content") ? (n: number) => `Page${n}Content` : (n: number) => `Page${n}`;
    let pageCount = 0;
    while (root.getElementById(pageId(pageCount + 1))) pageCount++;
    let current = 1;
    const showPage = (n: number) => {
      if (n < 1 || n > pageCount) return;
      for (let i = 1; i <= pageCount; i++) {
        const p = root.getElementById(pageId(i)) as HTMLElement | null;
        if (p) p.style.display = i === n ? "" : "none";
      }
      current = n;
      const box = root.querySelector("input[id$=':txtCurrentPage']") as HTMLInputElement | null;
      if (box) box.value = String(n);
      host.current?.scrollIntoView();
    };
    if (pageCount > 1) showPage(1);

    // BIR's way with a problem: say it, then put the cursor in the box (on its page)
    const showProblem = (problem: Problem[]) => {
      window.alert(problem.map((p) => p.message).join("\n"));
      const el = problem.map((p) => byId(root, p.id)).find((e) => e && !e.disabled);
      if (!el) return;
      const n = pageOf(el);
      if (n && n !== current) showPage(n);
      el.focus();
    };
    const store = async (name: string, text: string) => {
      if (IS_WEB) {
        try {
          await writeText(`savefile/${name}`, text);
          await webExport(`savefile/${name}`);
        } catch {
          webDownload(name, text);
        }
      } else await writeText(`savefile/${name}`, text);
    };
    const save = async () => {
      if (isFinal.current) return window.alert(WEB_SUBMIT_NOTE);
      const { state: s, computed: c, groups: g } = latest.current;
      const problem = validate(c, g);
      if (problem.length > 0) return showProblem(problem);
      const { name, text } = SAVEFILE_ADAPTER.build({ form_code, state: s, groups: g, profile });
      await store(name, text);
      window.alert(`BIR Form saved successfully as : savefile/${name}`);
      onSaved();
    };
    // Submit / Final Copy: BIR's offline branch of openAlertEmail (no internet: txtFinalFlag "3", saveXML(true),
    // locked). BIR refuses to overwrite a final copy unless the return is amended; amended returns carry their own
    // name, so the same name holding a final copy is refused here with BIR's words.
    const finalCopy = async () => {
      if (isFinal.current) return window.alert(WEB_SUBMIT_NOTE);
      const { state: s, computed: c, groups: g } = latest.current;
      const problem = validateFull(c, g);
      if (problem.length > 0) return showProblem(problem);
      if (!window.confirm(WEB_FINAL_COPY_ASK)) return;
      const { name, text } = SAVEFILE_ADAPTER.build({ form_code, state: s, groups: g, profile, is_final_copy: true });
      const before = await readText(`savefile/${name}`).catch(() => null);
      if (before !== null && parseSavefile(before).is_final_copy)
        return window.alert("If your intention is to make an amended return, kindly tick Amended Return to 'Yes' before hitting 'Save' or 'Final Copy' or 'Submit'.");
      await store(name, text);
      isFinal.current = true;
      setFinal(true);
      setValidated(true);
      window.alert(`Final copy saved as : savefile/${name}\n\nIt is locked. ${WEB_SEND_STEP}`);
      onSaved();
    };
    // BIR's Print Preview (printme()): the page as it prints, boxes read-only on white, lists as plain text, the
    // signature footer and barcode shown, buttons hidden, and File swapped for BIR's print menu (Print, Cancel Print).
    // Cancel Print puts every element back as it was.
    let undo: Array<() => void> | null = null;
    const keep = (el: Element) => {
      const h = el as HTMLInputElement;
      const style = h.getAttribute("style"), cls = h.getAttribute("class"), disabled = h.disabled, readOnly = h.readOnly;
      undo!.push(() => {
        if (style === null) h.removeAttribute("style");
        else h.setAttribute("style", style);
        if (cls === null) h.removeAttribute("class");
        else h.setAttribute("class", cls);
        if ("disabled" in h) h.disabled = disabled;
        if ("readOnly" in h) h.readOnly = readOnly;
      });
      return h;
    };
    const preview = () => {
      if (undo) return;
      const note = printNote[form_code];
      if (note) window.alert(note);
      undo = [];
      const css = (sel: string, style: Partial<CSSStyleDeclaration>) => root.querySelectorAll(sel).forEach((el) => Object.assign(keep(el).style, style));
      css("#bg", { display: "none" });
      css(".printSignFooterClass", { maxWidth: "94%", margin: "15px auto 0", display: "block", position: "relative", overflow: "visible", pageBreakBefore: "always", background: "#ffffff", width: "", height: "", top: "", left: "" });
      css(".imgClass", { margin: "auto", display: "block", position: "relative", overflow: "visible" });
      css("#formPaper", { border: "#000 3px solid" });
      for (const el of Array.from(root.querySelectorAll("input, select, textarea")) as HTMLInputElement[]) {
        if (el.type === "hidden" || /:txtCurrentPage$/.test(el.id)) continue;
        if (el.type === "button" || el.type === "submit") {
          keep(el).classList.add("previewButtonClass");
        } else if (el.type === "radio" || el.type === "checkbox") {
          keep(el).disabled = true;
        } else if (el instanceof HTMLSelectElement) {
          keep(el).style.display = "none";
          const label = document.createElement("div");
          label.className = "labels";
          label.innerHTML = `${(el.options[el.selectedIndex]?.textContent ?? "").replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}&nbsp;`;
          el.after(label);
          undo.push(() => label.remove());
        } else {
          const h = keep(el);
          h.disabled = false;
          h.readOnly = true;
          h.style.backgroundColor = "#FFFFFF";
          h.style.color = "#000000";
        }
      }
      css("#printMenu", { display: "block" });
      css("#formMenu", { display: "none" });
    };
    const cancelPreview = () => {
      for (const f of (undo ?? []).reverse()) f();
      undo = null;
    };
    off.push(cancelPreview);
    const button = Array.from(root.querySelectorAll("input[type=button], button")) as HTMLInputElement[];
    for (const b of button) {
      if (b.id in (POPUP[form_code] ?? {}) || pickerOf(form_code, b.id)) continue; // a pop-up's or picker's own button (below)
      const v = (b.value || b.textContent || "").trim();
      if (v === "Validate")
        on(b, "click", () => {
          const problem = validateFull(latest.current.computed, latest.current.groups);
          if (problem.length) return showProblem(problem);
          setValidated(true);
          window.alert("Validation successful. Click on Edit if you wish to modify your entries.");
        });
      else if (v === "Edit") on(b, "click", () => setValidated(false));
      else if (v === "Save") on(b, "click", () => void save());
      else if (v === "Prev") on(b, "click", () => showPage(current - 1));
      else if (v === "Next") on(b, "click", () => showPage(current + 1));
      else if (v === "Main Menu" || v === "Exit") on(b, "click", onClose);
      // BIR's Print button opens its Print Preview; the plain "Print" of its header prints straight away
      else if (v === "Print") on(b, "click", b.id === "btnPrint" ? preview : () => window.print());
      else if (v === "Submit / Final Copy") on(b, "click", () => void finalCopy());
    }
    // BIR's File / Help menu: File opens its list (Main Screen, Save, Print Preview, Exit); in Print Preview, BIR's
    // print menu (Print, Cancel Print)
    wireMenu(root, on, { "Main Screen": onClose, Save: () => void save(), "Print Preview": preview, Print: () => window.print(), "Cancel Print": cancelPreview }, ["Exit"], (label, href) => openHelp(label, href, true));
    const pageBox = root.querySelector("input[id$=':txtCurrentPage']") as HTMLInputElement | null;
    if (pageBox) on(pageBox, "change", () => showPage(Number(pageBox.value)));
    // BIR's page-jump links: "btnNavigatePage<N>_…" goes to page N, Next / Prev page by one, and a "(To / From …
    // Schedule X …)" note goes to the other page that holds Schedule X (or Part X)
    const pageOf = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const n = p.id.match(/^Page(\d+)(?:Content)?$/)?.[1];
        if (n) return Number(n);
      }
      return 0;
    };
    // a page's own text, without the other jump links' labels (they name schedules that live elsewhere)
    const pageText = Array.from({ length: pageCount }, (_, i) => {
      const p = root.getElementById(pageId(i + 1))?.cloneNode(true) as HTMLElement | undefined;
      p?.querySelectorAll("[data-js]").forEach((a) => a.remove());
      return (p?.textContent ?? "").replace(/\s+/g, " ").replace(/\bSched\.?(?=\s)/gi, "Schedule").replace(/\s*-\s*/g, " ").toLowerCase();
    });
    const jumpTarget = (a: Element): number | null => {
      const id = a.id;
      const n = id.match(/^btnNavigatePage(\d+)/)?.[1];
      if (n) return Number(n);
      if (/btnNextPage$/.test(id)) return (pageOf(a) || current) + 1;
      if (/btnPrevPage$/.test(id)) return (pageOf(a) || current) - 1;
      const text = (a.textContent ?? "").replace(/\s+/g, " ").replace(/\bSched\.?(?=\s)/gi, "Schedule");
      if (!/\b(to|from)\b/i.test(text)) return null;
      const target = (text.match(/Schedule\s+[\w.]+?(?=[\s,)]|$)/i) ?? text.match(/Part\s+[IVX]+\b/))?.[0].toLowerCase().replace(/\s+/g, " ");
      if (!target) return null;
      const here = pageOf(a);
      const hit = pageText.findIndex((t, i) => i + 1 !== here && t.includes(target));
      return hit < 0 ? null : hit + 1;
    };
    // schedules: a group's row boxes BIR shows on the page are typed into like any field, and the link next to
    // its table ("Add more…", "View Details", BIR's btnModal<X> for its modalDiv<X>) opens the row editor
    const rowBox = new Map<Element, { group: GroupSpec; row: number; id: string }>();
    for (const g of schema.group ?? []) {
      for (const sub of g.row) {
        // a row box is the column's id with the row number in its {i} slot, or after it (naturePayment1)
        const [head, tail = ""] = (sub.id.includes("{i}") ? sub.id.split("{i}") : [sub.id, ""]) as [string, string?];
        for (let n = g.first_index ?? 1, el = byId(root, `${head}${n}${tail}`); el; n++, el = byId(root, `${head}${n}${tail}`)) {
          rowBox.set(el, { group: g, row: n - (g.first_index ?? 1), id: sub.id });
          const at = n - (g.first_index ?? 1);
          if (sub.kind === "checkbox") on(el, "change", () => setRow(g.name, at, sub.id, String(el.checked)));
          else {
            on(el, sub.kind === "select" ? "change" : "input", () => setRow(g.name, at, sub.id, el.value));
            if (sub.kind === "money") on(el, "blur", () => !el.readOnly && setRow(g.name, at, sub.id, typedMoney(schema, el.value)));
          }
        }
      }
    }
    // a stem specific enough to name one group: it must end in a separator BIR puts before the row number
    const r_ok = (h: string) => /[_A-Za-z]$/.test(h) && h.length > 8;
    const groupIn = (box: Element | null): GroupSpec | null => {
      if (!box) return null;
      for (const [el, r] of rowBox) if (box.contains(el)) return r.group;
      // a size field (BIR's row counter) also names its group, and so does a box sharing the rows' id stem (BIR's
      // pop-up tables are empty until its script adds rows; their subtotals are named like the rows, e.g.
      // txtPg4Sc10Itm8_SubTotalCA for rows txtPg4Sc10Itm8_<i>Col<c>)
      for (const g of schema.group ?? []) if (box.querySelector(`[id="${g.size_field}"]`)) return g;
      // and so does a total of its rows (BIR's pop-up shows the schedule's totals under its empty table)
      for (const g of schema.group ?? []) if (groupAggs(g).some((a) => box.querySelector(`[id="${CSS.escape(a.into)}"]`))) return g;
      const ids = Array.from(box.querySelectorAll("[id]"), (x) => x.id);
      for (const g of schema.group ?? []) {
        const stem = g.row.map((r) => r.id.split("{i}")[0]!).filter((h, i, all) => r_ok(h) && all.indexOf(h) === i);
        if (stem.some((h) => ids.some((id) => id.startsWith(h)))) return g;
      }
      return null;
    };
    const groupOf = (a: Element): GroupSpec | null => {
      const modal = a.id.match(/btnModal(.+)$/)?.[1];
      if (modal) {
        // BIR's row counter is named for the pop-up: txtCtrmodal<X> for btnModal<X> / modalDiv<X>
        const g = (schema.group ?? []).find((x) => x.size_field?.endsWith(`modal${modal}`)) ?? groupIn(root.getElementById(`modalDiv${modal}`));
        if (g) return g;
      }
      for (let p = a.parentElement; p && !/^Page\d+Content$/.test(p.id); p = p.parentElement) {
        const g = groupIn(p);
        if (g) return g;
      }
      return null;
    };
    // BIR's column heading for a row box: the text of the same column in the first row of its table that has text
    const labelOf = (g: GroupSpec): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [el, r] of rowBox) {
        if (r.group !== g || r.row !== 0) continue;
        const cell = el.closest("td");
        const table = cell?.closest("table");
        if (!cell || !table) continue;
        const col = Array.from(cell.parentElement!.children).indexOf(cell);
        for (const tr of Array.from(table.rows)) {
          if (tr.contains(el)) break;
          const text = tr.cells[col]?.textContent?.replace(/\s+/g, " ").trim();
          if (text) out[r.id] = text;
        }
      }
      return out;
    };
    // the pop-up's title: BIR's own heading in its modalDiv, else the link's words, else the schedule's name
    const titleOf = (a: Element, g: GroupSpec, popupBox?: Element) => {
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").replace(/^[\s(]+|[\s)]+$/g, "").trim();
      const modal = a.id.match(/btnModal(.+)$/)?.[1];
      const box = popupBox ?? (modal ? root.getElementById(`modalDiv${modal}`) : null);
      const heading = box && Array.from(box.querySelectorAll("b, strong, th, td, span, font, div")).map((x) => clean(x.textContent)).find((t) => t.length > 3 && t.length < 120);
      const own = clean(a.textContent);
      return heading || (own && !/^(add more|view details)/i.test(own) ? own : `Schedule ${g.name}`);
    };
    const isPopup = (a: Element) => /btnModal|btnNewSched|part\d+btn/i.test(a.id) || /add more|view details/i.test(a.textContent ?? "") || !(a.textContent ?? "").trim();
    // BIR's pop-ups (popup.json, read from BIR's pages by tool/popup-extract.mjs): a button shows a div on the page
    // (modalAtc, modalSched1, …) and hides the page behind it, as BIR's own script does, and the pop-up's buttons
    // put the page back. Its boxes are the form's fields, wired above. Cancel puts back what the boxes held when the
    // pop-up opened, as BIR's temporary copies do.
    // BIR's ATC pickers: the list BIR's script builds, listed from the form's pick list (picker.ts)
    const picked = new Set<string>();
    for (const el of Array.from(root.querySelectorAll("[id]")) as HTMLInputElement[]) {
      const p = pickerOf(form_code, el.id);
      if (!p) continue;
      picked.add(el.id);
      on(el, "click", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (el.disabled) return;
        const need = p.picker.kind === "row" ? null : (p.picker.need?.(latest.current.computed) ?? null);
        if (need !== null) return need ? window.alert(need) : undefined;
        setPick({ ...p, title: (el.value || el.textContent || "").replace(/\s+/g, " ").trim() || "ATC" });
      });
    }
    const popup = Object.fromEntries(Object.entries(POPUP[form_code] ?? {}).filter(([id]) => !picked.has(id)));
    // a pop-up is a div BIR's page starts with hidden; a button that shows one opens it, the rest close it
    const hidden = (x: string) => {
      const el = root.getElementById(x);
      return !!el && getComputedStyle(el).display === "none";
    };
    let before: { state: FormState; groups: GroupState } | null = null;
    // a pop-up whose rows BIR's script adds (its captured table is empty) opens the schedule editor instead
    const bound = (div: Element) => schema.field.some((f) => div.querySelector(`[id="${CSS.escape(f.id)}"]`)) || Array.from(rowBox.keys()).some((x) => div.contains(x));
    for (const [id, fx] of Object.entries(popup)) {
      // BIR reuses an id (0605 has a btnOkPop in each pop-up): take the copy inside the pop-up this one closes
      const same = Array.from(root.querySelectorAll<HTMLInputElement>(`[id="${CSS.escape(id)}"]`));
      const el = same.find((x) => fx.hide.some((h) => root.getElementById(h)?.contains(x))) ?? same[0];
      if (!el) continue;
      const opening = fx.show.some(hidden);
      // a choice (radio, tick box) that shows a part of the page still ticks as usual
      const choice = el.type === "radio" || el.type === "checkbox";
      const div = fx.show.map((x) => root.getElementById(x)).filter((x): x is HTMLElement => !!x);
      const rowsHere = div.some((d) => Array.from(rowBox.keys()).some((x) => d.contains(x)));
      const hinted = fx.show.map((x) => POPUP_GROUP[form_code]?.[x]).find(Boolean);
      const editor = opening && !rowsHere ? ((hinted ? (schema.group ?? []).find((g) => g.name === hinted) : null) ?? div.map(groupIn).find(Boolean) ?? null) : null;
      // what it opens, for bench/web-parity.mjs: BIR's pop-up with its boxes, the schedule editor, or BIR's pop-up
      // with nothing the form keeps (a list BIR's script fills, still to do)
      if (opening && !choice) el.dataset.ebfPopup = editor ? "editor" : div.some(bound) || fx.show.some((x) => LIST_COPY[form_code]?.[x]) ? "bir" : "empty";
      on(el, "click", (e) => {
        if (!choice) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        if (el.disabled) return;
        if (editor) return setOpenGroup({ name: editor.name, title: titleOf(el, editor, div[0]), label: labelOf(editor) });
        if (opening) before = { state: latest.current.state, groups: latest.current.groups };
        else if (/cancel/i.test(el.value || el.textContent || "") && before) {
          setState(before.state);
          setGroups(before.groups);
        }
        // OK on a list BIR's page holds copies the ticked row into the form, as BIR's getATCCode does
        if (!opening && !/cancel/i.test(el.value || el.textContent || ""))
          for (const x of fx.hide) {
            const patch = LIST_COPY[form_code]?.[x]?.(root);
            if (patch) set(patch);
          }
        if (!opening) before = null;
        for (const x of fx.hide) (root.getElementById(x) as HTMLElement | null)?.style.setProperty("display", "none");
        for (const x of fx.show) (root.getElementById(x) as HTMLElement | null)?.style.setProperty("display", "block");
        host.current?.scrollIntoView();
      });
      // a pop-up BIR closes from its script (a click on a row of its list) and no button: give it an OK that closes
      // it and copies the choice, so the page behind it comes back
      if (!opening || choice) continue;
      for (const x of fx.show) {
        const box = root.getElementById(x);
        const closer = Object.values(popup).some((y) => y.hide.includes(x));
        if (!box || closer || box.querySelector(".ebf-close")) continue;
        const ok = document.createElement("input");
        ok.type = "button";
        ok.value = "OK";
        ok.className = "printButtonClass ebf-close";
        ok.style.cssText = "display:block;margin:12px auto;width:120px;height:30px";
        box.appendChild(ok);
        off.push(() => ok.remove());
        on(ok, "click", () => {
          const patch = LIST_COPY[form_code]?.[x]?.(root);
          if (patch) set(patch);
          box.style.display = "none";
          for (const y of fx.hide) (root.getElementById(y) as HTMLElement | null)?.style.setProperty("display", "block");
          before = null;
        });
      }
    }
    for (const a of Array.from(root.querySelectorAll("[data-js]"))) {
      if (a.id in popup || picked.has(a.id)) continue;
      // every other javascript: link (pickers, help) does nothing yet rather than navigating
      on(a, "click", (e) => {
        e.preventDefault();
        const to = pageCount < 2 ? null : jumpTarget(a);
        if (to !== null && !/btnModal/.test(a.id)) return showPage(to);
        const g = isPopup(a) ? groupOf(a) : null;
        if (g) setOpenGroup({ name: g.name, title: titleOf(a, g), label: labelOf(g) });
      });
    }
    // a table's own Add / Delete / More button (BIR's script adds or drops a row there): open that table's editor,
    // which adds and deletes rows; the nearest box around the button that holds a group's rows names the table
    for (const b of Array.from(root.querySelectorAll<HTMLInputElement>("input[type=button], button"))) {
      const v = (b.value || b.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^(?:(?:add|delete|del|remove)(?: \w+)?|more|add more)$/i.test(v) || b.id in popup || picked.has(b.id)) continue;
      let g: GroupSpec | null = null;
      for (let n = b.parentElement; n && !g; n = n.parentElement) {
        g = groupIn(n);
        if (/^Page\d+(Content)?$/.test(n.id)) break;
      }
      if (!g) continue;
      const group = g;
      b.dataset.ebfPopup = "editor";
      on(b, "click", (e) => {
        e.preventDefault();
        setOpenGroup({ name: group.name, title: titleOf(b, group), label: labelOf(group) });
      });
    }
    // BIR's own page jumps (goTo(n) / linkTo(this, n)), read from its pages by label (page-link.json)
    const jump = (PAGE_LINK as Record<string, Record<string, number | string>>)[form_code] ?? {};
    if (pageCount > 1 && Object.keys(jump).length)
      for (const a of Array.from(root.querySelectorAll<HTMLElement>("a, input[type=button]"))) {
        if (a.hasAttribute("data-js")) continue;
        const text = ((a as HTMLInputElement).value || a.textContent || "").replace(/\s+/g, " ").trim();
        const n = jump[text];
        if (!n) continue;
        on(a, "click", (e) => {
          e.preventDefault();
          // "+1" / "-1": BIR's processNext / processPrev, from the page the link is on
          showPage(typeof n === "number" ? n : (pageOf(a) || current) + Number(n));
        });
      }
    groupBox.current = rowBox;
    return () => off.forEach((f) => f());
  }, [root, schema, form_code, validate, profile, onClose, onSaved, host]); // eslint-disable-line react-hooks/exhaustive-deps

  // BIR's buttons follow Validate: before it only Validate (and Save) work; after it Edit, Print and Submit do. A
  // final copy keeps Print and Submit (which says how to send it) and nothing that changes it
  useEffect(() => {
    if (!root) return;
    for (const b of Array.from(root.querySelectorAll("input[type=button], button")) as HTMLInputElement[]) {
      const v = (b.value || b.textContent || "").trim();
      if (v === "Validate") b.disabled = validated;
      else if (v === "Edit") b.disabled = !validated || final;
      else if (v === "Save") b.disabled = final;
      else if (v === "Submit / Final Copy" || (v === "Print" && b.id === "btnPrint")) b.disabled = !validated;
    }
  }, [root, validated, final]);

  // engine → page: write every known field's value, and lock what BIR locks
  useEffect(() => {
    if (!root) return;
    const focused = root.activeElement;
    // an untouched box shows what the savefile will hold for it (BIR's blank-save default), so what you see is
    // what is saved; BIR's captured page default is only the fallback for a box the file doesn't carry
    const saved = new Map(formRecords(schema, state, groups).map((r) => [r.key, r.value]));
    const lock = lockOf(form_code);
    // a link to a group's pop-up that BIR hides until that group has rows ("Other Selected ATC" past 6 picks)
    for (const [box, name] of Object.entries(POPUP_GROUP[form_code] ?? {})) {
      const has = (groups[name] ?? []).length > 0;
      for (const [id, fx] of Object.entries(POPUP[form_code] ?? {})) {
        if (!fx.show.includes(box)) continue;
        for (let n = root.getElementById(id)?.parentElement; n && n !== (root as unknown as HTMLElement); n = n.parentElement)
          if (n.style.visibility === "hidden" || n.dataset.ebfShown) {
            n.style.visibility = has ? "visible" : "hidden";
            n.dataset.ebfShown = "1";
          }
      }
    }
    // greyed out as on BIR's page until something that opens it there holds: "<id>" a choice ticked,
    // "<id>=<value>" a list on that value, "<id>=*" anything typed or picked there (not the blank form's value)
    const now = (c: string) => (c in state ? computed[c] : (saved.get(c) ?? computed[c])) ?? "";
    const lockedByBir = (id: string) => {
      const opener = lock[id];
      return !!opener && !opener.some((o) => {
        const at = o.indexOf("=");
        // a choice BIR's blank page already ticks opens the box only from its click (1701MS item 2 "No"), not
        // from being ticked: it counts once the user has picked it
        if (at < 0) return now(o) === "true" && (o in state || !(byId(root, o) as HTMLInputElement | null)?.defaultChecked);
        const c = o.slice(0, at), want = o.slice(at + 1);
        if (want !== "*") return now(c) === want;
        const el = byId(root, c);
        const v = now(c).trim();
        const blank = el instanceof HTMLSelectElement ? (Array.from(el.options).find((x) => x.defaultSelected)?.value ?? "") : (el?.defaultValue ?? "");
        return v !== "" && v !== blank.trim();
      });
    };
    for (const f of schema.field) {
      const el = byId(root, f.id);
      if (!el || f.secret) continue;
      const ro = readOnly(f, computed);
      if (f.kind === "radio" || f.kind === "checkbox") {
        // like a text box: an untouched choice shows what the savefile will hold, so BIR's preselected options
        // (1701Q item 3 "Amended Return? No") are ticked as on BIR's page, not left blank
        el.checked = (f.id in state || f.compute ? computed[f.id] : (saved.get(f.id) ?? computed[f.id])) === "true";
        el.disabled = !isGateOpen(f, computed);
        continue;
      }
      // what BIR's blank page showed: a text box's default, or a list's preselected option
      const shown = f.kind === "select" ? (Array.from((el as unknown as HTMLSelectElement).options).find((o) => o.defaultSelected)?.value ?? "") : el.defaultValue;
      const fallback = f.escaped ? shown : (saved.get(f.id) ?? shown);
      // a locked box shows what the file will hold: some totals (a schedule's rows summed into its item lines) are
      // derived only as the save is built, so the live compute alone would leave them stale
      const value = ro ? (f.escaped ? (computed[f.id] ?? "") : (saved.get(f.id) ?? computed[f.id] ?? "")) : (state[f.id] ?? (f.is_editable || f.derive ? (computed[f.id] || fallback) : fallback));
      if (el !== focused && el.value !== value) el.value = value;
      // BIR fills the taxpayer's details from the profile and greys them out; with no profile they stay open to type
      const fromProfile = f.id in def.prefill && Boolean(state[f.id]);
      if (f.kind === "select") el.disabled = ro || fromProfile || lockedByBir(f.id);
      else {
        el.readOnly = ro;
        el.disabled = fromProfile || lockedByBir(f.id);
      }
    }
    // schedule rows BIR shows on the page: the row's value, computed columns locked
    const rowsOf = new Map((schema.group ?? []).map((g) => [g.name, { rows: groups[g.name] ?? [], computed: computeGroupRows(g, groups[g.name] ?? [], computed) }]));
    for (const [box, r] of groupBox.current) {
      const el = box as HTMLInputElement;
      const sub = r.group.row.find((x) => x.id === r.id)!;
      const at = rowsOf.get(r.group.name)!;
      const value = sub.row_compute || sub.derive ? (at.computed[r.row]?.[r.id] ?? "") : (at.rows[r.row]?.[r.id] ?? "");
      if (sub.kind === "checkbox") el.checked = value === "true";
      else if (el !== focused && el.value !== value && (value !== "" || at.rows[r.row])) el.value = value;
      if (sub.row_compute) el.readOnly = true;
    }
    // a validated return is locked until Edit, as BIR's disableAllControl() does
    if (validated) {
      for (const f of schema.field) {
        const el = byId(root, f.id);
        if (el && !f.secret) el.disabled = true;
      }
      for (const box of groupBox.current.keys()) {
        const el = box as HTMLInputElement;
        if (!el.disabled) el.dataset.validated = "";
        el.disabled = true;
      }
    } else
      for (const box of groupBox.current.keys()) {
        const el = box as HTMLInputElement;
        if (!("validated" in el.dataset)) continue;
        el.disabled = false;
        delete el.dataset.validated;
      }
  }, [root, schema, state, computed, groups, validated]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = openGroup && (schema.group ?? []).find((g) => g.name === openGroup.name);
  // the picker's list and what is ticked now: a Part II table's rows, or the payee row's code
  const pickList = pick ? pick.picker.list(computed) : [];
  const pickNow = ((): number[] => {
    if (!pick) return [];
    const p = pick.picker;
    if (p.kind === "field") return [pickList.findIndex((a) => a.atc_code === (computed[p.field] ?? "").trim())].filter((j) => j >= 0);
    const rows = [...(groups[p.group] ?? []), ...(p.kind === "rows" && p.more ? (groups[p.more.group] ?? []) : [])];
    if (p.kind === "row") return [pickList.findIndex((a) => a.atc_code === (rows[pick.row]?.[p.atc] ?? "").trim())].filter((j) => j >= 0);
    return atcPickIndex(pickList, rows.map((r) => ({ atc_code: r[p.atc] ?? "", rate: p.rate ? (r[p.rate] ?? "") : "" }))).filter((j) => j >= 0);
  })();
  const pickOk = (index: number[]) => {
    if (!pick) return;
    const { picker, row } = pick;
    if (picker.kind === "field") {
      const a = pickList[index[0]!];
      if (a) setState((s) => ({ ...s, ...(picker.fill ? picker.fill(a) : { [picker.field]: a.atc_code }) }));
    } else if (picker.kind === "row") {
      const a = pickList[index[0]!];
      if (a) {
        setRow(picker.group, row, picker.atc, a.atc_code);
        setRow(picker.group, row, picker.nature, natureOf(a.atc_code));
        setRow(picker.group, row, picker.rate, rateText(a.rate));
      }
    } else {
      // one row per ticked code, in list order; a code already on the table keeps its row (and its tax base)
      const pickRows = [...(groups[picker.group] ?? []), ...(picker.more ? (groups[picker.more.group] ?? []) : [])];
      const was = atcPickIndex(pickList, pickRows.map((r) => ({ atc_code: r[picker.atc] ?? "", rate: picker.rate ? (r[picker.rate] ?? "") : "" })));
      const next = index.map((j) => {
        const k = was.indexOf(j);
        return k >= 0 ? pickRows[k]! : { [picker.atc]: pickList[j]!.atc_code, ...(picker.rate ? { [picker.rate]: rateText(pickList[j]!.rate) } : {}) };
      });
      const { more } = picker;
      setGroups((g) => (more ? { ...g, [picker.group]: next.slice(0, more.after), [more.group]: next.slice(more.after) } : { ...g, [picker.group]: next }));
      // BIR's script draws these rows on the page; the captured page has none, so the tax bases go in the editor
      const g = (schema.group ?? []).find((x) => x.name === picker.group);
      const onPage = Array.from(groupBox.current.values()).some((r) => r.group.name === picker.group);
      // column names from BIR's ids: frm1600:txtTaxBase → "Tax Base"
      const words = (id: string) => id.replace(/^.*:/, "").replace(/^txt/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Cde?$|Cd$/, "Code").trim();
      if (g && next.length && !onPage) setOpenGroup({ name: g.name, title: pick.title, label: Object.fromEntries(g.row.map((r) => [r.id, r.id === picker.atc ? "ATC" : words(r.id)])) });
    }
    setPick(null);
  };
  return (
    <>
      <div ref={host} className="bir-layout" data-form={form_code} />
      {pick && <AtcPicker title={pick.title} list={pickList} multi={pick.picker.kind === "rows"} picked={pickNow} onOk={pickOk} onCancel={() => setPick(null)} />}
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOpenGroup(null)}>
          <div className="modal schedule-modal" role="dialog" aria-label={openGroup.title}>
            <ScheduleTable typed={(raw) => typedMoney(schema, raw)} title={openGroup.title} group={open} rows={groups[open.name] ?? []} form={computed} label={{ ...def.label, ...openGroup.label }} onSet={setRow} onAdd={addRow} onRemove={removeRow} />
            <button onClick={() => setOpenGroup(null)}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
