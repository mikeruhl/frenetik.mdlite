import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path, protocol) => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
}));

const { buildRichCopy, toPlainText, MAX_IMAGE_CHARS, MAX_TOTAL_CHARS } = await import("./rich-copy.js");
const { encodeSource } = await import("./rich-blocks.js");
const { imageProxyUrl } = await import("./images.js");

const png = (length = 8) => `data:image/png;base64,${"A".repeat(length)}`;

function fakes(overrides = {}) {
  return {
    rasterizeSvg: vi.fn(async () => ({ src: png(), width: 400, height: 200 })),
    rasterizeImage: vi.fn(async () => png()),
    ...overrides,
  };
}

function mount(html) {
  document.body.innerHTML = `<div id="content">${html}</div>`;
  return document.getElementById("content");
}

function loaded(img, width = 100, height = 50) {
  Object.defineProperty(img, "complete", { value: true });
  Object.defineProperty(img, "naturalWidth", { value: width });
  Object.defineProperty(img, "naturalHeight", { value: height });
  return img;
}

const mermaid = (source = "graph TD; A-->B") =>
  `<div class="mermaid-block" data-mermaid-idx="0" data-mermaid="${encodeSource(source)}">` +
  `<div class="mermaid-rendered"><svg viewBox="0 0 10 10"><g/></svg></div>` +
  `<button class="mermaid-expand" type="button">Open</button></div>`;

describe("buildRichCopy", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("interface chrome", () => {
    it("omits code copy buttons and unwraps the code block wrapper", async () => {
      const root = mount(
        `<div class="code-block-wrapper"><pre><code class="hljs language-js">let x</code></pre>` +
          `<button class="copy-code-btn" type="button"><svg></svg></button></div>`
      );
      const { html } = await buildRichCopy(root, fakes());
      expect(html).toContain("let x");
      expect(html).not.toContain("button");
      expect(html).not.toContain("copy-code-btn");
      expect(html).not.toContain("<svg");
    });

    it("omits search highlight marks but keeps their text", async () => {
      const root = mount(`<p>find <mark class="search-match search-match-current">me</mark> now</p>`);
      const { html, plain } = await buildRichCopy(root, fakes());
      expect(html).not.toContain("<mark");
      expect(plain).toBe("find me now");
    });

    it("omits interactive controls and UI chrome elements", async () => {
      const root = mount(
        `<p>text</p><fieldset><input type="radio"><textarea></textarea><select></select><button>Go</button></fieldset>` +
          `<span data-ui-chrome>badge</span><iframe src="x"></iframe>`
      );
      const { html } = await buildRichCopy(root, fakes());
      for (const tag of ["input", "textarea", "select", "button", "iframe", "badge"]) expect(html).not.toContain(tag);
    });

    it("omits footnote back references and keeps footnote text", async () => {
      const root = mount(
        `<p>a<sup><a data-footnote-ref href="#fn-1" id="fnref-1">1</a></sup></p>` +
          `<section class="footnotes"><ol><li id="fn-1"><p>note <a data-footnote-backref href="#fnref-1">\u21a9</a></p></li></ol></section>`
      );
      const { html } = await buildRichCopy(root, fakes());
      expect(html).toContain("note");
      expect(html).not.toContain("\u21a9");
      expect(html).not.toContain('href="#');
    });

    it("does not modify the live document", async () => {
      const root = mount(`${mermaid()}<p>find <mark class="search-match">me</mark></p><img src="a.png" alt="a">`);
      loaded(root.querySelector("img"));
      const before = root.innerHTML;
      await buildRichCopy(root, fakes());
      expect(root.innerHTML).toBe(before);
    });
  });

  describe("diagrams and charts", () => {
    it("embeds a rendered diagram as a PNG image with no inline SVG", async () => {
      const root = mount(mermaid());
      const f = fakes();
      const { html, omitted } = await buildRichCopy(root, f);
      expect(f.rasterizeSvg).toHaveBeenCalledWith(root.querySelector(".mermaid-rendered svg"));
      expect(html).toContain('<img src="data:image/png;base64,');
      expect(html).toContain('width="400"');
      expect(html).toContain('height="200"');
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("mermaid-expand");
      expect(omitted).toBe(0);
    });

    it("embeds a rendered chart as a PNG image", async () => {
      const root = mount(
        `<div class="chart-block" data-chart="${encodeSource("{}")}"><div class="chart-rendered"><svg width="10" height="10"></svg></div></div>`
      );
      const { html, omitted } = await buildRichCopy(root, fakes());
      expect(html).toContain("data:image/png;base64,");
      expect(html).not.toContain("<svg");
      expect(omitted).toBe(0);
    });

    it("scales wide diagrams down to the display width, keeping the aspect ratio", async () => {
      const root = mount(mermaid());
      const f = fakes({ rasterizeSvg: vi.fn(async () => ({ src: png(), width: 1440, height: 720 })) });
      const { html } = await buildRichCopy(root, f);
      expect(html).toContain('width="720"');
      expect(html).toContain('height="360"');
    });

    it("replaces one failed diagram by its source and still copies the rest", async () => {
      const root = mount(`<p>before</p>${mermaid("graph A")}${mermaid("graph B")}<p>after</p>`);
      const f = fakes({
        rasterizeSvg: vi
          .fn()
          .mockRejectedValueOnce(new Error("tainted"))
          .mockResolvedValueOnce({ src: png(), width: 10, height: 10 }),
      });
      const { html, plain, omitted } = await buildRichCopy(root, f);
      expect(omitted).toBe(1);
      expect(plain).toContain("graph A");
      expect(plain).not.toContain("graph B");
      expect(html).toContain("data:image/png;base64,");
      expect(plain).toContain("before");
      expect(plain).toContain("after");
    });

    it("replaces a block that never rendered by its source", async () => {
      const root = mount(
        `<div class="mermaid-block" data-mermaid="${encodeSource("graph X")}"><div class="mermaid-rendered"></div></div>`
      );
      const f = fakes();
      const { plain, omitted } = await buildRichCopy(root, f);
      expect(f.rasterizeSvg).not.toHaveBeenCalled();
      expect(plain).toBe("graph X");
      expect(omitted).toBe(1);
    });

    it("replaces a block with malformed source by an empty fallback instead of failing", async () => {
      const root = mount(`<p>before</p><div class="mermaid-block" data-mermaid="%%%"></div><p>after</p>`);
      const { plain, omitted } = await buildRichCopy(root, fakes());
      expect(plain).toBe("before\n\nafter");
      expect(omitted).toBe(1);
    });

    it("counts a running Live Block without a snapshot as replaced", async () => {
      const root = mount(
        `<div class="live-block" data-live="x" data-live-state="running"><pre class="live-source"><code>src</code></pre></div>` +
          `<div class="live-block" data-live="y" data-live-state="source"><pre class="live-source"><code>src</code></pre></div>`
      );
      const { omitted } = await buildRichCopy(root, fakes());
      expect(omitted).toBe(1);
    });

    it("replaces a diagram that would exceed the size cap by its source", async () => {
      const root = mount(mermaid("graph BIG"));
      const f = fakes({ rasterizeSvg: vi.fn(async () => ({ src: png(MAX_IMAGE_CHARS), width: 10, height: 10 })) });
      const { html, plain, omitted } = await buildRichCopy(root, f);
      expect(omitted).toBe(1);
      expect(plain).toBe("graph BIG");
      expect(html).not.toContain("data:image");
    });

    it("embeds a Live Block snapshot and drops its toolbar and source", async () => {
      const root = mount(
        `<div class="live-block" data-live="x"><div class="live-toolbar"><button class="live-run">Stop</button></div>` +
          `<iframe class="live-frame"></iframe><pre class="live-source"><code>src</code></pre>` +
          `<img class="live-snapshot" alt="Live Block output" src="data:image/png;base64,AAAA"></div>`
      );
      loaded(root.querySelector(".live-snapshot"), 300, 100);
      const { html, plain } = await buildRichCopy(root, fakes());
      expect(html).toContain("data:image/png;base64,");
      expect(html).not.toContain("iframe");
      expect(plain).not.toContain("src");
    });

    it("decodes a Live Block snapshot that has not loaded before rasterizing it", async () => {
      const root = mount(
        `<div class="live-block" data-live="x"><img class="live-snapshot" alt="Live Block output" src="data:image/png;base64,AAAA"></div>`
      );
      const snapshot = root.querySelector(".live-snapshot");
      snapshot.decode = vi.fn(async () => loaded(snapshot, 300, 100));
      const f = fakes();
      const { html, omitted } = await buildRichCopy(root, f);
      expect(snapshot.decode).toHaveBeenCalled();
      expect(f.rasterizeImage).toHaveBeenCalledWith(snapshot);
      expect(html).toContain('width="300"');
      expect(omitted).toBe(0);
    });

    it("pairs blocks with the document captured at the start when the content is replaced mid copy", async () => {
      const root = mount(
        `${mermaid("graph A")}<div class="chart-block" data-chart="${encodeSource("{}")}"><div class="chart-rendered"><svg id="old-chart"></svg></div></div>`
      );
      const oldChart = root.querySelector("#old-chart");
      const f = fakes({
        rasterizeSvg: vi.fn(async () => {
          root.innerHTML = `<div class="chart-block" data-chart="${encodeSource("{}")}"><div class="chart-rendered"><svg id="new-chart"></svg></div></div>`;
          return { src: png(), width: 10, height: 10 };
        }),
      });
      const { omitted } = await buildRichCopy(root, f);
      expect(f.rasterizeSvg).toHaveBeenLastCalledWith(oldChart);
      expect(omitted).toBe(0);
    });
  });

  describe("images", () => {
    it("embeds a loaded local image as a data URI and leaves no local URL", async () => {
      const root = mount(`<img src="C:/docs/pic.png" alt="pic">`);
      loaded(root.querySelector("img"));
      const f = fakes();
      const { html, omitted } = await buildRichCopy(root, f);
      expect(f.rasterizeImage).toHaveBeenCalled();
      expect(html).toContain('src="data:image/png;base64,');
      expect(html).toContain('alt="pic"');
      expect(html).not.toMatch(/file:|asset:|C:\/docs/);
      expect(omitted).toBe(0);
    });

    it("sizes an image by its displayed dimensions rather than its intrinsic size", async () => {
      const root = mount(`<img src="C:/docs/big.png" alt="big" width="100" height="50">`);
      loaded(root.querySelector("img"), 1000, 500);
      const { html } = await buildRichCopy(root, fakes());
      expect(html).toContain('width="100"');
      expect(html).toContain('height="50"');
    });

    it("keeps an existing PNG data URI without redrawing it", async () => {
      const root = mount(`<img src="${png(12)}" alt="inline">`);
      loaded(root.querySelector("img"));
      const f = fakes();
      const { html } = await buildRichCopy(root, f);
      expect(f.rasterizeImage).not.toHaveBeenCalled();
      expect(html).toContain(png(12));
    });

    it("replaces a local image that has not loaded by its alt text", async () => {
      const root = mount(`<p><img src="missing.png" alt="missing pic"></p>`);
      const { html, plain, omitted } = await buildRichCopy(root, fakes());
      expect(html).not.toContain("<img");
      expect(html).toContain("missing pic");
      expect(plain).toBe("missing pic");
      expect(omitted).toBe(1);
    });

    it("replaces a local image that cannot be redrawn by its alt text", async () => {
      const root = mount(`<img src="tainted.png" alt="tainted">`);
      loaded(root.querySelector("img"));
      const f = fakes({ rasterizeImage: vi.fn().mockRejectedValue(new Error("SecurityError")) });
      const { html, omitted } = await buildRichCopy(root, f);
      expect(html).toContain("tainted");
      expect(html).not.toContain("<img");
      expect(omitted).toBe(1);
    });

    it("replaces a local image over the size cap by its alt text", async () => {
      const root = mount(`<img src="huge.png" alt="huge">`);
      loaded(root.querySelector("img"));
      const f = fakes({ rasterizeImage: vi.fn(async () => png(MAX_IMAGE_CHARS)) });
      const { html, omitted } = await buildRichCopy(root, f);
      expect(html).not.toContain("<img");
      expect(html).toContain("huge");
      expect(omitted).toBe(1);
    });

    it("stops embedding once the total payload budget is spent", async () => {
      const count = Math.ceil(MAX_TOTAL_CHARS / (MAX_IMAGE_CHARS - 100)) + 1;
      const root = mount(Array.from({ length: count }, (_, i) => `<img src="p${i}.png" alt="p${i}">`).join(""));
      root.querySelectorAll("img").forEach((img) => loaded(img));
      const f = fakes({ rasterizeImage: vi.fn(async () => png(MAX_IMAGE_CHARS - 100)) });
      const { omitted } = await buildRichCopy(root, f);
      expect(omitted).toBeGreaterThan(0);
      expect(omitted).toBeLessThan(count);
    });

    it("keeps the remote URL of an allowed remote image instead of the app proxy URL", async () => {
      const root = mount(`<img src="${imageProxyUrl("https://example.com/a.png")}" alt="remote">`);
      loaded(root.querySelector("img"));
      const f = fakes();
      const { html, omitted } = await buildRichCopy(root, f);
      expect(html).toContain('src="https://example.com/a.png"');
      expect(html).not.toContain("mdimg");
      expect(html).not.toContain("localhost");
      expect(f.rasterizeImage).not.toHaveBeenCalled();
      expect(omitted).toBe(0);
    });

    it("replaces a blocked remote image placeholder by its alt text", async () => {
      const root = mount(
        `<p><span class="remote-image-placeholder" data-remote-src="https://x.test/a.png" data-alt="logo">` +
          `<span class="remote-image-alt">logo</span><span class="remote-image-host">x.test</span>` +
          `<span class="remote-image-actions"><button>Load once</button></span></span></p>`
      );
      const { html, plain, omitted } = await buildRichCopy(root, fakes());
      expect(plain).toBe("logo");
      expect(html).not.toContain("x.test");
      expect(html).not.toContain("Load once");
      expect(omitted).toBe(1);
    });

    it("falls back to a generic label when a placeholder has no alt text", async () => {
      const root = mount(
        `<span class="remote-image-placeholder" data-remote-src="https://x.test/a.png" data-alt="">` +
          `<span class="remote-image-alt">Image</span></span>`
      );
      const { plain } = await buildRichCopy(root, fakes());
      expect(plain).toBe("Image");
    });
  });

  describe("formulas", () => {
    it("replaces rendered math by its TeX source", async () => {
      const root = mount(
        `<p>inline <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow>` +
          `<annotation encoding="application/x-tex">x^2</annotation></semantics></math></span>` +
          `<span class="katex-html" aria-hidden="true">x2</span></span></p>`
      );
      const { html, plain, omitted } = await buildRichCopy(root, fakes());
      expect(plain).toBe("inline x^2");
      expect(html).not.toContain("katex");
      expect(omitted).toBe(1);
    });
  });

  describe("fixed light styling", () => {
    it("inlines styles and references no theme variables or classes", async () => {
      document.documentElement.style.setProperty("--theme-bg", "#000");
      document.documentElement.style.setProperty("--mdlite-fg", "#fff");
      const root = mount(
        `<h1 id="a">Title</h1><p>text <a href="https://example.com">link</a></p><blockquote><p>q</p></blockquote>` +
          `<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>` +
          `<pre><code class="hljs language-js"><span class="hljs-keyword">const</span> x</code></pre>` +
          `<div class="markdown-alert markdown-alert-warning"><p class="markdown-alert-title">Warning</p><p>careful</p></div>`
      );
      const { html } = await buildRichCopy(root, fakes());
      expect(html).not.toMatch(/var\(|--theme|--mdlite|class=|id=|<style|<link/);
      expect(html).toMatch(/<h1 style="[^"]*font-size:2em/);
      expect(html).toMatch(/<th[^>]*style="[^"]*background-color:#f6f8fa/);
      expect(html).toMatch(/<blockquote[^>]*style="[^"]*border-left:0\.25em solid #d1d9e0/);
      expect(html).toMatch(/<a[^>]*href="https:\/\/example\.com"[^>]*style="[^"]*color:#0969da/);
      expect(html).toMatch(/<div style="[^"]*border-left-color:#9a6700/);
    });

    it("keeps code syntax coloring as inline colors", async () => {
      const root = mount(
        `<pre><code class="hljs language-js"><span class="hljs-keyword">const</span> <span class="hljs-string">"a"</span></code></pre>`
      );
      const { html } = await buildRichCopy(root, fakes());
      expect(html).toMatch(/<span style="[^"]*color:#cf222e[^"]*">const<\/span>/);
      expect(html).toMatch(/<span style="[^"]*color:#0a3069[^"]*">"a"<\/span>/);
    });

    it("produces identical output regardless of the active theme", async () => {
      const markup =
        `<h2>T</h2><p>x</p><pre><code class="hljs"><span class="hljs-keyword">if</span></code></pre>` +
        `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">Note</p></div>`;
      const outputs = [];
      for (const [bg, fg, cls] of [
        ["#ffffff", "#24292f", "theme-github"],
        ["#0d1117", "#e6edf3", "theme-github-dark"],
        ["#fbf1c7", "#3c3836", "theme-retro"],
      ]) {
        document.documentElement.style.setProperty("--theme-bg", bg);
        document.documentElement.style.setProperty("--theme-fg", fg);
        document.body.className = cls;
        outputs.push((await buildRichCopy(mount(markup), fakes())).html);
      }
      expect(outputs[1]).toBe(outputs[0]);
      expect(outputs[2]).toBe(outputs[0]);
      document.body.className = "";
    });
  });

  describe("sanitization", () => {
    it("removes scripts, event handlers, and script URLs", async () => {
      const root = mount(
        `<p>ok</p><script>alert(1)</script><p onclick="x()">c</p><img src="x" alt="i" onerror="alert(1)">` +
          `<a href="javascript:alert(1)">bad</a><a href="https://example.com" onmouseover="y()">good</a>`
      );
      loaded(root.querySelector("img"));
      const { html } = await buildRichCopy(root, fakes());
      expect(html).not.toMatch(/<script|onclick|onerror|onmouseover|javascript:|alert\(/);
      expect(html).toContain("good");
      expect(html).toContain('href="https://example.com"');
    });

    it("turns relative, local, and in-page links into plain text", async () => {
      const root = mount(
        `<p><a href="other.md">rel</a> <a href="#sec">anchor</a> <a href="file:///c:/x">file</a> ` +
          `<a href="mailto:a@b.co">mail</a></p>`
      );
      const { html, plain } = await buildRichCopy(root, fakes());
      expect(plain).toBe("rel anchor file mail");
      expect(html).not.toMatch(/other\.md|#sec|file:/);
      expect(html).toContain('href="mailto:a@b.co"');
    });
  });

  describe("task lists", () => {
    it("shows checkbox state as characters", async () => {
      const root = mount(
        `<ul><li><input type="checkbox" disabled checked> done</li><li><input type="checkbox" disabled> todo</li></ul>`
      );
      const { html, plain } = await buildRichCopy(root, fakes());
      expect(html).not.toContain("<input");
      expect(plain).toBe("- \u2611 done\n- \u2610 todo");
    });
  });
});

describe("toPlainText", () => {
  it("separates blocks, numbers lists, and tabs table cells without tags", () => {
    const root = mount(
      `<h1>Title</h1><p>one <em>two</em></p><ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul>` +
        `<ol start="3"><li>x</li><li>y</li></ol>` +
        `<table><tr><th>h1</th><th>h2</th></tr><tr><td>c1</td><td>c2</td></tr></table>` +
        `<pre>line1\n  line2</pre><p>a<br>b</p><img alt="pic" src="x">`
    );
    expect(toPlainText(root)).toBe(
      [
        "Title",
        "",
        "one two",
        "",
        "- a",
        "- nested",
        "- b",
        "",
        "3. x",
        "4. y",
        "",
        "h1\th2",
        "c1\tc2",
        "",
        "line1",
        "  line2",
        "",
        "a",
        "b",
        "",
        "pic",
      ].join("\n")
    );
  });

  it("numbers an ordered list that starts at zero from zero", () => {
    const root = mount(`<ol start="0"><li>a</li><li>b</li></ol>`);
    expect(toPlainText(root)).toBe("0. a\n1. b");
  });

  it("keeps the indentation of a leading code block", () => {
    const root = mount(`<pre>    foo()\n    bar()</pre>`);
    expect(toPlainText(root)).toBe("    foo()\n    bar()");
  });

  it("ignores whitespace-only text between blocks", () => {
    const root = mount("<p>one</p>\n<p>two</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(toPlainText(root)).toBe("one\n\ntwo\n\n- a\n- b");
  });

  it("keeps the list marker on the first paragraph of a loose list item", () => {
    const root = mount("<ul>\n<li><p>alpha</p>\n</li>\n<li><p>beta</p>\n<p>more</p>\n</li>\n</ul>");
    expect(toPlainText(root)).toBe("- alpha\n- beta\n\nmore");
  });
});
