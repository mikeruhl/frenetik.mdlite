import { describe, it, expect } from "vitest";
import { sanitizeRendererSvg } from "./svg-sanitize.js";

function parse(svg) {
  const holder = document.createElement("div");
  holder.innerHTML = sanitizeRendererSvg(svg);
  return holder;
}

describe("sanitizeRendererSvg", () => {
  it("keeps drawing markup, classes, and styles", () => {
    const out = parse('<svg viewBox="0 0 1 1"><style>.a{fill:red}</style><rect class="a" style="stroke:blue"/></svg>');
    expect(out.querySelector("rect.a").getAttribute("style")).toBe("stroke:blue");
    expect(out.querySelector("style")).not.toBeNull();
  });

  it("removes scripts, frames, and event handlers", () => {
    const out = parse(
      '<svg onload="x()"><script>x()</script><foreignObject><iframe src="a"></iframe></foreignObject><g onclick="y()"/></svg>'
    );
    expect(out.querySelector("script, iframe")).toBeNull();
    expect(out.innerHTML).not.toMatch(/onload|onclick/);
  });

  it.each(["javascript:alert(1)", " java\tscript:x", "data:text/html,x", "vbscript:x"])("drops href %s", (href) => {
    const out = parse(`<svg><a href="${href}"><text>t</text></a></svg>`);
    expect(out.querySelector("a").hasAttribute("href")).toBe(false);
  });

  it("removes remote image references and keeps inline raster sources", () => {
    const out = parse('<svg><image href="https://example.com/a.png"/><image href="data:image/png;base64,AA"/></svg>');
    const images = out.querySelectorAll("image");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("href")).toBe("data:image/png;base64,AA");
  });

  it.each([
    "data:image/png;base64,AA",
    "DATA:IMAGE/JPEG;base64,AA",
    "data:image/gif,GIF89a",
    "data:image/webp;charset=utf-8;base64,AA",
  ])("keeps raster data URL %s on SVG images", (href) => {
    const out = parse(`<svg><image href="${href}"/><image xlink:href="${href}"/></svg>`);
    const [plain, xlink] = out.querySelectorAll("image");
    expect(plain.getAttribute("href")).toBe(href);
    expect(xlink.getAttribute("xlink:href")).toBe(href);
  });

  it.each(["data:image/svg+xml;base64,AA", "data:image/bmp;base64,AA", "data:text/html,x", "javascript:alert(1)"])(
    "drops %s on SVG images",
    (href) => {
      const out = parse(`<svg><image href="${href}"/><image xlink:href="${href}"/></svg>`);
      const [plain, xlink] = out.querySelectorAll("image");
      expect(plain.hasAttribute("href")).toBe(false);
      expect(xlink.hasAttribute("xlink:href")).toBe(false);
    }
  );

  it("drops raster data URLs on links", () => {
    const out = parse('<svg><a href="data:image/png;base64,AA"><text>t</text></a></svg>');
    expect(out.querySelector("a").hasAttribute("href")).toBe(false);
  });

  it("returns an empty string when there is no svg", () => {
    expect(sanitizeRendererSvg("<div>no</div>")).toBe("");
  });
});
