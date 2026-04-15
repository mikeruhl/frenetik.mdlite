import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

import hljsLightCss from "highlight.js/styles/github.min.css?inline";
import hljsDarkCss from "highlight.js/styles/github-dark.min.css?inline";

import githubLightCss from "github-markdown-css/github-markdown-light.css?inline";
import githubDarkCss from "github-markdown-css/github-markdown-dark.css?inline";
import githubDarkDimmedCss from "github-markdown-css/github-markdown-dark-dimmed.css?inline";
import githubDarkHcCss from "github-markdown-css/github-markdown-dark-high-contrast.css?inline";
import githubAutoCss from "github-markdown-css/github-markdown.css?inline";
import githubLightCbCss from "github-markdown-css/github-markdown-light-colorblind.css?inline";
import githubDarkCbCss from "github-markdown-css/github-markdown-dark-colorblind.css?inline";
import splendorCss from "./themes/splendor.css?inline";
import retroCss from "./themes/retro.css?inline";
import airCss from "./themes/air.css?inline";
import modestCss from "./themes/modest.css?inline";

const ghUrl = "https://github.com/sindresorhus/github-markdown-css";
const mdcssUrl = "https://markdowncss.github.io/";

const themes = {
  github: {
    label: "GitHub Light",
    css: githubLightCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark": {
    label: "GitHub Dark",
    css: githubDarkCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark-dimmed": {
    label: "GitHub Dark Dimmed",
    css: githubDarkDimmedCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark-hc": {
    label: "GitHub Dark HC",
    css: githubDarkHcCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-auto": {
    label: "GitHub Auto",
    css: githubAutoCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-light-cb": {
    label: "GitHub Light (Colorblind)",
    css: githubLightCbCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark-cb": {
    label: "GitHub Dark (Colorblind)",
    css: githubDarkCbCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  splendor: { label: "Splendor", css: splendorCss, wrapClass: null, author: "John Otander", url: mdcssUrl },
  retro: { label: "Retro", css: retroCss, wrapClass: null, author: "John Otander", url: mdcssUrl },
  air: { label: "Air", css: airCss, wrapClass: null, author: "John Otander", url: mdcssUrl },
  modest: { label: "Modest", css: modestCss, wrapClass: null, author: "John Otander", url: mdcssUrl },
};

const GITHUB_WRAP_CSS = `
.markdown-body {
  box-sizing: border-box;
  min-width: 200px;
  max-width: 980px;
  margin: 0 auto;
  padding: 32px 45px;
}
@media (max-width: 767px) {
  .markdown-body { padding: 16px; }
}
`;

let mermaidInstance = null;
let mermaidCounter = 0;

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
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

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
        const id = slugify(text);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        if (lang === "mermaid") {
          const idx = mermaidCounter++;
          const encoded = btoa(unescape(encodeURIComponent(text)));
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

const contentEl = document.getElementById("content");
const mainContentEl = document.getElementById("main-content");
const themeStyleEl = document.getElementById("theme-style");
const hljsStyleEl = document.getElementById("hljs-style");
const attributionEl = document.getElementById("attribution");
const sidebarHeaderEl = document.getElementById("sidebar-header");
const sidebarTreeEl = document.getElementById("sidebar-tree");
const searchBarEl = document.getElementById("search-bar");
const searchInputEl = document.getElementById("search-input");
const searchRegexBtn = document.getElementById("search-regex");
const searchCaseBtn = document.getElementById("search-case");
const searchCountEl = document.getElementById("search-count");
const searchPrevBtn = document.getElementById("search-prev");
const searchNextBtn = document.getElementById("search-next");
const searchCloseBtn = document.getElementById("search-close");

let currentFilePath = null;
let lastMarkdown = "";
let startupErrorMsg = null;
const folderScrollPositions = new Map();
let searchMatches = [];
let searchCurrentIdx = -1;
let searchIsRegex = false;
let searchCaseSensitive = false;

function applyTheme(themeId) {
  const theme = themes[themeId] || themes.github;

  let css = theme.css;
  if (theme.wrapClass === "markdown-body") {
    css += GITHUB_WRAP_CSS;
  }
  themeStyleEl.textContent = css;

  if (theme.wrapClass) {
    contentEl.className = theme.wrapClass;
  } else {
    contentEl.className = "";
  }

  attributionEl.textContent = "";
  if (theme.author) {
    attributionEl.appendChild(document.createTextNode("Theme: "));
    const link = document.createElement("a");
    link.href = theme.url;
    link.textContent = theme.label;
    attributionEl.appendChild(link);
    attributionEl.appendChild(document.createTextNode(" by " + theme.author));
  }

  const isDark = themeId.includes("dark");
  document.body.classList.toggle("dark-sidebar", isDark);
  hljsStyleEl.textContent = isDark ? hljsDarkCss : hljsLightCss;
}

async function renderMermaidBlocks() {
  const blocks = contentEl.querySelectorAll(".mermaid-block");
  if (blocks.length === 0) return;

  const mermaid = await getMermaid();
  for (const block of blocks) {
    const code = decodeURIComponent(escape(atob(block.dataset.mermaid)));
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

function bindMermaidButtons() {
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

function clearSearchHighlights() {
  contentEl.querySelectorAll("mark.search-match").forEach((mark) => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  searchMatches = [];
  searchCurrentIdx = -1;
  searchCountEl.textContent = "";
}

function highlightSearchMatches(query) {
  clearSearchHighlights();
  if (!query) return;

  let regex;
  try {
    const flags = searchCaseSensitive ? "g" : "gi";
    regex = searchIsRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    searchInputEl.classList.remove("search-invalid");
  } catch {
    searchInputEl.classList.add("search-invalid");
    searchCountEl.textContent = "Invalid regex";
    return;
  }

  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const text = node.textContent;
    regex.lastIndex = 0;
    const parts = [];
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      if (match.index > lastIdx) parts.push(document.createTextNode(text.slice(lastIdx, match.index)));
      const mark = document.createElement("mark");
      mark.className = "search-match";
      mark.textContent = match[0];
      parts.push(mark);
      lastIdx = regex.lastIndex;
    }
    if (parts.length === 0) continue;
    if (lastIdx < text.length) parts.push(document.createTextNode(text.slice(lastIdx)));
    const frag = document.createDocumentFragment();
    parts.forEach((p) => frag.appendChild(p));
    node.parentNode.replaceChild(frag, node);
  }

  searchMatches = Array.from(contentEl.querySelectorAll("mark.search-match"));
  if (searchMatches.length > 0) {
    searchCurrentIdx = 0;
    searchMatches[0].classList.add("search-match-current");
    searchMatches[0].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  updateSearchCount();
}

function updateSearchCount() {
  if (searchMatches.length === 0) {
    searchCountEl.textContent = searchInputEl.value ? "No results" : "";
  } else {
    searchCountEl.textContent = searchCurrentIdx + 1 + " of " + searchMatches.length;
  }
}

function searchNavigate(direction) {
  if (searchMatches.length === 0) return;
  searchMatches[searchCurrentIdx].classList.remove("search-match-current");
  searchCurrentIdx = (searchCurrentIdx + direction + searchMatches.length) % searchMatches.length;
  searchMatches[searchCurrentIdx].classList.add("search-match-current");
  searchMatches[searchCurrentIdx].scrollIntoView({ behavior: "smooth", block: "center" });
  updateSearchCount();
}

function openSearch() {
  searchBarEl.classList.remove("search-hidden");
  searchInputEl.focus();
  searchInputEl.select();
}

function closeSearch() {
  searchBarEl.classList.add("search-hidden");
  clearSearchHighlights();
  searchInputEl.value = "";
  searchInputEl.classList.remove("search-invalid");
}

function render(markdown) {
  if (startupErrorMsg) {
    const startupErrorEl = document.createElement("div");
    startupErrorEl.className = "startup-error";
    startupErrorEl.textContent = startupErrorMsg;
    contentEl.replaceChildren(startupErrorEl);
    return;
  }
  mermaidCounter = 0;
  const raw = marked.parse(markdown);
  contentEl.innerHTML = DOMPurify.sanitize(raw, {
    ADD_TAGS: ["div", "button"],
    ADD_ATTR: ["data-mermaid-idx", "data-mermaid", "title", "id"],
  });
  renderMermaidBlocks();
  bindMermaidButtons();
  if (searchInputEl.value && !searchBarEl.classList.contains("search-hidden")) {
    searchMatches = [];
    searchCurrentIdx = -1;
    highlightSearchMatches(searchInputEl.value);
  }
}

// --- Folder mode ---

let folderRootPath = null;
const folderNodeMap = new Map();

function showScanningIndicator() {
  removeScanningIndicator();
  const el = document.createElement("div");
  el.className = "sidebar-scanning";
  el.innerHTML = '<div class="sidebar-spinner-sm"></div><span>Scanning\u2026</span>';
  sidebarTreeEl.prepend(el);
}

function removeScanningIndicator() {
  const el = sidebarTreeEl.querySelector(".sidebar-scanning");
  if (el) el.remove();
}

function insertFolderSorted(container, folderItem, childrenEl, name) {
  const children = Array.from(container.children);
  for (const child of children) {
    if (!child.classList.contains("tree-folder") && !child.classList.contains("tree-file")) continue;
    if (child.classList.contains("tree-file")) {
      container.insertBefore(folderItem, child);
      container.insertBefore(childrenEl, child);
      return;
    }
    if (child.classList.contains("tree-folder")) {
      const childName = child.querySelector(".tree-label").textContent;
      if (name.localeCompare(childName, undefined, { sensitivity: "base" }) < 0) {
        container.insertBefore(folderItem, child);
        container.insertBefore(childrenEl, child);
        return;
      }
    }
  }
  container.appendChild(folderItem);
  container.appendChild(childrenEl);
}

function createFolderNode(container, name, dirPath, depth) {
  const item = document.createElement("div");
  item.className = "tree-item tree-folder";
  item.style.paddingLeft = 12 + depth * 16 + "px";

  const toggle = document.createElement("span");
  toggle.className = "tree-toggle";
  toggle.textContent = "\u25b8";
  item.appendChild(toggle);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = name;
  item.appendChild(label);

  const spinner = document.createElement("span");
  spinner.className = "folder-scan-spinner";
  spinner.innerHTML = '<div class="sidebar-spinner-sm"></div>';
  item.appendChild(spinner);

  const childrenDiv = document.createElement("div");
  childrenDiv.className = "tree-children";
  childrenDiv.style.display = "none";

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const expanded = childrenDiv.style.display !== "none";
    childrenDiv.style.display = expanded ? "none" : "block";
    toggle.textContent = expanded ? "\u25b8" : "\u25be";
    item.classList.toggle("expanded", !expanded);
  });

  insertFolderSorted(container, item, childrenDiv, name);
  const nodeInfo = { container: childrenDiv, depth: depth + 1 };
  folderNodeMap.set(dirPath, nodeInfo);
  return nodeInfo;
}

function ensureDirChain(pathChain) {
  let container = sidebarTreeEl;
  let depth = 0;
  for (const ancestor of pathChain) {
    const existing = folderNodeMap.get(ancestor.path);
    if (existing) {
      container = existing.container;
      depth = existing.depth;
    } else {
      const node = createFolderNode(container, ancestor.name, ancestor.path, depth);
      container = node.container;
      depth = node.depth;
    }
  }
  return { container, depth };
}

function handleScanFiles(pathChain, files) {
  const { container, depth } = ensureDirChain(pathChain);
  for (const file of files) {
    const item = document.createElement("div");
    item.className = "tree-item tree-file";
    item.style.paddingLeft = 28 + depth * 16 + "px";
    item.dataset.path = file.path;

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = file.name;
    item.appendChild(label);

    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      await selectFolderFile(file.path);
    });

    container.appendChild(item);

    if (file.path === currentFilePath) {
      item.classList.add("active");
    }
  }
}

function handleScanComplete() {
  removeScanningIndicator();
  sidebarTreeEl.querySelectorAll(".folder-scan-spinner").forEach((el) => el.remove());
  folderNodeMap.clear();
  if (currentFilePath) {
    const stillExists = Array.from(sidebarTreeEl.querySelectorAll(".tree-file")).some(
      (el) => el.dataset.path === currentFilePath
    );
    if (!stillExists) {
      currentFilePath = null;
      lastMarkdown = "";
      render("");
    }
  }
}

function highlightCurrentFile() {
  sidebarTreeEl.querySelectorAll(".tree-item.active").forEach((el) => el.classList.remove("active"));
  if (!currentFilePath) return;
  sidebarTreeEl.querySelectorAll(".tree-file").forEach((el) => {
    if (el.dataset.path === currentFilePath) {
      el.classList.add("active");
    }
  });
}

function expandToFile(filePath) {
  sidebarTreeEl.querySelectorAll(".tree-file").forEach((el) => {
    if (el.dataset.path === filePath) {
      let parent = el.parentElement;
      while (parent && parent !== sidebarTreeEl) {
        if (parent.classList && parent.classList.contains("tree-children")) {
          parent.style.display = "block";
          const folder = parent.previousElementSibling;
          if (folder && folder.classList.contains("tree-folder")) {
            const toggle = folder.querySelector(".tree-toggle");
            if (toggle) toggle.textContent = "\u25be";
            folder.classList.add("expanded");
          }
        }
        parent = parent.parentElement;
      }
    }
  });
}

async function selectFolderFile(path) {
  try {
    if (currentFilePath && mainContentEl) {
      folderScrollPositions.set(currentFilePath, mainContentEl.scrollTop);
    }
    const content = await invoke("open_folder_file", { path });
    startupErrorMsg = null;
    currentFilePath = path;
    lastMarkdown = content;
    render(content);
    highlightCurrentFile();
    if (mainContentEl) {
      mainContentEl.scrollTop = folderScrollPositions.get(path) || 0;
    }
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

async function enterFolderMode() {
  startupErrorMsg = null;
  document.body.classList.add("folder-mode");
  const modeInfo = await invoke("get_mode");

  if (modeInfo.folder_name) {
    sidebarHeaderEl.textContent = modeInfo.folder_name;
  }
  currentFilePath = modeInfo.current_file || null;
  folderRootPath = modeInfo.folder_path || null;
  folderNodeMap.clear();
  sidebarTreeEl.innerHTML = "";
  showScanningIndicator();
  invoke("start_folder_scan");
}

function exitFolderMode() {
  document.body.classList.remove("folder-mode");
  sidebarTreeEl.innerHTML = "";
  folderNodeMap.clear();
  folderRootPath = null;
  currentFilePath = null;
}

const WELCOME_MD = `# mdlite

A lightweight markdown previewer.

---

**Open a file** — use **File \u2192 Open...** or run \`mdlite <file.md>\`

**Open a folder** — use **File \u2192 Open Folder...** or run \`mdlite <folder>\`

---

**Keyboard shortcuts**

| Action | Shortcut |
|---|---|
| Open file | File \u2192 Open... |
| Open folder | File \u2192 Open Folder... |
| Switch theme | Theme menu |

**Supported formats** — \`.md\`, \`.markdown\`, \`.mdx\`

**Features** — live reload, mermaid diagrams, multiple themes
`;

function showWelcome() {
  lastMarkdown = WELCOME_MD;
  render(WELCOME_MD);
}

// --- Event listeners (registered before init to avoid race conditions) ---

await listen("set-theme", (event) => {
  applyTheme(event.payload);
});

await listen("file-changed", (event) => {
  startupErrorMsg = null;
  lastMarkdown = event.payload;
  render(lastMarkdown);
});

await listen("enter-folder-mode", async () => {
  await enterFolderMode();
});

await listen("folder-scan-files", (event) => {
  handleScanFiles(event.payload.path_chain, event.payload.files);
});

await listen("folder-scan-complete", () => {
  handleScanComplete();
});

await listen("folder-changed", async () => {
  if (!document.body.classList.contains("folder-mode")) return;
  folderNodeMap.clear();
  sidebarTreeEl.innerHTML = "";
  showScanningIndicator();
  invoke("start_folder_scan");
});

await listen("enter-file-mode", () => {
  exitFolderMode();
});

await listen("open-search", () => {
  openSearch();
  if (searchInputEl.value) highlightSearchMatches(searchInputEl.value);
});

// --- Initialization ---

const savedTheme = await invoke("get_theme");
applyTheme(savedTheme);

const modeInfo = await invoke("get_mode");
const startupError = await invoke("get_startup_error");

if (startupError) {
  startupErrorMsg = startupError;
  render("");
} else if (modeInfo.mode === "empty") {
  showWelcome();
} else if (modeInfo.mode === "folder") {
  document.body.classList.add("folder-mode");
  if (modeInfo.folder_name) {
    sidebarHeaderEl.textContent = modeInfo.folder_name;
  }
  currentFilePath = modeInfo.current_file || null;
  folderRootPath = modeInfo.folder_path || null;
  folderNodeMap.clear();
  showScanningIndicator();
  invoke("start_folder_scan");

  if (currentFilePath) {
    try {
      const content = await invoke("read_file");
      lastMarkdown = content;
      render(content);
    } catch {
      lastMarkdown = "";
      render("");
    }
  }
} else {
  const content = await invoke("read_file");
  lastMarkdown = content;
  render(content);
}

// --- Search event handlers ---

let searchDebounce;
searchInputEl.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => highlightSearchMatches(searchInputEl.value), 150);
});

searchInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchNavigate(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeSearch();
  }
});

searchRegexBtn.addEventListener("click", () => {
  searchIsRegex = !searchIsRegex;
  searchRegexBtn.classList.toggle("active", searchIsRegex);
  highlightSearchMatches(searchInputEl.value);
});

searchCaseBtn.addEventListener("click", () => {
  searchCaseSensitive = !searchCaseSensitive;
  searchCaseBtn.classList.toggle("active", searchCaseSensitive);
  highlightSearchMatches(searchInputEl.value);
});

searchPrevBtn.addEventListener("click", () => searchNavigate(-1));
searchNextBtn.addEventListener("click", () => searchNavigate(1));
searchCloseBtn.addEventListener("click", closeSearch);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    openSearch();
    if (searchInputEl.value) highlightSearchMatches(searchInputEl.value);
  }
});

// Handle link clicks
document.addEventListener("click", (e) => {
  const anchor = e.target.closest("a[href]");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (href && href.startsWith("#")) {
    e.preventDefault();
    const target = document.getElementById(href.slice(1));
    if (target) target.scrollIntoView({ behavior: "smooth" });
  } else if (href && href.startsWith("http")) {
    e.preventDefault();
    openUrl(href);
  }
});

// Re-render on window resize
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(lastMarkdown), 150);
});
