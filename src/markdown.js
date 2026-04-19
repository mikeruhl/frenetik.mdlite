import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
import markedFootnote from "marked-footnote";
import markedAlert from "marked-alert";
import { markedEmoji } from "marked-emoji";
import { gemoji } from "gemoji";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";

let mermaidInstance = null;
let mermaidCounter = 0;
const usedIds = new Set();

async function getMermaid() {
  if (!mermaidInstance) {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({ startOnLoad: false, theme: "default" });
    mermaidInstance = mermaid;
  }
  return mermaidInstance;
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

function slugify(text) {
  let result = text.toLowerCase();
  let prev;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, "");
  } while (result !== prev);
  return result
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const emojiMap = {};
for (const entry of gemoji) {
  for (const name of entry.names) {
    emojiMap[name] = entry.emoji;
  }
}

marked.use(markedKatex({ throwOnError: false }));
marked.use(markedFootnote());
marked.use(markedAlert());
marked.use(markedEmoji({ emojis: emojiMap, renderer: (token) => token.emoji }));

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code;
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
  {
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = slugify(text) || `heading-${usedIds.size}`;
        if (usedIds.has(id)) {
          let i = 1;
          while (usedIds.has(`${id}-${i}`)) i++;
          id = `${id}-${i}`;
        }
        usedIds.add(id);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        if (lang === "mermaid") {
          const idx = mermaidCounter++;
          const bytes = new TextEncoder().encode(text);
          const chars = new Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i]);
          const encoded = btoa(chars.join(""));
          return `<div class="mermaid-block" data-mermaid-idx="${idx}" data-mermaid="${encoded}">
            <div class="mermaid-rendered" id="mermaid-render-${idx}"></div>
            <button class="mermaid-expand" title="Open in new window">&#x26F6; Open</button>
          </div>`;
        }
        return false;
      },
    },
  }
);

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.hasAttribute("style") && !node.closest(".katex")) {
    node.removeAttribute("style");
  }
});

const contentEl = document.getElementById("content");

export async function renderMermaidBlocks() {
  const blocks = contentEl.querySelectorAll(".mermaid-block");
  if (blocks.length === 0) return;

  const mermaid = await getMermaid();
  for (const block of blocks) {
    const code = new TextDecoder().decode(Uint8Array.from(atob(block.dataset.mermaid), (c) => c.charCodeAt(0)));
    const target = block.querySelector(".mermaid-rendered");
    try {
      const { svg } = await mermaid.render("mermaid-svg-" + block.dataset.mermaidIdx + "-" + Date.now(), code);
      target.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    } catch (e) {
      const pre = document.createElement("pre");
      pre.className = "mermaid-error";
      pre.textContent = "Mermaid error: " + e.message;
      target.appendChild(pre);
    }
  }
}

export function bindCopyButtons() {
  contentEl.querySelectorAll("pre > code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (pre.closest(".mermaid-block")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-code-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Copy to clipboard");
    const copyIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const checkIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.innerHTML = copyIcon;
    btn.title = "Copy to clipboard";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        btn.innerHTML = checkIcon;
        btn.classList.add("copied");
      } catch {
        btn.classList.add("copy-failed");
      }
      setTimeout(() => {
        btn.innerHTML = copyIcon;
        btn.classList.remove("copied");
        btn.classList.remove("copy-failed");
      }, 1500);
    });
    wrapper.appendChild(btn);
  });
}

export function bindMermaidButtons() {
  contentEl.querySelectorAll(".mermaid-expand").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".mermaid-block");
      const rendered = block.querySelector(".mermaid-rendered");
      const svg = rendered.innerHTML;
      if (svg && !svg.includes("mermaid-error")) {
        const sanitized = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        await openMermaidWindow(sanitized);
      }
    });
  });
}

export function resetMermaidCounter() {
  mermaidCounter = 0;
  usedIds.clear();
}

export function parseMarkdown(markdown) {
  const raw = marked.parse(markdown);
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: [
      "div",
      "button",
      "section",
      "svg",
      "path",
      "math",
      "semantics",
      "annotation",
      "mrow",
      "mi",
      "mo",
      "mn",
      "ms",
      "mtext",
      "msup",
      "msub",
      "msubsup",
      "mfrac",
      "mover",
      "munder",
      "munderover",
      "msqrt",
      "mroot",
      "mtable",
      "mtr",
      "mtd",
      "mspace",
      "menclose",
      "mpadded",
      "mphantom",
      "mglyph",
      "mlabeledtr",
    ],
    ADD_ATTR: [
      "data-mermaid-idx",
      "data-mermaid",
      "data-footnote-ref",
      "data-footnote-backref",
      "data-footnotes",
      "title",
      "id",
      "aria-hidden",
      "aria-label",
      "aria-describedby",
      "role",
      "viewBox",
      "fill",
      "d",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "encoding",
      "xmlns",
      "mathvariant",
      "stretchy",
      "fence",
      "separator",
      "accent",
      "accentunder",
      "lspace",
      "rspace",
      "linethickness",
      "displaystyle",
      "scriptlevel",
      "columnalign",
      "rowalign",
      "columnspacing",
      "rowspacing",
      "columnlines",
      "rowlines",
      "frame",
      "framespacing",
      "width",
      "height",
      "depth",
      "voffset",
      "minsize",
      "maxsize",
      "movablelimits",
      "symmetric",
    ],
  });
}
