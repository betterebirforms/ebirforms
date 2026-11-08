// Evaluated in BIR's blank 1701 (the oracle, test/oracle.ts): the three captures tool/port1701.mjs `page` reads.
// Save .dom / .ids / .tables as dom-out.json / ids-out.json / tables-out.json.
(() => {
  const el = [];
  for (const e of Array.from(document.querySelectorAll("input, select, textarea"))) {
    const anc = [];
    for (let p = e.parentElement; p; p = p.parentElement) if (p.id) anc.push(p.id);
    el.push({
      id: e.id, tag: e.tagName.toLowerCase(), type: e.type, name: e.getAttribute("name") || "", cls: e.className,
      ml: e.getAttribute("maxlength"), dis: e.disabled, v: e.value, chk: !!e.checked, anc: anc.join(" "),
      blur: e.getAttribute("onblur") || "", click: e.getAttribute("onclick") || "", change: e.getAttribute("onchange") || "",
      inForm: !!e.form && e.form.id === "frmMain", vis: e.offsetParent !== null,
    });
  }
  const ids = Array.from(document.querySelectorAll("[id]")).filter((e) => !/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)).map((e) => `${e.tagName.toLowerCase()} ${e.id}`);
  const tables = {};
  for (const t of Array.from(document.querySelectorAll("table[id]")))
    tables[t.id] = Array.from(t.rows).map((r) => ({
      cell: Array.from(r.cells).map((c) => (c.children[0] && c.children[0].id) || ""),
      input: Array.from(r.getElementsByTagName("input")).map((i) => i.id),
    }));
  return { dom: { el }, ids, tables };
})()
