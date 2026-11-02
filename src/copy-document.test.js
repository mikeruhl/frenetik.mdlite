import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path, protocol) => `http://${protocol}.localhost/${path}` }));

const { copyMarkdown, copyRichText } = await import("./copy-document.js");

function deps(overrides = {}) {
  return { invoke: vi.fn().mockResolvedValue(true), notify: vi.fn(), report: vi.fn(), ...overrides };
}

describe("copyMarkdown", () => {
  it.each([
    ["frontmatter and trailing newline", "---\ntitle: x\n---\n\n# Hi\n"],
    ["no trailing newline", "# Hi"],
    ["CRLF line endings", "# Hi\r\n\r\ntext\r\n"],
  ])("sends the source verbatim: %s", async (_, source) => {
    const d = deps();
    await copyMarkdown({ source, ...d });
    expect(d.invoke).toHaveBeenCalledWith("copy_document_markdown", { markdown: source });
  });

  it("shows the success toast", async () => {
    const d = deps();
    await copyMarkdown({ source: "# Hi", ...d });
    expect(d.notify).toHaveBeenCalledWith("Markdown copied");
    expect(d.report).not.toHaveBeenCalled();
  });

  it("shows no toast when nothing was written", async () => {
    const d = deps({ invoke: vi.fn().mockResolvedValue(false) });
    await copyMarkdown({ source: "", ...d });
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });

  it("reports a clipboard failure without a success toast", async () => {
    const d = deps({ invoke: vi.fn().mockRejectedValue("busy") });
    await copyMarkdown({ source: "# Hi", ...d });
    expect(d.report).toHaveBeenCalledWith("busy");
    expect(d.notify).not.toHaveBeenCalled();
  });
});

describe("copyRichText", () => {
  const root = { id: "root" };
  const build = (omitted = 0) => vi.fn().mockResolvedValue({ html: "<p>Hi</p>", plain: "Hi", omitted });

  it("builds from the root after rich blocks settle and sends html with the plain text alternative", async () => {
    const order = [];
    const d = deps();
    const builder = vi.fn(async () => {
      order.push("build");
      return { html: "<p>Hi</p>", plain: "Hi", omitted: 0 };
    });
    await copyRichText({
      root,
      ready: async () => {
        order.push("ready");
        return true;
      },
      build: builder,
      ...d,
    });
    expect(order).toEqual(["ready", "build"]);
    expect(builder).toHaveBeenCalledWith(root);
    expect(d.invoke).toHaveBeenCalledWith("copy_document_rich", { html: "<p>Hi</p>", plain: "Hi" });
    expect(d.notify).toHaveBeenCalledWith("Rich text copied");
  });

  it("mentions replaced content in the toast", async () => {
    const d = deps();
    await copyRichText({ root, ready: async () => true, build: build(2), ...d });
    expect(d.notify).toHaveBeenCalledWith("Rich text copied (some content replaced)");
  });

  it("mentions incomplete diagrams in the toast", async () => {
    const d = deps();
    await copyRichText({ root, ready: async () => false, build: build(0), ...d });
    expect(d.notify).toHaveBeenCalledWith("Rich text copied (diagrams may be incomplete)");
  });

  it("shows no toast when nothing was written", async () => {
    const d = deps({ invoke: vi.fn().mockResolvedValue(false) });
    await copyRichText({ root, ready: async () => true, build: build(), ...d });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("reports a clipboard failure without a success toast", async () => {
    const d = deps({ invoke: vi.fn().mockRejectedValue("busy") });
    await copyRichText({ root, ready: async () => true, build: build(), ...d });
    expect(d.report).toHaveBeenCalledWith("busy");
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("reports a build failure without touching the clipboard", async () => {
    const d = deps();
    const failure = new Error("boom");
    await copyRichText({ root, ready: async () => true, build: vi.fn().mockRejectedValue(failure), ...d });
    expect(d.report).toHaveBeenCalledWith(failure);
    expect(d.invoke).not.toHaveBeenCalled();
  });
});
