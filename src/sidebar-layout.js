export const DEFAULT_WIDTH = 250;
export const MIN_WIDTH = 150;
export const MAX_WIDTH = 600;

const MAX_VIEWPORT_FRACTION = 0.6;
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

const MODES = {
  folder: {
    bodyClass: "folder-mode",
    defaultWidth: DEFAULT_WIDTH,
    widthKey: "mdlite-sidebar-width",
    collapsedKey: "mdlite-sidebar-collapsed",
    collapseId: "sidebar-collapse",
    expandLabel: "Show sidebar",
  },
  interactive: {
    bodyClass: "interactive-mode",
    defaultWidth: 340,
    widthKey: "mdlite-interactive-width",
    collapsedKey: null,
    collapseId: "interactive-collapse",
    expandLabel: "Show questions",
  },
};

function maxWidthFor(viewportWidth) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(viewportWidth * MAX_VIEWPORT_FRACTION)));
}

export function clampWidth(width, viewportWidth) {
  return Math.min(maxWidthFor(viewportWidth), Math.max(MIN_WIDTH, width));
}

export function parseStoredWidth(raw, viewportWidth, fallback = DEFAULT_WIDTH) {
  const parsed = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return clampWidth(Number.isFinite(parsed) ? parsed : fallback, viewportWidth);
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (!key) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

let bound = false;
let mode = MODES.folder;
let preferredWidth = DEFAULT_WIDTH;
let collapsed = false;
let dividerEl = null;
let expandBtn = null;
let collapseBtns = [];

function appliedWidth() {
  return clampWidth(preferredWidth, window.innerWidth);
}

function renderWidth() {
  const width = appliedWidth();
  document.documentElement.style.setProperty("--sidebar-width", width + "px");
  dividerEl.setAttribute("aria-valuenow", String(width));
  dividerEl.setAttribute("aria-valuemin", String(MIN_WIDTH));
  dividerEl.setAttribute("aria-valuemax", String(maxWidthFor(window.innerWidth)));
}

function setWidth(width, persist) {
  preferredWidth = clampWidth(width, window.innerWidth);
  renderWidth();
  if (persist) writeStorage(mode.widthKey, String(preferredWidth));
}

function renderCollapsed() {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  for (const btn of [...collapseBtns, expandBtn]) btn.setAttribute("aria-expanded", String(!collapsed));
}

function setCollapsed(value) {
  collapsed = value;
  renderCollapsed();
  writeStorage(mode.collapsedKey, String(collapsed));
}

function layoutControlsActive() {
  return Object.values(MODES).some((m) => document.body.classList.contains(m.bodyClass));
}

export function toggleSidebar() {
  if (!layoutControlsActive()) return false;
  setCollapsed(!collapsed);
  return true;
}

export function expandSidebar() {
  if (bound && collapsed) setCollapsed(false);
}

function bindDrag() {
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  let pendingWidth = null;
  let frame = 0;

  function flush() {
    frame = 0;
    if (pendingWidth === null) return;
    setWidth(pendingWidth, false);
    pendingWidth = null;
  }

  function end(e) {
    if (!dragging) return;
    dragging = false;
    if (dividerEl.hasPointerCapture(e.pointerId)) dividerEl.releasePointerCapture(e.pointerId);
    window.cancelAnimationFrame(frame);
    flush();
    document.body.classList.remove("sidebar-resizing");
    writeStorage(mode.widthKey, String(preferredWidth));
  }

  dividerEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = appliedWidth();
    dividerEl.setPointerCapture(e.pointerId);
    document.body.classList.add("sidebar-resizing");
  });

  dividerEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    pendingWidth = startWidth + e.clientX - startX;
    if (!frame) frame = window.requestAnimationFrame(flush);
  });

  dividerEl.addEventListener("pointerup", end);
  dividerEl.addEventListener("pointercancel", end);
}

function bindKeyboard() {
  dividerEl.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    let next;
    if (e.key === "ArrowLeft") next = appliedWidth() - step;
    else if (e.key === "ArrowRight") next = appliedWidth() + step;
    else if (e.key === "Home") next = MIN_WIDTH;
    else if (e.key === "End") next = MAX_WIDTH;
    else return;
    e.preventDefault();
    setWidth(next, true);
  });
}

function loadStored() {
  preferredWidth = parseStoredWidth(readStorage(mode.widthKey), window.innerWidth, mode.defaultWidth);
  collapsed = mode.collapsedKey ? readStorage(mode.collapsedKey) === "true" : false;
  expandBtn.title = `${mode.expandLabel} (Ctrl+B)`;
  expandBtn.setAttribute("aria-label", mode.expandLabel);
  renderWidth();
  renderCollapsed();
}

function focusCollapseButton() {
  document.getElementById(mode.collapseId)?.focus();
}

/** Binds the divider and collapse controls once; later calls only switch the active mode. */
export function initSidebarLayout(modeName) {
  mode = MODES[modeName];
  if (bound) {
    loadStored();
    return;
  }
  dividerEl = document.getElementById("sidebar-divider");
  expandBtn = document.getElementById("sidebar-expand");
  collapseBtns = [...document.querySelectorAll(".sidebar-collapse-btn")];
  if (!dividerEl || !expandBtn || collapseBtns.length === 0) return;
  bound = true;

  bindDrag();
  bindKeyboard();
  dividerEl.addEventListener("dblclick", () => setWidth(mode.defaultWidth, true));
  for (const btn of collapseBtns) {
    btn.addEventListener("click", () => {
      setCollapsed(true);
      expandBtn.focus();
    });
  }
  expandBtn.addEventListener("click", () => {
    setCollapsed(false);
    focusCollapseButton();
  });
  window.addEventListener("resize", renderWidth);

  loadStored();
}
