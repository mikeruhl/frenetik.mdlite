import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
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

marked.use(markedKatex({ throwOnError: false }));

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
          const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
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
      "title",
      "id",
      "aria-hidden",
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
