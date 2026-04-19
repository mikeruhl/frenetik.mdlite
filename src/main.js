import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LazyStore } from "@tauri-apps/plugin-store";

import { applyTheme } from "./themes.js";
import { applyZoom, getZoom } from "./zoom.js";
import {
  parseMarkdown,
  renderMermaidBlocks,
  bindMermaidButtons,
  bindCopyButtons,
  resetMermaidCounter,
} from "./markdown.js";
import { highlightSearchMatches, openSearch, isSearchActive, getSearchQuery, bindSearchEvents } from "./search.js";
import { toggleToc, refreshToc, bindTocEvents } from "./toc.js";
import { initHistory, pushNavigation, navigateBack, navigateForward } from "./history.js";
import {
  initSidebar,
  handleScanFiles,
  handleScanComplete,
  enterFolderMode,
  exitFolderMode,
  resetSidebarForRescan,
  initFolderStartup,
  getCurrentFilePath,
  navigateToFile,
} from "./sidebar.js";

const store = new LazyStore("settings.json");

const contentEl = document.getElementById("content");
const mainContentEl = document.getElementById("main-content");

let startupErrorMsg = null;

function render(markdown) {
  if (startupErrorMsg) {
    const startupErrorEl = document.createElement("div");
    startupErrorEl.className = "startup-error";
    startupErrorEl.textContent = startupErrorMsg;
    contentEl.replaceChildren(startupErrorEl);
    return;
  }
  resetMermaidCounter();
  contentEl.innerHTML = parseMarkdown(markdown);
  renderMermaidBlocks();
  bindMermaidButtons();
  bindCopyButtons();
  if (isSearchActive()) {
    highlightSearchMatches(getSearchQuery());
  }
  refreshToc();
}

initSidebar(render);

initHistory(
  () => ({ filePath: getCurrentFilePath(), scrollTop: mainContentEl.scrollTop }),
  async (filePath, scrollTop) => {
    if (filePath && filePath !== getCurrentFilePath()) {
      await navigateToFile(filePath);
    }
    mainContentEl.scrollTop = scrollTop;
  }
);

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
| Print | Ctrl+P |
| Export to PDF | Ctrl+Shift+E |
| Go back | Alt+Left |
| Go forward | Alt+Right |
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

await listen("navigate-back", () => {
  navigateBack();
});

await listen("navigate-forward", () => {
  navigateForward();
});

await listen("print", () => {
  window.print();
});

await listen("export-pdf-error", (event) => {
  window.alert("PDF export failed: " + event.payload);
});

await listen("set-print-header", (event) => {
  document.body.classList.toggle("print-header-enabled", event.payload);
});

// --- Print header ---

function updatePrintHeader() {
  if (!document.body.classList.contains("print-header-enabled")) return;
  const titleEl = document.getElementById("print-header-title");
  const dateEl = document.getElementById("print-header-date");
  const pageTitle = document.title;
  const parts = pageTitle
    .replace("mdlite", "")
    .replace(/—/g, "|")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  titleEl.textContent = parts.join(" / ") || "mdlite";
  dateEl.textContent = new Date().toLocaleDateString();
}

window.addEventListener("beforeprint", updatePrintHeader);

// --- Initialization ---

const savedTheme = (await store.get("theme")) ?? "github";
applyTheme(savedTheme);

const savedZoom = (await store.get("zoom")) ?? 100;
applyZoom(savedZoom);

const printHeader = (await store.get("print_header")) ?? true;
document.body.classList.toggle("print-header-enabled", printHeader);

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
    store.set("zoom", newZoom);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "-") {
    e.preventDefault();
    const newZoom = Math.max(50, getZoom() - 10);
    applyZoom(newZoom);
    store.set("zoom", newZoom);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "0") {
    e.preventDefault();
    applyZoom(100);
    store.set("zoom", 100);
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "p") {
    e.preventDefault();
    window.print();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
    e.preventDefault();
    invoke("export_pdf");
  }
  if (e.altKey && e.key === "ArrowLeft") {
    e.preventDefault();
    navigateBack();
  }
  if (e.altKey && e.key === "ArrowRight") {
    e.preventDefault();
    navigateForward();
  }
});

document.addEventListener("click", (e) => {
  const anchor = e.target.closest("a[href]");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (href && href.startsWith("#")) {
    e.preventDefault();
    const target = document.getElementById(href.slice(1));
    if (target) {
      pushNavigation();
      target.scrollIntoView({ behavior: "smooth" });
    }
  } else if (href && href.startsWith("http")) {
    e.preventDefault();
    openUrl(href);
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 3) {
    e.preventDefault();
    navigateBack();
  } else if (e.button === 4) {
    e.preventDefault();
    navigateForward();
  }
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => refreshToc(), 150);
});
