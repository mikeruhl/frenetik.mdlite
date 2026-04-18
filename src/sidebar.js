import { invoke } from "@tauri-apps/api/core";

const mainContentEl = document.getElementById("main-content");
const sidebarHeaderEl = document.getElementById("sidebar-header");
const sidebarTreeEl = document.getElementById("sidebar-tree");

const folderNodeMap = new Map();
const folderScrollPositions = new Map();
let currentFilePath = null;
let renderFn = null;

export function initSidebar(render) {
  renderFn = render;
}

export function getCurrentFilePath() {
  return currentFilePath;
}

export function setCurrentFilePath(path) {
  currentFilePath = path;
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

export function handleScanFiles(pathChain, files) {
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

export function handleScanComplete() {
  removeScanningIndicator();
  sidebarTreeEl.querySelectorAll(".folder-scan-spinner").forEach((el) => el.remove());
  folderNodeMap.clear();
  if (currentFilePath) {
    const stillExists = Array.from(sidebarTreeEl.querySelectorAll(".tree-file")).some(
      (el) => el.dataset.path === currentFilePath
    );
    if (!stillExists) {
      currentFilePath = null;
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

async function selectFolderFile(path) {
  try {
    if (currentFilePath && mainContentEl) {
      folderScrollPositions.set(currentFilePath, mainContentEl.scrollTop);
    }
    const content = await invoke("open_folder_file", { path });
    currentFilePath = path;
    renderFn(content);
    highlightCurrentFile();
    if (mainContentEl) {
      mainContentEl.scrollTop = folderScrollPositions.get(path) || 0;
    }
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

export async function enterFolderMode() {
  document.body.classList.add("folder-mode");
  const modeInfo = await invoke("get_mode");

  if (modeInfo.folder_name) {
    sidebarHeaderEl.textContent = modeInfo.folder_name;
  }
  currentFilePath = modeInfo.current_file || null;

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
  currentFilePath = null;
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
    sidebarHeaderEl.textContent = modeInfo.folder_name;
  }
  currentFilePath = modeInfo.current_file || null;
  folderNodeMap.clear();
  showScanningIndicator();
  invoke("start_folder_scan").catch((e) => console.error("Folder scan failed:", e));
}
