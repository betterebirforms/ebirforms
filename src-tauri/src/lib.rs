mod bir_mod;
mod codec;
#[cfg(feature = "bir-submit")]
mod crypto;
#[cfg(feature = "bir-submit")]
mod dispatch;
mod host;
#[cfg(target_os = "macos")]
mod mac_dialog;
mod package;
#[cfg(feature = "bir-submit")]
mod submit;
mod update;

use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WindowEvent};

/// Reserved host port (block 10900–10999 in ~/Code/PORTS.md); falls back to an OS-assigned port.
const HOST_PORT: u16 = 10907;
/// Height of the faux-XP caption bar (Luna's caption is 30 px at 96 dpi).
const CAPTION_HEIGHT: f64 = 30.0;

/// Serve the built shell from a folder (`dist/`) instead of the bundled assets — headless host and `EBF_RUST_HOST`.
fn file_asset(dist_dir: std::path::PathBuf) -> host::AssetFn {
    Box::new(move |path: &str| {
        let p = dist_dir.join(path.trim_start_matches('/'));
        let mime = match p.extension().and_then(|e| e.to_str()).unwrap_or("") {
            "html" => "text/html",
            "js" => "text/javascript",
            "css" => "text/css",
            "png" => "image/png",
            "svg" => "image/svg+xml",
            _ => "application/octet-stream",
        };
        std::fs::read(&p).ok().map(|b| (b, mime.to_string()))
    })
}

/// The packaged app's loopback host without a window — for the WebKit playtests (`cargo run --example host`).
/// Serves `dist_dir` as the shell and `original_dir` as BIR's tree; never contacts BIR unless EBF_DISPATCH_HOST
/// or the user's own Submit asks it to.
pub fn serve_headless(dist_dir: std::path::PathBuf, original_dir: std::path::PathBuf, data_dir: std::path::PathBuf, port: u16) -> Result<u16, String> {
    for d in ["savefile", "profile", "IAF_RDO_Copy"] {
        std::fs::create_dir_all(data_dir.join(d)).map_err(|e| e.to_string())?;
    }
    let host = host::Host {
        asset: file_asset(dist_dir),
        original: original_dir,
        shipped: None,
        data: data_dir,
        mod_dir: std::env::var_os("EBF_MOD_DIR").map(std::path::PathBuf::from),
        token: std::env::var("EBF_TOKEN").unwrap_or_else(|_| host::random_token()),
        print: Box::new(|| Err("no window to print in the headless host".into())),
        close: Box::new(|| Err("no window to close in the headless host".into())),
        #[cfg(feature = "bir-submit")]
        conn: Default::default(),
    };
    let server = tiny_http::Server::http(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    let bound = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(port);
    std::thread::spawn(move || host.serve(server));
    Ok(bound)
}

/// Debug-only (`EBF_SELFTEST=1 npm run tauri dev`): press the real caption buttons inside the caption webview —
/// their click handlers, the capability's permissions and Tauri's window calls — and print the window state Rust
/// reads back after each step. Drag is checked via the same IPC call `data-tauri-drag-region` makes. Ends by
/// pressing Close, so the app exits.
fn caption_selftest(handle: tauri::AppHandle) {
    use tauri::Listener;
    handle.listen("selftest", |e| println!("SELFTEST js {}", e.payload()));
    std::thread::spawn(move || {
        let pause = |ms| std::thread::sleep(std::time::Duration::from_millis(ms));
        let (Some(win), Some(cap)) = (handle.get_window("main"), handle.get_webview("caption")) else {
            println!("SELFTEST FAIL no window/caption");
            return;
        };
        let state = |step: &str| {
            println!(
                "SELFTEST {step}: maximized={} minimized={}",
                win.is_maximized().unwrap_or(false),
                win.is_minimized().unwrap_or(false)
            )
        };
        let press = |js: &str| {
            let _ = cap.eval(js);
        };
        pause(4000);
        state("start");
        press("document.querySelector('button.maximize').click()");
        pause(1500);
        state("after maximize button (expect restored)");
        press("document.querySelector('button.maximize').click()");
        pause(1500);
        state("after maximize button again (expect maximized)");
        press("document.querySelector('.title').dispatchEvent(new MouseEvent('dblclick', {bubbles: true}))");
        pause(1500);
        state("after title double-click (expect restored)");
        press("document.querySelector('.title').dispatchEvent(new MouseEvent('dblclick', {bubbles: true}))");
        pause(1500);
        state("after title double-click again (expect maximized)");
        press("document.querySelector('button.minimize').click()");
        pause(1500);
        state("after minimize button (expect minimized)");
        let _ = win.unminimize();
        pause(1500);
        state("after unminimize (expect not minimized)");
        press(
            "(async () => { const ipc = window.__TAURI_INTERNALS__; let r; \
             try { await ipc.invoke('plugin:window|start_dragging', { label: 'main' }); r = 'start_dragging ok'; } \
             catch (e) { r = 'start_dragging error: ' + e; } \
             const cls = document.getElementById('caption').className; \
             await ipc.invoke('plugin:event|emit', { event: 'selftest', payload: r + ' | caption class: ' + cls }); })()",
        );
        pause(2000);
        println!("SELFTEST pressing close");
        press("document.querySelector('button.close').click()");
    });
}

/// The Go menu: point the content webview at BIR's main screen or the native forms.
/// Opens a folder in Finder / File Explorer / the Linux file manager (made first if it isn't there yet).
fn show_folder(dir: &std::path::Path) {
    let _ = std::fs::create_dir_all(dir);
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    };
    let _ = std::process::Command::new(opener).arg(dir).spawn();
}

fn go_to(app: &tauri::AppHandle, id: &str) {
    let page = match id {
        "go_main" => "/legacy/BIRForms.hta",
        "go_form" => "/form",
        "go_mod" => "/mod",
        _ => return,
    };
    if let Some(content) = app.get_webview("content") {
        let _ = content.eval(format!("location.href = '{page}'"));
    }
}

/// Debug-only (`EBF_GOTEST=1 npm run tauri dev`): fire the Go menu's two handlers and print what the content
/// webview shows after each (its path and the native form-list length), then quit.
fn go_selftest(handle: tauri::AppHandle) {
    use tauri::Listener;
    handle.listen("selftest", |e| println!("GOTEST {}", e.payload()));
    std::thread::spawn(move || {
        let pause = |ms| std::thread::sleep(std::time::Duration::from_millis(ms));
        let report = |step: &str| {
            if let Some(content) = handle.get_webview("content") {
                println!("GOTEST at {}: {}", step, content.url().map(|u| u.path().to_string()).unwrap_or_default());
            }
        };
        pause(5000);
        report("start");
        go_to(&handle, "go_form");
        pause(3000);
        report("after Go > Native Forms");
        go_to(&handle, "go_main");
        pause(3000);
        report("after Go > BIR Main Screen");
        handle.exit(0);
    });
}

/// Debug-only (`EBF_FINALTEST=1`, with `EBF_RUST_HOST=<data dir>` holding `profile/84653210700000.xml`): in the real
/// app window, fill BIR's own 0605 and press its Submit / Final Copy button, BIR's dialogs answered OK and logged;
/// then print the savefile Rust finds (name, plain or not, final flag) and quit. The scripted steps are the same as
/// test/legacy-0605.test.ts.
fn final_selftest(handle: tauri::AppHandle, data: std::path::PathBuf) {
    std::thread::spawn(move || {
        let pause = |ms| std::thread::sleep(std::time::Duration::from_millis(ms));
        let Some(content) = handle.get_webview("content") else { return };
        pause(4000);
        let _ = content.eval("location.href = '/legacy/forms/BIR-Form0605.hta?xmlBGInfoFileName=profile/84653210700000.xml'");
        pause(5000);
        let _ = content.eval(
            "(() => { window.__dlg = []; window.alert = (m) => { window.__dlg.push(String(m)); }; \
             window.confirm = (m) => { window.__dlg.push(String(m)); return !String(m).startsWith('File saved and encrypted.') ? true : false; }; \
             const f = (id) => document.getElementById(id); \
             const fill = (id, v) => { const e = f(id); e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('blur')); }; \
             f('frm0605:itemFiscalStartMonth:_1').click(); f('frm0605:txtClassification:_1').click(); \
             fill('frm0605:txtReturnPeriodMonth','10'); fill('frm0605:txtReturnPeriodDay','15'); fill('frm0605:txtReturnPeriodYear','2026'); \
             fill('frm0605:txtDueDateMonth','10'); fill('frm0605:txtDueDateDay','31'); fill('frm0605:txtDueDateYear','2026'); \
             f('frm0605:itemMannerOfPayment:_1').click(); f('frm0605:itemModeOfPayment:_3').click(); \
             f('btnTaxType').click(); f('TaxTypeCode1').click(); getTaxTypeCode(); \
             f('btnATC').click(); f('AtcCode1').click(); getATCCode(); \
             fill('frm0605:txtTax19','1234.50'); \
             const btn = (v) => [...document.querySelectorAll('input[type=button]')].filter((b) => b.value === v).pop(); \
             btn('Validate').click(); btn('Submit / Final Copy').click(); })()",
        );
        pause(5000);
        let dir = data.join("savefile");
        for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            let byte = std::fs::read(entry.path()).unwrap_or_default();
            let text = String::from_utf8_lossy(&byte);
            println!(
                "FINALTEST {} plain_xml={} final_flag_3={} secret_key={}",
                entry.file_name().to_string_lossy(),
                text.starts_with("<?xml"),
                text.contains("txtFinalFlag=3txtFinalFlag="),
                text.contains("ebirOnline")
            );
        }
        handle.exit(0);
    });
}

/// Debug-only (`EBF_DIALOGTEST=1 npm run tauri dev`, any OS): call `confirm()` then `alert()` in the real content
/// webview, look 4 s later whether `confirm()` is still waiting (a dialog is up), press Return twice, and print
/// `DIALOGTEST shown=<bool> confirm=<answer>&ms=<wait>&alert=closed`. Before the macOS fix (issue #1) it read
/// `shown=false confirm=false&ms=1`. CI runs it on Windows and Linux (.github/workflows/dialog.yml).
fn dialog_selftest(handle: tauri::AppHandle) {
    // Return on whatever window has focus: the dialog, if one is showing
    fn press_return() {
        let _ = if cfg!(target_os = "macos") {
            std::process::Command::new("osascript").args(["-e", "tell application \"System Events\" to key code 36"]).status()
        } else if cfg!(windows) {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", "(New-Object -ComObject WScript.Shell).SendKeys('{ENTER}')"])
                .status()
        } else {
            std::process::Command::new("xdotool").args(["key", "Return"]).status()
        };
    }
    std::thread::spawn(move || {
        let pause = |ms| std::thread::sleep(std::time::Duration::from_millis(ms));
        let Some(content) = handle.get_webview("content") else { return };
        let hash = |c: &tauri::Webview| c.url().map(|u| u.fragment().unwrap_or("").to_string()).unwrap_or_default();
        pause(5000);
        // EBF_DIALOGTEST=submit: BIR's own Submit messages (the shim rewrites them in a build that can't submit), each
        // left up 15 s so CI can screenshot what a user reads
        let submit = std::env::var("EBF_DIALOGTEST").as_deref() == Ok("submit");
        let (ask, tell, wait) = if submit {
            (
                "Please ensure that you have INTERNET access and a VALID email address is indicated in your tax return.\\n\\nAre you sure you want to submit?",
                "The system detected that you have no internet connection.\\nPlease contact your internet service provider.",
                15000,
            )
        } else {
            ("EBF_DIALOGTEST: press OK", "EBF_DIALOGTEST: alert", 4000)
        };
        let _ = content.eval(format!(
            "setTimeout(() => {{ const t = performance.now(); const c = confirm('{ask}'); \
             location.hash = 'confirm=' + c + '&ms=' + Math.round(performance.now() - t); \
             alert('{tell}'); location.hash += '&alert=closed'; }}, 50)"
        ));
        // a dialog blocks confirm() until it is answered; with no dialog it returns false at once (issue #1: 1 ms)
        pause(wait);
        let shown = !hash(&content).contains("confirm=");
        for _ in 0..2 {
            press_return();
            pause(if submit { wait } else { 2500 });
        }
        println!("DIALOGTEST shown={shown} {}", hash(&content));
        handle.exit(0);
    });
}

/// Debug-only (`EBF_PRINTTEST='forms/<page>.hta|<js>' npm run tauri dev`): open a BIR page in the content webview,
/// run `<js>` (e.g. the form's own print function). The print sheet is left open for the caller to read (page count)
/// and cancel.
fn print_selftest(handle: tauri::AppHandle, spec: String) {
    std::thread::spawn(move || {
        let pause = |ms| std::thread::sleep(std::time::Duration::from_millis(ms));
        let (page, js) = spec.split_once('|').unwrap_or((spec.as_str(), "window.print()"));
        let Some(content) = handle.get_webview("content") else { return };
        pause(4000);
        let _ = content.eval(format!("location.href = '/legacy/{page}'"));
        pause(6000);
        println!("PRINTTEST running: {js}");
        let _ = content.eval(js);
        println!("PRINTTEST ran");
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // used from Rust only (update.rs): no webview is granted the updater's commands. No dialog plugin: it rewrites
        // window.alert/confirm in every page (update.rs uses rfd instead)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // debug + EBF_RUST_HOST=<data dir>: the packaged Rust host (native print, Submit) over dist/ + vendor/original
            let rust_host_data = std::env::var("EBF_RUST_HOST").ok().filter(|_| cfg!(debug_assertions));
            let url = if cfg!(debug_assertions) && rust_host_data.is_none() {
                // `tauri dev`: Vite (with the Node legacy host) is already serving on the dev port
                "http://127.0.0.1:10900/".to_string()
            } else {
                let root = app.path().app_data_dir()?;
                let (asset, original, data) = match &rust_host_data {
                    Some(d) => {
                        let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
                        (file_asset(repo.join("dist")), repo.join("vendor/original"), std::path::PathBuf::from(d))
                    }
                    None => {
                        let resolver = app.asset_resolver();
                        let asset: host::AssetFn = Box::new(move |path: &str| resolver.get(path.to_string()).map(|a| (a.bytes.to_vec(), a.mime_type)));
                        (asset, root.join("original"), root.join("data"))
                    }
                };
                let handle = app.handle().clone();
                let host = host::Host {
                    asset,
                    original,
                    // `npm run package` ships BIR's tree as Resources/bir; absent in dev and in a plain build
                    shipped: if rust_host_data.is_none() { app.path().resource_dir().ok().map(|r| r.join("bir")) } else { None },
                    data: data.clone(),
                    // the user's own mods: <app data>/mod (beside data/, not inside it)
                    mod_dir: Some(root.join("mod")),
                    token: host::random_token(),
                    // print the content webview (BIR's page), never the caption bar
                    print: Box::new(move || {
                        let webview = handle.get_webview("content").ok_or("no content webview")?;
                        webview.print().map_err(|e| e.to_string())
                    }),
                    close: {
                        let handle = app.handle().clone();
                        Box::new(move || handle.get_window("main").ok_or("no main window")?.close().map_err(|e| e.to_string()))
                    },
                    #[cfg(feature = "bir-submit")]
                    conn: Default::default(),
                };
                for d in ["savefile", "profile", "IAF_RDO_Copy"] {
                    std::fs::create_dir_all(data.join(d))?;
                }
                let server = tiny_http::Server::http(("127.0.0.1", HOST_PORT))
                    .or_else(|_| tiny_http::Server::http(("127.0.0.1", 0)))
                    .map_err(|e| format!("cannot bind the local host: {e}"))?;
                let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(HOST_PORT);
                std::thread::spawn(move || host.serve(server));
                format!("http://127.0.0.1:{port}/")
            };
            // BIR's window, drawn the way the original looked on Windows XP: no OS frame, a Luna caption bar
            // (its own small webview, so printing and BIR's absolute layouts are untouched) above the content.
            let (width, height) = (1280.0, 860.0);
            let window = WindowBuilder::new(app, "main")
                .title("Offline eBIRForms Package")
                .inner_size(width, height)
                .min_inner_size(960.0, 640.0)
                .decorations(false)
                .build()?;
            let base: tauri::Url = url.parse()?;
            let caption = window.add_child(
                WebviewBuilder::new("caption", WebviewUrl::External(base.join("caption.html")?)),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(width, CAPTION_HEIGHT),
            )?;
            // Linux: wry packs every child webview into the window's GtkBox with expand + fill, and ignores the
            // bounds above for a box parent, so GTK split the height evenly (a ~390 px blue caption over half a
            // page). Repack the caption as a fixed 30 px row; the content webview takes the rest.
            #[cfg(target_os = "linux")]
            caption.with_webview(|w| {
                use gtk::prelude::*;
                let view = w.inner();
                view.set_size_request(-1, CAPTION_HEIGHT as i32);
                view.set_vexpand(false);
                if let Some(parent) = view.parent().and_then(|p| p.downcast::<gtk::Box>().ok()) {
                    parent.set_child_packing(&view, false, true, 0, gtk::PackType::Start);
                }
            })?;
            let content = window.add_child(
                WebviewBuilder::new("content", WebviewUrl::External(base)),
                LogicalPosition::new(0.0, CAPTION_HEIGHT),
                LogicalSize::new(width, height - CAPTION_HEIGHT),
            )?;
            // macOS: wry's webview shows no alert/confirm/prompt (issue #1); add them before BIR's page can ask
            #[cfg(target_os = "macos")]
            for view in [&caption, &content] {
                mac_dialog::install(view)?;
            }
            let w = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Resized(size) = event {
                    let scale = w.scale_factor().unwrap_or(1.0);
                    let size = size.to_logical::<f64>(scale);
                    let _ = caption.set_size(LogicalSize::new(size.width, CAPTION_HEIGHT));
                    let _ = content.set_position(LogicalPosition::new(0.0, CAPTION_HEIGHT));
                    let _ = content.set_size(LogicalSize::new(size.width, (size.height - CAPTION_HEIGHT).max(0.0)));
                }
            });
            // BIRForms.hta: WINDOWSTATE="maximize". After the webviews attach — the builder's `.maximized(true)` is
            // ignored for a frameless window on macOS (it opened at the minimum size).
            window.maximize()?;
            // Go menu: BIR's own main screen (the 1:1 default) or the native forms (`/form`, ROADMAP P4). Kept in
            // the OS menu bar, not the faux-XP caption, so BIR's window still looks like BIR's.
            {
                use tauri::menu::{CheckMenuItemBuilder, Menu, MenuItemBuilder, SubmenuBuilder};
                let main = MenuItemBuilder::with_id("go_main", "BIR Main Screen").accelerator("CmdOrCtrl+Shift+M").build(app)?;
                let native = MenuItemBuilder::with_id("go_form", "Native Forms").accelerator("CmdOrCtrl+Shift+F").build(app)?;
                let mods = MenuItemBuilder::with_id("go_mod", "Mods").build(app)?;
                // where returns are saved, so a user can copy one to BIR's own app on Windows
                let saved = MenuItemBuilder::with_id("show_saved", "Show Saved Returns").build(app)?;
                let go = SubmenuBuilder::new(app, "Go").item(&main).item(&native).separator().item(&mods).item(&saved).build()?;
                let data = app.path().app_data_dir()?.join("data");
                let check = MenuItemBuilder::with_id("check_update", "Check for Updates…").build(app)?;
                let auto = CheckMenuItemBuilder::with_id("auto_update", "Check Automatically")
                    .checked(update::auto_check_enabled(&data))
                    .build(app)?;
                let help = SubmenuBuilder::new(app, "Updates").item(&check).item(&auto).build()?;
                let menu = Menu::default(app.handle())?;
                menu.append(&go)?;
                menu.append(&help)?;
                app.set_menu(menu)?;
                app.on_menu_event(move |app, event| match event.id().as_ref() {
                    "check_update" => update::check(app.clone(), data.clone(), true),
                    // the menu toggles the tick itself; save what it now shows
                    "auto_update" => update::set_auto_check(&data, auto.is_checked().unwrap_or(true)),
                    "show_saved" => show_folder(&data.join("savefile")),
                    id => go_to(app, id),
                });
            }
            // a packaged build checks GitHub for a newer signed release once at start-up (update.rs)
            if !cfg!(debug_assertions) {
                let data = app.path().app_data_dir()?.join("data");
                if update::auto_check_enabled(&data) {
                    update::check(app.handle().clone(), data, false);
                }
            }
            if let (true, Ok(_), Some(d)) = (cfg!(debug_assertions), std::env::var("EBF_FINALTEST"), rust_host_data.clone()) {
                final_selftest(app.handle().clone(), std::path::PathBuf::from(d));
            }
            if cfg!(debug_assertions) && std::env::var("EBF_UPDATETEST").is_ok() {
                update::selftest(app.handle().clone());
            }
            if cfg!(debug_assertions) && std::env::var("EBF_DIALOGTEST").is_ok() {
                dialog_selftest(app.handle().clone());
            }
            if cfg!(debug_assertions) && std::env::var("EBF_GOTEST").is_ok() {
                go_selftest(app.handle().clone());
            }
            if cfg!(debug_assertions) && std::env::var("EBF_SELFTEST").is_ok() {
                caption_selftest(app.handle().clone());
            }
            if cfg!(debug_assertions) {
                if let Ok(spec) = std::env::var("EBF_PRINTTEST") {
                    print_selftest(app.handle().clone(), spec);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ebirforms");
}
