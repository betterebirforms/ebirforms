//! Up to v0.1.7 the app id was `ph.advo.ebirforms`, so its data (returns, profile, settings, BIR's forms) sits in a
//! folder of that name next to the current one. On start, move each entry the new folder lacks, then drop the old
//! folder if it is empty. A rename within one parent folder: nothing is copied, nothing is lost if it stops halfway.

use std::fs;
use std::path::Path;

pub const OLD_ID: &str = "ph.advo.ebirforms";

pub fn from_old_id(new: &Path) {
    let Some(old) = new.parent().map(|p| p.join(OLD_ID)) else { return };
    if old == new || !old.is_dir() {
        return;
    }
    if let Err(e) = move_entries(&old, new) {
        eprintln!("[data] could not move {} to {}: {e}", old.display(), new.display());
    }
}

fn move_entries(old: &Path, new: &Path) -> std::io::Result<()> {
    fs::create_dir_all(new)?;
    for entry in fs::read_dir(old)? {
        let entry = entry?;
        let to = new.join(entry.file_name());
        if !to.exists() {
            fs::rename(entry.path(), to)?;
        }
    }
    let _ = fs::remove_dir(old); // only when empty
    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn moves_the_old_folder_once_and_keeps_what_is_new() {
        let root = std::env::temp_dir().join(format!("ebf-data-move-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let old = root.join(OLD_ID);
        let new = root.join("io.github.betterebirforms.ebirforms");
        fs::create_dir_all(old.join("data/savefile")).unwrap();
        fs::write(old.join("data/savefile/a.xml"), "x").unwrap();
        fs::create_dir_all(old.join("original")).unwrap();
        fs::create_dir_all(new.join("original")).unwrap();
        fs::write(new.join("original/keep"), "new").unwrap();
        from_old_id(&new);
        assert_eq!(fs::read_to_string(new.join("data/savefile/a.xml")).unwrap(), "x");
        assert!(new.join("original/keep").exists(), "an entry the new folder has is not replaced");
        assert!(old.join("original").exists(), "the old one stays where it was");
        assert!(!old.join("data").exists());
        fs::remove_dir_all(old.join("original")).unwrap();
        from_old_id(&new); // old now empty: removed, nothing else changes
        assert!(!old.exists());
        assert!(new.join("data/savefile/a.xml").exists());
        from_old_id(&new); // no old folder: nothing to do
        let _ = fs::remove_dir_all(&root);
    }
}
