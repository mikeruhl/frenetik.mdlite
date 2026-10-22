use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri_plugin_opener::OpenerExt;

const REPO_URL: &str = "https://api.github.com/repos/mikeruhl/frenetik.mdlite/releases/latest";
const RELEASES_PREFIX: &str = "https://github.com/mikeruhl/frenetik.mdlite/releases/";

static LAST_RELEASE_URL: Mutex<Option<String>> = Mutex::new(None);

fn is_release_url(u: &str) -> bool {
    u.starts_with(RELEASES_PREFIX)
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct UpdateResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub release_notes: String,
}

#[tauri::command]
pub(crate) async fn check_for_updates() -> Result<UpdateResult, String> {
    let current = env!("CARGO_PKG_VERSION");

    let client = reqwest::Client::builder()
        .user_agent("mdlite-updater")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let release: GithubRelease = client
        .get(REPO_URL)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?
        .error_for_status()
        .map_err(|e| format!("GitHub API error: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let latest_tag = release.tag_name.strip_prefix('v').unwrap_or(&release.tag_name);

    let current_ver = semver::Version::parse(current).map_err(|e| e.to_string())?;
    let latest_ver =
        semver::Version::parse(latest_tag).map_err(|e| format!("Invalid version tag '{}': {}", latest_tag, e))?;

    let update_available = latest_ver > current_ver;
    if update_available {
        *LAST_RELEASE_URL.lock().unwrap() = Some(release.html_url.clone());
    }

    Ok(UpdateResult {
        current_version: current.to_string(),
        latest_version: latest_tag.to_string(),
        update_available,
        release_url: release.html_url,
        release_notes: release.body.unwrap_or_default(),
    })
}

#[tauri::command]
pub(crate) fn open_release_page(app: tauri::AppHandle) -> Result<(), String> {
    let url = LAST_RELEASE_URL
        .lock()
        .unwrap()
        .clone()
        .filter(|u| is_release_url(u))
        .ok_or("No release page available")?;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_url_must_be_project_release() {
        assert!(is_release_url(
            "https://github.com/mikeruhl/frenetik.mdlite/releases/tag/v1.2.3"
        ));
        assert!(!is_release_url(
            "https://github.com/mikeruhl/frenetik.mdlite.evil/releases/x"
        ));
        assert!(!is_release_url("http://github.com/mikeruhl/frenetik.mdlite/releases/x"));
    }
}
