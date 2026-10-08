import { describe, it, expect, vi } from "vitest";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ WebviewWindow: vi.fn() }));

const { parseMarkdown } = await import("./markdown.js");

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
