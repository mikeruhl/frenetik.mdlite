import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import hljs from "highlight.js";
import { decodeSource } from "./rich-blocks.js";
import { sanitizeRendererSvg } from "./svg-sanitize.js";

export const SNAPSHOT_LIMIT = 2 * 1024 * 1024;
const MAX_HEIGHT = 4000;
const PNG_PREFIX = "data:image/png;base64,";

let frameUrl = null;
let documentContent = "";
let consentCheck = null;
const frames = new Map();

/** Records the content being rendered; consent for the open Document is checked against it. */
export function setLiveDocument(content) {
  documentContent = content;
  consentCheck = null;
}

function hasConsent() {
  consentCheck ??= invoke("live_consent_check", { content: documentContent }).catch(() => false);
  return consentCheck;
}

async function grantConsent() {
  await invoke("live_consent_grant", { content: documentContent }).catch(() => {});
  consentCheck = Promise.resolve(true);
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

function setButton(block, running) {
  const button = block.querySelector(".live-run");
  button.textContent = running ? "Stop" : "Run";
  button.onclick = running ? () => stop(block) : () => runAll(block);
  block.dataset.liveState = running ? "running" : "source";
}

function stop(block) {
  for (const [win, entry] of frames) {
    if (entry.block === block) frames.delete(win);
  }
  block.querySelector(".live-frame")?.remove();
  block.querySelector(".live-snapshot")?.remove();
  delete block.dataset.hasSnapshot;
  setButton(block, false);
}

async function runAll(trigger) {
  await grantConsent();
  const root = trigger.closest("#content") ?? document;
  for (const block of root.querySelectorAll(".live-block")) {
    if (block.dataset.liveState !== "running") run(block);
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
  frames.set(iframe.contentWindow, { block, iframe, source: decodeSource(block.dataset.live) });
  setButton(block, true);
}

function showSnapshot(block, data) {
  let node;
  if (typeof data.svg === "string" && data.svg.length <= SNAPSHOT_LIMIT) {
    const markup = sanitizeRendererSvg(data.svg);
    if (!markup) return;
    node = document.createElement("div");
    node.innerHTML = markup;
  } else if (typeof data.png === "string" && data.png.length <= SNAPSHOT_LIMIT && data.png.startsWith(PNG_PREFIX)) {
    node = document.createElement("img");
    node.alt = "Live Block output";
    node.src = data.png;
  } else {
    return;
  }
  node.classList.add("live-snapshot");
  block.querySelector(".live-snapshot")?.remove();
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
  }
});

export const liveBlockRenderer = {
  selector: ".live-block",

  emit(encoded, idx) {
    return `<div class="live-block" data-live-idx="${idx}" data-live="${encoded}"></div>`;
  },

  async render(blocks) {
    for (const [win, entry] of frames) {
      if (!entry.block.isConnected) frames.delete(win);
    }
    for (const block of blocks) buildSourceView(block, decodeSource(block.dataset.live));
    if (await hasConsent()) blocks.forEach(run);
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
