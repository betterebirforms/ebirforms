// BIR's own artwork, bundled from asset/bir/ by tool/asset-extract.mjs (README "Legal": government works, used
// freely): the seal-and-name banner, and the per-page barcode BIR prints on each form page.

import headerUrl from "../../asset/bir/header.png";
import barcodeJson from "../../asset/bir/barcode.json";

const barcodeFile = import.meta.glob("../../asset/bir/barcode/*/*.{png,PNG,jpg,jpeg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const page = barcodeJson as Record<string, string[]>;

/** The "Republic of the Philippines / Bureau of Internal Revenue" banner (white type — needs a dark backdrop). */
export const birHeaderUrl: string = headerUrl;

/** A form's page barcodes in page order (BIR's own images, e.g. "1601-FQ 01/18 P1"); empty for forms BIR
 *  never printed one on (0605, 1601E, …). */
export const barcodeUrl = (form_code: string): string[] =>
  (page[form_code] ?? []).map((rel) => barcodeFile[`../../asset/bir/barcode/${rel}`]).filter((url): url is string => Boolean(url));
