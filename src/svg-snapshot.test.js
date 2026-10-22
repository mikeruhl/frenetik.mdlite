import { describe, it, expect, afterEach } from "vitest";
import { cloneSvgForSnapshot, collectSvgRules } from "./svg-snapshot.js";

function mount(css, svgMarkup) {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = `<div id="root">${svgMarkup}</div>`;
  return document.querySelector("svg");
}

describe("cloneSvgForSnapshot", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("embeds stylesheet rules that match elements in the SVG", () => {
    const svg = mount(
      ".series { fill: none; stroke: red; } .unused { stroke: blue; } p { color: green; }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series" d="M0 0L10 10"/></svg>'
    );
    const clone = cloneSvgForSnapshot(svg);
    const style = clone.querySelector("style");
    expect(style).not.toBeNull();
    expect(style.textContent).toMatch(/\.series\s*\{[^}]*stroke:\s*red/);
    expect(style.textContent).not.toContain(".unused");
    expect(style.textContent).not.toMatch(/\bp\s*\{/);
    expect(svg.querySelector("style")).toBeNull();
  });

  it("keeps matching rules nested in media blocks", () => {
    const svg = mount(
      "@media screen { .series { stroke: red; } .unused { stroke: blue; } }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series"/></svg>'
    );
    const text = cloneSvgForSnapshot(svg).querySelector("style").textContent;
    expect(text).toMatch(/@media screen\s*\{/);
    expect(text).toContain(".series");
    expect(text).not.toContain(".unused");
  });

  it("rewrites selectors scoped to the frame root so they apply in the standalone snapshot", () => {
    const svg = mount(
      "#root .series { stroke: red; fill: none; }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series"/></svg>'
    );
    const clone = cloneSvgForSnapshot(svg);
    const text = clone.querySelector("style").textContent;
    expect(text).not.toContain("#root");
    expect(clone.id).toBe("mdlite-snapshot-root");
    document.body.innerHTML = "";
    document.head.innerHTML = `<style>${text}</style>`;
    document.body.appendChild(clone);
    expect(getComputedStyle(clone.querySelector(".series")).stroke).toBe("rgb(255, 0, 0)");
    expect(svg.id).toBe("");
  });

  it("keeps the part of an ancestor selector that lies inside the SVG", () => {
    const svg = mount(
      "#root > div svg .series, .other, #root g > .series { stroke: red; }",
      '<div><svg xmlns="http://www.w3.org/2000/svg" id="chart"><g><path class="series"/></g></svg></div>'
    );
    const text = cloneSvgForSnapshot(svg).querySelector("style").textContent;
    expect(text).toContain("svg:is(#chart, #chart *) .series");
    expect(text).toContain("g:is(#chart, #chart *) > .series");
    expect(text).not.toContain(".other");
    expect(text).not.toContain("#root");
  });

  it("rewrites frame-scoped selectors nested in media blocks", () => {
    const svg = mount(
      "@media screen { #root .series { stroke: red; } #root .unused { stroke: blue; } }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series"/></svg>'
    );
    const text = cloneSvgForSnapshot(svg).querySelector("style").textContent;
    expect(text).toMatch(/@media screen\s*\{/);
    expect(text).toContain(".series:is(#mdlite-snapshot-root, #mdlite-snapshot-root *)");
    expect(text).not.toContain(".unused");
  });

  it("leaves selectors that already apply within the SVG unchanged", () => {
    const svg = mount(
      "svg .series { stroke: red; }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series"/></svg>'
    );
    const clone = cloneSvgForSnapshot(svg);
    expect(clone.querySelector("style").textContent).toMatch(/^svg \.series \{/);
  });

  it("adds no style element when no rule applies or rules are disabled", () => {
    const svg = mount(
      ".other { stroke: red; }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series"/></svg>'
    );
    expect(cloneSvgForSnapshot(svg).querySelector("style")).toBeNull();
    document.head.innerHTML = "<style>.series { stroke: red; }</style>";
    expect(cloneSvgForSnapshot(svg, { withRules: false }).querySelector("style")).toBeNull();
  });

  it("copies the theme variables onto the clone", () => {
    const svg = mount("", '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    document.documentElement.style.setProperty("--mdlite-fg", "#123456");
    document.documentElement.style.setProperty("--other", "x");
    const clone = cloneSvgForSnapshot(svg);
    expect(clone.style.getPropertyValue("--mdlite-fg")).toBe("#123456");
    expect(clone.style.getPropertyValue("--other")).toBe("");
  });

  it("skips stylesheets whose rules cannot be read", () => {
    const svg = mount(
      ".series { stroke: red; }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="series"/></svg>'
    );
    const blocked = {
      get cssRules() {
        throw new Error("SecurityError");
      },
    };
    const doc = { styleSheets: [blocked, ...document.styleSheets] };
    expect(collectSvgRules(svg, doc).join("")).toContain(".series");
  });
});
