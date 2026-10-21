import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";

import { applyTheme } from "./themes.js";
import { applyZoom, getZoom } from "./zoom.js";
import { showToast, isEditableTarget } from "./toast.js";
import { trackRichRender, joinRichRender, awaitRichRender } from "./rich-render.js";
import {
  parseMarkdown,
  extractFrontmatter,
  renderAllRichBlocks,
  bindCopyButtons,
  resetRenderState,
  setRenderTheme,
} from "./markdown.js";
import { bindImagePlaceholders, revealPlaceholders } from "./images.js";
import { setLiveDocument } from "./live-blocks.js";
import { highlightSearchMatches, openSearch, isSearchActive, getSearchQuery, bindSearchEvents } from "./search.js";
import { toggleToc, refreshToc, bindTocEvents } from "./toc.js";
import { initInteractive, refreshInteractive } from "./interactive.js";
import { initHistory, pushNavigation, navigateBack, navigateForward } from "./history.js";
import {
  initSidebar,
  handleScanFiles,
  handleScanComplete,
  enterFolderMode,
  exitFolderMode,
  resetSidebarForRescan,
  applyFolderChanges,
  initFolderStartup,
  getCurrentFilePath,
  navigateToFile,
  navigateToFolderLink,
} from "./sidebar.js";
import { initLinks } from "./links.js";

const store = new LazyStore("settings.json");

const contentEl = document.getElementById("content");
const mainContentEl = document.getElementById("main-content");

let startupErrorMsg = null;
let showFrontmatter = false;
let lastRawMarkdown = "";
let renderSeq = 0;
const sessionImageUrls = new Set();

function renderFrontmatterPanel(fields) {
  if (!fields || fields.length === 0 || !showFrontmatter) return "";
  const rows = fields
    .map((f) => `<tr><td class="fm-key">${escapeHtml(f.key)}</td><td class="fm-val">${escapeHtml(f.value)}</td></tr>`)
    .join("");
  return `<div id="frontmatter-panel"><table>${rows}</table></div>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadImageOnce(url) {
  try {
    await invoke("allow_image_once", { url });
    sessionImageUrls.add(url);
    revealPlaceholders(contentEl, url);
  } catch (err) {
    showToast("Could not load image: " + err);
  }
}

async function allowImageHost(host) {
  try {
    await invoke("allow_image_host", { host });
    await render(lastRawMarkdown);
  } catch (err) {
    showToast("Could not allow " + host + ": " + err);
  }
}

const RICH_RENDER_TIMEOUT_MS = 10000;

async function whenRichBlocksReady() {
  if (!(await awaitRichRender(RICH_RENDER_TIMEOUT_MS))) {
    showToast("Diagrams may be incomplete");
  }
}

async function printWhenReady() {
  await whenRichBlocksReady();
  window.print();
}

async function exportPdfWhenReady() {
  await whenRichBlocksReady();
  invoke("export_pdf");
}

async function render(markdown) {
  const seq = ++renderSeq;
  let settleRichRender;
  trackRichRender(new Promise((resolve) => (settleRichRender = resolve)));
  try {
    const result = await renderDocument(markdown, seq);
    settleRichRender(result?.richRender);
  } catch (err) {
    settleRichRender();
    throw err;
  }
}

async function renderDocument(markdown, seq) {
  if (startupErrorMsg) {
    const startupErrorEl = document.createElement("div");
    startupErrorEl.className = "startup-error";
    startupErrorEl.textContent = startupErrorMsg;
    contentEl.replaceChildren(startupErrorEl);
    return;
  }
  lastRawMarkdown = markdown;
  const hosts = await invoke("get_image_allowlist").catch(() => []);
  if (seq !== renderSeq) return;
  const { body, raw, fields } = extractFrontmatter(markdown);
  const hasFm = raw !== null;
  const panelHtml = renderFrontmatterPanel(fields);
  resetRenderState();
  setLiveDocument(markdown);
  contentEl.innerHTML = panelHtml + parseMarkdown(body, { images: { hosts, urls: sessionImageUrls } });
  bindImagePlaceholders(contentEl, { onLoadOnce: loadImageOnce, onAllowHost: allowImageHost });
  const richRender = renderAllRichBlocks();
  bindCopyButtons();
  if (isSearchActive()) {
    highlightSearchMatches(getSearchQuery());
  }
  refreshToc();
  refreshInteractive();
  invoke("notify_has_frontmatter", { has: hasFm });
  return { richRender };
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
| Copy file path | Shift+Alt+C |
| Go back | Alt+Left |
| Go forward | Alt+Right |
| Switch theme | Theme menu |

**Supported formats** — \`.md\`, \`.markdown\`, \`.mdx\`

**Features** — live reload, mermaid diagrams, math/LaTeX (KaTeX), multiple themes
`;

// --- Event listeners (registered before init to avoid race conditions) ---

await listen("set-theme", (event) => {
  applyTheme(event.payload);
  joinRichRender(setRenderTheme(event.payload).catch((e) => console.error("Rich Block theme update failed:", e)));
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
  clearTimeout(folderChangedTimer);
  pendingFolderChanges = [];
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
let pendingFolderChanges = [];
await listen("folder-changed", (event) => {
  if (!document.body.classList.contains("folder-mode")) return;
  pendingFolderChanges.push(...event.payload);
  clearTimeout(folderChangedTimer);
  folderChangedTimer = setTimeout(() => {
    const changes = pendingFolderChanges;
    pendingFolderChanges = [];
    applyFolderChanges(changes);
  }, 500);
});

await listen("rescan-folder", () => {
  if (!document.body.classList.contains("folder-mode")) return;
  clearTimeout(folderChangedTimer);
  pendingFolderChanges = [];
  resetSidebarForRescan();
});

await listen("enter-file-mode", () => {
  clearTimeout(folderChangedTimer);
  pendingFolderChanges = [];
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

await listen("print", printWhenReady);

await listen("export-pdf", exportPdfWhenReady);

await listen("export-pdf-error", (event) => {
  window.alert("PDF export failed: " + event.payload);
});

function reportCopyError(message) {
  window.alert("Could not copy file path: " + message);
}

await listen("file-path-copied", () => {
  showToast("Path copied");
});

await listen("file-path-copy-error", (event) => {
  reportCopyError(event.payload);
});

await listen("set-print-header", (event) => {
  document.body.classList.toggle("print-header-enabled", event.payload);
});

await listen("image-allowlist-changed", () => {
  if (lastRawMarkdown) render(lastRawMarkdown);
});

await listen("set-frontmatter", (event) => {
  showFrontmatter = event.payload;
  if (lastRawMarkdown) render(lastRawMarkdown);
});

// --- About / Update modal ---

const aboutOverlay = document.getElementById("about-overlay");
const aboutVersionNumber = document.getElementById("about-version-number");
const aboutUpdateResult = document.getElementById("about-update-result");
const aboutCheckBtn = document.getElementById("about-check-updates");

let previouslyFocusedElement = null;

function showAboutModal() {
  previouslyFocusedElement = document.activeElement;
  aboutVersionNumber.textContent = __APP_VERSION__;
  aboutUpdateResult.textContent = "";
  aboutCheckBtn.disabled = false;
  aboutOverlay.classList.remove("about-hidden");
  document.getElementById("about-close").focus();
}

function hideAboutModal() {
  aboutOverlay.classList.add("about-hidden");
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus();
    previouslyFocusedElement = null;
  }
}

await listen("show-about", () => {
  showAboutModal();
});

await listen("show-update-check", async () => {
  showAboutModal();
  await checkForUpdates();
});

async function checkForUpdates() {
  aboutCheckBtn.disabled = true;
  aboutUpdateResult.textContent = "Checking...";
  aboutUpdateResult.className = "";
  try {
    const result = await invoke("check_for_updates");
    if (result.update_available) {
      aboutUpdateResult.className = "update-available";
      aboutUpdateResult.textContent = "";
      aboutUpdateResult.append(
        `v${result.latest_version} is available! `,
        Object.assign(document.createElement("a"), {
          href: "#",
          id: "about-download-link",
          textContent: "Download update",
        })
      );
      document.getElementById("about-download-link").addEventListener("click", (e) => {
        e.preventDefault();
        invoke("open_release_page").catch((err) => showToast("Could not open link: " + err));
      });
    } else {
      aboutUpdateResult.textContent = "You're on the latest version.";
    }
  } catch (err) {
    aboutUpdateResult.className = "update-error";
    aboutUpdateResult.textContent = String(err);
  }
  aboutCheckBtn.disabled = false;
}

aboutCheckBtn.addEventListener("click", checkForUpdates);

document.getElementById("about-close").addEventListener("click", hideAboutModal);

aboutOverlay.addEventListener("click", (e) => {
  if (e.target === aboutOverlay) hideAboutModal();
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
setRenderTheme(savedTheme).catch((e) => console.error("Rich Block theme init failed:", e));

const savedZoom = (await store.get("zoom")) ?? 100;
applyZoom(savedZoom);

const printHeader = (await store.get("print_header")) ?? true;
document.body.classList.toggle("print-header-enabled", printHeader);

showFrontmatter = (await store.get("show_frontmatter")) ?? false;

await initInteractive({ contentEl, scrollRoot: mainContentEl });

const modeInfo = await invoke("get_mode");
const startupError = await invoke("get_startup_error");

if (startupError) {
  startupErrorMsg = startupError;
  await render("");
} else if (modeInfo.mode === "empty") {
  await render(WELCOME_MD);
} else if (modeInfo.mode === "folder") {
  initFolderStartup(modeInfo);

  if (modeInfo.current_file) {
    try {
      const content = await invoke("read_file");
      await render(content);
    } catch {
      await render("");
    }
  }
} else {
  const content = await invoke("read_file");
  await render(content);
}

// --- Global event handlers ---

bindSearchEvents();
bindTocEvents();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !aboutOverlay.classList.contains("about-hidden")) {
    hideAboutModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    openSearch();
    if (getSearchQuery()) highlightSearchMatches(getSearchQuery());
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
    printWhenReady();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
    e.preventDefault();
    exportPdfWhenReady();
  }
  if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyC" && !isEditableTarget(e.target)) {
    e.preventDefault();
    invoke("copy_file_path").then((path) => {
      if (path) showToast("Path copied");
    }, reportCopyError);
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

initLinks({
  invoke,
  navigate: navigateToFolderLink,
  confirm: () => Promise.resolve({ open: false, trustOrigin: false }),
  notify: showToast,
  scrollToFragment: (id) => {
    const target = document.getElementById(id);
    if (target) {
      pushNavigation();
      target.scrollIntoView({ behavior: "smooth" });
    }
  },
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
