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

  it("removes remote image references", () => {
    const out = parse('<svg><image href="https://example.com/a.png"/><image href="data:image/png;base64,AA"/></svg>');
    expect(out.querySelectorAll("image")).toHaveLength(1);
  });

  it("returns an empty string when there is no svg", () => {
    expect(sanitizeRendererSvg("<div>no</div>")).toBe("");
  });
});
