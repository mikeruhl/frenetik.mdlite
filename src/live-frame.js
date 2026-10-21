import * as d3 from "d3";

export const SNAPSHOT_LIMIT = 2 * 1024 * 1024;
const SETTLE_MS = 1000;

window.d3 = d3;

const root = document.getElementById("root");
let settleTimer;
let lastHeight = 0;

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

function reportSize() {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (height !== lastHeight) {
    lastHeight = height;
    post({ type: "size", height });
  }
}

function snapshot() {
  const svg = root.querySelector("svg");
  if (svg) {
    const markup = new XMLSerializer().serializeToString(svg);
    if (markup.length <= SNAPSHOT_LIMIT) return { type: "snapshot", svg: markup };
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

function scheduleSnapshot() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const message = snapshot();
    if (message) post(message);
  }, SETTLE_MS);
}

function run(source) {
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

new ResizeObserver(reportSize).observe(document.documentElement);
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
  }
});

post({ type: "ready" });
