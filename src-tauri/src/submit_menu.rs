//! Go > Send Returns to BIR (beta): the user's switch for online submission. Off by default. Turning it on warns
//! plainly, fetches BIR's two keys from BIR's official package the first time (bir_key.rs), then saves the switch.

use crate::{bir_key, submit_setting, update::ask};
use std::path::PathBuf;
use tauri::menu::CheckMenuItem;
use tauri::{AppHandle, Wry};

pub const TITLE: &str = "Send Returns to BIR (beta)";

const WARNING: &str = "When this is on, Submit sends your return to BIR's server, the same way BIR's own eBIRForms app does.\n\n\
Before you turn it on:\n\n\
- This app is unofficial and not approved by BIR. Sending is new: no return sent by this app has been confirmed by BIR yet.\n\n\
- Your return is filed only when BIR's confirmation email arrives (the Tax Return Receipt Confirmation). Keep that email. If it doesn't arrive within a day, file the return another way.\n\n\
- The first time, the app downloads BIR's official Offline eBIRForms Package (about 18 MB) from bir.gov.ph and keeps two files from it. It never runs them.";

/// The menu ticks the item itself before this runs; `on` is what it now shows.
pub fn toggle(app: AppHandle, data: PathBuf, item: CheckMenuItem<Wry>) {
    let on = item.is_checked().unwrap_or(false);
    tauri::async_runtime::spawn(async move {
        if !on {
            let _ = submit_setting::set_enabled(&data, false);
            ask(&app, TITLE, "Sending is off. Submit makes a final copy on this computer and sends nothing to BIR.", None).await;
            return;
        }
        if !ask(&app, TITLE, WARNING, Some(("Turn On", "Cancel"))).await {
            let _ = item.set_checked(false);
            return;
        }
        if !bir_key::ready(&data) {
            let d = data.clone();
            let got = tauri::async_runtime::spawn_blocking(move || bir_key::fetch(&d)).await.map_err(|e| e.to_string()).and_then(|r| r);
            if let Err(e) = got {
                let _ = item.set_checked(false);
                ask(&app, TITLE, &format!("Sending is still off. The app could not get BIR's package: {e}\n\nCheck your internet connection and try again."), None).await;
                return;
            }
        }
        match submit_setting::set_enabled(&data, true) {
            Ok(()) => ask(&app, TITLE, "Sending is on. Open your return again (close the form and use Fill-up or the saved list), then click Submit.\n\nYour return is filed only when BIR's confirmation email arrives.", None).await,
            Err(e) => {
                let _ = item.set_checked(false);
                ask(&app, TITLE, &format!("Sending is still off: {e}"), None).await
            }
        };
    });
}
