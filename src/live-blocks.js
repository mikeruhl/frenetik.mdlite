import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import hljs from "highlight.js";
import { decodeSource } from "./rich-blocks.js";
import { joinRichRender } from "./rich-render.js";

export const SNAPSHOT_LIMIT = 2 * 1024 * 1024;
const MAX_HEIGHT = 4000;
const PNG_PREFIX = "data:image/png;base64,";
const SVG_PREFIX = "data:image/svg+xml;charset=utf-8,";
export const FIRST_SNAPSHOT_TIMEOUT_MS = 5000;

let frameUrl = null;
let documentContent = "";
let consentCheck = null;
let generation = 0;
const frames = new Map();
const sources = new WeakMap();

/** Records the content being rendered; consent for the open Document is checked against it. */
export function setLiveDocument(content) {
  documentContent = content;
  consentCheck = null;
  generation++;
  for (const [win, entry] of frames) forget(win, entry);
}

function hasConsent() {
  consentCheck ??= invoke("live_consent_check", { content: documentContent }).catch(() => false);
  return consentCheck;
}

function themeVariables(element) {
  const style = getComputedStyle(element);
  const bodyStyle = getComputedStyle(document.body);
  return {
    "--mdlite-fg": style.color,
    "--mdlite-bg": bodyStyle.getPropertyValue("--theme-bg").trim() || "transparent",
    "--mdlite-font": style.fontFamily,
  };
}

function nextFrame() {
  return new Promise((resolve) => (globalThis.requestAnimationFrame ?? setTimeout)(resolve));
}

function buildSourceView(block, source) {
  const pre = document.createElement("pre");
  pre.className = "live-source";
  const code = document.createElement("code");
  code.className = "hljs language-html";
  code.innerHTML = hljs.highlight(source, { language: "xml" }).value;
  pre.appendChild(code);

  const toolbar = document.createElement("div");
  toolbar.className = "live-toolbar";
  const label = document.createElement("span");
  label.className = "live-label";
  label.textContent = "Live Block: runs this code in an isolated frame";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "live-run";
  toolbar.append(label, button);
  block.replaceChildren(toolbar, pre);
  setButton(block, false);
}

function showError(block) {
  const pre = document.createElement("pre");
  pre.className = "live-error";
  pre.textContent = "Live Block error: invalid source";
  block.replaceChildren(pre);
}

function prepare(block) {
  let source;
  try {
    source = decodeSource(block.dataset.live);
  } catch {
    sources.delete(block);
    showError(block);
    return;
  }
  sources.set(block, source);
  buildSourceView(block, source);
}

function setButton(block, running) {
  const button = block.querySelector(".live-run");
  button.textContent = running ? "Stop" : "Run";
  button.onclick = running ? () => stop(block) : () => runAll(block);
  block.dataset.liveState = running ? "running" : "source";
}

function forget(win, entry) {
  frames.delete(win);
  settleSnapshots(entry);
}

function stop(block) {
  for (const [win, entry] of frames) {
    if (entry.block === block) forget(win, entry);
  }
  block.querySelector(".live-frame")?.remove();
  block.querySelector(".live-snapshot")?.remove();
  delete block.dataset.hasSnapshot;
  setButton(block, false);
}

async function runAll(trigger) {
  const requested = generation;
  await invoke("live_consent_grant", { content: documentContent }).catch(() => {});
  if (requested !== generation || !trigger.isConnected) return;
  consentCheck = Promise.resolve(true);
  const root = trigger.closest("#content");
  if (!root) return;
  for (const block of root.querySelectorAll(".live-block")) {
    if (sources.has(block) && block.dataset.liveState !== "running") run(block);
  }
}

function run(block) {
  stop(block);
  frameUrl ??= convertFileSrc("live-frame.html", "mdlive");
  const iframe = document.createElement("iframe");
  iframe.className = "live-frame";
  iframe.title = "Live Block";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("allow", "");
  iframe.src = frameUrl;
  block.insertBefore(iframe, block.querySelector(".live-source"));
  const entry = { block, iframe, source: sources.get(block), pending: new Set() };
  awaitSnapshot(entry);
  frames.set(iframe.contentWindow, entry);
  setButton(block, true);
}

function awaitSnapshot(entry) {
  const snapshot = new Promise((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      entry.pending.delete(settle);
      resolve();
    };
    const timer = setTimeout(settle, FIRST_SNAPSHOT_TIMEOUT_MS);
    entry.pending.add(settle);
  });
  joinRichRender(snapshot);
}

function settleSnapshots(entry) {
  for (const settle of entry.pending) settle();
}

/** Asks each running Live Block for a fresh snapshot and adds the replies to the in-flight Rich Block render. */
export function requestLiveSnapshots() {
  for (const entry of frames.values()) {
    awaitSnapshot(entry);
    entry.iframe.contentWindow?.postMessage({ type: "snapshot-request" }, "*");
  }
}

function snapshotSrc(data) {
  if (typeof data.svg === "string" && data.svg.length <= SNAPSHOT_LIMIT) {
    return SVG_PREFIX + encodeURIComponent(data.svg);
  }
  if (typeof data.png === "string" && data.png.length <= SNAPSHOT_LIMIT && data.png.startsWith(PNG_PREFIX)) {
    return data.png;
  }
  return null;
}

function showSnapshot(block, data) {
  const src = snapshotSrc(data);
  block.querySelector(".live-snapshot")?.remove();
  if (!src) {
    delete block.dataset.hasSnapshot;
    return;
  }
  const node = document.createElement("img");
  node.alt = "Live Block output";
  node.src = src;
  node.classList.add("live-snapshot");
  block.appendChild(node);
  block.dataset.hasSnapshot = "true";
}

window.addEventListener("message", (event) => {
  const entry = frames.get(event.source);
  const data = event.data;
  if (!entry || !data || typeof data !== "object" || typeof data.type !== "string") return;
  if (data.type === "ready") {
    entry.iframe.contentWindow.postMessage(
      { type: "run", source: entry.source, theme: themeVariables(entry.block) },
      "*"
    );
  } else if (data.type === "size" && Number.isFinite(data.height) && data.height >= 0) {
    entry.iframe.style.height = Math.min(Math.ceil(data.height), MAX_HEIGHT) + "px";
  } else if (data.type === "snapshot") {
    showSnapshot(entry.block, data);
    settleSnapshots(entry);
  }
});

export const liveBlockRenderer = {
  selector: ".live-block",

  emit(encoded, idx) {
    return `<div class="live-block" data-live-idx="${idx}" data-live="${encoded}"></div>`;
  },

  async render(blocks) {
    const rendering = ++generation;
    for (const [win, entry] of frames) {
      if (!entry.block.isConnected) forget(win, entry);
    }
    blocks.forEach(prepare);
    if ((await hasConsent()) && rendering === generation) {
      blocks.filter((block) => block.isConnected && sources.has(block)).forEach(run);
    }
  },

  setTheme() {
    nextFrame().then(() => {
      for (const { block, iframe } of frames.values()) {
        iframe.contentWindow?.postMessage({ type: "theme", theme: themeVariables(block) }, "*");
      }
    });
    return false;
  },
};
