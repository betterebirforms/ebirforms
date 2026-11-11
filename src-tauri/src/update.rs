//! In-app updates: the packaged app checks GitHub for a newer signed release and offers to install it.
//!
//! The check runs in Rust, not in a page: no webview (BIR's pages or the caption strip) gets updater access.
//! Every update is verified against the public key in tauri.conf.json before it is installed; the private key is
//! never in this repo (CI secret `TAURI_SIGNING_PRIVATE_KEY`). The release's `latest.json` is written by
//! tool/latest-json.mjs.
//!
//! The user stays in charge: nothing is installed without a yes, "Skip this version" is remembered, and
//! Updates > Check Automatically (saved as `{"check": false}` in `<app data>/data/settings/update.json`) or
//! `EBF_NO_UPDATE=1` turns the automatic check off.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

fn settings_path(data: &Path) -> PathBuf {
    data.join("settings/update.json")
}

fn settings(data: &Path) -> Value {
    std::fs::read(settings_path(data)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_else(|| json!({}))
}

fn save(data: &Path, value: &Value) {
    let p = settings_path(data);
    let _ = std::fs::create_dir_all(p.parent().unwrap());
    let _ = std::fs::write(p, serde_json::to_vec_pretty(value).unwrap_or_default());
}

/// Whether the automatic check at start-up is on (`{"check": false}` or EBF_NO_UPDATE=1 turns it off).
pub fn auto_check_enabled(data: &Path) -> bool {
    std::env::var_os("EBF_NO_UPDATE").is_none() && settings(data)["check"].as_bool() != Some(false)
}

/// Updates > Check Automatically: saves `{"check": true|false}`, keeping a skipped version.
pub fn set_auto_check(data: &Path, on: bool) {
    let mut s = settings(data);
    if !s.is_object() {
        s = json!({});
    }
    s["check"] = json!(on);
    save(data, &s);
}

/// Check once. `manual`: the user chose "Check for Updates…", so say so when there is nothing new or the check
/// failed, and ignore a skipped version.
pub fn check(app: AppHandle, data: PathBuf, manual: bool) {
    tauri::async_runtime::spawn(async move {
        let found = match app.updater() {
            Ok(u) => u.check().await.map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        };
        let update = match found {
            Ok(Some(u)) => u,
            Ok(None) => {
                if manual {
                    say(&app, "You have the latest version", &format!("eBIRForms {} is the newest version.", app.package_info().version));
                }
                return;
            }
            Err(e) => {
                if manual {
                    say(&app, "Couldn't check for updates", &format!("{e}\n\nCheck your internet connection and try again."));
                }
                return;
            }
        };
        let mut s = settings(&data);
        if !manual && s["skip"].as_str() == Some(update.version.as_str()) {
            return;
        }
        let notes = update.body.clone().unwrap_or_default();
        let message = format!(
            "eBIRForms {} is available. You have {}.\n\n{}\n\nSave any open return first: the app restarts after the update.",
            update.version,
            update.current_version,
            notes.trim()
        );
        let (app2, msg) = (app.clone(), message.clone());
        let install = tauri::async_runtime::spawn_blocking(move || {
            app2.dialog()
                .message(msg)
                .title("Update available")
                .buttons(MessageDialogButtons::OkCancelCustom("Install and Restart".into(), "Skip This Version".into()))
                .blocking_show()
        })
        .await
        .unwrap_or(false);
        if !install {
            s["skip"] = json!(update.version);
            save(&data, &s);
            return;
        }
        match update.download_and_install(|_, _| {}, || {}).await {
            Ok(()) => app.restart(),
            Err(e) => say(&app, "The update didn't install", &format!("{e}\n\nYou can download it from github.com/betterebirforms/ebirforms/releases/latest")),
        }
    });
}

fn say(app: &AppHandle, title: &str, text: &str) {
    app.dialog().message(text).title(title).kind(MessageDialogKind::Info).show(|_| {});
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn check_automatically_switch_round_trips_and_keeps_skip() {
        let dir = std::env::temp_dir().join(format!("ebf-update-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(settings(&dir).as_object().unwrap().is_empty());
        save(&dir, &json!({"skip": "0.1.3"}));
        set_auto_check(&dir, false);
        assert_eq!(settings(&dir), json!({"skip": "0.1.3", "check": false}));
        set_auto_check(&dir, true);
        assert_eq!(settings(&dir)["check"], json!(true));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
