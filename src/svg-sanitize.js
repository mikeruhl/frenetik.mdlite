import { parseRemoteUrl } from "./images.js";

/** Returns the first `<svg>` in renderer output with scripts, handlers, unsafe links, and remote images removed. */
export function sanitizeRendererSvg(svg) {
  const doc = new DOMParser().parseFromString(svg, "text/html");
  doc.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
  doc.querySelectorAll("img, image").forEach((el) => {
    const src = el.getAttribute("src") ?? el.getAttribute("href") ?? el.getAttribute("xlink:href");
    if (parseRemoteUrl(src)) el.remove();
  });
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return "";
  for (const el of [svgEl, ...svgEl.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (attr.name === "href" || attr.name === "xlink:href") {
        // eslint-disable-next-line no-control-regex -- intentional: strip control chars browsers normalize from URLs
        const scheme = attr.value.replace(/[\x00-\x20]+/g, "").toLowerCase();
        if (scheme.startsWith("javascript:") || scheme.startsWith("data:") || scheme.startsWith("vbscript:")) {
          el.removeAttribute(attr.name);
        }
      }
    }
  }
  return svgEl.outerHTML;
}
