// Old eBIRForms files carry a 3-digit branch code in their name; BIR's current app lists only 5 digits. The web
// version offers to update them: the 5-digit name, the branch inside set to match, nothing overwritten.
import { describe, expect, it } from "vitest";
import { fiveDigitName, fiveDigitText, oldBranchFile, updateBranch, type BranchStore } from "@/lib/branch";
import { parseSavefile, profileFromSavefile, profileToSavefile, serializeSavefile, getValue } from "@/lib/savefile";

const PROFILE = serializeSavefile(
  profileToSavefile({ tin1: "123", tin2: "456", tin3: "789", tin4: "001", rdo: "059", lob: "ACCOUNTING FIRM", fn: "DELA CRUZ, JUAN", regAddr: "LIPA CITY", zip: "4217", telNo: "09170000000", email: "juan@example.com", formType: "0" }),
);
const KEY = "frm2551Qv2018:txtBranchCode";
const RETURN = (branch: string, is_final_copy = false) =>
  serializeSavefile({ record: [{ key: "frm2551Qv2018:txtTIN3", value: "789" }, { key: KEY, value: branch }, { key: "frm2551Qv2018:txtRDOCode", value: "001" }], trailer_year: 2012, is_final_copy });

function memory(file: Record<string, string>): BranchStore & { file: Record<string, string> } {
  return {
    file,
    list: async (folder) => Object.keys(file).filter((p) => p.startsWith(`${folder}/`)).map((p) => p.slice(folder.length + 1)),
    read: async (path) => file[path]!,
    write: async (path, text) => void (file[path] = text),
    remove: async (path) => void delete file[path],
  };
}

describe("3-digit branch code to 5 digits", () => {
  it("names: only a 9-digit TIN plus 3-digit branch is old", () => {
    expect(fiveDigitName("123456789000.xml")).toBe("12345678900000.xml");
    expect(fiveDigitName("123456789001-2551Qv2018-122026Q3.xml")).toBe("12345678900001-2551Qv2018-122026Q3.xml");
    expect(fiveDigitName("12345678900000.xml")).toBeNull();
    expect(fiveDigitName("12345678900000-2551Qv2018-122026Q3.xml")).toBeNull();
    expect(fiveDigitName("notes.xml")).toBeNull();
  });

  it("text: sets the branch record only, every other byte kept", () => {
    const out = fiveDigitText(RETURN("001"), "123456789001-2551Qv2018-122026Q3.xml", [KEY]);
    expect(getValue(parseSavefile(out), KEY)).toBe("00001");
    expect(getValue(parseSavefile(out), "frm2551Qv2018:txtRDOCode")).toBe("001"); // same digits, another box
    expect(out).toBe(RETURN("00001"));
  });

  it("text: a final copy (what was filed) is not edited", () => {
    const filed = RETURN("001", true);
    expect(fiveDigitText(filed, "123456789001-2551Qv2018-122026Q3.xml", [KEY])).toBe(filed);
  });

  it("moves profiles and returns, and never overwrites", async () => {
    const store = memory({
      "profile/123456789001.xml": PROFILE,
      "savefile/123456789001-2551Qv2018-122026Q3.xml": RETURN("001"),
      "savefile/123456789001-2551Qv2018-092026Q2.xml": RETURN("001"),
      "savefile/12345678900001-2551Qv2018-092026Q2.xml": "ALREADY THERE",
      "savefile/123456789001-9999-x.xml": RETURN("001"), // a form we do not know: the name alone changes
      "savefile/98765432100000-2551Qv2018-122026Q3.xml": RETURN("00000"),
    });
    expect(await oldBranchFile(store)).toEqual({
      profile: ["123456789001.xml"],
      savefile: ["123456789001-2551Qv2018-092026Q2.xml", "123456789001-2551Qv2018-122026Q3.xml", "123456789001-9999-x.xml"],
    });
    const r = await updateBranch(store, (name) => (name.includes("-2551Qv2018-") ? KEY : null));
    expect(r.kept).toEqual(["savefile/123456789001-2551Qv2018-092026Q2.xml"]);
    expect(r.updated.sort()).toEqual(["profile/12345678900001.xml", "savefile/12345678900001-2551Qv2018-122026Q3.xml", "savefile/12345678900001-9999-x.xml"]);
    expect(Object.keys(store.file).sort()).toEqual([
      "profile/12345678900001.xml",
      "savefile/12345678900001-2551Qv2018-092026Q2.xml",
      "savefile/12345678900001-2551Qv2018-122026Q3.xml",
      "savefile/12345678900001-9999-x.xml",
      "savefile/123456789001-2551Qv2018-092026Q2.xml",
      "savefile/98765432100000-2551Qv2018-122026Q3.xml",
    ]);
    expect(store.file["savefile/12345678900001-2551Qv2018-092026Q2.xml"]).toBe("ALREADY THERE");
    expect(profileFromSavefile(parseSavefile(store.file["profile/12345678900001.xml"]!)).tin4).toBe("00001");
    expect(store.file["profile/12345678900001.xml"]).toContain("<div>confirmtin4=00001confirmtin4=</div>");
    expect(store.file["savefile/12345678900001-2551Qv2018-122026Q3.xml"]).toBe(RETURN("00001"));
    expect(store.file["savefile/12345678900001-9999-x.xml"]).toBe(RETURN("001"));
    expect(await oldBranchFile(store)).toEqual({ profile: [], savefile: ["123456789001-2551Qv2018-092026Q2.xml"] });
  });
});
