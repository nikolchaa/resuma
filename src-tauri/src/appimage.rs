//! App menu entry for the Linux AppImage.
//!
//! On Wayland an app can't give the taskbar its own icon: the desktop matches
//! the window's app ID ("Resuma", the program name) to an installed
//! `Resuma.desktop` and takes the icon from there. The .deb and .rpm install
//! one; an AppImage installs nothing, so its window got a generic icon. When
//! Resuma runs from an AppImage, it therefore writes `Resuma.desktop` and its
//! icon under the user's data folder (`~/.local/share`), and keeps the entry
//! pointing at wherever the AppImage now is.
//!
//! It never touches an entry it didn't write, and writes none when a package
//! or an AppImage tool (AppImageLauncher, Gear Lever) already provides one.
//! The entry's `TryExec` hides it once the AppImage is deleted.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const DESKTOP_FILE: &str = "Resuma.desktop";
/// Marks an entry as Resuma's own, so it may be updated.
const MARKER: &str = "X-Resuma-AppImage=true";
const ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");
const ICON_FILE: &str = "resuma.png";
/// The app's own data folder under the user's data folder (the identifier).
const APP_DIR: &str = "com.resuma.app";

#[derive(Debug, PartialEq)]
pub enum Outcome {
    Written,
    UpToDate,
    /// A package, an AppImage tool or the user already provides an entry.
    LeftAlone,
}

/// Adds or updates the menu entry when running from an AppImage ($APPIMAGE
/// is the AppImage's own path). Failures are only logged: it's a convenience.
pub fn integrate() {
    let Some(appimage) = std::env::var_os("APPIMAGE").map(PathBuf::from) else {
        return;
    };
    let Some(data_home) = dirs_next::data_dir() else {
        return;
    };
    let system_dirs: Vec<PathBuf> = std::env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|dirs| !dirs.trim().is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".to_string())
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .collect();
    if let Err(e) = integrate_into(&data_home, &system_dirs, &appimage) {
        eprintln!("[appimage] couldn't add Resuma to the app menu: {e}");
    }
}

pub fn integrate_into(
    data_home: &Path,
    system_dirs: &[PathBuf],
    appimage: &Path,
) -> io::Result<Outcome> {
    let apps = data_home.join("applications");
    let target = apps.join(DESKTOP_FILE);
    let appimage_text = appimage
        .to_str()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "the AppImage path isn't UTF-8"))?;

    match fs::read_to_string(&target) {
        Ok(existing) if !existing.contains(MARKER) => return Ok(Outcome::LeftAlone),
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // A package's own entry already gives the window its icon, and a
            // second "Resuma" in the menu would only confuse.
            if system_dirs.iter().any(|dir| dir.join("applications").join(DESKTOP_FILE).is_file()) {
                return Ok(Outcome::LeftAlone);
            }
            if entry_mentions(&apps, appimage_text) {
                return Ok(Outcome::LeftAlone);
            }
        }
        Err(e) => return Err(e),
    }

    let icon = data_home.join(APP_DIR).join(ICON_FILE);
    if fs::read(&icon).map(|bytes| bytes != ICON).unwrap_or(true) {
        fs::create_dir_all(icon.parent().unwrap_or(data_home))?;
        write_replacing(&icon, ICON)?;
    }
    let icon_text = icon
        .to_str()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "the data folder path isn't UTF-8"))?;

    let entry = desktop_entry(appimage_text, icon_text)?;
    if fs::read_to_string(&target).map(|existing| existing == entry).unwrap_or(false) {
        return Ok(Outcome::UpToDate);
    }
    fs::create_dir_all(&apps)?;
    write_replacing(&target, entry.as_bytes())?;
    Ok(Outcome::Written)
}

/// Whether another entry in `apps` already launches this AppImage, as the
/// ones AppImageLauncher and Gear Lever write do.
fn entry_mentions(apps: &Path, appimage: &str) -> bool {
    let Ok(entries) = fs::read_dir(apps) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let path = entry.path();
        path.extension().is_some_and(|ext| ext == "desktop")
            && fs::read_to_string(&path).is_ok_and(|text| text.contains(appimage))
    })
}

/// Writes through a temporary file, so the menu never reads half an entry.
fn write_replacing(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

fn desktop_entry(appimage: &str, icon: &str) -> io::Result<String> {
    Ok(format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Resuma\n\
         Comment=Build professional resumes, with optional local AI\n\
         Exec={exec}\n\
         TryExec={try_exec}\n\
         Icon={icon}\n\
         Terminal=false\n\
         Categories=Office;\n\
         StartupWMClass=Resuma\n\
         {MARKER}\n",
        exec = exec_arg(appimage)?,
        try_exec = string_value(appimage)?,
        icon = string_value(icon)?,
    ))
}

/// A desktop entry string value: backslashes doubled, control characters
/// refused (a path with a newline can't be written into an entry).
fn string_value(text: &str) -> io::Result<String> {
    if text.chars().any(char::is_control) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "the path has a control character"));
    }
    Ok(text.replace('\\', "\\\\"))
}

/// One quoted argument of an `Exec` key: `"`, `` ` ``, `$` and `\` take a
/// backslash inside the quotes, `%` is doubled, and then the string rule
/// doubles every backslash (desktop entry spec, "The Exec key").
fn exec_arg(path: &str) -> io::Result<String> {
    let mut quoted = String::from("\"");
    for c in path.chars() {
        match c {
            '"' | '`' | '$' | '\\' => {
                quoted.push('\\');
                quoted.push(c);
            }
            '%' => quoted.push_str("%%"),
            _ => quoted.push(c),
        }
    }
    quoted.push('"');
    string_value(&quoted)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("resuma-appimage-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn quotes_the_appimage_path_for_exec() {
        assert_eq!(exec_arg("/home/a/Resuma.AppImage").unwrap(), "\"/home/a/Resuma.AppImage\"");
        assert_eq!(exec_arg("/home/a b/R.AppImage").unwrap(), "\"/home/a b/R.AppImage\"");
        assert_eq!(exec_arg("/x/100%/$y").unwrap(), "\"/x/100%%/\\\\$y\"");
        assert_eq!(exec_arg("/x/a\\b").unwrap(), "\"/x/a\\\\\\\\b\"");
        assert!(exec_arg("/x/a\nb").is_err());
    }

    #[test]
    fn writes_the_entry_and_icon_then_keeps_them_current() {
        let home = temp_home("write");
        let first = Path::new("/home/a/Downloads/Resuma_1.1.3_amd64.AppImage");
        assert_eq!(integrate_into(&home, &[], first).unwrap(), Outcome::Written);

        let entry = fs::read_to_string(home.join("applications/Resuma.desktop")).unwrap();
        assert!(entry.contains("Exec=\"/home/a/Downloads/Resuma_1.1.3_amd64.AppImage\"\n"));
        assert!(entry.contains("TryExec=/home/a/Downloads/Resuma_1.1.3_amd64.AppImage\n"));
        assert!(entry.contains("StartupWMClass=Resuma\n"));
        let icon = home.join("com.resuma.app").join("resuma.png");
        assert!(entry.contains(&format!("Icon={}\n", string_value(icon.to_str().unwrap()).unwrap())));
        assert_eq!(fs::read(&icon).unwrap(), ICON);

        assert_eq!(integrate_into(&home, &[], first).unwrap(), Outcome::UpToDate);

        // The AppImage moved or a newer one runs: the entry follows it.
        let moved = Path::new("/home/a/Apps/Resuma_1.1.4_amd64.AppImage");
        assert_eq!(integrate_into(&home, &[], moved).unwrap(), Outcome::Written);
        let entry = fs::read_to_string(home.join("applications/Resuma.desktop")).unwrap();
        assert!(entry.contains("Exec=\"/home/a/Apps/Resuma_1.1.4_amd64.AppImage\"\n"));
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn leaves_other_entries_alone() {
        let appimage = Path::new("/home/a/Resuma.AppImage");

        // An entry Resuma didn't write.
        let home = temp_home("foreign");
        fs::create_dir_all(home.join("applications")).unwrap();
        fs::write(home.join("applications/Resuma.desktop"), "[Desktop Entry]\nName=Mine\n").unwrap();
        assert_eq!(integrate_into(&home, &[], appimage).unwrap(), Outcome::LeftAlone);
        assert_eq!(
            fs::read_to_string(home.join("applications/Resuma.desktop")).unwrap(),
            "[Desktop Entry]\nName=Mine\n"
        );
        let _ = fs::remove_dir_all(&home);

        // An installed .deb or .rpm.
        let home = temp_home("package");
        let system = temp_home("package-system");
        fs::create_dir_all(system.join("applications")).unwrap();
        fs::write(system.join("applications/Resuma.desktop"), "[Desktop Entry]\n").unwrap();
        assert_eq!(integrate_into(&home, &[system.clone()], appimage).unwrap(), Outcome::LeftAlone);
        assert!(!home.join("applications/Resuma.desktop").exists());
        let _ = fs::remove_dir_all(&home);
        let _ = fs::remove_dir_all(&system);

        // An AppImage tool's entry for the same file.
        let home = temp_home("tool");
        fs::create_dir_all(home.join("applications")).unwrap();
        fs::write(
            home.join("applications/appimagekit_0123-Resuma.desktop"),
            "[Desktop Entry]\nExec=/home/a/Resuma.AppImage\n",
        )
        .unwrap();
        assert_eq!(integrate_into(&home, &[], appimage).unwrap(), Outcome::LeftAlone);
        assert!(!home.join("applications/Resuma.desktop").exists());
        let _ = fs::remove_dir_all(&home);
    }
}
