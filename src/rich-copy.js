import DOMPurify from "dompurify";
import { decodeSource } from "./rich-blocks.js";
import { cloneSvgForSnapshot } from "./svg-snapshot.js";
import { PLACEHOLDER_CLASS, originalImageUrl } from "./images.js";
import { ROOT_STYLE, STYLE_RULES, MATH_STYLE, DIAGRAM_STYLE } from "./rich-copy-styles.js";

export const MAX_IMAGE_CHARS = 2_000_000;
export const MAX_TOTAL_CHARS = 12_000_000;
const MAX_DISPLAY_WIDTH = 720;
const MAX_RASTER_SIDE = 4096;
const SVG_RASTER_SCALE = 2;
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_PREFIX = "data:image/svg+xml;charset=utf-8,";

const RICH_BLOCKS = [
  {
    selector: ".mermaid-block",
    svg: ".mermaid-rendered svg",
    source: (block) => block.dataset.mermaid,
    alt: "Diagram",
  },
  { selector: ".chart-block", svg: ".chart-rendered svg", source: (block) => block.dataset.chart, alt: "Chart" },
];

const CHROME_SELECTOR = [
  ".copy-code-btn",
  ".mermaid-expand",
  ".live-toolbar",
  ".remote-image-actions",
  "[data-ui-chrome]",
  "[data-footnote-backref]",
  ".katex-mathml",
  "iframe",
  "button",
  "select",
  "textarea",
  "script",
  "style",
  "link",
  "svg",
  'input:not([type="checkbox"])',
].join(", ");

const KEPT_ATTRIBUTES = new Set([
  "style",
  "href",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "colspan",
  "rowspan",
  "align",
  "start",
  "reversed",
  "value",
  "open",
  "lang",
  "dir",
]);

const SAFE_LINK = /^(?:https?:|mailto:)/i;
const PARAGRAPH_TAGS = new Set([
  "BLOCKQUOTE",
  "DETAILS",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL",
]);
const LINE_TAGS = new Set(["HR", "LI", "SUMMARY", "TR"]);

const purify = DOMPurify(window);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

function toPng(drawable, width, height, { scale, background } = {}) {
  const factor = Math.min(scale, MAX_RASTER_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * factor));
  canvas.height = Math.max(1, Math.round(height * factor));
  const context = canvas.getContext("2d");
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function attributeLength(value) {
  const length = parseFloat(value);
  return length > 0 && !String(value).trim().endsWith("%") ? length : 0;
}

function svgSize(svg) {
  const box = svg.viewBox?.baseVal;
  const rect = svg.getBoundingClientRect();
  const declaredWidth = attributeLength(svg.getAttribute("width"));
  const declaredHeight = attributeLength(svg.getAttribute("height"));
  const width = declaredWidth || box?.width || rect.width;
  const height = declaredHeight || (box?.width ? (width * box.height) / box.width : rect.height);
  if (!(width > 0 && height > 0)) throw new Error("SVG has no size");
  return { width: Math.round(width), height: Math.round(height) };
}

/** Rasterizes a live SVG to a PNG data URI on the page's background color. */
export async function rasterizeSvg(svg) {
  const doc = svg.ownerDocument;
  const { width, height } = svgSize(svg);
  const clone = cloneSvgForSnapshot(svg, { doc });
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.removeProperty("max-width");
  const markup = new XMLSerializer().serializeToString(clone);
  const image = await loadImage(SVG_PREFIX + encodeURIComponent(markup));
  const background = doc.defaultView.getComputedStyle(doc.body).getPropertyValue("--theme-bg").trim() || "#ffffff";
  return { src: toPng(image, width, height, { scale: SVG_RASTER_SCALE, background }), width, height };
}

/** Redraws a loaded image to a PNG data URI. Rejects when the canvas is tainted or the image has no size. */
export async function rasterizeImage(img) {
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error("Image has no size");
  return toPng(img, img.naturalWidth, img.naturalHeight, { scale: 1 });
}

function charge(context, src) {
  if (src.length > MAX_IMAGE_CHARS || src.length > context.budget) throw new Error("Image exceeds the size cap");
  context.budget -= src.length;
}

function pairs(root, clone, selector) {
  const live = root.querySelectorAll(selector);
  return [...clone.querySelectorAll(selector)].map((copy, index) => [live[index], copy]);
}

function textNode(context, text) {
  return context.doc.createTextNode(text);
}

function unwrap(node) {
  node.replaceWith(...node.childNodes);
}

function addStyle(node, css) {
  node.setAttribute("style", `${node.getAttribute("style") ?? ""}${css}`);
}

function sizedImage(context, { src, width, height, alt }) {
  const img = context.doc.createElement("img");
  img.setAttribute("src", src);
  img.setAttribute("alt", alt);
  if (width > 0 && height > 0) {
    const shown = Math.min(width, MAX_DISPLAY_WIDTH);
    img.setAttribute("width", String(Math.round(shown)));
    img.setAttribute("height", String(Math.round((height * shown) / width)));
  }
  return img;
}

function sourceFallback(context, encoded) {
  const pre = context.doc.createElement("pre");
  try {
    pre.textContent = decodeSource(encoded ?? "");
  } catch {
    pre.textContent = "";
  }
  return pre;
}

async function diagramImage(context, liveSvg, alt) {
  const { src, width, height } = await context.rasterizeSvg(liveSvg);
  charge(context, src);
  const holder = context.doc.createElement("div");
  addStyle(holder, DIAGRAM_STYLE);
  holder.append(sizedImage(context, { src, width, height, alt }));
  return holder;
}

async function replaceRichBlocks(blockPairs, context) {
  for (const [index, definition] of RICH_BLOCKS.entries()) {
    for (const [live, copy] of blockPairs[index]) {
      const liveSvg = live.querySelector(definition.svg);
      let replacement;
      try {
        if (!liveSvg) throw new Error("Block has not rendered");
        replacement = await diagramImage(context, liveSvg, definition.alt);
      } catch {
        context.omitted++;
        replacement = sourceFallback(context, definition.source(copy));
      }
      copy.replaceWith(replacement);
    }
  }
}

async function replaceLiveBlocks(livePairs, context) {
  for (const [live, copy] of livePairs) {
    const liveSnapshot = live.querySelector(".live-snapshot");
    if (!liveSnapshot) {
      if (live.dataset.liveState === "running") context.omitted++;
      continue;
    }
    try {
      if (!isLoaded(liveSnapshot)) await liveSnapshot.decode();
      const src = await context.rasterizeImage(liveSnapshot);
      charge(context, src);
      const holder = context.doc.createElement("div");
      addStyle(holder, DIAGRAM_STYLE);
      holder.append(
        sizedImage(context, {
          src,
          width: liveSnapshot.naturalWidth,
          height: liveSnapshot.naturalHeight,
          alt: "Live Block output",
        })
      );
      copy.replaceWith(holder);
    } catch {
      context.omitted++;
      copy.querySelector(".live-snapshot")?.remove();
    }
  }
}

function isLoaded(img) {
  return img.complete && img.naturalWidth > 0;
}

async function resolveImage(live, context) {
  const src = live.getAttribute("src") ?? "";
  if (!isLoaded(live)) throw new Error("Image is not loaded");
  const remote = originalImageUrl(src);
  if (remote) return { src: remote };
  const embedded = /^data:image\/(?!svg)/i.test(src) ? src : await context.rasterizeImage(live);
  charge(context, embedded);
  return { src: embedded };
}

function displaySize(img) {
  return img.width > 0 && img.height > 0
    ? { width: img.width, height: img.height }
    : { width: img.naturalWidth, height: img.naturalHeight };
}

async function embedImages(imagePairs, clone, context) {
  for (const [live, copy] of imagePairs) {
    if (!clone.contains(copy)) continue;
    try {
      const { src } = await resolveImage(live, context);
      const alt = copy.getAttribute("alt") ?? "";
      copy.replaceWith(sizedImage(context, { src, ...displaySize(live), alt }));
    } catch {
      context.omitted++;
      copy.replaceWith(textNode(context, copy.getAttribute("alt") || "[image]"));
    }
  }
}

function replacePlaceholders(clone, context) {
  for (const placeholder of clone.querySelectorAll(`.${PLACEHOLDER_CLASS}`)) {
    const alt = placeholder.dataset.alt || placeholder.querySelector(".remote-image-alt")?.textContent || "Image";
    placeholder.replaceWith(textNode(context, alt));
    context.omitted++;
  }
}

function texSource(node) {
  const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
  return annotation?.textContent ?? node.querySelector(".katex-html")?.textContent ?? node.textContent;
}

function replaceMath(clone, context) {
  for (const display of clone.querySelectorAll(".katex-display")) {
    const block = context.doc.createElement("div");
    block.setAttribute("style", `text-align:center;margin:0 0 16px;${MATH_STYLE}`);
    block.textContent = texSource(display);
    display.replaceWith(block);
    context.omitted++;
  }
  for (const inline of clone.querySelectorAll(".katex")) {
    const span = context.doc.createElement("span");
    span.setAttribute("style", MATH_STYLE);
    span.textContent = texSource(inline);
    inline.replaceWith(span);
    context.omitted++;
  }
}

function replaceCheckboxes(clone, context) {
  for (const box of clone.querySelectorAll('input[type="checkbox"]')) {
    const item = box.closest("li");
    if (item) item.setAttribute("style", "list-style-type:none;");
    box.replaceWith(textNode(context, box.hasAttribute("checked") ? "☑" : "☐"));
  }
}

function stripChrome(clone) {
  for (const node of clone.querySelectorAll(CHROME_SELECTOR)) node.remove();
  for (const mark of clone.querySelectorAll("mark.search-match")) unwrap(mark);
  for (const wrapper of clone.querySelectorAll(".code-block-wrapper")) unwrap(wrapper);
}

function neutralizeLinks(clone) {
  for (const link of clone.querySelectorAll("a")) {
    if (!SAFE_LINK.test(link.getAttribute("href") ?? "")) unwrap(link);
  }
}

function applyStyles(clone) {
  for (const [selector, css] of STYLE_RULES) {
    for (const node of clone.querySelectorAll(selector)) addStyle(node, css);
  }
  for (const details of clone.querySelectorAll("details")) details.setAttribute("open", "");
}

function scrubAttributes(clone) {
  for (const node of clone.querySelectorAll("*")) {
    for (const { name } of [...node.attributes]) {
      if (!KEPT_ATTRIBUTES.has(name)) node.removeAttribute(name);
    }
  }
}

function integerAttribute(node, name) {
  const value = parseInt(node.getAttribute(name), 10);
  return Number.isNaN(value) ? null : value;
}

function orderedNumbers(list) {
  const items = [...list.children].filter((child) => child.tagName === "LI");
  const reversed = list.hasAttribute("reversed");
  const numbers = new Map();
  let next = integerAttribute(list, "start") ?? (reversed ? items.length : 1);
  for (const item of items) {
    const current = integerAttribute(item, "value") ?? next;
    numbers.set(item, current);
    next = current + (reversed ? -1 : 1);
  }
  return numbers;
}

/** Readable plain text of a rendered DOM subtree: block separators, list markers, tab separated table cells. */
export function toPlainText(root) {
  const out = [];
  let pending = 0;
  let atLineStart = true;
  let markerOpen = false;
  const listNumbers = new Map();

  const listMarker = (item) => {
    const list = item.parentElement;
    if (list?.tagName !== "OL") return "- ";
    if (!listNumbers.has(list)) listNumbers.set(list, orderedNumbers(list));
    return `${listNumbers.get(list).get(item)}. `;
  };

  const write = (text, preserve = false) => {
    const flushing = pending > 0 && out.length > 0;
    const visible = !preserve && (atLineStart || flushing) ? text.replace(/^ +/, "") : text;
    if (!visible) return;
    if (flushing) {
      out[out.length - 1] = out[out.length - 1].replace(/ +$/, "");
      out.push("\n".repeat(pending));
    }
    pending = 0;
    markerOpen = false;
    out.push(visible);
    atLineStart = visible.endsWith("\n");
  };

  const visit = (node, inPre) => {
    if (node.nodeType === 3) {
      write(inPre ? node.nodeValue : node.nodeValue.replace(/\s+/g, " "), inPre);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === "BR") {
      write("\n", true);
      return;
    }
    if (tag === "IMG") {
      write(node.getAttribute("alt") ?? "");
      return;
    }
    const nestedList = (tag === "UL" || tag === "OL") && node.parentElement?.tagName === "LI";
    const blockGap = nestedList ? 1 : PARAGRAPH_TAGS.has(tag) ? 2 : LINE_TAGS.has(tag) ? 1 : 0;
    const gap = markerOpen ? 0 : blockGap;
    pending = Math.max(pending, gap);
    if (tag === "LI") {
      write(listMarker(node), true);
      markerOpen = true;
    }
    for (const child of node.childNodes) visit(child, inPre || tag === "PRE");
    if ((tag === "TD" || tag === "TH") && node.nextElementSibling) write("\t", true);
    pending = Math.max(pending, gap);
  };

  visit(root, false);
  return out.join("").trimEnd();
}

function sanitize(html) {
  return purify.sanitize(html, {
    FORBID_TAGS: ["style", "script", "form", "button", "select", "textarea", "input", "iframe", "svg", "math"],
    FORBID_ATTR: ["class", "id"],
  });
}

/**
 * Builds the rich text clipboard payload from the rendered document under `root`: `{ html, plain, omitted }`.
 * `omitted` counts images, diagrams, and formulas that were replaced by text. Output uses fixed inline light styling and
 * is sanitized. `root` is never modified.
 */
export async function buildRichCopy(
  root,
  { rasterizeSvg: svgToPng = rasterizeSvg, rasterizeImage: imageToPng = rasterizeImage } = {}
) {
  const doc = root.ownerDocument;
  const clone = root.cloneNode(true);
  const context = { doc, omitted: 0, budget: MAX_TOTAL_CHARS, rasterizeSvg: svgToPng, rasterizeImage: imageToPng };
  const blockPairs = RICH_BLOCKS.map((definition) => pairs(root, clone, definition.selector));
  const livePairs = pairs(root, clone, ".live-block");
  const imagePairs = pairs(root, clone, "img");
  await replaceRichBlocks(blockPairs, context);
  await replaceLiveBlocks(livePairs, context);
  await embedImages(imagePairs, clone, context);
  replacePlaceholders(clone, context);
  replaceMath(clone, context);
  replaceCheckboxes(clone, context);
  stripChrome(clone);
  neutralizeLinks(clone);
  applyStyles(clone);
  scrubAttributes(clone);

  const wrapper = doc.createElement("div");
  wrapper.setAttribute("style", ROOT_STYLE);
  wrapper.append(...clone.childNodes);
  return { html: sanitize(wrapper.outerHTML), plain: toPlainText(wrapper), omitted: context.omitted };
}
