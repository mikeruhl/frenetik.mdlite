use serde::Serialize;
use std::path::{Component, Path, PathBuf};

use crate::config::{normalize_extension, normalize_origin};
use crate::display_path;
use crate::scan::is_markdown_ext;

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum LinkAction {
    Navigate {
        path: String,
        fragment: Option<String>,
    },
    ConfirmDocument {
        path: String,
    },
    ConfirmOpenFile {
        path: String,
    },
    ConfirmReveal {
        path: String,
    },
    OpenUrl {
        url: String,
    },
    ConfirmUrl {
        url: String,
        origin: String,
        insecure: bool,
    },
    ConfirmNetwork {
        path: String,
    },
    NotFound {
        path: String,
    },
    Blocked {
        scheme: String,
    },
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, PartialEq)]
pub(crate) enum ParsedHref {
    /// `path` is relative to the open document's directory unless absolute.
    File {
        path: PathBuf,
        fragment: Option<String>,
    },
    Web {
        url: String,
        origin: String,
        insecure: bool,
    },
    Mailto {
        url: String,
    },
    Blocked {
        scheme: String,
    },
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) struct LinkContext<'a> {
    /// Parent of the open document; `None` when no document is open.
    pub doc_dir: Option<&'a Path>,
    /// Canonical folder in folder mode.
    pub folder: Option<&'a Path>,
    pub safe_types: &'a [String],
    pub trusted_origins: &'a [String],
    /// False when resolving; true only when following a link the user confirmed.
    pub allow_network: bool,
}

/// Lowercase `\\server\share` for a UNC path (including verbatim UNC), else `None`.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn unc_share(p: &Path) -> Option<String> {
    let s = p.to_string_lossy();
    let rest = s.strip_prefix(r"\\?\UNC\").or_else(|| {
        s.strip_prefix(r"\\")
            .filter(|r| !r.starts_with(r"?\") && !r.starts_with(r".\"))
    })?;
    let mut parts = rest.split(['\\', '/']);
    let server = parts.next().filter(|p| !p.is_empty())?;
    let share = parts.next().filter(|p| !p.is_empty())?;
    Some(format!(r"\\{server}\{share}").to_lowercase())
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn parse_href(href: &str) -> ParsedHref {
    let href = href.trim();
    if let Some(blocked) = blocked_prefix(href) {
        return blocked;
    }
    if let Some(scheme) = scheme_of(href) {
        let rest = &href[scheme.len() + 1..];
        let is_drive = scheme.len() == 1 && rest.starts_with(['/', '\\']);
        if !is_drive {
            let scheme = scheme.to_ascii_lowercase();
            return match scheme.as_str() {
                "http" | "https" => match normalize_origin(href) {
                    Some(origin) => ParsedHref::Web {
                        url: href.to_string(),
                        origin,
                        insecure: scheme == "http",
                    },
                    None => ParsedHref::Blocked { scheme },
                },
                "mailto" => ParsedHref::Mailto { url: href.to_string() },
                "file" => parse_file_url(rest),
                _ => ParsedHref::Blocked { scheme },
            };
        }
    }
    let (path, fragment) = split_fragment_and_query(href);
    file_href(percent_decode(path), fragment)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn classify(
    parsed: ParsedHref,
    ctx: &LinkContext,
    canonicalize: impl Fn(&Path) -> Option<PathBuf>,
) -> (LinkAction, Option<PathBuf>) {
    match parsed {
        ParsedHref::Blocked { scheme } => (LinkAction::Blocked { scheme }, None),
        ParsedHref::Mailto { url } => (LinkAction::OpenUrl { url }, None),
        ParsedHref::Web { url, origin, insecure } => {
            let trusted = ctx
                .trusted_origins
                .iter()
                .filter_map(|o| normalize_origin(o))
                .any(|o| o == origin);
            let action = if trusted {
                LinkAction::OpenUrl { url }
            } else {
                LinkAction::ConfirmUrl { url, origin, insecure }
            };
            (action, None)
        }
        ParsedHref::File { path, fragment } => classify_file(path, fragment, ctx, canonicalize),
    }
}

#[cfg_attr(not(test), allow(dead_code))]
fn classify_file(
    path: PathBuf,
    fragment: Option<String>,
    ctx: &LinkContext,
    canonicalize: impl Fn(&Path) -> Option<PathBuf>,
) -> (LinkAction, Option<PathBuf>) {
    let joined = match ctx.doc_dir {
        _ if path.is_absolute() => path,
        Some(dir) => dir.join(&path),
        None => {
            return (
                LinkAction::NotFound {
                    path: display_path(&path),
                },
                None,
            )
        }
    };
    let joined = normalize_lexically(&joined);

    // Any file system call on a UNC path makes Windows connect to that server and offer the
    // user's NTLM credentials, and an unreachable host can block for a long time. A share the
    // user already has open (document or folder) is fair game; any other share stays untouched
    // until the user confirms.
    let target_share = unc_share(&joined);
    if target_share.is_some() && !ctx.allow_network {
        let known = [ctx.doc_dir, ctx.folder]
            .into_iter()
            .flatten()
            .any(|p| unc_share(p) == target_share);
        if !known {
            return (
                LinkAction::ConfirmNetwork {
                    path: display_path(&joined),
                },
                None,
            );
        }
    }

    let Some(canonical) = canonicalize(&joined) else {
        return (
            LinkAction::NotFound {
                path: display_path(&joined),
            },
            None,
        );
    };
    let path = display_path(&canonical);
    let extension = canonical.extension();
    let action = if canonical.is_dir() {
        LinkAction::ConfirmReveal { path }
    } else if extension.is_some_and(is_markdown_ext) {
        let inside = ctx.folder.is_some_and(|f| canonical.starts_with(f));
        let network = target_share.is_some() || unc_share(&canonical).is_some();
        if inside && !(ctx.allow_network && network) {
            LinkAction::Navigate { path, fragment }
        } else {
            LinkAction::ConfirmDocument { path }
        }
    } else if extension
        .and_then(|e| normalize_extension(&e.to_string_lossy()))
        .is_some_and(|e| is_safe(&e, ctx))
    {
        LinkAction::ConfirmOpenFile { path }
    } else {
        LinkAction::ConfirmReveal { path }
    };
    (action, Some(canonical))
}

#[cfg_attr(not(test), allow(dead_code))]
fn is_safe(ext: &str, ctx: &LinkContext) -> bool {
    ctx.safe_types
        .iter()
        .any(|t| normalize_extension(t).as_deref() == Some(ext))
}

/// `//` (protocol-relative) and Windows device namespaces (`\\?\`, `\\.\`, `\??\`).
#[cfg_attr(not(test), allow(dead_code))]
fn blocked_prefix(s: &str) -> Option<ParsedHref> {
    let is_sep = |b: u8| b == b'/' || b == b'\\';
    let b = s.as_bytes();
    if b.len() < 2 || !is_sep(b[0]) || !is_sep(b[1]) {
        return s.starts_with(r"\??\").then(|| ParsedHref::Blocked {
            scheme: "device".into(),
        });
    }
    if b[0] == b'/' && b[1] == b'/' {
        return Some(ParsedHref::Blocked { scheme: "//".into() });
    }
    let device = matches!(b.get(2), Some(b'?' | b'.')) && b.get(3).is_none_or(|&c| is_sep(c));
    device.then(|| ParsedHref::Blocked {
        scheme: "device".into(),
    })
}

#[cfg_attr(not(test), allow(dead_code))]
fn scheme_of(s: &str) -> Option<&str> {
    let scheme = &s[..s.find(':')?];
    let mut chars = scheme.chars();
    let valid = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'));
    valid.then_some(scheme)
}

#[cfg_attr(not(test), allow(dead_code))]
fn split_fragment_and_query(s: &str) -> (&str, Option<String>) {
    let (before, fragment) = match s.split_once('#') {
        Some((before, f)) => (before, Some(percent_decode(f)).filter(|f| !f.is_empty())),
        None => (s, None),
    };
    (before.split_once('?').map_or(before, |(path, _)| path), fragment)
}

#[cfg_attr(not(test), allow(dead_code))]
fn parse_file_url(rest: &str) -> ParsedHref {
    let (rest, fragment) = split_fragment_and_query(rest);
    let (host, path) = match rest.strip_prefix("//") {
        Some(after) => after.split_at(after.find('/').unwrap_or(after.len())),
        None => ("", rest),
    };
    let host = percent_decode(host);
    let mut path = percent_decode(path);
    if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        if !cfg!(windows) {
            return ParsedHref::Blocked { scheme: "file".into() };
        }
        path = format!(r"\\{host}{path}");
    } else if cfg!(windows) {
        let b = path.as_bytes();
        if b.len() >= 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' {
            path.remove(0);
        }
    }
    file_href(path, fragment)
}

#[cfg_attr(not(test), allow(dead_code))]
fn file_href(path: String, fragment: Option<String>) -> ParsedHref {
    if path.is_empty() {
        return ParsedHref::Blocked { scheme: "#".into() };
    }
    if let Some(blocked) = blocked_prefix(&path) {
        return blocked;
    }
    let path = if cfg!(windows) { path.replace('/', "\\") } else { path };
    ParsedHref::File {
        path: PathBuf::from(path),
        fragment,
    }
}

/// Decodes `%XX` escapes; returns the input unchanged when the result is not UTF-8.
#[cfg_attr(not(test), allow(dead_code))]
fn percent_decode(s: &str) -> String {
    let hex = |c: u8| (c as char).to_digit(16);
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(hi), Some(lo)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

/// Resolves `.` and `..` without touching the disk. Canonical Windows paths are verbatim
/// (`\\?\`), which the OS takes literally, so `..` must be resolved before canonicalizing.
#[cfg_attr(not(test), allow(dead_code))]
fn normalize_lexically(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in p.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if matches!(out.components().next_back(), Some(Component::Normal(_))) {
                    out.pop();
                } else if !out.has_root() {
                    out.push("..");
                }
            }
            other => out.push(other),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_SAFE_FILE_TYPES;
    use crate::display_path;
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn parses_relative_with_fragment_and_query() {
        assert_eq!(
            parse_href("../a/b.md?x=1#Install"),
            ParsedHref::File {
                path: PathBuf::from("../a/b.md"),
                fragment: Some("Install".into())
            }
        );
    }

    #[test]
    fn percent_decodes_path_and_fragment() {
        assert_eq!(
            parse_href("my%20doc.md#a%20b"),
            ParsedHref::File {
                path: PathBuf::from("my doc.md"),
                fragment: Some("a b".into())
            }
        );
    }

    #[test]
    fn windows_drive_is_a_path_not_a_scheme() {
        assert!(matches!(parse_href("C:/x/y.md"), ParsedHref::File { .. }));
        assert!(matches!(parse_href(r"C:\x\y.md"), ParsedHref::File { .. }));
    }

    #[test]
    fn unc_is_a_file_protocol_relative_is_blocked() {
        assert!(matches!(parse_href(r"\\server\share\x.md"), ParsedHref::File { .. }));
        assert_eq!(
            parse_href("//evil.example/x"),
            ParsedHref::Blocked { scheme: "//".into() }
        );
    }

    #[test]
    fn encoded_protocol_relative_is_blocked() {
        assert_eq!(
            parse_href("%2F%2Fevil.example/x"),
            ParsedHref::Blocked { scheme: "//".into() }
        );
    }

    #[test]
    fn file_urls_become_paths() {
        #[cfg(windows)]
        assert_eq!(
            parse_href("file:///C:/docs/a%20b.md"),
            ParsedHref::File {
                path: PathBuf::from(r"C:\docs\a b.md"),
                fragment: None
            }
        );
        #[cfg(windows)]
        assert_eq!(
            parse_href("file://server/share/a.md"),
            ParsedHref::File {
                path: PathBuf::from(r"\\server\share\a.md"),
                fragment: None
            }
        );
        #[cfg(not(windows))]
        assert_eq!(
            parse_href("file:///tmp/a.md"),
            ParsedHref::File {
                path: PathBuf::from("/tmp/a.md"),
                fragment: None
            }
        );
    }

    #[test]
    fn web_and_mailto() {
        assert_eq!(
            parse_href("HTTP://Example.com/x"),
            ParsedHref::Web {
                url: "HTTP://Example.com/x".into(),
                origin: "http://example.com".into(),
                insecure: true
            }
        );
        assert!(matches!(parse_href("mailto:a@b.c"), ParsedHref::Mailto { .. }));
    }

    #[test]
    fn fragment_only_is_blocked() {
        assert_eq!(parse_href("#install"), ParsedHref::Blocked { scheme: "#".into() });
        assert_eq!(parse_href("?q=1"), ParsedHref::Blocked { scheme: "#".into() });
        assert_eq!(parse_href(""), ParsedHref::Blocked { scheme: "#".into() });
    }

    #[test]
    fn device_paths_blocked() {
        assert_eq!(
            parse_href(r"\\?\C:\x.md"),
            ParsedHref::Blocked {
                scheme: "device".into()
            }
        );
        assert_eq!(
            parse_href(r"\\.\pipe\x"),
            ParsedHref::Blocked {
                scheme: "device".into()
            }
        );
    }

    #[test]
    fn encoded_device_paths_blocked() {
        assert_eq!(
            parse_href("%5C%5C%3F%5CC:%5Cx.md"),
            ParsedHref::Blocked {
                scheme: "device".into()
            }
        );
        assert_eq!(
            parse_href("file://./pipe/x"),
            ParsedHref::Blocked {
                scheme: "device".into()
            }
        );
    }

    #[test]
    fn unc_share_extracts_server_and_share() {
        assert_eq!(unc_share(Path::new(r"\\Srv\Docs\a\b.md")), Some(r"\\srv\docs".into()));
        assert_eq!(
            unc_share(Path::new(r"\\?\UNC\srv\docs\a.md")),
            Some(r"\\srv\docs".into())
        );
        assert_eq!(unc_share(Path::new(r"C:\x")), None);
    }

    #[test]
    fn other_schemes_blocked() {
        for (href, scheme) in [
            ("javascript:alert(1)", "javascript"),
            ("ms-msdt:/id x", "ms-msdt"),
            ("vscode://file/x", "vscode"),
            ("data:text/html,x", "data"),
        ] {
            assert_eq!(parse_href(href), ParsedHref::Blocked { scheme: scheme.into() });
        }
    }

    struct Fixture {
        _tmp: tempfile::TempDir,
        root: PathBuf,
        folder: PathBuf,
        safe_types: Vec<String>,
    }

    impl Fixture {
        fn new() -> Self {
            let tmp = tempfile::tempdir().unwrap();
            let root = fs::canonicalize(tmp.path()).unwrap();
            let folder = root.join("folder");
            fs::create_dir_all(folder.join("sub")).unwrap();
            fs::create_dir_all(folder.join("dir")).unwrap();
            fs::create_dir_all(folder.join(".github")).unwrap();
            fs::create_dir_all(root.join("outside")).unwrap();
            fs::create_dir_all(root.join("services")).unwrap();
            for f in [
                "a.md",
                "sub/b.md",
                "img.png",
                "run.ps1",
                "report.docm",
                ".github/c.md",
                "my doc.md",
            ] {
                fs::write(folder.join(f), "x").unwrap();
            }
            fs::write(root.join("outside/notes.md"), "x").unwrap();
            let safe_types = DEFAULT_SAFE_FILE_TYPES.iter().map(|s| s.to_string()).collect();
            Fixture {
                _tmp: tmp,
                root,
                folder,
                safe_types,
            }
        }

        fn ctx<'a>(&'a self, trusted: &'a [String]) -> LinkContext<'a> {
            LinkContext {
                doc_dir: Some(&self.folder),
                folder: Some(&self.folder),
                safe_types: &self.safe_types,
                trusted_origins: trusted,
                allow_network: false,
            }
        }

        fn display(&self, rel: &str) -> String {
            display_path(&fs::canonicalize(self.folder.join(rel)).unwrap())
        }
    }

    fn fs_canon(p: &Path) -> Option<PathBuf> {
        fs::canonicalize(p).ok()
    }

    fn run(href: &str, ctx: &LinkContext) -> LinkAction {
        classify(parse_href(href), ctx, fs_canon).0
    }

    fn panicking(_: &Path) -> Option<PathBuf> {
        panic!("canonicalize must not be called for an unconfirmed network path")
    }

    #[test]
    fn in_folder_markdown_navigates() {
        let fx = Fixture::new();
        let (action, canonical) = classify(parse_href("sub/b.md#install"), &fx.ctx(&[]), fs_canon);
        assert_eq!(
            action,
            LinkAction::Navigate {
                path: fx.display("sub/b.md"),
                fragment: Some("install".into())
            }
        );
        assert_eq!(canonical, Some(fs::canonicalize(fx.folder.join("sub/b.md")).unwrap()));
    }

    #[test]
    fn percent_encoded_and_spaced_paths_resolve() {
        let fx = Fixture::new();
        let expected = LinkAction::Navigate {
            path: fx.display("my doc.md"),
            fragment: None,
        };
        assert_eq!(run("my%20doc.md", &fx.ctx(&[])), expected);
        assert_eq!(run("my doc.md", &fx.ctx(&[])), expected);
    }

    #[test]
    fn dotdot_escape_needs_confirmation() {
        let fx = Fixture::new();
        assert!(matches!(
            run("../outside/notes.md", &fx.ctx(&[])),
            LinkAction::ConfirmDocument { .. }
        ));
    }

    #[test]
    fn symlink_escape_needs_confirmation() {
        let fx = Fixture::new();
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_dir(fx.root.join("outside"), fx.folder.join("esc"));
        #[cfg(not(windows))]
        let made = std::os::unix::fs::symlink(fx.root.join("outside"), fx.folder.join("esc"));
        if made.is_err() {
            return;
        }
        let expected = display_path(&fs::canonicalize(fx.root.join("outside/notes.md")).unwrap());
        assert_eq!(
            run("esc/notes.md", &fx.ctx(&[])),
            LinkAction::ConfirmDocument { path: expected }
        );
    }

    #[test]
    fn single_file_mode_confirms_markdown() {
        let fx = Fixture::new();
        let ctx = LinkContext {
            folder: None,
            ..fx.ctx(&[])
        };
        assert_eq!(
            run("sub/b.md", &ctx),
            LinkAction::ConfirmDocument {
                path: fx.display("sub/b.md")
            }
        );
    }

    #[test]
    fn safe_type_opens() {
        let fx = Fixture::new();
        assert_eq!(
            run("img.png", &fx.ctx(&[])),
            LinkAction::ConfirmOpenFile {
                path: fx.display("img.png")
            }
        );
        #[cfg(windows)]
        assert_eq!(
            run("IMG.PNG", &fx.ctx(&[])),
            LinkAction::ConfirmOpenFile {
                path: fx.display("img.png")
            }
        );
    }

    #[test]
    fn unsafe_type_reveals() {
        let fx = Fixture::new();
        assert_eq!(
            run("run.ps1", &fx.ctx(&[])),
            LinkAction::ConfirmReveal {
                path: fx.display("run.ps1")
            }
        );
        assert_eq!(
            run("report.docm", &fx.ctx(&[])),
            LinkAction::ConfirmReveal {
                path: fx.display("report.docm")
            }
        );
    }

    #[test]
    fn directory_reveals() {
        let fx = Fixture::new();
        assert_eq!(
            run("dir/", &fx.ctx(&[])),
            LinkAction::ConfirmReveal {
                path: fx.display("dir")
            }
        );
        let services = display_path(&fs::canonicalize(fx.root.join("services")).unwrap());
        assert_eq!(
            run("../services/", &fx.ctx(&[])),
            LinkAction::ConfirmReveal { path: services }
        );
    }

    #[test]
    fn missing_file() {
        let fx = Fixture::new();
        let (action, canonical) = classify(parse_href("nope.md"), &fx.ctx(&[]), fs_canon);
        match action {
            LinkAction::NotFound { path } => assert!(path.ends_with("nope.md"), "{path}"),
            other => panic!("expected NotFound, got {other:?}"),
        }
        assert_eq!(canonical, None);
    }

    #[test]
    fn no_document_relative_is_not_found() {
        let fx = Fixture::new();
        let ctx = LinkContext {
            doc_dir: None,
            ..fx.ctx(&[])
        };
        assert!(matches!(run("b.md", &ctx), LinkAction::NotFound { .. }));
    }

    #[test]
    fn trusted_origin_opens() {
        let fx = Fixture::new();
        let trusted = vec!["https://docs.example.com".to_string()];
        assert_eq!(
            run("https://docs.example.com/x", &fx.ctx(&trusted)),
            LinkAction::OpenUrl {
                url: "https://docs.example.com/x".into()
            }
        );
    }

    #[test]
    fn same_host_other_scheme_confirms() {
        let fx = Fixture::new();
        let trusted = vec!["https://docs.example.com".to_string()];
        assert_eq!(
            run("http://docs.example.com/x", &fx.ctx(&trusted)),
            LinkAction::ConfirmUrl {
                url: "http://docs.example.com/x".into(),
                origin: "http://docs.example.com".into(),
                insecure: true,
            }
        );
    }

    #[test]
    fn subdomain_not_trusted() {
        let fx = Fixture::new();
        let trusted = vec!["https://docs.example.com".to_string()];
        assert_eq!(
            run("https://api.docs.example.com", &fx.ctx(&trusted)),
            LinkAction::ConfirmUrl {
                url: "https://api.docs.example.com".into(),
                origin: "https://api.docs.example.com".into(),
                insecure: false,
            }
        );
    }

    #[test]
    fn mailto_opens() {
        let fx = Fixture::new();
        assert_eq!(
            run("mailto:a@b.c", &fx.ctx(&[])),
            LinkAction::OpenUrl {
                url: "mailto:a@b.c".into()
            }
        );
    }

    #[test]
    fn blocked_passes_through() {
        let fx = Fixture::new();
        assert_eq!(
            run("//evil.example/x", &fx.ctx(&[])),
            LinkAction::Blocked { scheme: "//".into() }
        );
        assert_eq!(
            run("javascript:x", &fx.ctx(&[])),
            LinkAction::Blocked {
                scheme: "javascript".into()
            }
        );
    }

    #[cfg(windows)]
    #[test]
    fn case_mismatch_is_inside() {
        let fx = Fixture::new();
        assert_eq!(
            run("SUB/B.MD", &fx.ctx(&[])),
            LinkAction::Navigate {
                path: fx.display("sub/b.md"),
                fragment: None
            }
        );
        assert!(fx.display("sub/b.md").ends_with(r"sub\b.md"));
    }

    #[test]
    fn hidden_file_navigates() {
        let fx = Fixture::new();
        assert_eq!(
            run(".github/c.md", &fx.ctx(&[])),
            LinkAction::Navigate {
                path: fx.display(".github/c.md"),
                fragment: None
            }
        );
    }

    #[cfg(windows)]
    #[test]
    fn network_not_touched() {
        let fx = Fixture::new();
        let (action, canonical) = classify(parse_href(r"\\nonexistent.example\share\x.md"), &fx.ctx(&[]), panicking);
        assert_eq!(
            action,
            LinkAction::ConfirmNetwork {
                path: r"\\nonexistent.example\share\x.md".into()
            }
        );
        assert_eq!(canonical, None);
    }

    #[cfg(windows)]
    #[test]
    fn network_file_url_not_touched() {
        let fx = Fixture::new();
        assert_eq!(
            classify(parse_href("file://nonexistent.example/s/x.md"), &fx.ctx(&[]), panicking).0,
            LinkAction::ConfirmNetwork {
                path: r"\\nonexistent.example\s\x.md".into()
            }
        );
    }

    #[cfg(windows)]
    #[test]
    fn same_share_is_checked() {
        let fx = Fixture::new();
        let local = fs::canonicalize(fx.folder.join("a.md")).unwrap();
        let calls = std::cell::RefCell::new(Vec::new());
        let ctx = LinkContext {
            doc_dir: Some(Path::new(r"\\srv\docs\a")),
            folder: None,
            ..fx.ctx(&[])
        };
        let (action, _) = classify(parse_href("../b.md"), &ctx, |p: &Path| {
            calls.borrow_mut().push(p.to_path_buf());
            Some(local.clone())
        });
        assert_eq!(*calls.borrow(), vec![PathBuf::from(r"\\srv\docs\b.md")]);
        assert_eq!(
            action,
            LinkAction::ConfirmDocument {
                path: display_path(&local)
            }
        );
    }

    #[cfg(windows)]
    #[test]
    fn network_allowed_after_confirm() {
        let fx = Fixture::new();
        let local = fs::canonicalize(fx.folder.join("a.md")).unwrap();
        let ctx = LinkContext {
            allow_network: true,
            ..fx.ctx(&[])
        };
        let (action, canonical) = classify(parse_href(r"\\srv\s\x.md"), &ctx, |_: &Path| Some(local.clone()));
        assert_eq!(
            action,
            LinkAction::ConfirmDocument {
                path: display_path(&local)
            }
        );
        assert_eq!(canonical, Some(local));
    }

    #[test]
    fn serializes_with_kind_tag() {
        let json = serde_json::to_value(LinkAction::ConfirmOpenFile { path: "p".into() }).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "confirmOpenFile", "path": "p" }));
    }
}
