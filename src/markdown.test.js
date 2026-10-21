import { describe, it, expect, vi } from "vitest";

const mermaidState = vi.hoisted(() => ({ config: null }));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn((config) => {
      mermaidState.config = config;
    }),
    render: vi.fn(),
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path, protocol) => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ WebviewWindow: vi.fn() }));

const contentEl = document.createElement("div");
contentEl.id = "content";
document.body.appendChild(contentEl);

const { parseMarkdown, resetRenderState, renderAllRichBlocks, setRenderTheme } = await import("./markdown.js");

function render(markdown, options) {
  const container = document.createElement("div");
  container.innerHTML = parseMarkdown(markdown, options);
  return container;
}

describe("parseMarkdown forbidden tags", () => {
  it.each(["style", "form", "input", "button", "select", "textarea", "option"])("removes <%s>", (tag) => {
    const container = render(`<div>x<${tag}>y</${tag}></div>`);
    expect(container.querySelector(tag)).toBeNull();
  });

  it("removes a fake form and all of its controls", () => {
    const container = render('<form><input name="q"><select><option>a</option></select><button>Submit</button></form>');
    expect(container.querySelector("form, input, select, option, button")).toBeNull();
  });

  it("removes style elements so document CSS cannot be injected", () => {
    expect(render("<style>body{display:none}</style>\n\ntext").querySelector("style")).toBeNull();
  });

  it("removes author style attributes outside KaTeX", () => {
    expect(render('<span style="color:red">x</span>').querySelector("[style]")).toBeNull();
  });

  it("keeps task list checkboxes as disabled, attribute-free checkboxes", () => {
    const container = render("- [x] done\n- [ ] todo");
    const boxes = container.querySelectorAll("li > input");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.type).toBe("checkbox");
      expect(box.disabled).toBe(true);
    }
    expect(boxes[0].checked).toBe(true);
  });

  it("removes enabled or named checkboxes from raw HTML", () => {
    expect(render('<input type="checkbox">').querySelector("input")).toBeNull();
    const box = render('<input type="checkbox" disabled name="q" value="1">').querySelector("input");
    expect(box.hasAttribute("name")).toBe(false);
    expect(box.hasAttribute("value")).toBe(false);
  });
});

describe("parseMarkdown class allowlist", () => {
  it("drops mdlite chrome classes from raw HTML", () => {
    const span = render('<span class="question-badge">Q1</span>').querySelector("span");
    expect(span.hasAttribute("class")).toBe(false);
  });

  it("keeps allowed tokens and drops the rest", () => {
    const div = render('<div class="markdown-alert toolbar">x</div>').querySelector("div");
    expect(div.className).toBe("markdown-alert");
  });

  it("preserves classes emitted by the alert, highlight, KaTeX, and footnote renderers", () => {
    const container = render("> [!NOTE]\n> hi\n\n```js\nconst a = 1;\n```\n\n$x^2$\n\nRef[^1]\n\n[^1]: note");
    for (const selector of [
      ".markdown-alert.markdown-alert-note",
      ".markdown-alert-title",
      "svg.octicon",
      "code.hljs.language-js",
      ".hljs-keyword",
      ".katex .katex-html",
      ".katex .mord",
      ".katex .vlist-t",
      "section.footnotes",
      "h2.sr-only",
    ]) {
      expect(container.querySelector(selector), selector).not.toBeNull();
    }
  });
});

describe("parseMarkdown Atlassian-style constructs", () => {
  it.each(["neutral", "info", "success", "warning", "error", "note"])("keeps data-status=%s on mark", (tone) => {
    const mark = render(`<mark data-status="${tone}">DONE</mark>`).querySelector("mark");
    expect(mark.dataset.status).toBe(tone);
  });

  it("drops an unknown data-status but keeps the mark", () => {
    const mark = render('<mark data-status="evil">X</mark>').querySelector("mark");
    expect(mark.textContent).toBe("X");
    expect(mark.hasAttribute("data-status")).toBe(false);
  });

  it("drops data-status on elements other than mark", () => {
    expect(render('<span data-status="info">x</span>').querySelector("[data-status]")).toBeNull();
  });

  it.each(["note", "tip", "important", "warning", "caution"])("keeps the %s alert markup used for Panels", (type) => {
    const container = render(`> [!${type.toUpperCase()}]\n> body`);
    expect(container.querySelector(`.markdown-alert.markdown-alert-${type} .markdown-alert-title`)).not.toBeNull();
  });

  it("keeps details and summary for Expands", () => {
    const details = render("<details><summary>More</summary>\n\nBody\n\n</details>").querySelector("details");
    expect(details.querySelector("summary").textContent).toBe("More");
    expect(details.textContent).toContain("Body");
    expect(details.open).toBe(false);
  });
});

describe("shared DOMPurify instance", () => {
  it("is not altered by document hooks, because Mermaid sanitizes its SVG with it", async () => {
    const { default: DOMPurify } = await import("dompurify");
    parseMarkdown("text");
    const html = DOMPurify.sanitize('<svg><g class="node" style="fill:red"><rect></rect></g></svg>');
    expect(html).toContain('class="node"');
    expect(html).toContain('style="fill:red"');
  });
});

describe("mermaid controls", () => {
  it("emits no button from the sanitizer and adds one Open control after rendering", async () => {
    resetRenderState();
    contentEl.innerHTML = parseMarkdown("```mermaid\ngraph TD; A-->B\n```");
    expect(contentEl.querySelector("button")).toBeNull();

    await renderAllRichBlocks();
    await renderAllRichBlocks();
    const buttons = contentEl.querySelectorAll(".mermaid-block > button.mermaid-expand");
    expect(buttons).toHaveLength(1);
  });

  it("re-renders diagrams with the Mermaid theme that matches the page background", async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.render.mockResolvedValue({ svg: "<svg><g></g></svg>" });
    const switchTo = (themeId, background) => {
      document.body.style.setProperty("--theme-bg", background);
      return setRenderTheme(themeId);
    };
    await switchTo("github", "rgb(255, 255, 255)");
    resetRenderState();
    contentEl.innerHTML = parseMarkdown("```mermaid\ngraph TD; A-->B\n```");
    await renderAllRichBlocks();
    expect(mermaidState.config).toMatchObject({ theme: "default" });
    mermaid.render.mockClear();

    await switchTo("github-dark", "rgb(13, 17, 23)");
    expect(mermaidState.config).toMatchObject({ theme: "dark" });
    expect(mermaid.render).toHaveBeenCalledTimes(1);

    await switchTo("retro", "rgb(34, 34, 34)");
    expect(mermaidState.config).toMatchObject({ theme: "dark" });

    await switchTo("github", "rgb(255, 255, 255)");
    expect(mermaidState.config).toMatchObject({ theme: "default" });
    document.body.style.removeProperty("--theme-bg");
    mermaid.render.mockReset();
  });

  it("keeps Mermaid's error graphic out of the page and shows one error per broken block", async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.render.mockRejectedValue(new Error("Syntax error"));
    resetRenderState();
    contentEl.innerHTML = parseMarkdown("```mermaid\nflowchart TD\n  A -->\n```");

    await renderAllRichBlocks();
    await renderAllRichBlocks();

    expect(mermaidState.config).toMatchObject({ suppressErrorRendering: true });
    expect(contentEl.querySelectorAll(".mermaid-error")).toHaveLength(1);
    mermaid.render.mockReset();
  });
});

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
    resetRenderState();
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

  it("shows Rich Block source as escaped text, not markup", () => {
    const panel = render('```mermaid\ngraph TD; A["<b>x</b>"]\n```', { panel: true });
    expect(panel.querySelector("b")).toBeNull();
    expect(panel.querySelector("pre > code").textContent).toContain("<b>x</b>");
  });
});

describe("parseMarkdown remote images", () => {
  const remote = "![Company logo](https://example.com/a.png)";

  it("replaces a remote image from a host that is not allowed with a placeholder", () => {
    const container = render(remote);
    expect(container.querySelector("img")).toBeNull();
    const placeholder = container.querySelector(".remote-image-placeholder");
    expect(placeholder.dataset.remoteSrc).toBe("https://example.com/a.png");
    expect(placeholder.dataset.alt).toBe("Company logo");
    expect(placeholder.querySelector(".remote-image-alt").textContent).toBe("Company logo");
    expect(placeholder.querySelector(".remote-image-host").textContent).toBe("example.com");
  });

  it("labels a placeholder without alt text generically", () => {
    const container = render('<img src="https://example.com/a.png">');
    expect(container.querySelector(".remote-image-alt").textContent).toBe("Image");
  });

  it("rewrites an allowed host to the proxy URL", () => {
    const img = render(remote, { images: { hosts: ["example.com"] } }).querySelector("img");
    expect(img.getAttribute("src")).toBe("http://mdimg.localhost/?u=https%3A%2F%2Fexample.com%2Fa.png");
    expect(img.alt).toBe("Company logo");
  });

  it("does not imply subdomains of an allowed host", () => {
    const container = render("![x](https://cdn.example.com/a.png)", { images: { hosts: ["example.com"] } });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".remote-image-placeholder")).not.toBeNull();
  });

  it("rewrites a URL allowed once in this session", () => {
    const urls = new Set(["https://example.com/a.png"]);
    expect(render(remote, { images: { urls } }).querySelector("img").getAttribute("src")).toContain("mdimg");
    expect(render("![x](https://example.com/b.png)", { images: { urls } }).querySelector("img")).toBeNull();
  });

  it("treats protocol-relative sources as remote", () => {
    const placeholder = render('<img src="//example.com/a.png">').querySelector(".remote-image-placeholder");
    expect(placeholder.dataset.remoteSrc).toBe("https://example.com/a.png");
  });

  it("leaves local and data images untouched", () => {
    const container = render('![a](images/a.png)\n\n<img src="data:image/png;base64,AAAA">');
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toEqual(["images/a.png", "data:image/png;base64,AAAA"]);
  });

  it("strips srcset so candidates cannot bypass the rewrite", () => {
    const html = parseMarkdown('<img src="images/a.png" srcset="https://example.com/a.png 2x">');
    expect(html).not.toContain("example.com");
  });

  it("removes SVG images that reference a remote host", () => {
    const html = parseMarkdown('<svg><image href="https://example.com/a.png"></image></svg>');
    expect(html).not.toContain("example.com");
  });

  it("does not carry the policy over to the next render", () => {
    render(remote, { images: { hosts: ["example.com"] } });
    expect(render(remote).querySelector("img")).toBeNull();
  });
});
