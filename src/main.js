import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

import { applyTheme } from "./themes.js";
import { applyZoom, getZoom } from "./zoom.js";
import { parseMarkdown, renderMermaidBlocks, bindMermaidButtons, resetMermaidCounter } from "./markdown.js";
import { highlightSearchMatches, openSearch, isSearchActive, getSearchQuery, bindSearchEvents } from "./search.js";
import { toggleToc, refreshToc, bindTocEvents } from "./toc.js";
import {
  initSidebar,
  handleScanFiles,
  handleScanComplete,
  enterFolderMode,
  exitFolderMode,
  resetSidebarForRescan,
  initFolderStartup,
} from "./sidebar.js";

const contentEl = document.getElementById("content");

let lastMarkdown = "";
let startupErrorMsg = null;

function render(markdown) {
  if (startupErrorMsg) {
    const startupErrorEl = document.createElement("div");
    startupErrorEl.className = "startup-error";
    startupErrorEl.textContent = startupErrorMsg;
    contentEl.replaceChildren(startupErrorEl);
    return;
  }
  lastMarkdown = markdown;
  resetMermaidCounter();
  contentEl.innerHTML = parseMarkdown(markdown);
  renderMermaidBlocks();
  bindMermaidButtons();
  if (isSearchActive()) {
    highlightSearchMatches(getSearchQuery());
  }
  refreshToc();
}

initSidebar(render);

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
| Zoom in | Ctrl+= |
| Zoom out | Ctrl+- |
| Reset zoom | Ctrl+0 |
| Toggle outline | Ctrl+Shift+O |
| Switch theme | Theme menu |

**Supported formats** — \`.md\`, \`.markdown\`, \`.mdx\`

**Features** — live reload, mermaid diagrams, math/LaTeX (KaTeX), multiple themes
`;

// --- Event listeners (registered before init to avoid race conditions) ---

await listen("set-theme", (event) => {
  applyTheme(event.payload);
});

await listen("set-zoom", (event) => {
  applyZoom(event.payload);
});

await listen("file-changed", (event) => {
  startupErrorMsg = null;
  render(event.payload);
});

await listen("enter-folder-mode", async () => {
  startupErrorMsg = null;
  await enterFolderMode();
});

await listen("folder-scan-files", (event) => {
  if (!document.body.classList.contains("folder-mode")) return;
  handleScanFiles(event.payload.path_chain, event.payload.files);
});

await listen("folder-scan-complete", () => {
  if (!document.body.classList.contains("folder-mode")) return;
  handleScanComplete();
});

let folderChangedTimer;
await listen("folder-changed", () => {
  if (!document.body.classList.contains("folder-mode")) return;
  clearTimeout(folderChangedTimer);
  folderChangedTimer = setTimeout(() => resetSidebarForRescan(), 500);
});

await listen("enter-file-mode", () => {
  clearTimeout(folderChangedTimer);
  exitFolderMode();
});

await listen("toggle-outline", () => {
  toggleToc();
});

await listen("open-search", () => {
  openSearch();
  if (getSearchQuery()) highlightSearchMatches(getSearchQuery());
});

// --- Initialization ---

const savedTheme = await invoke("get_theme");
applyTheme(savedTheme);

const savedZoom = await invoke("get_zoom");
applyZoom(savedZoom);

const modeInfo = await invoke("get_mode");
const startupError = await invoke("get_startup_error");

if (startupError) {
  startupErrorMsg = startupError;
  render("");
} else if (modeInfo.mode === "empty") {
  render(WELCOME_MD);
} else if (modeInfo.mode === "folder") {
  initFolderStartup(modeInfo);

  if (modeInfo.current_file) {
    try {
      const content = await invoke("read_file");
      render(content);
    } catch {
      render("");
    }
  }
} else {
  const content = await invoke("read_file");
  render(content);
}

// --- Global event handlers ---

bindSearchEvents();
bindTocEvents();

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    openSearch();
    if (getSearchQuery()) highlightSearchMatches(getSearchQuery());
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "O") {
    e.preventDefault();
    toggleToc();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
    e.preventDefault();
    const newZoom = Math.min(200, getZoom() + 10);
    applyZoom(newZoom);
    invoke("save_zoom", { level: newZoom });
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "-") {
    e.preventDefault();
    const newZoom = Math.max(50, getZoom() - 10);
    applyZoom(newZoom);
    invoke("save_zoom", { level: newZoom });
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "0") {
    e.preventDefault();
    applyZoom(100);
    invoke("save_zoom", { level: 100 });
  }
});

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

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(lastMarkdown), 150);
});
