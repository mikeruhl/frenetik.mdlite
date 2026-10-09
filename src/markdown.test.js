import { describe, it, expect, vi } from "vitest";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ WebviewWindow: vi.fn() }));

const { parseMarkdown, resetMermaidCounter } = await import("./markdown.js");

describe("parseMarkdown sanitization", () => {
  it("keeps id on anchor elements used as question anchors", () => {
    const html = parseMarkdown('<a id="caching-options"></a>\n\n## Caching');
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector("a#caching-options")).not.toBeNull();
  });

  it("strips event handlers from untrusted markup", () => {
    const html = parseMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("onerror");
  });
});

describe("parseMarkdown panel mode", () => {
  it("renders mermaid fences as code without consuming document counters or heading ids", () => {
    const source = "## Intro\n\n```mermaid\ngraph TD; A-->B\n```";
    resetMermaidCounter();
    const panel = document.createElement("div");
    panel.innerHTML = parseMarkdown(source, { panel: true });
    expect(panel.querySelector(".mermaid-block")).toBeNull();
    expect(panel.querySelector("pre > code").textContent).toContain("A-->B");
    expect(panel.querySelector("h2").hasAttribute("id")).toBe(false);

    const doc = document.createElement("div");
    doc.innerHTML = parseMarkdown(source);
    expect(doc.querySelector("h2").id).toBe("intro");
    expect(doc.querySelector(".mermaid-block").dataset.mermaidIdx).toBe("0");
  });
});
