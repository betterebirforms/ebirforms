// BIR's attachments on the web (1701 / 1702-MX): BIR's addAttachment clones its template block (attachmentPages_TEMP)
// into attachmentEX / attachmentSP with its token ("TYPE", "AttM") renamed to the copy ("EX1", "SP2"). The web clones
// every copy the engine models up front, hidden, so each copy's boxes are on the page under BIR's own ids and the
// usual field binding, compute and save cover them; the count fields say which copies are in use.
import type { AttachmentSpec, FieldSpec, FormState } from "./schema.ts";

/** Clone the template once per copy into its kind's container (hidden until shown). Idempotent per root. */
export function prepareCopy(root: ShadowRoot, spec: AttachmentSpec): void {
  const template = root.getElementById(spec.template);
  if (!template || root.querySelector("[data-ebf-copy]")) return;
  const source = template.innerHTML;
  const token = new RegExp(spec.token, "g");
  for (const kind of spec.kind) {
    const container = root.getElementById(kind.container);
    if (!container) continue;
    for (let n = 1; n <= spec.max; n++) {
      let html = source.replace(token, `${kind.code}${n}`);
      if (spec.unhide) html = html.replace(/type=(["']?)hidden\1/gi, 'type="text"');
      const copy = document.createElement("div");
      copy.dataset.ebfCopy = `${kind.code}${n}`;
      copy.style.display = "none";
      copy.innerHTML = html;
      container.appendChild(copy);
    }
  }
}

/** Show copy `name`'s page `page` (BIR's Page<p>…<name>…Content blocks), hide the other copies. */
export function showCopy(root: ShadowRoot, name: string | null, page: number): void {
  for (const copy of Array.from(root.querySelectorAll<HTMLElement>("[data-ebf-copy]"))) {
    const on = copy.dataset.ebfCopy === name;
    copy.style.display = on ? "block" : "none";
    if (!on) continue;
    const pages = Array.from(copy.querySelectorAll<HTMLElement>("[id^=Page]")).filter((e) => /^Page\d+\D/.test(e.id) && e.id.includes(name!));
    for (const p of pages) p.style.display = p.id.startsWith(`Page${page}`) && !/^Page\d\d/.test(p.id) ? "block" : "none";
    // the template's own first block starts hidden (BIR turns its first DISPLAY: none into block)
    const first = copy.firstElementChild as HTMLElement | null;
    if (first && !pages.includes(first)) first.style.display = "block";
  }
}

/** A field id belongs to copy `code`+`n` (not `code`+`n0`…). */
const copyOf = (id: string, code: string) => id.match(new RegExp(`${code}(\\d+)(?!\\d)`))?.[1];

/** BIR's deleteAttachment: drop copy n of a kind; the later copies move down one and the count drops by one. */
export function deleteCopy(state: FormState, field: FieldSpec[], spec: AttachmentSpec, code: string, n: number): FormState {
  const kind = spec.kind.find((k) => k.code === code);
  if (!kind) return state;
  const count = Number(state[kind.count_field] || 0);
  if (n < 1 || n > count) return state;
  const next: FormState = { ...state };
  const byCopy = new Map<number, FieldSpec[]>();
  for (const f of field) {
    const m = copyOf(f.id, code);
    if (m) byCopy.set(Number(m), [...(byCopy.get(Number(m)) ?? []), f]);
  }
  for (let m = n; m <= count; m++) {
    for (const f of byCopy.get(m) ?? []) {
      const from = f.id.replace(new RegExp(`${code}${m}(?!\\d)`), `${code}${m + 1}`);
      if (m < count && from in state) next[f.id] = state[from]!;
      else delete next[f.id];
    }
  }
  next[kind.count_field] = String(count - 1);
  return next;
}
