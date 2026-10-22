import * as d3 from "d3";
import { cloneSvgForSnapshot } from "./svg-snapshot.js";

export const SNAPSHOT_LIMIT = 2 * 1024 * 1024;
const SETTLE_MS = 1000;

window.d3 = d3;

const root = document.getElementById("root");
let settleTimer;
let lastHeight = 0;
let hasRun = false;

function post(message) {
  window.parent.postMessage(message, "*");
}

function applyTheme(theme) {
  if (!theme || typeof theme !== "object") return;
  for (const [name, value] of Object.entries(theme)) {
    if (/^--mdlite-[a-z-]+$/.test(name) && typeof value === "string") {
      document.documentElement.style.setProperty(name, value);
    }
  }
}

function contentHeight() {
  const body = getComputedStyle(document.body);
  const rootHeight = Math.max(root.getBoundingClientRect().height, root.scrollHeight);
  return rootHeight + (parseFloat(body.marginTop) || 0) + (parseFloat(body.marginBottom) || 0);
}

function reportSize() {
  const height = Math.ceil(contentHeight());
  if (height !== lastHeight) {
    lastHeight = height;
    post({ type: "size", height });
  }
}

function snapshot() {
  const svg = root.querySelector("svg");
  if (svg) {
    for (const withRules of [true, false]) {
      const markup = new XMLSerializer().serializeToString(cloneSvgForSnapshot(svg, { withRules }));
      if (markup.length <= SNAPSHOT_LIMIT) return { type: "snapshot", svg: markup };
    }
  }
  const canvas = root.querySelector("canvas");
  if (canvas) {
    try {
      const png = canvas.toDataURL("image/png");
      if (png.length <= SNAPSHOT_LIMIT) return { type: "snapshot", png };
    } catch {
      return null;
    }
  }
  return null;
}

function postSnapshot() {
  clearTimeout(settleTimer);
  post(snapshot() ?? { type: "snapshot" });
}

function scheduleSnapshot() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(postSnapshot, SETTLE_MS);
}

function run(source) {
  hasRun = true;
  root.innerHTML = source;
  for (const original of root.querySelectorAll("script")) {
    const script = document.createElement("script");
    for (const { name, value } of original.attributes) script.setAttribute(name, value);
    script.textContent = original.textContent;
    original.replaceWith(script);
  }
  reportSize();
  scheduleSnapshot();
}

new ResizeObserver(reportSize).observe(root);
new MutationObserver(scheduleSnapshot).observe(root, { childList: true, subtree: true, attributes: true });

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "run" && typeof data.source === "string") {
    applyTheme(data.theme);
    run(data.source);
  } else if (data.type === "theme") {
    applyTheme(data.theme);
    scheduleSnapshot();
  } else if (data.type === "snapshot-request" && hasRun) {
    postSnapshot();
  }
});

post({ type: "ready" });
