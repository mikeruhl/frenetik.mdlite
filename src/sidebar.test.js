import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: vi.fn() } }));

async function loadSidebar() {
  vi.resetModules();
  document.body.innerHTML =
    '<div id="main-content"></div><div id="toast" hidden></div><div id="sidebar-header"><span id="sidebar-title"></span></div><div id="sidebar-tree"></div>';
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

const fileEl = (path) => document.querySelector(`.tree-file[data-path="${path}"]`);
const childrenOf = (path) => folderEl(path).nextElementSibling;

describe("revealFolder", () => {
  beforeEach(() => {
    window.Element.prototype.scrollIntoView = vi.fn();
  });

  it("expands the folder and every collapsed ancestor", async () => {
    const sidebar = await loadSidebar();
    sidebar.handleScanFiles([dir("a", "/root/a"), dir("b", "/root/a/b")], [{ name: "n.md", path: "/root/a/b/n.md" }]);
    expect(childrenOf("/root/a").style.display).toBe("none");

    sidebar.revealFolder("/root/a/b");

    expect(childrenOf("/root/a").style.display).toBe("block");
    expect(childrenOf("/root/a/b").style.display).toBe("block");
    expect(window.Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("leaves an already expanded folder expanded", async () => {
    const sidebar = await loadSidebar();
    sidebar.handleScanFiles([dir("a", "/root/a")], [{ name: "n.md", path: "/root/a/n.md" }]);
    folderEl("/root/a").click();

    sidebar.revealFolder("/root/a");

    expect(childrenOf("/root/a").style.display).toBe("block");
  });

  it("scrolls the tree to the top for the root", async () => {
    const sidebar = await loadSidebar();
    const tree = document.getElementById("sidebar-tree");
    tree.scrollTop = 80;

    sidebar.revealFolder("/root");

    expect(tree.scrollTop).toBe(0);
  });
});

describe("copyTreePath", () => {
  it("copies and confirms with a toast", async () => {
    const sidebar = await loadSidebar();
    const { invoke } = await import("@tauri-apps/api/core");
    invoke.mockResolvedValue("a/b.md");

    await sidebar.copyTreePath("/root/a/b.md", "relative");

    expect(invoke).toHaveBeenCalledWith("copy_tree_path", { path: "/root/a/b.md", kind: "relative" });
    expect(document.getElementById("toast").textContent).toBe("Path copied");
    expect(document.getElementById("toast").hidden).toBe(false);
  });

  it("alerts and shows no confirmation when the copy fails", async () => {
    const sidebar = await loadSidebar();
    const { invoke } = await import("@tauri-apps/api/core");
    invoke.mockRejectedValue("Path is outside the opened folder");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});

    await sidebar.copyTreePath("/elsewhere/a.md", "full");

    expect(alert).toHaveBeenCalledWith("Could not copy path: Path is outside the opened folder");
    expect(document.getElementById("toast").hidden).toBe(true);
    alert.mockRestore();
  });
});

describe("tree context menu", () => {
  const rightClick = (el) => {
    const event = new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    el.dispatchEvent(event);
    return event;
  };

  it("offers full and relative path copy on a file and suppresses the default menu", async () => {
    const sidebar = await loadSidebar();
    const { Menu } = await import("@tauri-apps/api/menu");
    const { invoke } = await import("@tauri-apps/api/core");
    const popup = vi.fn();
    Menu.new.mockResolvedValue({ popup });
    invoke.mockResolvedValue("copied");
    sidebar.handleScanFiles([dir("docs", "/root/docs")], [{ name: "a.md", path: "/root/docs/a.md" }]);

    const event = rightClick(fileEl("/root/docs/a.md"));
    await vi.waitFor(() => expect(popup).toHaveBeenCalled());

    expect(event.defaultPrevented).toBe(true);
    const { items } = Menu.new.mock.calls[0][0];
    expect(items.map((i) => i.text)).toEqual(["Copy Full Path", "Copy Relative Path"]);
    items[0].action();
    items[1].action();
    expect(invoke).toHaveBeenCalledWith("copy_tree_path", { path: "/root/docs/a.md", kind: "full" });
    expect(invoke).toHaveBeenCalledWith("copy_tree_path", { path: "/root/docs/a.md", kind: "relative" });
  });

  it("offers the same menu on a folder row", async () => {
    const sidebar = await loadSidebar();
    const { Menu } = await import("@tauri-apps/api/menu");
    const popup = vi.fn();
    Menu.new.mockResolvedValue({ popup });
    sidebar.handleScanFiles([dir("docs", "/root/docs")], [{ name: "a.md", path: "/root/docs/a.md" }]);

    rightClick(folderEl("/root/docs"));
    await vi.waitFor(() => expect(popup).toHaveBeenCalled());

    expect(Menu.new).toHaveBeenCalledTimes(1);
  });

  it("does not open a path menu on the sidebar background", async () => {
    await loadSidebar();
    const { Menu } = await import("@tauri-apps/api/menu");

    const event = rightClick(document.getElementById("sidebar-tree"));

    expect(event.defaultPrevented).toBe(false);
    expect(Menu.new).not.toHaveBeenCalled();
  });
});
