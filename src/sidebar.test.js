import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

async function loadSidebar() {
  vi.resetModules();
  document.body.innerHTML =
    '<div id="main-content"></div><div id="sidebar-header"><span id="sidebar-title"></span></div><div id="sidebar-tree"></div>';
  return import("./sidebar.js");
}

const dir = (name, path) => ({ name, path });
const added = (path, name, pathChain) => ({ path, name, exists: true, path_chain: pathChain });
const folderEl = (path) => document.querySelector(`.tree-folder[data-path="${path}"]`);
const marked = (path) => folderEl(path).classList.contains("has-new");

describe("new-file marker on collapsed folders", () => {
  it("marks a collapsed folder when a watcher add lands inside it", async () => {
    const sidebar = await loadSidebar();
    sidebar.handleScanFiles([dir("docs", "/root/docs")], [{ name: "a.md", path: "/root/docs/a.md" }]);
    expect(marked("/root/docs")).toBe(false);

    sidebar.applyFolderChanges([added("/root/docs/new.md", "new.md", [dir("docs", "/root/docs")])]);

    expect(marked("/root/docs")).toBe(true);
  });

  it("clears the marker when the folder is expanded", async () => {
    const sidebar = await loadSidebar();
    sidebar.applyFolderChanges([added("/root/docs/new.md", "new.md", [dir("docs", "/root/docs")])]);
    expect(marked("/root/docs")).toBe(true);

    folderEl("/root/docs").click();

    expect(marked("/root/docs")).toBe(false);
  });

  it("marks nothing for a file added at the folder root", async () => {
    const sidebar = await loadSidebar();

    sidebar.applyFolderChanges([added("/root/new.md", "new.md", [])]);

    expect(document.querySelectorAll(".has-new")).toHaveLength(0);
    expect(document.querySelector('.tree-file[data-path="/root/new.md"]')).not.toBeNull();
  });

  it("does not mark a folder that is already expanded", async () => {
    const sidebar = await loadSidebar();
    sidebar.handleScanFiles([dir("docs", "/root/docs")], [{ name: "a.md", path: "/root/docs/a.md" }]);
    folderEl("/root/docs").click();

    sidebar.applyFolderChanges([added("/root/docs/new.md", "new.md", [dir("docs", "/root/docs")])]);

    expect(marked("/root/docs")).toBe(false);
  });

  it("marks every collapsed ancestor of a nested add", async () => {
    const sidebar = await loadSidebar();

    sidebar.applyFolderChanges([added("/root/a/b/new.md", "new.md", [dir("a", "/root/a"), dir("b", "/root/a/b")])]);

    expect(marked("/root/a")).toBe(true);
    expect(marked("/root/a/b")).toBe(true);
  });

  it("keeps a descendant marked after expanding its parent", async () => {
    const sidebar = await loadSidebar();
    sidebar.applyFolderChanges([added("/root/a/b/new.md", "new.md", [dir("a", "/root/a"), dir("b", "/root/a/b")])]);

    folderEl("/root/a").click();

    expect(marked("/root/a")).toBe(false);
    expect(marked("/root/a/b")).toBe(true);
  });

  // Guards against "fixing" the scan/watcher race by marking in the
  // already-present branch: the backend sends exists:true for edits too.
  it("does not mark when an existing file is merely modified", async () => {
    const sidebar = await loadSidebar();
    sidebar.handleScanFiles([dir("docs", "/root/docs")], [{ name: "e.md", path: "/root/docs/e.md" }]);

    sidebar.applyFolderChanges([added("/root/docs/e.md", "e.md", [dir("docs", "/root/docs")])]);

    expect(marked("/root/docs")).toBe(false);
  });

  it("hides the decorative marker from assistive technologies", async () => {
    const sidebar = await loadSidebar();
    sidebar.applyFolderChanges([added("/root/docs/new.md", "new.md", [dir("docs", "/root/docs")])]);

    const dot = folderEl("/root/docs").querySelector(".tree-new-dot");

    expect(dot.getAttribute("aria-hidden")).toBe("true");
  });

  it("never marks folders discovered by the initial scan", async () => {
    const sidebar = await loadSidebar();

    sidebar.handleScanFiles([dir("a", "/root/a"), dir("b", "/root/a/b")], [{ name: "a.md", path: "/root/a/b/a.md" }]);

    expect(document.querySelectorAll(".has-new")).toHaveLength(0);
  });
});

describe("link navigation", () => {
  async function loadWithFile(path) {
    const sidebar = await loadSidebar();
    const { invoke } = await import("@tauri-apps/api/core");
    invoke.mockReset();
    const render = vi.fn();
    sidebar.initSidebar(render);
    invoke.mockResolvedValue("content");
    await sidebar.navigateToFolderLink(path, "");
    return { sidebar, invoke, render };
  }

  it("revealInTree expands a collapsed ancestor and scrolls to the file", async () => {
    const sidebar = await loadSidebar();
    const { invoke } = await import("@tauri-apps/api/core");
    invoke.mockReset();
    invoke.mockResolvedValue("content");
    sidebar.initSidebar(vi.fn());
    sidebar.handleScanFiles([dir("docs", "/root/docs")], [{ name: "a.md", path: "/root/docs/a.md" }]);
    const row = document.querySelector('.tree-file[data-path="/root/docs/a.md"]');
    row.scrollIntoView = vi.fn();
    const children = row.parentElement;
    expect(children.style.display).toBe("none");

    await sidebar.navigateToFolderLink("/root/docs/a.md", "");

    expect(children.style.display).toBe("block");
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("scrolls to the fragment target after loading", async () => {
    const sidebar = await loadSidebar();
    const { invoke } = await import("@tauri-apps/api/core");
    invoke.mockReset();
    invoke.mockResolvedValue("content");
    sidebar.initSidebar(vi.fn());
    const target = document.createElement("h2");
    target.id = "install";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    await sidebar.navigateToFolderLink("/root/a.md", "install");

    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it("handleScanComplete keeps a hidden current file when it still exists", async () => {
    const { sidebar, invoke, render } = await loadWithFile("/root/hidden.md");
    invoke.mockReset();
    invoke.mockResolvedValueOnce(true);
    render.mockClear();

    await sidebar.handleScanComplete();

    expect(invoke).toHaveBeenCalledWith("file_exists", { path: "/root/hidden.md" });
    expect(sidebar.getCurrentFilePath()).toBe("/root/hidden.md");
    expect(render).not.toHaveBeenCalled();
  });

  it("handleScanComplete blanks the current file when it no longer exists", async () => {
    const { sidebar, invoke, render } = await loadWithFile("/root/gone.md");
    invoke.mockReset();
    invoke.mockResolvedValueOnce(false);
    render.mockClear();

    await sidebar.handleScanComplete();

    expect(sidebar.getCurrentFilePath()).toBeNull();
    expect(render).toHaveBeenCalledWith("");
  });
});
