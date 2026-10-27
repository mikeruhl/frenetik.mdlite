import { invoke } from "@tauri-apps/api/core";

export function applyAlwaysOnTop(enabled) {
  const badge = document.getElementById("pin-badge");
  if (!badge) return;
  badge.hidden = !enabled;
  badge.setAttribute("aria-pressed", String(enabled));
}

export function bindPinBadge() {
  const badge = document.getElementById("pin-badge");
  if (!badge) return;
  badge.addEventListener("click", () => {
    invoke("set_always_on_top", { enabled: false });
  });
}
