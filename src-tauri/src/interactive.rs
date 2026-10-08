use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI32, Ordering};

pub(crate) const SCHEMA_VERSION: u32 = 1;
const MAX_QUESTIONS_FILE_BYTES: u64 = 256 * 1024;
const MAX_QUESTIONS: usize = 50;
const MAX_OPTIONS: usize = 50;
const MAX_ID_LEN: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct QuestionSet {
    pub(crate) version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) submit_label: Option<String>,
    pub(crate) questions: Vec<Question>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum QuestionKind {
    Single,
    Multi,
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Question {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) kind: QuestionKind,
    pub(crate) prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) required: bool,
    #[serde(default)]
    pub(crate) allow_other: bool,
    #[serde(default)]
    pub(crate) multiline: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) default: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) anchor: Option<String>,
    #[serde(default)]
    pub(crate) options: Vec<QuestionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct QuestionOption {
    pub(crate) value: String,
    pub(crate) label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) description: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Answer {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) values: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) other: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) text: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Status {
    Submitted,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct InteractiveResult {
    pub(crate) version: u32,
    pub(crate) status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) document: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) answers: Option<BTreeMap<String, Answer>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

impl InteractiveResult {
    pub(crate) fn submitted(document: String, answers: BTreeMap<String, Answer>) -> Self {
        Self {
            version: SCHEMA_VERSION,
            status: Status::Submitted,
            document: Some(document),
            answers: Some(answers),
            error: None,
        }
    }

    pub(crate) fn cancelled() -> Self {
        Self {
            version: SCHEMA_VERSION,
            status: Status::Cancelled,
            document: None,
            answers: None,
            error: None,
        }
    }

    pub(crate) fn error(message: impl Into<String>) -> Self {
        Self {
            version: SCHEMA_VERSION,
            status: Status::Error,
            document: None,
            answers: None,
            error: Some(message.into()),
        }
    }

    pub(crate) fn exit_code(&self) -> i32 {
        match self.status {
            Status::Submitted => 0,
            Status::Error => 1,
            Status::Cancelled => 2,
        }
    }
}

/// An interactive session: the document under review, its questions, and where to deliver the result.
#[derive(Debug, Clone)]
pub(crate) struct InteractiveSession {
    pub(crate) document: PathBuf,
    pub(crate) questions: QuestionSet,
    pub(crate) output: Option<PathBuf>,
    /// Set by the frontend once the user has entered answers; closing then needs confirmation.
    pub(crate) dirty: bool,
}

const NO_EXIT_CODE: i32 = i32::MIN;

/// Guarantees a session emits at most one result, whichever exit path reaches it first, and remembers
/// that result's exit code. Tauri's event loop always ends with code 0, so `run` exits with this code.
pub(crate) struct ResultGate(AtomicI32);

impl ResultGate {
    pub(crate) const fn new() -> Self {
        Self(AtomicI32::new(NO_EXIT_CODE))
    }

    pub(crate) fn claim(&self, exit_code: i32) -> bool {
        self.0
            .compare_exchange(NO_EXIT_CODE, exit_code, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    pub(crate) fn is_claimed(&self) -> bool {
        self.exit_code().is_some()
    }

    pub(crate) fn exit_code(&self) -> Option<i32> {
        Some(self.0.load(Ordering::SeqCst)).filter(|&c| c != NO_EXIT_CODE)
    }
}

pub(crate) static RESULT_GATE: ResultGate = ResultGate::new();

fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn id_error(field: &str, value: &str) -> String {
    format!("{field} '{value}' must match ^[A-Za-z0-9_-]{{1,{MAX_ID_LEN}}}$")
}

/// Reads and validates a questions file against schema v1.
pub(crate) fn load_questions(path: &Path) -> Result<QuestionSet, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Cannot read questions file {}: {e}", path.display()))?;
    if meta.len() > MAX_QUESTIONS_FILE_BYTES {
        return Err(format!(
            "Questions file is {} bytes; the limit is {MAX_QUESTIONS_FILE_BYTES}",
            meta.len()
        ));
    }
    let text =
        std::fs::read_to_string(path).map_err(|e| format!("Cannot read questions file {}: {e}", path.display()))?;
    parse_questions(&text)
}

pub(crate) fn parse_questions(text: &str) -> Result<QuestionSet, String> {
    let set: QuestionSet = serde_json::from_str(text).map_err(|e| format!("Invalid questions JSON: {e}"))?;
    validate_questions(&set)?;
    Ok(set)
}

fn validate_questions(set: &QuestionSet) -> Result<(), String> {
    if set.version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported questions version {}; expected {SCHEMA_VERSION}",
            set.version
        ));
    }
    if set.questions.is_empty() || set.questions.len() > MAX_QUESTIONS {
        return Err(format!(
            "Questions file must contain 1 to {MAX_QUESTIONS} questions; found {}",
            set.questions.len()
        ));
    }
    let mut ids = HashSet::new();
    for q in &set.questions {
        if !is_valid_id(&q.id) {
            return Err(id_error("Question id", &q.id));
        }
        if !ids.insert(q.id.as_str()) {
            return Err(format!("Duplicate question id '{}'", q.id));
        }
        if let Some(anchor) = &q.anchor {
            if !is_valid_id(anchor) {
                return Err(format!("Question '{}': {}", q.id, id_error("anchor", anchor)));
            }
        }
        validate_question_options(q)?;
        validate_question_default(q)?;
    }
    Ok(())
}

fn validate_question_options(q: &Question) -> Result<(), String> {
    match q.kind {
        QuestionKind::Text => {
            if !q.options.is_empty() {
                return Err(format!("Question '{}': text questions cannot have options", q.id));
            }
        }
        QuestionKind::Single | QuestionKind::Multi => {
            if q.options.is_empty() || q.options.len() > MAX_OPTIONS {
                return Err(format!(
                    "Question '{}' must have 1 to {MAX_OPTIONS} options; found {}",
                    q.id,
                    q.options.len()
                ));
            }
            let mut values = HashSet::new();
            for opt in &q.options {
                if !is_valid_id(&opt.value) {
                    return Err(format!("Question '{}': {}", q.id, id_error("option value", &opt.value)));
                }
                if !values.insert(opt.value.as_str()) {
                    return Err(format!("Question '{}': duplicate option value '{}'", q.id, opt.value));
                }
            }
        }
    }
    Ok(())
}

fn validate_question_default(q: &Question) -> Result<(), String> {
    let Some(default) = &q.default else {
        return Ok(());
    };
    let known = |v: &str| q.options.iter().any(|o| o.value == v);
    let ok = match (q.kind, default) {
        (QuestionKind::Single, serde_json::Value::String(v)) => known(v),
        (QuestionKind::Multi, serde_json::Value::Array(items)) => items.iter().all(|i| i.as_str().is_some_and(known)),
        (QuestionKind::Text, serde_json::Value::String(_)) => true,
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(format!(
            "Question '{}': default does not match its type or references an unknown option",
            q.id
        ))
    }
}

fn non_blank(s: &Option<String>) -> Option<String> {
    s.as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

/// Checks submitted answers against the question set and returns them normalized, with unanswered
/// optional questions omitted.
pub(crate) fn validate_answers(
    set: &QuestionSet,
    answers: &HashMap<String, Answer>,
) -> Result<BTreeMap<String, Answer>, String> {
    for id in answers.keys() {
        if !set.questions.iter().any(|q| &q.id == id) {
            return Err(format!("Answer for unknown question '{id}'"));
        }
    }
    let mut normalized = BTreeMap::new();
    for q in &set.questions {
        let normalized_answer = match answers.get(&q.id) {
            Some(a) => normalize_answer(q, a)?,
            None => None,
        };
        match normalized_answer {
            Some(a) => {
                normalized.insert(q.id.clone(), a);
            }
            None if q.required => return Err(format!("Question '{}' is required", q.id)),
            None => {}
        }
    }
    Ok(normalized)
}

fn normalize_answer(q: &Question, a: &Answer) -> Result<Option<Answer>, String> {
    let other = non_blank(&a.other);
    if other.is_some() && !q.allow_other {
        return Err(format!("Question '{}' does not accept an Other answer", q.id));
    }
    let known = |v: &str| q.options.iter().any(|o| o.value == v);
    match q.kind {
        QuestionKind::Single => {
            if a.values.is_some() || a.text.is_some() {
                return Err(format!("Question '{}' expects 'value' or 'other'", q.id));
            }
            match (&a.value, other) {
                (Some(_), Some(_)) => Err(format!("Question '{}' accepts 'value' or 'other', not both", q.id)),
                (Some(v), None) if known(v) => Ok(Some(Answer {
                    value: Some(v.clone()),
                    ..Answer::default()
                })),
                (Some(v), None) => Err(format!("Question '{}': unknown option '{v}'", q.id)),
                (None, Some(o)) => Ok(Some(Answer {
                    other: Some(o),
                    ..Answer::default()
                })),
                (None, None) => Ok(None),
            }
        }
        QuestionKind::Multi => {
            if a.value.is_some() || a.text.is_some() {
                return Err(format!("Question '{}' expects 'values' and optionally 'other'", q.id));
            }
            let values = a.values.clone().unwrap_or_default();
            let mut seen = HashSet::new();
            for v in &values {
                if !known(v) {
                    return Err(format!("Question '{}': unknown option '{v}'", q.id));
                }
                if !seen.insert(v.as_str()) {
                    return Err(format!("Question '{}': option '{v}' selected twice", q.id));
                }
            }
            if values.is_empty() && other.is_none() {
                return Ok(None);
            }
            Ok(Some(Answer {
                values: Some(values),
                other,
                ..Answer::default()
            }))
        }
        QuestionKind::Text => {
            if a.value.is_some() || a.values.is_some() || a.other.is_some() {
                return Err(format!("Question '{}' expects 'text'", q.id));
            }
            Ok(a.text.as_ref().filter(|t| !t.trim().is_empty()).map(|t| Answer {
                text: Some(t.clone()),
                ..Answer::default()
            }))
        }
    }
}

/// Verifies the `--output` path can be created before the window opens.
pub(crate) fn check_output_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        return Err(format!("Output path {} is a directory", path.display()));
    }
    let parent = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    if !parent.is_dir() {
        return Err(format!("Output directory {} does not exist", parent.display()));
    }
    Ok(())
}

fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    let tmp = path.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

/// Writes the result to the optional output file (atomically) and then as one JSON line to `out`.
pub(crate) fn deliver(result: &InteractiveResult, output: Option<&Path>, out: &mut impl Write) -> Result<(), String> {
    let json = serde_json::to_string(result).map_err(|e| format!("Cannot serialize result: {e}"))?;
    let file_result = output
        .map(|path| write_atomic(path, json.as_bytes()).map_err(|e| format!("Cannot write {}: {e}", path.display())));
    let _ = writeln!(out, "{json}");
    let _ = out.flush();
    file_result.unwrap_or(Ok(()))
}

/// Emits the session result once and returns the exit code, or `None` when a result was already
/// emitted.
pub(crate) fn emit_once(result: &InteractiveResult, output: Option<&Path>) -> Option<i32> {
    if !RESULT_GATE.claim(result.exit_code()) {
        return None;
    }
    if let Some(msg) = &result.error {
        eprintln!("{msg}");
    }
    if let Err(e) = deliver(result, output, &mut std::io::stdout()) {
        eprintln!("{e}");
    }
    Some(result.exit_code())
}

/// Emits the result once and exits the app with the matching code.
pub(crate) fn finish_session(app: &tauri::AppHandle, result: &InteractiveResult, output: Option<&Path>) {
    if let Some(code) = emit_once(result, output) {
        app.exit(code);
    }
}

/// Reports a startup failure and terminates before the event loop runs.
pub(crate) fn fail_startup(message: String, output: Option<&Path>) -> ! {
    let result = InteractiveResult::error(message);
    let code = emit_once(&result, output).unwrap_or(1);
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_json() -> String {
        serde_json::json!({
            "version": 1,
            "title": "Pick",
            "questions": [
                {
                    "id": "strategy", "type": "single", "prompt": "Which?", "required": true,
                    "allowOther": true, "default": "redis", "anchor": "caching-options",
                    "options": [{ "value": "redis", "label": "Redis" }, { "value": "memory", "label": "Memory" }]
                },
                {
                    "id": "risks", "type": "multi", "prompt": "Risks?", "allowOther": true,
                    "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }]
                },
                { "id": "notes", "type": "text", "prompt": "Notes?", "multiline": true }
            ]
        })
        .to_string()
    }

    fn sample() -> QuestionSet {
        parse_questions(&sample_json()).unwrap()
    }

    fn with(mutator: impl FnOnce(&mut serde_json::Value)) -> Result<QuestionSet, String> {
        let mut v: serde_json::Value = serde_json::from_str(&sample_json()).unwrap();
        mutator(&mut v);
        parse_questions(&v.to_string())
    }

    fn answers(pairs: &[(&str, Answer)]) -> HashMap<String, Answer> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
    }

    #[test]
    fn valid_file_parses() {
        let set = sample();
        assert_eq!(set.questions.len(), 3);
        assert_eq!(set.questions[0].kind, QuestionKind::Single);
    }

    #[test]
    fn rejects_wrong_version() {
        let err = with(|v| v["version"] = 2.into()).unwrap_err();
        assert!(err.contains("version"));
    }

    #[test]
    fn rejects_no_questions() {
        assert!(with(|v| v["questions"] = serde_json::json!([])).is_err());
    }

    #[test]
    fn rejects_too_many_questions() {
        let err = with(|v| {
            let q: Vec<_> = (0..51)
                .map(|i| serde_json::json!({ "id": format!("q{i}"), "type": "text", "prompt": "p" }))
                .collect();
            v["questions"] = q.into();
        })
        .unwrap_err();
        assert!(err.contains("1 to 50"));
    }

    #[test]
    fn rejects_too_many_options() {
        let err = with(|v| {
            let opts: Vec<_> = (0..51)
                .map(|i| serde_json::json!({ "value": format!("o{i}"), "label": "l" }))
                .collect();
            v["questions"][1]["options"] = opts.into();
        })
        .unwrap_err();
        assert!(err.contains("1 to 50 options"));
    }

    #[test]
    fn rejects_choice_without_options() {
        assert!(with(|v| v["questions"][1]["options"] = serde_json::json!([])).is_err());
    }

    #[test]
    fn rejects_text_with_options() {
        assert!(with(|v| v["questions"][2]["options"] = serde_json::json!([{ "value": "x", "label": "x" }])).is_err());
    }

    #[test]
    fn rejects_duplicate_question_id() {
        let err = with(|v| v["questions"][1]["id"] = "strategy".into()).unwrap_err();
        assert!(err.contains("Duplicate question id 'strategy'"));
    }

    #[test]
    fn rejects_bad_question_id() {
        assert!(with(|v| v["questions"][0]["id"] = "has space".into()).is_err());
        assert!(with(|v| v["questions"][0]["id"] = "x".repeat(65).into()).is_err());
    }

    #[test]
    fn rejects_bad_option_value() {
        assert!(with(|v| v["questions"][0]["options"][0]["value"] = "a.b".into()).is_err());
    }

    #[test]
    fn rejects_duplicate_option_value() {
        assert!(with(|v| v["questions"][0]["options"][1]["value"] = "redis".into()).is_err());
    }

    #[test]
    fn rejects_bad_anchor() {
        let err = with(|v| v["questions"][0]["anchor"] = "#nope".into()).unwrap_err();
        assert!(err.contains("anchor"));
    }

    #[test]
    fn rejects_unknown_type() {
        assert!(with(|v| v["questions"][2]["type"] = "date".into()).is_err());
    }

    #[test]
    fn rejects_unknown_field() {
        assert!(with(|v| v["questions"][0]["allow_other"] = true.into()).is_err());
    }

    #[test]
    fn rejects_unknown_default() {
        assert!(with(|v| v["questions"][0]["default"] = "nope".into()).is_err());
        assert!(with(|v| v["questions"][1]["default"] = serde_json::json!(["a", "zzz"])).is_err());
        assert!(with(|v| v["questions"][1]["default"] = "a".into()).is_err());
    }

    #[test]
    fn accepts_valid_defaults() {
        assert!(with(|v| v["questions"][1]["default"] = serde_json::json!(["a", "b"])).is_ok());
        assert!(with(|v| v["questions"][2]["default"] = "hi".into()).is_ok());
    }

    #[test]
    fn rejects_invalid_json() {
        assert!(parse_questions("{not json").is_err());
    }

    #[test]
    fn load_rejects_oversized_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("q.json");
        std::fs::write(&path, vec![b' '; (MAX_QUESTIONS_FILE_BYTES + 1) as usize]).unwrap();
        assert!(load_questions(&path).unwrap_err().contains("limit"));
    }

    #[test]
    fn load_rejects_missing_file() {
        assert!(load_questions(Path::new("definitely-missing-questions.json")).is_err());
    }

    #[test]
    fn answer_shapes_by_type() {
        let set = sample();
        let result = validate_answers(
            &set,
            &answers(&[
                (
                    "strategy",
                    Answer {
                        value: Some("redis".into()),
                        ..Answer::default()
                    },
                ),
                (
                    "risks",
                    Answer {
                        values: Some(vec!["a".into(), "b".into()]),
                        other: Some("c".into()),
                        ..Answer::default()
                    },
                ),
                (
                    "notes",
                    Answer {
                        text: Some("hello".into()),
                        ..Answer::default()
                    },
                ),
            ]),
        )
        .unwrap();
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["strategy"], serde_json::json!({ "value": "redis" }));
        assert_eq!(json["risks"], serde_json::json!({ "values": ["a", "b"], "other": "c" }));
        assert_eq!(json["notes"], serde_json::json!({ "text": "hello" }));
    }

    #[test]
    fn single_other_answer() {
        let set = sample();
        let result = validate_answers(
            &set,
            &answers(&[(
                "strategy",
                Answer {
                    other: Some("  custom ".into()),
                    ..Answer::default()
                },
            )]),
        )
        .unwrap();
        assert_eq!(result["strategy"].other.as_deref(), Some("custom"));
    }

    #[test]
    fn missing_required_rejected() {
        let err = validate_answers(&sample(), &HashMap::new()).unwrap_err();
        assert!(err.contains("'strategy' is required"));
    }

    #[test]
    fn blank_optional_answers_omitted() {
        let result = validate_answers(
            &sample(),
            &answers(&[
                (
                    "strategy",
                    Answer {
                        value: Some("memory".into()),
                        ..Answer::default()
                    },
                ),
                (
                    "risks",
                    Answer {
                        values: Some(vec![]),
                        other: Some("   ".into()),
                        ..Answer::default()
                    },
                ),
                (
                    "notes",
                    Answer {
                        text: Some("  ".into()),
                        ..Answer::default()
                    },
                ),
            ]),
        )
        .unwrap();
        assert_eq!(result.keys().collect::<Vec<_>>(), vec!["strategy"]);
    }

    #[test]
    fn rejects_unknown_option_and_question() {
        let set = sample();
        assert!(validate_answers(
            &set,
            &answers(&[(
                "strategy",
                Answer {
                    value: Some("nope".into()),
                    ..Answer::default()
                }
            )])
        )
        .is_err());
        assert!(validate_answers(
            &set,
            &answers(&[
                (
                    "strategy",
                    Answer {
                        value: Some("redis".into()),
                        ..Answer::default()
                    }
                ),
                (
                    "ghost",
                    Answer {
                        text: Some("x".into()),
                        ..Answer::default()
                    }
                ),
            ])
        )
        .is_err());
    }

    #[test]
    fn rejects_other_when_not_allowed() {
        let set = with(|v| v["questions"][0]["allowOther"] = false.into()).unwrap();
        assert!(validate_answers(
            &set,
            &answers(&[(
                "strategy",
                Answer {
                    other: Some("x".into()),
                    ..Answer::default()
                }
            )])
        )
        .is_err());
    }

    #[test]
    fn rejects_wrong_shape_and_duplicates() {
        let set = sample();
        let base = (
            "strategy",
            Answer {
                value: Some("redis".into()),
                ..Answer::default()
            },
        );
        assert!(validate_answers(
            &set,
            &answers(&[
                base.clone(),
                (
                    "notes",
                    Answer {
                        value: Some("x".into()),
                        ..Answer::default()
                    }
                )
            ])
        )
        .is_err());
        assert!(validate_answers(
            &set,
            &answers(&[
                base.clone(),
                (
                    "risks",
                    Answer {
                        values: Some(vec!["a".into(), "a".into()]),
                        ..Answer::default()
                    }
                )
            ])
        )
        .is_err());
        assert!(validate_answers(
            &set,
            &answers(&[(
                "strategy",
                Answer {
                    value: Some("redis".into()),
                    other: Some("x".into()),
                    ..Answer::default()
                }
            )])
        )
        .is_err());
    }

    #[test]
    fn exit_codes() {
        assert_eq!(InteractiveResult::submitted("d".into(), BTreeMap::new()).exit_code(), 0);
        assert_eq!(InteractiveResult::error("e").exit_code(), 1);
        assert_eq!(InteractiveResult::cancelled().exit_code(), 2);
    }

    #[test]
    fn cancelled_serializes_minimal() {
        let json = serde_json::to_string(&InteractiveResult::cancelled()).unwrap();
        assert_eq!(json, r#"{"version":1,"status":"cancelled"}"#);
    }

    #[test]
    fn deliver_writes_single_line_and_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("answers.json");
        let mut out = Vec::new();
        let result = InteractiveResult::submitted("doc.md".into(), BTreeMap::new());
        deliver(&result, Some(&path), &mut out).unwrap();
        let stdout = String::from_utf8(out).unwrap();
        assert_eq!(stdout.lines().count(), 1);
        let file = std::fs::read_to_string(&path).unwrap();
        assert_eq!(stdout.trim_end(), file);
        let leftovers: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(leftovers.len(), 1, "temporary file must not remain");
    }

    #[test]
    fn deliver_without_output_writes_stdout_only() {
        let mut out = Vec::new();
        deliver(&InteractiveResult::cancelled(), None, &mut out).unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(parsed["status"], "cancelled");
    }

    #[test]
    fn deliver_reports_unwritable_file_but_still_writes_stdout() {
        let mut out = Vec::new();
        let missing = Path::new("no-such-dir-xyz").join("answers.json");
        assert!(deliver(&InteractiveResult::cancelled(), Some(&missing), &mut out).is_err());
        assert!(!out.is_empty());
    }

    #[test]
    fn gate_claims_once() {
        let gate = ResultGate::new();
        assert!(!gate.is_claimed());
        assert_eq!(gate.exit_code(), None);
        assert!(gate.claim(2));
        assert!(!gate.claim(0));
        assert!(gate.is_claimed());
        assert_eq!(gate.exit_code(), Some(2));
    }

    #[test]
    fn output_path_checks() {
        let dir = tempfile::tempdir().unwrap();
        assert!(check_output_path(&dir.path().join("a.json")).is_ok());
        assert!(check_output_path(dir.path()).is_err());
        assert!(check_output_path(&dir.path().join("missing").join("a.json")).is_err());
    }
}
