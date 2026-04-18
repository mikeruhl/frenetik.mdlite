const contentEl = document.getElementById("content");
const attributionEl = document.getElementById("attribution");

let currentZoom = 100;

export function getZoom() {
  return currentZoom;
}

export function applyZoom(level) {
  currentZoom = Math.max(50, Math.min(200, level));
  contentEl.style.zoom = currentZoom / 100;
  updateZoomIndicator();
}

export function updateZoomIndicator() {
  let indicator = document.getElementById("zoom-indicator");
  if (currentZoom === 100) {
    if (indicator) indicator.remove();
    return;
  }
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.id = "zoom-indicator";
    attributionEl.prepend(indicator);
  }
  indicator.textContent = currentZoom + "% \u00b7 ";
}
