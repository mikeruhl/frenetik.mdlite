import { invoke } from "@tauri-apps/api/core";

const MAX_SEGMENTS = 4;
const FILE_ICON =
  '<svg class="breadcrumb-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4zM9.5 1.5V5H13" /></svg>';

let revealFolder = () => {};
let latest = 0;

export function initBreadcrumb(onReveal) {
  revealFolder = onReveal;
}

export function buildSegments({ root, folders, file }) {
  const crumbs = [root, ...folders];
  const folderSegments = crumbs.map((c) => ({ kind: "folder", name: c.name, path: c.path }));
  const fileSegment = { kind: "file", name: file.name };
  if (crumbs.length + 1 <= MAX_SEGMENTS) return [...folderSegments, fileSegment];
  const hidden = folderSegments.slice(1, -1).map((s) => s.name);
  return [folderSegments[0], { kind: "ellipsis", hidden }, folderSegments.at(-1), fileSegment];
}

function createSegment(segment) {
  const item = document.createElement("li");
  if (segment.kind === "folder") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "breadcrumb-link";
    button.textContent = segment.name;
    button.dataset.path = segment.path;
    button.addEventListener("click", () => revealFolder(segment.path));
    item.appendChild(button);
  } else if (segment.kind === "ellipsis") {
    const marker = document.createElement("span");
    marker.className = "breadcrumb-ellipsis";
    marker.textContent = "…";
    marker.title = segment.hidden.join("/");
    item.appendChild(marker);
  } else {
    item.className = "breadcrumb-current";
    item.setAttribute("aria-current", "page");
    item.title = segment.name;
    item.insertAdjacentHTML("beforeend", FILE_ICON);
    const name = document.createElement("span");
    name.className = "breadcrumb-file-name";
    name.textContent = segment.name;
    item.appendChild(name);
  }
  return item;
}

export function renderBreadcrumb(nav, data) {
  const list = document.createElement("ol");
  list.className = "breadcrumb-list";
  for (const segment of buildSegments(data)) list.appendChild(createSegment(segment));
  nav.replaceChildren(list);
  nav.hidden = false;
}

export function clearBreadcrumb() {
  latest++;
  const nav = document.getElementById("breadcrumb");
  if (!nav) return;
  nav.hidden = true;
  nav.replaceChildren();
}

export async function updateBreadcrumb(path) {
  if (!path) {
    clearBreadcrumb();
    return;
  }
  const seq = ++latest;
  let data;
  try {
    data = await invoke("get_breadcrumb", { path });
  } catch {
    data = null;
  }
  if (seq !== latest) return;
  const nav = document.getElementById("breadcrumb");
  if (!nav) return;
  if (data) renderBreadcrumb(nav, data);
  else clearBreadcrumb();
}
