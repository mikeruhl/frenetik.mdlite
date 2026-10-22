import { describe, it, expect, vi, beforeEach } from "vitest";

const imported = { vega: false };
vi.mock("vega", async (importOriginal) => {
  imported.vega = true;
  return importOriginal();
});
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path, protocol) => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
}));

const contentEl = document.createElement("div");
contentEl.id = "content";
document.body.appendChild(contentEl);

const { parseMarkdown, resetRenderState, renderAllRichBlocks, setRenderTheme } = await import("./markdown.js");

async function show(markdown) {
  resetRenderState();
  contentEl.innerHTML = parseMarkdown(markdown);
  await renderAllRichBlocks();
  return contentEl;
}

function chart(spec) {
  return "```vega-lite\n" + (typeof spec === "string" ? spec : JSON.stringify(spec)) + "\n```";
}

const bar = {
  data: {
    values: [
      { a: "A", b: 28 },
      { a: "B", b: 55 },
    ],
  },
  mark: "bar",
  encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } },
};

describe("charts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not load the chart engine for a Document without Charts", async () => {
    await show("# Plain\n\n```js\nconst a = 1;\n```");
    expect(imported.vega).toBe(false);
  });

  it("renders a valid bar chart as SVG in place of the code block", async () => {
    const root = await show(chart(bar));
    expect(imported.vega).toBe(true);
    expect(root.querySelector(".chart-block pre")).toBeNull();
    expect(root.querySelector(".chart-rendered svg")).not.toBeNull();
    expect(root.querySelectorAll(".chart-rendered svg path, .chart-rendered svg rect").length).toBeGreaterThan(0);
  });

  it("refuses a remote data URL without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const root = await show(chart({ ...bar, data: { url: "https://example.com/d.csv" } }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(root.querySelector(".chart-block .rich-block-error").textContent).toMatch(/inline data only/);
  });

  it("shows an error for invalid JSON and still renders the rest of the Document", async () => {
    const root = await show("Before\n\n" + chart("{ not json") + "\n\nAfter");
    expect(root.querySelector(".rich-block-error").textContent).toMatch(/invalid JSON/);
    expect(root.textContent).toContain("After");
  });

  it("shows an error for an invalid specification", async () => {
    const root = await show(chart({ data: { values: [] }, mark: "no-such-mark" }));
    expect(root.querySelector(".rich-block-error")).not.toBeNull();
  });

  it("drops href encodings so marks are not links", async () => {
    const values = [{ a: "A", b: 1, u: "https://example.com" }];
    const root = await show(chart({ ...bar, data: { values }, encoding: { ...bar.encoding, href: { field: "u" } } }));
    expect(root.querySelector(".chart-rendered svg")).not.toBeNull();
    expect(root.querySelector(".chart-rendered [href], .chart-rendered a")).toBeNull();
  });

  it("keeps inline data fields named href and url", async () => {
    const values = [
      { href: "A", url: "https://example.com", b: 28 },
      { href: "B", url: "https://example.org", b: 55 },
    ];
    const encoding = { x: { field: "href", type: "nominal" }, y: { field: "b", type: "quantitative" } };
    const root = await show(chart({ data: { values }, mark: "bar", encoding }));
    expect(root.querySelector(".rich-block-error")).toBeNull();
    expect(root.querySelector(".chart-rendered svg").textContent).toContain("A");
  });

  it("finalizes Chart views when render state resets and before re-rendering", async () => {
    const { View } = await import("vega");
    const finalize = vi.spyOn(View.prototype, "finalize");
    await show(chart(bar) + "\n\n" + chart(bar));
    finalize.mockClear();
    await setRenderTheme("github");
    await setRenderTheme("github-dark");
    expect(finalize).toHaveBeenCalledTimes(2);
    resetRenderState();
    expect(finalize).toHaveBeenCalledTimes(4);
    resetRenderState();
    expect(finalize).toHaveBeenCalledTimes(4);
  });

  it("re-renders Charts when the theme changes", async () => {
    const root = await show(chart(bar));
    const before = root.querySelector(".chart-rendered svg");
    await setRenderTheme("github");
    await setRenderTheme("github-dark");
    expect(root.querySelector(".chart-rendered svg")).not.toBe(before);
  });
});
