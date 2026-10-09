const TOAST_MS = 1800;
let hideTimer;

export function showToast(text) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.hidden = true;
  }, TOAST_MS);
}

export function isEditableTarget(target) {
  if (typeof target?.matches !== "function") return false;
  return target.matches("input, textarea, select") || target.isContentEditable === true;
}
