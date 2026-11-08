// Seed a test taxpayer profile into the dev data root (.data/), written by our own codec.
import { mkdirSync, writeFileSync } from "node:fs";
import { profileFileName, profileToSavefile, writeSavefile, type Profile } from "../src/lib/savefile.ts";

const profile: Profile = {
  fn: "DELA CRUZ, JUAN & SONS",
  tin1: "846",
  tin2: "532",
  tin3: "107",
  tin4: "00000",
  rdo: "043",
  lob: "RETAIL",
  regAddr: "1 RIZAL ST., QUEZON CITY",
  zip: "1100",
  telNo: "0281234567",
  email: "juan@example.com",
  formType: process.argv[2] ?? "", // a form only reads a profile whose formType names it
};
const dir = `${process.env.EBIRFORMS_DATA_DIR ?? ".data"}/profile`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${profileFileName(profile)}`, writeSavefile(profileToSavefile(profile)));
console.log(`seeded ${dir}/${profileFileName(profile)}`);
