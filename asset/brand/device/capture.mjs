// Screens for asset/brand/device: the running app (npm run dev), filled with made-up values.
// usage (repo root, browser lane pinned in the same command):
//   eval "$(node ~/.agents/skills/test-browser/scripts/use.mjs --lane device)" && node asset/brand/device/capture.mjs asset/brand/device/shot
//   python3 asset/brand/device/compose.py asset/brand/device/shot asset/brand/logo.png asset/brand/device.png
import { chromium } from 'playwright';
const out = process.argv[2], base = 'http://127.0.0.1:10900';
const shots = [
  { name: 'mac', url: `${base}/`, w: 1440, h: 848, scroll: 0, val: { tin1: '123', tin2: '456', tin3: '789', tin4: '000', lob: 'RETAIL TRADE', fn: 'DELA CRUZ, JUAN SANTOS', regAddr: '123 RIZAL ST., BRGY. SAN ANTONIO, PASIG CITY', zip: '1600', telNo: '09171234567', txtEmail: 'juan.delacruz@example.com', rdo: '043' } },
  { name: 'win', url: `${base}/legacy/forms/BIR-Form1701Qv2018.hta`, w: 1600, h: 820, scroll: 30, val: {
      'frm1701q:txtYear': '2026', 'frm1701q:txtTIN1': '123', 'frm1701q:txtTIN2': '456', 'frm1701q:txtTIN3': '789', 'frm1701q:txtBranchCode': '00000',
      'frm1701q:txtTaxpayerName': 'DELA CRUZ, JUAN SANTOS', 'frm1701q:txtAddress': '123 RIZAL ST., BRGY. SAN ANTONIO, PASIG CITY', 'frm1701q:txtZipCode': '1600',
      'frm1701q:txtBirthMonth': '03', 'frm1701q:txtBirthDay': '15', 'frm1701q:txtBirthYear': '1990', txtEmail: 'juan.delacruz@example.com', 'frm1701q:txtCitizenship': 'FILIPINO' },
    check: ['frm1701q:DateQuarter_2', 'frm1701q:AmendedRtn_2', 'frm1701q:optType_1', 'frm1701q:optATC_1', 'frm1701q:optForeignTaxCredits_2', 'frm1701q:optTaxRate_2'] },
  { name: 'linux', url: `${base}/legacy/forms/BIR-Form2550Qv2024.hta`, w: 1368, h: 824, scroll: 40, val: {
      'frm2550qv2024:txtYearNo2': '2026', 'frm2550qv2024:RtnPeriodFromNo4': '04/01/2026', 'frm2550qv2024:RtnPeriodToNo4': '06/30/2026',
      'frm2550qv2024:txtTIN1': '123', 'frm2550qv2024:txtTIN2': '456', 'frm2550qv2024:txtTIN3': '789', 'frm2550qv2024:branchCode': '00000', 'frm2550qv2024:txtRDOCode': '043',
      'frm2550qv2024:taxpayerName': 'DELA CRUZ, JUAN SANTOS', 'frm2550qv2024:taxpayerAddress': '123 RIZAL ST., BRGY. SAN ANTONIO, PASIG CITY', 'frm2550qv2024:taxpayerZip': '1600',
      'frm2550qv2024:taxpayerContactNumber': '09171234567', 'frm2550qv2024:taxpayerEmailAddress': 'juan.delacruz@example.com' },
    check: ['frm2550qv2024:calendarNo1', 'frm2550qv2024:OptQuarter2', 'frm2550qv2024:amendedReturnNo5', 'frm2550qv2024:OptShortPrd2', 'frm2550qv2024:taxPayerClassification1'] },
];
const ctx = await chromium.launchPersistentContext(process.env.AGENT_BROWSER_PROFILE, { executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH, headless: true, deviceScaleFactor: 1.5 });
const p = ctx.pages()[0] || await ctx.newPage();
for (const s of shots) {
  await p.setViewportSize({ width: s.w, height: s.h });
  await p.goto(s.url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await p.evaluate(({ val, check, scroll }) => {
    for (const [id, v] of Object.entries(val)) { const e = document.getElementById(id); if (e) e.value = v; }
    for (const id of check || []) { const e = document.getElementById(id); if (e) e.checked = true; }
    document.activeElement?.blur?.(); window.scrollTo(0, scroll);
  }, s);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${s.name}.png` });
  console.log(s.name, 'ok');
}
await ctx.close();
