use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::http::{header, Method, Request, Response, StatusCode};

use crate::config::{store_get_live_consent, store_set_live_consent};
use crate::AppState;

pub(crate) const SCHEME: &str = "mdlive";
const FRAME_PATH: &str = "/live-frame.html";
pub(crate) const FRAME_CSP: &str = "default-src 'none'; \
    script-src mdlive: http://mdlive.localhost 'unsafe-inline'; \
    style-src 'unsafe-inline'; img-src data: blob:; font-src data:; \
    connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

pub(crate) struct ServedAsset {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

/// Bundled asset paths the frame page references through `src` or `href` attributes.
fn frame_asset_paths(html: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for attr in ["src=\"", "href=\""] {
        let mut rest = html;
        while let Some(start) = rest.find(attr) {
            rest = &rest[start + attr.len()..];
            let Some(end) = rest.find('"') else { break };
            let value = &rest[..end];
            if value.starts_with("/assets/") && !value.contains("..") {
                paths.push(value.to_string());
            }
            rest = &rest[end..];
        }
    }
    paths
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(code).body(Vec::new()).unwrap()
}

/// Serves the Live Block frame page and only the assets it references; every other path is 404.
pub(crate) fn respond(method: &Method, path: &str, resolve: impl Fn(&str) -> Option<ServedAsset>) -> Response<Vec<u8>> {
    if method != Method::GET {
        return status(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Some(frame) = resolve(FRAME_PATH) else {
        return status(StatusCode::NOT_FOUND);
    };
    let asset = if path == FRAME_PATH {
        frame
    } else if frame_asset_paths(&String::from_utf8_lossy(&frame.bytes))
        .iter()
        .any(|p| p == path)
    {
        match resolve(path) {
            Some(asset) => asset,
            None => return status(StatusCode::NOT_FOUND),
        }
    } else {
        return status(StatusCode::NOT_FOUND);
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, asset.mime_type)
        .header("Content-Security-Policy", FRAME_CSP)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(asset.bytes)
        .unwrap()
}

pub(crate) fn handle_request<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let resolver = app.asset_resolver();
    respond(request.method(), request.uri().path(), |path| {
        resolver.get(path.to_string()).map(|asset| ServedAsset {
            bytes: asset.bytes,
            mime_type: asset.mime_type,
        })
    })
}

pub(crate) const MAX_CONSENT: usize = 200;

fn content_hash(content: &str) -> String {
    Sha256::digest(content.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// True when `path` was consented with exactly this content; a match moves it to the front.
fn check_consent(list: &mut Vec<(String, String)>, path: &str, content: &str) -> bool {
    let hash = content_hash(content);
    let Some(pos) = list.iter().position(|(p, h)| p == path && *h == hash) else {
        return false;
    };
    let entry = list.remove(pos);
    list.insert(0, entry);
    true
}

fn grant_consent(list: &mut Vec<(String, String)>, path: &str, content: &str) {
    list.retain(|(p, _)| p != path);
    list.insert(0, (path.to_string(), content_hash(content)));
    list.truncate(MAX_CONSENT);
}

fn open_document_path(state: &Mutex<AppState>) -> Option<String> {
    let state = state.lock().unwrap();
    (!state.file_path.as_os_str().is_empty()).then(|| state.file_path.to_string_lossy().into_owned())
}

/// Whether the open Document's Live Blocks were consented with exactly this content.
#[tauri::command]
pub(crate) fn live_consent_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    content: String,
) -> bool {
    let Some(path) = open_document_path(&state) else {
        return false;
    };
    let mut list = store_get_live_consent(&app);
    let consented = check_consent(&mut list, &path, &content);
    if consented {
        store_set_live_consent(&app, &list);
    }
    consented
}

#[tauri::command]
pub(crate) fn live_consent_grant(app: tauri::AppHandle, state: tauri::State<'_, Mutex<AppState>>, content: String) {
    let Some(path) = open_document_path(&state) else {
        return;
    };
    let mut list = store_get_live_consent(&app);
    grant_consent(&mut list, &path, &content);
    store_set_live_consent(&app, &list);
}

#[cfg(test)]
mod tests {
    use super::*;

    const HTML: &str = r#"<script type="module" crossorigin src="/assets/liveFrame-1.js"></script>
<link rel="modulepreload" crossorigin href="/assets/d3-2.js"><link rel="icon" href="https://example.com/x.ico">"#;

    fn resolver(path: &str) -> Option<ServedAsset> {
        let (bytes, mime) = match path {
            FRAME_PATH => (HTML.as_bytes().to_vec(), "text/html"),
            "/assets/liveFrame-1.js" | "/assets/d3-2.js" | "/assets/main-3.js" => (b"js".to_vec(), "text/javascript"),
            "/index.html" => (b"app".to_vec(), "text/html"),
            _ => return None,
        };
        Some(ServedAsset {
            bytes,
            mime_type: mime.to_string(),
        })
    }

    #[test]
    fn extracts_only_local_asset_references() {
        assert_eq!(
            frame_asset_paths(HTML),
            vec!["/assets/liveFrame-1.js", "/assets/d3-2.js"]
        );
    }

    #[test]
    fn serves_frame_page_with_dedicated_csp() {
        let response = respond(&Method::GET, FRAME_PATH, resolver);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["Content-Security-Policy"], FRAME_CSP);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "text/html");
        assert_eq!(response.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
    }

    #[test]
    fn serves_assets_referenced_by_the_frame() {
        for path in ["/assets/liveFrame-1.js", "/assets/d3-2.js"] {
            let response = respond(&Method::GET, path, resolver);
            assert_eq!(response.status(), StatusCode::OK, "{path}");
            assert_eq!(response.headers()["Content-Security-Policy"], FRAME_CSP);
        }
    }

    #[test]
    fn rejects_app_assets_and_unknown_paths() {
        for path in [
            "/index.html",
            "/assets/main-3.js",
            "/",
            "/assets/../index.html",
            "/live-frame.html/x",
        ] {
            assert_eq!(
                respond(&Method::GET, path, resolver).status(),
                StatusCode::NOT_FOUND,
                "{path}"
            );
        }
    }

    #[test]
    fn rejects_non_get_methods() {
        assert_eq!(
            respond(&Method::POST, FRAME_PATH, resolver).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
    }

    #[test]
    fn missing_frame_page_is_not_found() {
        assert_eq!(
            respond(&Method::GET, FRAME_PATH, |_| None).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn consent_survives_reopen_until_content_changes() {
        let mut list = Vec::new();
        assert!(!check_consent(&mut list, "a.md", "one"));
        grant_consent(&mut list, "a.md", "one");
        assert!(check_consent(&mut list, "a.md", "one"));
        assert!(!check_consent(&mut list, "a.md", "two"));
        assert!(!check_consent(&mut list, "b.md", "one"));
    }

    #[test]
    fn regranting_replaces_the_previous_hash() {
        let mut list = Vec::new();
        grant_consent(&mut list, "a.md", "one");
        grant_consent(&mut list, "a.md", "two");
        assert_eq!(list.len(), 1);
        assert!(!check_consent(&mut list, "a.md", "one"));
        assert!(check_consent(&mut list, "a.md", "two"));
    }

    #[test]
    fn evicts_least_recently_used_beyond_the_cap() {
        let mut list = Vec::new();
        for i in 0..MAX_CONSENT {
            grant_consent(&mut list, &format!("{i}.md"), "x");
        }
        assert!(check_consent(&mut list, "0.md", "x"));
        grant_consent(&mut list, "new.md", "x");
        assert_eq!(list.len(), MAX_CONSENT);
        assert!(check_consent(&mut list, "0.md", "x"));
        assert!(!check_consent(&mut list, "1.md", "x"));
    }

    #[test]
    fn hashes_content_as_lowercase_sha256_hex() {
        assert_eq!(
            content_hash("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
