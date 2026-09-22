import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

async function loadSidebar() {
  vi.resetModules();
  document.body.innerHTML = '<div id="main-content"></div><div id="sidebar-header"></div><div id="sidebar-tree"></div>';
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
