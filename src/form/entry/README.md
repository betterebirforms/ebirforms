One file per natively rewritten form: `<CODE>.ts` (BIR's form code, e.g. `1702RTv2018C.ts`) default-exporting its
`NativeForm` (`import type { NativeForm } from "../registry.ts"`). `registry.ts` picks it up by file name.
