use std::path::{Path, PathBuf};

pub(crate) const LINK_PATH: &str = "/usr/local/bin/mdlite";
pub(crate) const INSTALL_MENU_ID: &str = "install-cli-tool";
pub(crate) const UNINSTALL_MENU_ID: &str = "uninstall-cli-tool";

#[cfg(target_os = "macos")]
const INSTALLED_EVENT: &str = "cli-tool-installed";
#[cfg(target_os = "macos")]
const UNINSTALLED_EVENT: &str = "cli-tool-uninstalled";
#[cfg(target_os = "macos")]
const ERROR_EVENT: &str = "cli-tool-error";

const NOT_IN_BUNDLE_ERROR: &str = "The command line tool can only be installed from the installed mdlite app.";

#[derive(Debug, PartialEq)]
pub(crate) enum LinkState {
    Missing,
    Ours,
    Foreign,
}

pub(crate) fn is_bundle_executable(path: &Path) -> bool {
    let tail: Vec<String> = path
        .components()
        .rev()
        .take(4)
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    tail.len() == 4 && tail[0] == "mdlite" && tail[1] == "MacOS" && tail[2] == "Contents" && tail[3].ends_with(".app")
}

pub(crate) fn install_target(exe: &Path) -> Result<PathBuf, String> {
    if is_bundle_executable(exe) {
        Ok(exe.to_path_buf())
    } else {
        Err(NOT_IN_BUNDLE_ERROR.to_string())
    }
}

pub(crate) fn classify_link(link: &Path) -> LinkState {
    match std::fs::symlink_metadata(link) {
        Err(_) => LinkState::Missing,
        Ok(meta) if !meta.file_type().is_symlink() => LinkState::Foreign,
        Ok(_) => match std::fs::read_link(link) {
            Ok(target) if is_bundle_executable(&target) => LinkState::Ours,
            _ => LinkState::Foreign,
        },
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

pub(crate) fn build_install_command(target: &Path) -> String {
    let dir = Path::new(LINK_PATH)
        .parent()
        .and_then(Path::to_str)
        .unwrap_or("/usr/local/bin");
    format!(
        "/bin/mkdir -p {} && /bin/ln -sf {} {}",
        shell_quote(dir),
        shell_quote(&target.to_string_lossy()),
        shell_quote(LINK_PATH)
    )
}

pub(crate) fn build_uninstall_command() -> String {
    format!("/bin/rm -f {}", shell_quote(LINK_PATH))
}

pub(crate) fn build_apple_script(shell_command: &str) -> String {
    format!(
        "do shell script \"{}\" with administrator privileges",
        escape_applescript(shell_command)
    )
}

/// `None` means the user dismissed the password prompt.
pub(crate) fn osascript_error(stderr: &str) -> Option<String> {
    let trimmed = stderr.trim();
    if trimmed.contains("User canceled") || trimmed.contains("(-128)") {
        None
    } else if trimmed.is_empty() {
        Some("The administrator command failed.".to_string())
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(target_os = "macos")]
fn run_elevated(shell_command: &str) -> Result<bool, String> {
    let output = std::process::Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(build_apple_script(shell_command))
        .output()
        .map_err(|e| format!("Could not run osascript: {e}"))?;
    if output.status.success() {
        return Ok(true);
    }
    match osascript_error(&String::from_utf8_lossy(&output.stderr)) {
        None => Ok(false),
        Some(message) => Err(message),
    }
}

#[cfg(target_os = "macos")]
fn run_install() -> Result<Option<String>, String> {
    let exe = std::env::current_exe()
        .and_then(std::fs::canonicalize)
        .map_err(|e| format!("Could not locate the mdlite executable: {e}"))?;
    let target = install_target(&exe)?;
    Ok(run_elevated(&build_install_command(&target))?.then(|| format!("Installed {LINK_PATH}")))
}

#[cfg(target_os = "macos")]
fn run_uninstall() -> Result<Option<String>, String> {
    match classify_link(Path::new(LINK_PATH)) {
        LinkState::Missing => Ok(Some("The command line tool is not installed.".to_string())),
        LinkState::Foreign => Err(format!(
            "{LINK_PATH} was not installed by mdlite, so it was left unchanged."
        )),
        LinkState::Ours => Ok(run_elevated(&build_uninstall_command())?.then(|| format!("Removed {LINK_PATH}"))),
    }
}

#[cfg(target_os = "macos")]
fn spawn_and_report(app: &tauri::AppHandle, success_event: &'static str, work: fn() -> Result<Option<String>, String>) {
    use tauri::Emitter;
    let handle = app.clone();
    std::thread::spawn(move || match work() {
        Ok(Some(message)) => {
            let _ = handle.emit(success_event, message);
        }
        Ok(None) => {}
        Err(message) => {
            let _ = handle.emit(ERROR_EVENT, message);
        }
    });
}

#[cfg(target_os = "macos")]
pub(crate) fn install(app: &tauri::AppHandle) {
    spawn_and_report(app, INSTALLED_EVENT, run_install);
}

#[cfg(target_os = "macos")]
pub(crate) fn uninstall(app: &tauri::AppHandle) {
    spawn_and_report(app, UNINSTALLED_EVENT, run_uninstall);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundle_executable_is_recognized() {
        assert!(is_bundle_executable(Path::new(
            "/Applications/mdlite.app/Contents/MacOS/mdlite"
        )));
        assert!(is_bundle_executable(Path::new(
            "/Users/me/My Apps/mdlite.app/Contents/MacOS/mdlite"
        )));
    }

    #[test]
    fn non_bundle_executables_are_rejected() {
        assert!(!is_bundle_executable(Path::new("/repo/target/debug/mdlite")));
        assert!(!is_bundle_executable(Path::new(
            "/Applications/mdlite.app/Contents/MacOS/other"
        )));
        assert!(!is_bundle_executable(Path::new(
            "/Applications/mdlite/Contents/MacOS/mdlite"
        )));
        assert!(!is_bundle_executable(Path::new("mdlite")));
    }

    #[test]
    fn install_target_rejects_non_bundle() {
        assert_eq!(
            install_target(Path::new("/repo/target/debug/mdlite")),
            Err(NOT_IN_BUNDLE_ERROR.to_string())
        );
        assert!(install_target(Path::new("/Applications/mdlite.app/Contents/MacOS/mdlite")).is_ok());
    }

    #[test]
    fn install_command_quotes_target_with_spaces_and_quotes() {
        let cmd = build_install_command(Path::new("/Users/o'neil/My Apps/mdlite.app/Contents/MacOS/mdlite"));
        assert_eq!(
            cmd,
            "/bin/mkdir -p '/usr/local/bin' && /bin/ln -sf '/Users/o'\\''neil/My Apps/mdlite.app/Contents/MacOS/mdlite' '/usr/local/bin/mdlite'"
        );
    }

    #[test]
    fn uninstall_command_removes_only_the_link() {
        assert_eq!(build_uninstall_command(), "/bin/rm -f '/usr/local/bin/mdlite'");
    }

    #[test]
    fn apple_script_escapes_backslashes_and_quotes() {
        let script = build_apple_script(r#"echo "a\b""#);
        assert_eq!(
            script,
            r#"do shell script "echo \"a\\b\"" with administrator privileges"#
        );
    }

    #[test]
    fn osascript_cancellation_is_silent() {
        assert_eq!(osascript_error("execution error: User canceled. (-128)"), None);
        assert_eq!(osascript_error("0:90: execution error: (-128)\n"), None);
    }

    #[test]
    fn osascript_failures_carry_the_message() {
        assert_eq!(
            osascript_error("execution error: ln: Permission denied (1)\n"),
            Some("execution error: ln: Permission denied (1)".to_string())
        );
        assert_eq!(
            osascript_error("  "),
            Some("The administrator command failed.".to_string())
        );
    }

    #[test]
    fn missing_path_is_classified_missing() {
        let path = std::env::temp_dir().join("mdlite-cli-install-test-does-not-exist");
        assert_eq!(classify_link(&path), LinkState::Missing);
    }

    #[test]
    fn regular_file_is_classified_foreign() {
        let path = std::env::temp_dir().join(format!("mdlite-cli-install-test-file-{}", std::process::id()));
        std::fs::write(&path, b"x").unwrap();
        let state = classify_link(&path);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(state, LinkState::Foreign);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_classified_by_target() {
        let dir = std::env::temp_dir().join(format!("mdlite-cli-install-test-links-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let ours = dir.join("ours");
        let foreign = dir.join("foreign");
        std::os::unix::fs::symlink("/Applications/mdlite.app/Contents/MacOS/mdlite", &ours).unwrap();
        std::os::unix::fs::symlink("/usr/bin/true", &foreign).unwrap();
        let results = (classify_link(&ours), classify_link(&foreign));
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(results, (LinkState::Ours, LinkState::Foreign));
    }
}
