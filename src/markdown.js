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
import { PLACEHOLDER_CLASS, imageProxyUrl, isImageAllowed, parseRemoteUrl } from "./images.js";
import {
  registerRichBlock,
  isRichBlockLang,
  emitRichBlock,
  resetRichBlockCounter,
  renderRichBlocks,
  setRichBlockTheme,
  richBlockSelector,
} from "./rich-blocks.js";
import { mermaidRenderer } from "./mermaid-block.js";
import { chartRenderer, disposeCharts } from "./charts.js";
import { liveBlockRenderer } from "./live-blocks.js";

let panelMode = false;
let imagePolicy = {};
const usedIds = new Set();
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

registerRichBlock("mermaid", mermaidRenderer);
registerRichBlock("vega-lite", chartRenderer);
registerRichBlock("html-live", liveBlockRenderer);

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      if (isRichBlockLang(lang)) return panelMode ? escapeHtml(code) : code;
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
        if (panelMode) return `<h${depth}>${text}</h${depth}>\n`;
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
        if (isRichBlockLang(lang) && !panelMode) return emitRichBlock(lang, text);
        return false;
      },
    },
  }
);

const documentPurify = DOMPurify(window);
const FORBID_TAGS = ["style", "form", "button", "select", "textarea", "option"];
const ALLOWED_CLASSES = new Set([
  "hljs",
  "footnotes",
  "sr-only",
  "data-footnote-backref",
  PLACEHOLDER_CLASS,
  "remote-image-alt",
  "remote-image-host",
  "chart-block",
  "chart-rendered",
  "live-block",
]);
const ALLOWED_CLASS_PREFIXES = ["hljs-", "language-", "katex", "markdown-alert", "mermaid-", "octicon"];
const TASK_CHECKBOX_ATTRS = new Set(["type", "disabled", "checked"]);
const STATUS_TONES = new Set(["neutral", "info", "success", "warning", "error", "note"]);

function isAllowedClass(token) {
  return ALLOWED_CLASSES.has(token) || ALLOWED_CLASS_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function isTaskCheckbox(node) {
  return node.getAttribute("type") === "checkbox" && node.hasAttribute("disabled");
}

function createImagePlaceholder(img, url) {
  const doc = img.ownerDocument;
  const alt = img.getAttribute("alt") ?? "";
  const placeholder = doc.createElement("span");
  placeholder.className = PLACEHOLDER_CLASS;
  placeholder.dataset.remoteSrc = url.href;
  placeholder.dataset.alt = alt;
  const altEl = doc.createElement("span");
  altEl.className = "remote-image-alt";
  altEl.textContent = alt || "Image";
  const hostEl = doc.createElement("span");
  hostEl.className = "remote-image-host";
  hostEl.textContent = url.hostname;
  placeholder.append(altEl, hostEl);
  return placeholder;
}

function rewriteImage(node) {
  if (node.nodeName === "IMG" || node.nodeName === "SOURCE") node.removeAttribute("srcset");
  if (node.nodeName === "IMG") {
    const url = parseRemoteUrl(node.getAttribute("src"));
    if (!url) return false;
    if (isImageAllowed(url, imagePolicy)) {
      node.setAttribute("src", imageProxyUrl(url.href));
      return false;
    }
    node.replaceWith(createImagePlaceholder(node, url));
    return true;
  }
  if (node.nodeName.toLowerCase() === "image") {
    const href = node.getAttribute("href") ?? node.getAttribute("xlink:href");
    if (parseRemoteUrl(href)) {
      node.remove();
      return true;
    }
  }
  return false;
}

documentPurify.addHook("afterSanitizeAttributes", (node) => {
  if (rewriteImage(node)) return;
  if (node.nodeName === "INPUT") {
    if (!isTaskCheckbox(node)) {
      node.remove();
      return;
    }
    for (const attr of [...node.attributes]) {
      if (!TASK_CHECKBOX_ATTRS.has(attr.name)) node.removeAttribute(attr.name);
    }
  }
  if (node.hasAttribute("data-status") && !(node.nodeName === "MARK" && STATUS_TONES.has(node.dataset.status))) {
    node.removeAttribute("data-status");
  }
  const inKatex = node.closest(".katex");
  if (node.hasAttribute("style") && !inKatex) {
    node.removeAttribute("style");
  }
  if (node.hasAttribute("class") && !inKatex) {
    const kept = [...node.classList].filter(isAllowedClass);
    if (kept.length) node.setAttribute("class", kept.join(" "));
    else node.removeAttribute("class");
  }
});

const contentEl = document.getElementById("content");

export function renderAllRichBlocks() {
  return renderRichBlocks(contentEl);
}

export function setRenderTheme(themeId) {
  return setRichBlockTheme(themeId, contentEl);
}

export function bindCopyButtons() {
  contentEl.querySelectorAll("pre > code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (pre.closest(richBlockSelector())) return;

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

export function resetRenderState() {
  disposeCharts();
  resetRichBlockCounter();
  usedIds.clear();
}

export function extractFrontmatter(markdown) {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return { body: markdown, raw: null, fields: null };
  const raw = match[1];
  const fields = [];
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      fields.push({ key, value: val });
    }
  }
  return { body: markdown.slice(match[0].length), raw, fields };
}

/**
 * Renders markdown to sanitized HTML. `images` is the remote image policy:
 * `{ hosts: string[], urls: Set<string> }`. Remote images outside it become placeholders.
 */
export function parseMarkdown(markdown, { panel = false, images = {} } = {}) {
  panelMode = panel;
  let raw;
  try {
    raw = marked.parse(markdown);
  } finally {
    panelMode = false;
  }
  imagePolicy = images;
  try {
    return sanitizeDocument(raw);
  } finally {
    imagePolicy = {};
  }
}

function sanitizeDocument(raw) {
  return documentPurify.sanitize(raw, {
    FORBID_TAGS,
    ADD_TAGS: [
      "div",
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
