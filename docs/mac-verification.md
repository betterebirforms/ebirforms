# macOS verification — turnkey checklist

The one half of the port that cannot be finished from a Windows session: **running the Apple-Silicon
`.dmg` on a real Mac and confirming the forms render, compute, and print.** Everything else (84/84 forms
load in WebKit, 13 native rewrites oracle-proven byte-compatible, byte-exact encryption, SFTP submission)
is verified on CI; this is the last mile that needs the hardware.

`bin/ebf-doctor.mjs` (pattern borrowed from rootstacks' `bs-doctor`) makes it one command.

## On the MacBook

```sh
git clone <repo> && cd ebirforms
npm install
npm run doctor            # toolchain + repo checks, read-only
npm run doctor -- --gate  # also run typecheck + vitest
npm run doctor -- --build # also build the aarch64 .dmg (needs Rust + Xcode CLT)
```

Prerequisites the doctor checks for: macOS 12+ on arm64, Node ≥ 20, Rust (rustup), Xcode Command Line
Tools (`xcode-select --install`), and the Tauri CLI (a dev-dependency, present after `npm install`).

## The manual part (what a script can't verify)

1. `open src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg`, drag **eBIRForms** to
   `/Applications`, launch it.
2. First launch of an unsigned build: right-click → **Open**, or
   `xattr -dr com.apple.quarantine /Applications/eBIRForms.app`.
3. Open a simple form (**0605**): confirm it renders and totals update live as you type.
4. **Print** (⌘P) → *Save as PDF*: confirm the layout matches the legacy form — no clipped fields, all
   totals present, barcode/jurat images in place.
5. Open a form **saved on Windows**: confirm every value round-trips identically.
6. Report back: launch OK? print layout OK? any errors in **Console.app** (filter `eBIRForms`)?

Paste any crash log or screenshot of a wrong print layout and the fixes can be driven from there.

## Why signing/notarization is deferred

The build is unsigned (no Apple Developer account wired in). That is fine for local verification via the
quarantine override above. Notarization is a release-time concern, tracked in `ROADMAP.md`, not a blocker
for confirming the port runs and prints correctly.
