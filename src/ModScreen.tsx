import { useEffect, useState } from "react";
import { listMods, setMod, type ModSummary } from "@/lib/vfs";

/** What each mod folder means, in the words of mod/README.md. */
const KIND: Record<string, string> = {
  fix: "Fixes a bug in BIR's own code",
  compat: "Makes something from Internet Explorer work in today's browsers",
  security: "Closes a security hole",
  speed: "Makes a page faster",
  remove: "Takes out something unused",
  improve: "Adds something BIR's app never had",
};

/**
 * Go > Mods: every change we make to BIR's pages, in plain words, each with an on/off switch. Switching writes
 * `mod.json` in the user's mod folder; BIR's pages pick it up the next time they open.
 */
export function ModScreen() {
  const [mod, setList] = useState<ModSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => listMods().then(setList, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);
  const toggle = async (m: ModSummary) => {
    setError(null);
    try {
      await setMod(m.id, !m.on);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!mod) return <main className="mod-screen">{error ?? "Loading mods…"}</main>;
  const kind = [...new Set(mod.map((m) => m.kind))];
  return (
    <main className="mod-screen">
      <h1>Mods</h1>
      <p>
        Each mod is one change we make to BIR's pages while the app shows them. BIR's own files are never edited. Switch a mod off to
        get BIR's original behaviour back. Changes apply the next time a form opens. <a href="/legacy/BIRForms.hta">Back to BIR's main screen</a>
      </p>
      {error && <p role="alert">{error}</p>}
      {kind.map((k) => (
        <section key={k}>
          <h2>
            {k} <small>{KIND[k] ?? ""}</small>
          </h2>
          <ul>
            {mod
              .filter((m) => m.kind === k)
              .map((m) => (
                <li key={m.id}>
                  <label>
                    <input type="checkbox" checked={m.on} onChange={() => void toggle(m)} />
                    <strong>{m.title}</strong>
                    {m.source === "user" && <em> (your mod)</em>}
                  </label>
                  <p>{m.about}</p>
                  <code>{m.id}</code>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
