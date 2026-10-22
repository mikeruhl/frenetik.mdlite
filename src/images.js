import { convertFileSrc } from "@tauri-apps/api/core";

export const IMAGE_SCHEME = "mdimg";
export const PLACEHOLDER_CLASS = "remote-image-placeholder";

const PROTOCOL_RELATIVE_RE = /^\/\//;

let proxyBase = null;

/**
 * Builds the `mdimg` proxy URL for a remote image, using Tauri's per-platform
 * custom scheme form (`http://mdimg.localhost/` on Windows, `mdimg://localhost/` elsewhere).
 */
export function imageProxyUrl(url) {
  proxyBase ??= convertFileSrc("", IMAGE_SCHEME);
  return `${proxyBase}?u=${encodeURIComponent(url)}`;
}

/** Returns the parsed URL when `src` targets a remote http(s) host, otherwise null. */
export function parseRemoteUrl(src) {
  if (!src) return null;
  const trimmed = src.trim();
  try {
    const url = new URL(PROTOCOL_RELATIVE_RE.test(trimmed) ? `https:${trimmed}` : trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Decides whether a remote URL may load: exact hostname on the allow-list, or the exact URL allowed once. */
export function isImageAllowed(url, { hosts = [], urls = new Set() } = {}) {
  return urls.has(url.href) || hosts.includes(url.hostname.toLowerCase());
}

function placeholderButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "remote-image-action";
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  btn.addEventListener("auxclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  return btn;
}

/**
 * Attaches Load once / Always allow actions to every blocked-image placeholder in `root`.
 * The host is derived from `data-remote-src`, never from the placeholder text.
 */
export function bindImagePlaceholders(root, { onLoadOnce, onAllowHost }) {
  for (const placeholder of root.querySelectorAll(`.${PLACEHOLDER_CLASS}`)) {
    const url = parseRemoteUrl(placeholder.dataset.remoteSrc);
    if (!url || placeholder.querySelector(".remote-image-actions")) continue;
    const actions = document.createElement("span");
    actions.className = "remote-image-actions";
    actions.append(
      placeholderButton("Load once", () => onLoadOnce(url.href)),
      placeholderButton(`Always allow ${url.hostname}`, () => onAllowHost(url.hostname))
    );
    placeholder.appendChild(actions);
  }
}

/** Swaps every placeholder for `url` with an image loaded through the proxy. */
export function revealPlaceholders(root, url) {
  for (const placeholder of root.querySelectorAll(`.${PLACEHOLDER_CLASS}`)) {
    if (parseRemoteUrl(placeholder.dataset.remoteSrc)?.href !== url) continue;
    const img = document.createElement("img");
    img.src = imageProxyUrl(url);
    img.alt = placeholder.dataset.alt ?? "";
    placeholder.replaceWith(img);
  }
}
