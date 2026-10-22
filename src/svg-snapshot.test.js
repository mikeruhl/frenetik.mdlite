import { describe, it, expect, afterEach } from "vitest";
import { cloneSvgForSnapshot, collectSvgRules, specificity } from "./svg-snapshot.js";

function setStyles(css) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.replaceChildren(style);
}

function mount(css, svgMarkup) {
  setStyles(css);
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

  it("carries the inherited color and font family onto the standalone clone", () => {
    const svg = mount(
      "html, body { color: rgb(1, 2, 3); font-family: Georgia, serif; }",
      '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="currentColor"/></svg>'
    );
    const clone = cloneSvgForSnapshot(svg);
    expect(clone.style.color).toBe("rgb(1, 2, 3)");
    expect(clone.style.fontFamily).toBe("Georgia, serif");
    document.head.innerHTML = "";
    document.body.replaceChildren(clone);
    expect(getComputedStyle(clone.querySelector("path")).color).toBe("rgb(1, 2, 3)");
  });

  it("carries fill and font styles inherited from ancestors outside the SVG", () => {
    const svg = mount(
      "#root { fill: rgb(255, 0, 0); font-size: 24px; font-weight: 700; }",
      '<span style="font-style: italic"><svg xmlns="http://www.w3.org/2000/svg"><text>label</text></svg></span>'
    );
    const clone = cloneSvgForSnapshot(svg);
    expect(clone.style.fill).toBe("rgb(255, 0, 0)");
    expect(clone.style.fontSize).toBe("24px");
    expect(clone.style.fontWeight).toBe("700");
    expect(clone.style.fontStyle).toBe("italic");
  });

  it("carries stroke styles inherited from an inline-styled wrapper outside the SVG", () => {
    const svg = mount(
      "",
      '<div style="stroke: rgb(255, 0, 0); stroke-width: 2px; stroke-dasharray: 4px; fill: none">' +
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg></div>'
    );
    const clone = cloneSvgForSnapshot(svg);
    expect(clone.style.stroke).toBe("rgb(255, 0, 0)");
    expect(clone.style.strokeWidth).toBe("2px");
    expect(clone.style.strokeDasharray).toBe("4px");
  });

  it("keeps the removed ancestor's specificity when rewriting a selector", () => {
    const svg = mount(
      ".frame .series { stroke: red; } .series.selected { stroke: blue; }",
      '<div class="frame"><svg xmlns="http://www.w3.org/2000/svg"><path class="series selected"/></svg></div>'
    );
    const text = cloneSvgForSnapshot(svg).querySelector("style").textContent;
    const rewritten = ".series:where(#mdlite-snapshot-root, #mdlite-snapshot-root *):not(.mdlite-specificity-pad)";
    expect(text).toContain(rewritten);
    expect(specificity(rewritten)).toEqual(specificity(".frame .series"));
    expect(text).toContain(".series.selected");
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
    setStyles(text);
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
    expect(text).toContain("svg:where(#chart, #chart *):not(mdlite-specificity-pad #mdlite-specificity-pad) .series");
    expect(text).toContain("g:where(#chart, #chart *):not(#mdlite-specificity-pad) > .series");
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
    expect(text).toContain(
      ".series:where(#mdlite-snapshot-root, #mdlite-snapshot-root *):not(#mdlite-specificity-pad)"
    );
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

describe("specificity", () => {
  it.each([
    ["*", [0, 0, 0]],
    ["svg g > path", [0, 0, 3]],
    ["#root .series[data-x='a]b']", [1, 2, 0]],
    ["a:hover::before", [0, 1, 2]],
    ["p:first-line", [0, 0, 2]],
    [".a:is(#x, .y) :where(#z) .b", [1, 2, 0]],
    [":not(.a, #b.c)", [1, 1, 0]],
    ["li:nth-child(2n of .item, #first)", [1, 1, 1]],
    ["svg\\:rect.x", [0, 1, 1]],
  ])("%s", (selector, expected) => {
    expect(specificity(selector)).toEqual(expected);
  });
});
