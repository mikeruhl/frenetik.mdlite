import { decodeSource } from "./rich-blocks.js";
import { sanitizeRendererSvg } from "./svg-sanitize.js";

let instance = null;
let theme = "default";
let appThemeId = null;

function config() {
  return { startOnLoad: false, suppressErrorRendering: true, theme };
}

async function getMermaid() {
  if (!instance) {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize(config());
    instance = mermaid;
  }
  return instance;
}

function nextFrame() {
  return new Promise((resolve) => (globalThis.requestAnimationFrame ?? setTimeout)(resolve));
}

function rgbChannels(color) {
  const hex = color?.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const parts = color?.match(/[\d.]+/g);
  return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : null;
}

/** Mermaid theme for the page background: dark backgrounds get Mermaid's dark theme, whatever the theme is called. */
export function mermaidThemeFor(background, themeId = "") {
  const parts = rgbChannels(background);
  if (!parts) return themeId.includes("dark") ? "dark" : "default";
  const [r, g, b] = parts.map((c) => {
    const v = +c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25 ? "dark" : "default";
}

async function openMermaidWindow(svgContent) {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const id = Date.now().toString(36);
  localStorage.setItem("mdlite-mermaid-" + id, svgContent);
  new WebviewWindow("mermaid-" + id, {
    url: "/mermaid-viewer.html?id=" + id,
    title: "Mermaid Diagram",
    width: 800,
    height: 600,
  });
}

function createExpandButton(block) {
  const btn = document.createElement("button");
  btn.className = "mermaid-expand";
  btn.type = "button";
  btn.title = "Open in new window";
  btn.textContent = "⛶ Open";
  btn.addEventListener("click", async () => {
    const svg = block.querySelector(".mermaid-rendered").innerHTML;
    if (svg && !svg.includes("mermaid-error")) {
      await openMermaidWindow(sanitizeRendererSvg(svg));
    }
  });
  return btn;
}

export const mermaidRenderer = {
  selector: ".mermaid-block",

  emit(encoded, idx) {
    return `<div class="mermaid-block" data-mermaid-idx="${idx}" data-mermaid="${encoded}">
            <div class="mermaid-rendered" id="mermaid-render-${idx}"></div>
          </div>`;
  },

  async render(allBlocks) {
    const blocks = [...allBlocks].filter((block) => block.querySelector(".mermaid-rendered"));
    for (const block of blocks) {
      if (!block.querySelector(".mermaid-expand")) block.appendChild(createExpandButton(block));
    }

    const mermaid = await getMermaid();
    await nextFrame();
    const background = getComputedStyle(document.body).getPropertyValue("--theme-bg").trim();
    const next = mermaidThemeFor(background, appThemeId ?? "");
    if (next !== theme) {
      theme = next;
      mermaid.initialize(config());
    }
    for (const block of blocks) {
      const target = block.querySelector(".mermaid-rendered");
      try {
        const code = decodeSource(block.dataset.mermaid);
        const { svg } = await mermaid.render("mermaid-svg-" + block.dataset.mermaidIdx + "-" + Date.now(), code);
        target.innerHTML = sanitizeRendererSvg(svg);
      } catch (e) {
        const pre = document.createElement("pre");
        pre.className = "mermaid-error";
        pre.textContent = "Mermaid error: " + e.message;
        target.replaceChildren(pre);
      }
    }
  },

  setTheme(themeId) {
    const changed = appThemeId !== null && themeId !== appThemeId;
    appThemeId = themeId;
    return changed && instance !== null;
  },
};
