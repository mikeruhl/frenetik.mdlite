import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { initBreadcrumb, updateBreadcrumb, clearBreadcrumb } from "./breadcrumb.js";
import { pushNavigation } from "./history.js";
import { expandSidebar } from "./sidebar-layout.js";
import { showToast } from "./toast.js";

const mainContentEl = document.getElementById("main-content");
const sidebarTitleEl = document.getElementById("sidebar-title");
const sidebarTreeEl = document.getElementById("sidebar-tree");

const folderNodeMap = new Map();
const folderScrollPositions = new Map();
let currentFilePath = null;
let renderFn = null;

export function initSidebar(render) {
  renderFn = render;
  initBreadcrumb(revealFolder);
}

function setCurrentFile(path) {
  currentFilePath = path;
  if (path) updateBreadcrumb(path);
  else clearBreadcrumb();
}

export function getCurrentFilePath() {
  return currentFilePath;
}

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

  const newDot = document.createElement("span");
  newDot.className = "tree-new-dot";
  newDot.setAttribute("aria-hidden", "true");
  newDot.textContent = "\u2022";
  item.appendChild(newDot);

  const childrenDiv = document.createElement("div");
  childrenDiv.className = "tree-children";
  childrenDiv.style.display = "none";

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const expanded = childrenDiv.style.display !== "none";
    childrenDiv.style.display = expanded ? "none" : "block";
    toggle.textContent = expanded ? "\u25b8" : "\u25be";
    item.classList.toggle("expanded", !expanded);
    if (!expanded) item.classList.remove("has-new");
  });

  item.dataset.path = dirPath;
  insertFolderSorted(container, item, childrenDiv, name);
  const nodeInfo = { container: childrenDiv, depth: depth + 1, item };
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

// Expanded ancestors are skipped: their contents are already on screen.
function markNewInCollapsedAncestors(pathChain) {
  for (const ancestor of pathChain) {
    const node = folderNodeMap.get(ancestor.path);
    if (node && node.item && node.container.style.display === "none") {
      node.item.classList.add("has-new");
    }
  }
}

function createFileElement(name, path, depth) {
  const item = document.createElement("div");
  item.className = "tree-item tree-file";
  item.style.paddingLeft = 28 + depth * 16 + "px";
  item.dataset.path = path;

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = name;
  item.appendChild(label);

  item.addEventListener("click", async (e) => {
    e.stopPropagation();
    await selectFolderFile(path);
  });

  return item;
}

function insertFileSorted(container, fileItem, name) {
  const children = Array.from(container.children);
  for (const child of children) {
    if (!child.classList.contains("tree-file")) continue;
    const childName = child.querySelector(".tree-label").textContent;
    if (name.localeCompare(childName, undefined, { sensitivity: "base" }) < 0) {
      container.insertBefore(fileItem, child);
      return;
    }
  }
  container.appendChild(fileItem);
}

function findFileElement(path) {
  return Array.from(sidebarTreeEl.querySelectorAll(".tree-file")).find((el) => el.dataset.path === path) || null;
}

function pruneEmptyAncestors(container) {
  while (container && container !== sidebarTreeEl) {
    if (container.querySelector(".tree-file, .tree-folder")) break;
    const folderItem = container.previousElementSibling;
    const parent = container.parentElement;
    container.remove();
    if (folderItem && folderItem.classList.contains("tree-folder")) {
      const folderPath = folderItem.dataset.path;
      if (folderPath) folderNodeMap.delete(folderPath);
      folderItem.remove();
    }
    container = parent;
  }
}

export function handleScanFiles(pathChain, files) {
  const { container, depth } = ensureDirChain(pathChain);
  for (const file of files) {
    const item = createFileElement(file.name, file.path, depth);
    container.appendChild(item);
    if (file.path === currentFilePath) {
      item.classList.add("active");
    }
  }
}

export async function handleScanComplete() {
  removeScanningIndicator();
  sidebarTreeEl.querySelectorAll(".folder-scan-spinner").forEach((el) => el.remove());
  if (currentFilePath && !findFileElement(currentFilePath)) {
    const path = currentFilePath;
    const exists = await invoke("file_exists", { path }).catch(() => false);
    if (!exists && currentFilePath === path) {
      setCurrentFile(null);
      renderFn("");
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

async function loadFile(path) {
  if (currentFilePath) {
    folderScrollPositions.set(currentFilePath, mainContentEl.scrollTop);
  }
  const content = await invoke("open_folder_file", { path });
  setCurrentFile(path);
  await renderFn(content);
  highlightCurrentFile();
}

async function selectFolderFile(path) {
  try {
    pushNavigation();
    await loadFile(path);
    mainContentEl.scrollTop = folderScrollPositions.get(path) || 0;
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

export async function navigateToFile(path) {
  try {
    await loadFile(path);
  } catch (e) {
    console.error("Failed to navigate to file:", e);
  }
}

function expandAncestors(el) {
  let container = el.parentElement;
  while (container && container !== sidebarTreeEl) {
    if (container.style.display === "none") container.previousElementSibling.click();
    container = container.parentElement;
  }
}

function revealInTree(path) {
  const row = findFileElement(path);
  if (!row) return;
  expandAncestors(row);
  row.scrollIntoView({ block: "nearest" });
}

export function revealFolder(path) {
  expandSidebar();
  const node = folderNodeMap.get(path);
  if (!node) {
    sidebarTreeEl.scrollTop = 0;
    return;
  }
  expandAncestors(node.item);
  if (node.container.style.display === "none") node.item.click();
  node.item.scrollIntoView({ block: "nearest" });
}

export async function copyTreePath(path, kind) {
  try {
    await invoke("copy_tree_path", { path, kind });
    showToast("Path copied");
  } catch (e) {
    window.alert("Could not copy path: " + e);
  }
}

async function showPathMenu(path, x, y) {
  const menu = await Menu.new({
    items: [
      { id: "copy-full-path", text: "Copy Full Path", action: () => copyTreePath(path, "full") },
      { id: "copy-relative-path", text: "Copy Relative Path", action: () => copyTreePath(path, "relative") },
    ],
  });
  await menu.popup(new LogicalPosition(x, y));
}

sidebarTreeEl.addEventListener("contextmenu", (e) => {
  const row = e.target.closest?.(".tree-file, .tree-folder");
  if (!row?.dataset.path) return;
  e.preventDefault();
  showPathMenu(row.dataset.path, e.clientX, e.clientY).catch((err) => showToast("Could not open menu: " + err));
});

export async function navigateToFolderLink(path, fragment) {
  try {
    pushNavigation();
    await loadFile(path);
    revealInTree(path);
    const target = fragment ? document.getElementById(fragment) : null;
    if (target) target.scrollIntoView();
    else mainContentEl.scrollTop = 0;
  } catch (e) {
    showToast("Could not open link: " + e);
  }
}

export async function enterFolderMode() {
  document.body.classList.add("folder-mode");
  const modeInfo = await invoke("get_mode");

  if (modeInfo.folder_name) {
    sidebarTitleEl.textContent = modeInfo.folder_name;
  }
  setCurrentFile(modeInfo.current_file || null);

  folderNodeMap.clear();
  sidebarTreeEl.innerHTML = "";
  showScanningIndicator();
  invoke("start_folder_scan").catch((e) => console.error("Folder scan failed:", e));
}

export function exitFolderMode() {
  invoke("cancel_folder_scan").catch(() => {});
  document.body.classList.remove("folder-mode");
  sidebarTreeEl.innerHTML = "";
  folderNodeMap.clear();
  folderScrollPositions.clear();
  setCurrentFile(null);
}

export function resetSidebarForRescan() {
  folderNodeMap.clear();
  sidebarTreeEl.innerHTML = "";
  showScanningIndicator();
  invoke("start_folder_scan").catch((e) => console.error("Folder scan failed:", e));
}

export function initFolderStartup(modeInfo) {
  document.body.classList.add("folder-mode");
  if (modeInfo.folder_name) {
    sidebarTitleEl.textContent = modeInfo.folder_name;
  }
  setCurrentFile(modeInfo.current_file || null);
  folderNodeMap.clear();
  showScanningIndicator();
  invoke("start_folder_scan").catch((e) => console.error("Folder scan failed:", e));
}

export function applyFolderChanges(changes) {
  for (const change of changes) {
    const fileEl = findFileElement(change.path);

    if (fileEl && change.exists) {
      continue;
    }

    if (fileEl && !change.exists) {
      const parentContainer = fileEl.parentElement;
      fileEl.remove();
      if (change.path === currentFilePath) {
        setCurrentFile(null);
        renderFn("");
      }
      pruneEmptyAncestors(parentContainer);
      continue;
    }

    if (!fileEl && change.exists) {
      const { container, depth } = ensureDirChain(change.path_chain);
      const item = createFileElement(change.name, change.path, depth);
      insertFileSorted(container, item, change.name);
      markNewInCollapsedAncestors(change.path_chain);
      if (change.path === currentFilePath) {
        item.classList.add("active");
      }
      continue;
    }
  }
  sidebarTreeEl.querySelectorAll(".folder-scan-spinner").forEach((el) => el.remove());
}
