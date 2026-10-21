use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use reqwest::{header, StatusCode, Url};
use tauri::http::{Request, Response};
use tauri::Emitter;

use crate::config::{normalize_host, store_add_image_host, store_get_image_allowlist, store_remove_image_host};
use crate::menu::refresh_menu;

pub(crate) const SCHEME: &str = "mdimg";
pub(crate) const ALLOWLIST_CHANGED_EVENT: &str = "image-allowlist-changed";
const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_BYTES: usize = 10 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;

pub(crate) struct ImageState {
    client: reqwest::Client,
    session_urls: Mutex<HashSet<String>>,
}

impl ImageState {
    pub(crate) fn new() -> Self {
        Self::with_client(build_client(TIMEOUT))
    }

    fn with_client(client: reqwest::Client) -> Self {
        Self {
            client,
            session_urls: Mutex::new(HashSet::new()),
        }
    }

    fn allow_once(&self, raw: &str) -> Result<(), String> {
        let url = parse_remote_url(raw).ok_or_else(|| format!("Not an http(s) URL: {raw}"))?;
        self.session_urls.lock().unwrap().insert(url.to_string());
        Ok(())
    }

    fn session_snapshot(&self) -> HashSet<String> {
        self.session_urls.lock().unwrap().clone()
    }
}

fn build_client(timeout: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("mdlite-image-proxy")
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("image proxy client")
}

pub(crate) fn parse_remote_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    matches!(url.scheme(), "http" | "https").then_some(url)
}

pub(crate) fn is_allowed(url: &Url, allowlist: &[String], session_urls: &HashSet<String>) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    if session_urls.contains(url.as_str()) {
        return true;
    }
    url.host_str()
        .and_then(normalize_host)
        .is_some_and(|host| allowlist.contains(&host))
}

#[derive(Debug, PartialEq)]
pub(crate) enum FetchError {
    Blocked,
    NotImage,
    TooLarge,
    TooManyRedirects,
    Upstream(String),
}

impl FetchError {
    fn status(&self) -> StatusCode {
        match self {
            FetchError::Blocked | FetchError::NotImage => StatusCode::FORBIDDEN,
            FetchError::TooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            FetchError::TooManyRedirects | FetchError::Upstream(_) => StatusCode::BAD_GATEWAY,
        }
    }
}

pub(crate) struct FetchedImage {
    pub content_type: String,
    pub body: Vec<u8>,
}

pub(crate) async fn fetch_image(
    client: &reqwest::Client,
    start: Url,
    allowed: impl Fn(&Url) -> bool,
    max_bytes: usize,
) -> Result<FetchedImage, FetchError> {
    let mut url = start;
    for _ in 0..=MAX_REDIRECTS {
        if !allowed(&url) {
            return Err(FetchError::Blocked);
        }
        let mut response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|e| FetchError::Upstream(e.to_string()))?;

        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| FetchError::Upstream("redirect without Location".into()))?;
            url = url.join(location).map_err(|e| FetchError::Upstream(e.to_string()))?;
            continue;
        }
        if !response.status().is_success() {
            return Err(FetchError::Upstream(response.status().to_string()));
        }

        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();
        if !content_type.to_ascii_lowercase().starts_with("image/") {
            return Err(FetchError::NotImage);
        }
        if response.content_length().is_some_and(|len| len > max_bytes as u64) {
            return Err(FetchError::TooLarge);
        }

        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| FetchError::Upstream(e.to_string()))?
        {
            if body.len() + chunk.len() > max_bytes {
                return Err(FetchError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(FetchedImage { content_type, body });
    }
    Err(FetchError::TooManyRedirects)
}

fn target_from_request(request: &Request<Vec<u8>>) -> Option<Url> {
    let uri = Url::parse(&request.uri().to_string()).ok()?;
    let target = uri.query_pairs().find(|(k, _)| k == "u").map(|(_, v)| v.into_owned())?;
    parse_remote_url(&target)
}

fn error_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(status.as_u16()).body(Vec::new()).unwrap()
}

pub(crate) async fn handle_request(
    state: &ImageState,
    allowlist: Vec<String>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let Some(target) = target_from_request(&request) else {
        return error_response(StatusCode::BAD_REQUEST);
    };
    let session = state.session_snapshot();
    let allowed = |u: &Url| is_allowed(u, &allowlist, &session);
    match fetch_image(&state.client, target, allowed, MAX_BYTES).await {
        Ok(image) => Response::builder()
            .status(200)
            .header(header::CONTENT_TYPE.as_str(), image.content_type)
            .header("X-Content-Type-Options", "nosniff")
            .body(image.body)
            .unwrap(),
        Err(e) => error_response(e.status()),
    }
}

#[tauri::command]
pub(crate) fn get_image_allowlist(app: tauri::AppHandle) -> Vec<String> {
    store_get_image_allowlist(&app)
}

#[tauri::command]
pub(crate) fn allow_image_once(state: tauri::State<'_, ImageState>, url: String) -> Result<(), String> {
    state.allow_once(&url)
}

#[tauri::command]
pub(crate) fn allow_image_host(app: tauri::AppHandle, host: String) -> Result<Vec<String>, String> {
    let hosts = store_add_image_host(&app, &host)?;
    refresh_menu(&app);
    Ok(hosts)
}

#[tauri::command]
pub(crate) fn remove_image_host(app: tauri::AppHandle, host: String) -> Vec<String> {
    let hosts = store_remove_image_host(&app, &host);
    refresh_menu(&app);
    let _ = app.emit(ALLOWLIST_CHANGED_EVENT, &hosts);
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn hosts(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn exact_host_allowed() {
        assert!(is_allowed(
            &url("https://example.com/a.png"),
            &hosts(&["example.com"]),
            &HashSet::new()
        ));
    }

    #[test]
    fn host_match_is_case_insensitive() {
        assert!(is_allowed(
            &url("https://EXAMPLE.com/a.png"),
            &hosts(&["example.com"]),
            &HashSet::new()
        ));
    }

    #[test]
    fn subdomain_rejected() {
        assert!(!is_allowed(
            &url("https://cdn.example.com/a.png"),
            &hosts(&["example.com"]),
            &HashSet::new()
        ));
    }

    #[test]
    fn parent_domain_rejected() {
        assert!(!is_allowed(
            &url("https://example.com/a.png"),
            &hosts(&["cdn.example.com"]),
            &HashSet::new()
        ));
    }

    #[test]
    fn empty_allowlist_blocks() {
        assert!(!is_allowed(&url("https://example.com/a.png"), &[], &HashSet::new()));
    }

    #[test]
    fn session_url_allowed_without_host() {
        let session = HashSet::from(["https://example.com/a.png".to_string()]);
        assert!(is_allowed(&url("https://example.com/a.png"), &[], &session));
        assert!(!is_allowed(&url("https://example.com/b.png"), &[], &session));
    }

    #[test]
    fn non_http_schemes_rejected() {
        let list = hosts(&["example.com"]);
        for raw in [
            "ftp://example.com/a.png",
            "file://example.com/a.png",
            "data:image/png;base64,AAAA",
        ] {
            assert!(!is_allowed(&url(raw), &list, &HashSet::new()), "{raw}");
        }
        assert!(parse_remote_url("javascript:alert(1)").is_none());
    }

    #[test]
    fn allow_once_normalizes_and_rejects_non_http() {
        let state = ImageState::with_client(build_client(TIMEOUT));
        state.allow_once("https://Example.com/a b.png").unwrap();
        assert!(is_allowed(
            &url("https://example.com/a%20b.png"),
            &[],
            &state.session_snapshot()
        ));
        assert!(state.allow_once("file:///c:/secret.png").is_err());
    }

    #[test]
    fn target_parsed_from_both_scheme_forms() {
        let encoded = "https%3A%2F%2Fexample.com%2Fa.png%3Fx%3D1";
        for base in ["mdimg://localhost/", "http://mdimg.localhost/"] {
            let req = Request::builder()
                .uri(format!("{base}?u={encoded}"))
                .body(Vec::new())
                .unwrap();
            assert_eq!(
                target_from_request(&req).unwrap().as_str(),
                "https://example.com/a.png?x=1"
            );
        }
        let bad = Request::builder()
            .uri("http://mdimg.localhost/?u=file%3A%2F%2F%2Fetc")
            .body(Vec::new())
            .unwrap();
        assert!(target_from_request(&bad).is_none());
    }

    struct Route {
        path: &'static str,
        response: String,
    }

    fn raw(status: &str, headers: &[(&str, &str)], body: &str) -> String {
        let mut out = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
        for (k, v) in headers {
            out.push_str(&format!("{k}: {v}\r\n"));
        }
        out.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
        out
    }

    fn serve(routes: Vec<Route>) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]);
                let path = request.split_whitespace().nth(1).unwrap_or("/").to_string();
                let response = routes
                    .iter()
                    .find(|r| r.path == path)
                    .map(|r| r.response.clone())
                    .unwrap_or_else(|| raw("404 Not Found", &[], ""));
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    fn fetch(port: u16, path: &str, allow: &[&str], max_bytes: usize) -> Result<FetchedImage, FetchError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let list = hosts(allow);
        let start = url(&format!("http://127.0.0.1:{port}{path}"));
        tauri::async_runtime::block_on(fetch_image(
            &client,
            start,
            |u| is_allowed(u, &list, &HashSet::new()),
            max_bytes,
        ))
    }

    #[test]
    fn fetches_allowed_image() {
        let port = serve(vec![Route {
            path: "/a.png",
            response: raw("200 OK", &[("Content-Type", "image/png")], "PNG"),
        }]);
        let image = fetch(port, "/a.png", &["127.0.0.1"], MAX_BYTES).unwrap();
        assert_eq!(image.content_type, "image/png");
        assert_eq!(image.body, b"PNG");
    }

    #[test]
    fn blocked_host_makes_no_request() {
        let port = serve(vec![]);
        assert_eq!(
            fetch(port, "/a.png", &["example.com"], MAX_BYTES).err(),
            Some(FetchError::Blocked)
        );
    }

    #[test]
    fn rejects_non_image_content_type() {
        let port = serve(vec![Route {
            path: "/a.png",
            response: raw("200 OK", &[("Content-Type", "text/html")], "<p>"),
        }]);
        assert_eq!(
            fetch(port, "/a.png", &["127.0.0.1"], MAX_BYTES).err(),
            Some(FetchError::NotImage)
        );
    }

    #[test]
    fn rejects_missing_content_type() {
        let port = serve(vec![Route {
            path: "/a.png",
            response: raw("200 OK", &[], "PNG"),
        }]);
        assert_eq!(
            fetch(port, "/a.png", &["127.0.0.1"], MAX_BYTES).err(),
            Some(FetchError::NotImage)
        );
    }

    #[test]
    fn follows_redirect_to_allowed_host() {
        let port = serve(vec![
            Route {
                path: "/r",
                response: raw("302 Found", &[("Location", "/a.png")], ""),
            },
            Route {
                path: "/a.png",
                response: raw("200 OK", &[("Content-Type", "image/gif")], "GIF"),
            },
        ]);
        assert_eq!(fetch(port, "/r", &["127.0.0.1"], MAX_BYTES).unwrap().body, b"GIF");
    }

    #[test]
    fn refuses_redirect_to_disallowed_host() {
        let port_holder = TcpListener::bind("127.0.0.1:0").unwrap();
        let other = port_holder.local_addr().unwrap().port();
        let location: &'static str = Box::leak(format!("http://localhost:{other}/a.png").into_boxed_str());
        let port = serve(vec![Route {
            path: "/r",
            response: raw("302 Found", &[("Location", location)], ""),
        }]);
        assert_eq!(
            fetch(port, "/r", &["127.0.0.1"], MAX_BYTES).err(),
            Some(FetchError::Blocked)
        );
    }

    #[test]
    fn stops_after_max_redirects() {
        let port = serve(vec![Route {
            path: "/loop",
            response: raw("302 Found", &[("Location", "/loop")], ""),
        }]);
        assert_eq!(
            fetch(port, "/loop", &["127.0.0.1"], MAX_BYTES).err(),
            Some(FetchError::TooManyRedirects)
        );
    }

    #[test]
    fn rejects_body_over_cap() {
        let port = serve(vec![Route {
            path: "/big.png",
            response: raw("200 OK", &[("Content-Type", "image/png")], "0123456789"),
        }]);
        assert_eq!(
            fetch(port, "/big.png", &["127.0.0.1"], 4).err(),
            Some(FetchError::TooLarge)
        );
    }

    #[test]
    fn rejects_streamed_body_over_cap() {
        let body = "0123456789";
        let response = format!(
            "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: image/png\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{body}\r\n0\r\n\r\n",
            body.len()
        );
        let port = serve(vec![Route {
            path: "/big.png",
            response,
        }]);
        assert_eq!(
            fetch(port, "/big.png", &["127.0.0.1"], 4).err(),
            Some(FetchError::TooLarge)
        );
    }

    #[test]
    fn times_out_slow_upstream() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let held: Vec<_> = listener.incoming().take(1).collect();
            std::thread::sleep(Duration::from_secs(3));
            drop(held);
        });
        let client = build_client(Duration::from_millis(200));
        let list = hosts(&["127.0.0.1"]);
        let result = tauri::async_runtime::block_on(fetch_image(
            &client,
            url(&format!("http://127.0.0.1:{port}/a.png")),
            |u| is_allowed(u, &list, &HashSet::new()),
            MAX_BYTES,
        ));
        assert!(matches!(result, Err(FetchError::Upstream(_))));
    }

    #[test]
    fn handle_request_serves_session_allowed_url() {
        let port = serve(vec![Route {
            path: "/once.png",
            response: raw("200 OK", &[("Content-Type", "image/png")], "ONCE"),
        }]);
        let target = format!("http://127.0.0.1:{port}/once.png");
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let state = ImageState::with_client(client);
        let request = || {
            let mut uri = url("http://mdimg.localhost/");
            uri.query_pairs_mut().append_pair("u", &target);
            Request::builder().uri(uri.as_str()).body(Vec::new()).unwrap()
        };

        let blocked = tauri::async_runtime::block_on(handle_request(&state, vec![], request()));
        assert_eq!(blocked.status(), 403);

        state.allow_once(&target).unwrap();
        let served = tauri::async_runtime::block_on(handle_request(&state, vec![], request()));
        assert_eq!(served.status(), 200);
        assert_eq!(served.headers()["content-type"], "image/png");
        assert_eq!(served.body(), b"ONCE");
    }
}
