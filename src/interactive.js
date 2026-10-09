import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";

import { parseMarkdown } from "./markdown.js";
import { initialState, toPayload, missingRequired, isDirty } from "./answers.js";
import { createAnchorLinks, flash } from "./anchors.js";

const OTHER = "";

const panelEl = document.getElementById("interactive-panel");
const titleEl = document.getElementById("interactive-title");
const questionsEl = document.getElementById("interactive-questions");
const statusEl = document.getElementById("interactive-status");
const errorEl = document.getElementById("interactive-error");
const submitBtn = document.getElementById("interactive-submit");
const cancelBtn = document.getElementById("interactive-cancel");
const collapseBtn = document.getElementById("interactive-collapse");

let questions = [];
let state = {};
let baseline = {};
let links = null;
let busy = false;
let confirming = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markdownBlock(className, markdown) {
  const node = el("div", className);
  node.innerHTML = parseMarkdown(markdown);
  return node;
}

function fieldsetFor(id) {
  return questionsEl.querySelector(`fieldset[data-qid="${CSS.escape(id)}"]`);
}

function buildChoice(q, entry, type, value, label, description) {
  const row = el("label", "iq-option");
  const input = el("input");
  input.type = type;
  input.name = `iq-${q.id}`;
  input.value = value;
  input.checked = value === OTHER ? entry.otherChosen : entry.selected.includes(value);
  row.append(input, el("span", "iq-option-label", label));
  if (description) row.append(markdownBlock("iq-option-desc", description));
  return row;
}

function buildOtherInput(entry) {
  const input = el("input", "iq-other");
  input.type = "text";
  input.placeholder = "Other…";
  input.setAttribute("aria-label", "Other answer");
  input.value = entry.other;
  input.disabled = !entry.otherChosen;
  input.addEventListener("input", () => {
    entry.other = input.value;
    update();
  });
  return input;
}

function bindChoiceGroup(q, entry, group, otherInput) {
  group.addEventListener("change", (e) => {
    const input = e.target;
    if (input.name !== `iq-${q.id}`) return;
    if (q.type === "single") {
      entry.otherChosen = input.value === OTHER;
      entry.selected = entry.otherChosen ? [] : [input.value];
    } else if (input.value === OTHER) {
      entry.otherChosen = input.checked;
    } else {
      entry.selected = input.checked
        ? [...entry.selected, input.value]
        : entry.selected.filter((v) => v !== input.value);
    }
    if (otherInput) {
      otherInput.disabled = !entry.otherChosen;
      if (entry.otherChosen && input.value === OTHER) otherInput.focus();
    }
    update();
  });
}

function buildControls(q, entry) {
  if (q.type === "text") {
    const input = el(q.multiline ? "textarea" : "input", "iq-text");
    if (!q.multiline) input.type = "text";
    if (q.placeholder) input.placeholder = q.placeholder;
    input.setAttribute("aria-label", q.prompt);
    input.required = Boolean(q.required);
    input.value = entry.text;
    input.addEventListener("input", () => {
      entry.text = input.value;
      update();
    });
    return input;
  }
  const group = el("div", "iq-options");
  const type = q.type === "single" ? "radio" : "checkbox";
  for (const opt of q.options) group.append(buildChoice(q, entry, type, opt.value, opt.label, opt.description));
  let otherInput = null;
  if (q.allowOther) {
    group.append(buildChoice(q, entry, type, OTHER, "Other"));
    otherInput = buildOtherInput(entry);
    group.append(otherInput);
  }
  bindChoiceGroup(q, entry, group, otherInput);
  return group;
}

function buildQuestion(q, index) {
  const fieldset = el("fieldset", "iq");
  fieldset.dataset.qid = q.id;
  const legend = el("legend", "iq-prompt");
  legend.append(el("span", "iq-num", `Q${index + 1}`), el("span", "iq-prompt-text", q.prompt));
  if (q.required) legend.append(el("span", "iq-required", "*"));
  if (q.anchor) {
    const locate = el("button", "iq-locate", "§");
    locate.type = "button";
    locate.title = "Show in document";
    locate.setAttribute("aria-label", "Show in document");
    locate.hidden = true;
    locate.addEventListener("click", () => links.scrollToAnchor(q.anchor));
    legend.append(locate);
  }
  fieldset.append(legend);
  if (q.description) fieldset.append(markdownBlock("iq-desc", q.description));
  fieldset.append(buildControls(q, state[q.id]));
  return fieldset;
}

function update() {
  const missing = missingRequired(questions, toPayload(questions, state));
  for (const q of questions) fieldsetFor(q.id).classList.toggle("iq-missing", missing.includes(q.id));
  submitBtn.disabled = busy || missing.length > 0;
  statusEl.textContent = missing.length
    ? `${missing.length} required question${missing.length === 1 ? "" : "s"} remaining`
    : "";
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

async function submit() {
  if (submitBtn.disabled) return;
  busy = true;
  showError("");
  update();
  try {
    await invoke("submit_answers", { answers: toPayload(questions, state) });
  } catch (err) {
    busy = false;
    showError(String(err));
    update();
  }
}

async function cancel() {
  if (confirming) return;
  if (isDirty(questions, state, baseline)) {
    confirming = true;
    try {
      const discard = await ask("Discard your answers and cancel?", {
        title: "mdlite",
        kind: "warning",
        okLabel: "Discard",
        cancelLabel: "Keep editing",
      });
      if (!discard) return;
    } finally {
      confirming = false;
    }
  }
  await invoke("cancel_interactive");
}

function activateQuestions(ids) {
  questionsEl.querySelectorAll("fieldset.iq-active").forEach((f) => f.classList.remove("iq-active"));
  const fieldsets = ids.map(fieldsetFor).filter(Boolean);
  fieldsets.forEach((f) => f.classList.add("iq-active"));
  const editing = panelEl.contains(document.activeElement) && document.activeElement.matches("input, textarea");
  if (fieldsets.length && !editing) fieldsets[0].scrollIntoView({ block: "nearest" });
}

function setCollapsed(collapsed) {
  document.body.classList.toggle("interactive-collapsed", collapsed);
  collapseBtn.title = collapsed ? "Show questions" : "Hide questions";
  collapseBtn.setAttribute("aria-label", collapseBtn.title);
}

function goToQuestion(id) {
  const fieldset = fieldsetFor(id);
  if (!fieldset) return;
  setCollapsed(false);
  fieldset.scrollIntoView({ behavior: "smooth", block: "center" });
  flash(fieldset);
  fieldset.querySelector("input:not([disabled]), textarea")?.focus({ preventScroll: true });
}

function showResolvedLinks(anchors) {
  for (const q of questions) {
    const locate = fieldsetFor(q.id).querySelector(".iq-locate");
    if (locate) locate.hidden = !anchors.has(q.anchor);
  }
}

/** Starts interactive mode when the backend has a session. Returns whether a session is active. */
export async function initInteractive({ contentEl, scrollRoot }) {
  const session = await invoke("get_interactive_session");
  if (!session) return false;

  questions = session.questions;
  state = initialState(questions);
  baseline = initialState(questions);
  titleEl.textContent = session.title || "Questions";
  submitBtn.textContent = session.submitLabel || "Submit";
  questionsEl.replaceChildren(...questions.map(buildQuestion));
  links = createAnchorLinks({
    contentEl,
    scrollRoot,
    questions,
    onActivate: activateQuestions,
    onBadge: goToQuestion,
    onResolved: showResolvedLinks,
  });

  submitBtn.addEventListener("click", submit);
  cancelBtn.addEventListener("click", cancel);
  collapseBtn.addEventListener("click", () => setCollapsed(!document.body.classList.contains("interactive-collapsed")));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  await listen("interactive-close-requested", cancel);
  await invoke("register_interactive_ready");

  panelEl.hidden = false;
  document.body.classList.add("interactive-mode");
  update();
  return true;
}

/** Re-links anchors after the document re-renders. Answers are kept. */
export function refreshInteractive() {
  links?.refresh();
}
