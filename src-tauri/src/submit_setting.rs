//! The user's switch for sending returns to BIR: `settings/submit.json` `enabled` (false when missing). The same file
//! holds BIR's optional proxy (`proxy_host`, `proxy_port`, read by host.rs), so a write keeps every other key.

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

fn path(data: &Path) -> PathBuf {
    data.join("settings/submit.json")
}

fn read(data: &Path) -> Value {
    fs::read(path(data)).ok().and_then(|b| serde_json::from_slice(&b).ok()).filter(Value::is_object).unwrap_or_else(|| json!({}))
}

/// Off unless the user turned it on.
pub fn enabled(data: &Path) -> bool {
    read(data)["enabled"].as_bool().unwrap_or(false)
}

#[cfg_attr(not(feature = "bir-submit"), allow(dead_code))]
pub fn set_enabled(data: &Path, on: bool) -> Result<(), String> {
    let mut v = read(data);
    v["enabled"] = Value::Bool(on);
    let p = path(data);
    fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&p, serde_json::to_vec_pretty(&v).unwrap_or_default()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn off_by_default_and_keeps_the_proxy() {
        let dir = std::env::temp_dir().join(format!("ebf-submit-setting-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert!(!enabled(&dir));
        fs::create_dir_all(dir.join("settings")).unwrap();
        fs::write(dir.join("settings/submit.json"), r#"{"proxy_host":"p","proxy_port":8080}"#).unwrap();
        assert!(!enabled(&dir));
        set_enabled(&dir, true).unwrap();
        assert!(enabled(&dir));
        let v: Value = serde_json::from_slice(&fs::read(dir.join("settings/submit.json")).unwrap()).unwrap();
        assert_eq!(v["proxy_host"], "p");
        set_enabled(&dir, false).unwrap();
        assert!(!enabled(&dir));
        fs::write(dir.join("settings/submit.json"), "not json").unwrap();
        assert!(!enabled(&dir), "a broken file means off");
        let _ = fs::remove_dir_all(&dir);
    }
}
