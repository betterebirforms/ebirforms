// BIR's older eBIRForms wrote the branch code with 3 digits (123456789000.xml, 123456789000-2551Q-….xml); the
// current one writes 5 (12345678900000…) and lists only an exact match, so it never shows the old files under a
// 5-digit profile. This moves an old file to its 5-digit name and sets the branch inside it to match, so BIR's
// app lists it and saves it back under the same name. Only on the user's say-so, and never over a file that exists.

/** The 5-digit name of a profile or savefile named with a 3-digit branch; null when the name is not one. */
export function fiveDigitName(name: string): string | null {
  const m = /^(\d{9})(\d{3})(-.+)?\.xml$/i.exec(name);
  return m ? `${m[1]}${m[2]!.padStart(5, "0")}${m[3] ?? ""}.xml` : null;
}

const FINAL_COPY = /All Rights Reserved BIR \d{4}\.0\s*$/;

/** Set one record's value in place, every other byte kept. Only when it holds exactly `from`. */
const setRecord = (text: string, key: string, from: string, to: string) =>
  text.split(`<div>${key}=${from}${key}=</div>`).join(`<div>${key}=${to}${key}=</div>`);

/**
 * The file's text with its branch set to 5 digits. `key` names the records that hold the branch: tin4 and
 * confirmtin4 in a profile, the form's own branch box in a return. A final copy is what was filed: left as it is.
 */
export function fiveDigitText(text: string, name: string, key: string[]): string {
  const m = /^\d{9}(\d{3})/.exec(name);
  if (!m || FINAL_COPY.test(text)) return text;
  return key.reduce((t, k) => setRecord(t, k, m[1]!, m[1]!.padStart(5, "0")), text);
}

export interface BranchStore {
  list(folder: string): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
}

export interface BranchResult {
  /** files moved to their 5-digit name */
  updated: string[];
  /** files left alone because the 5-digit name is already taken */
  kept: string[];
}

/** The profiles and returns still named with a 3-digit branch. */
export async function oldBranchFile(store: Pick<BranchStore, "list">): Promise<{ profile: string[]; savefile: string[] }> {
  const old = async (folder: string) => (await store.list(folder).catch(() => [] as string[])).filter((n) => fiveDigitName(n)).sort();
  return { profile: await old("profile"), savefile: await old("savefile") };
}

/**
 * Move every 3-digit profile and return to its 5-digit name. `branchKey` gives the record that holds the branch
 * in a return (null: unknown form, the name alone changes). The new file is written and read back before the old
 * one is removed, so a failed write loses nothing.
 */
export async function updateBranch(store: BranchStore, branchKey: (savefile_name: string) => string | null): Promise<BranchResult> {
  const result: BranchResult = { updated: [], kept: [] };
  const old = await oldBranchFile(store);
  for (const folder of ["profile", "savefile"] as const) {
    const taken = new Set((await store.list(folder)).map((n) => n.toLowerCase()));
    for (const name of old[folder]) {
      const next = fiveDigitName(name)!;
      if (taken.has(next.toLowerCase())) {
        result.kept.push(`${folder}/${name}`);
        continue;
      }
      const key = folder === "profile" ? ["tin4", "confirmtin4"] : [branchKey(name)].filter((k): k is string => !!k);
      const text = fiveDigitText(await store.read(`${folder}/${name}`), name, key);
      await store.write(`${folder}/${next}`, text);
      if ((await store.read(`${folder}/${next}`)).length === 0) throw new Error(`Could not write ${folder}/${next}. Nothing was removed.`);
      await store.remove(`${folder}/${name}`);
      taken.add(next.toLowerCase());
      result.updated.push(`${folder}/${next}`);
    }
  }
  return result;
}
