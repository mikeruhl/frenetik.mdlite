import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invoke(...args) }));

const crumb = (name, path = `/${name}`) => ({ name, path });
const data = (folderNames, fileName = "file.md") => ({
  root: crumb("root", "/root"),
  folders: folderNames.map((n) => crumb(n, `/root/${n}`)),
  file: crumb(fileName, `/root/${fileName}`),
});

async function load() {
  vi.resetModules();
  document.body.innerHTML = '<nav id="breadcrumb" hidden></nav>';
  return import("./breadcrumb.js");
}

const nav = () => document.getElementById("breadcrumb");
const labels = () => Array.from(nav().querySelectorAll("li")).map((li) => li.textContent);

beforeEach(() => {
  invoke.mockReset();
});

describe("buildSegments", () => {
  it("shows every segment for four or fewer", async () => {
    const { buildSegments } = await load();
    const segments = buildSegments(data(["a", "b"]));
    expect(segments.map((s) => s.kind)).toEqual(["folder", "folder", "folder", "file"]);
    expect(segments.map((s) => s.name)).toEqual(["root", "a", "b", "file.md"]);
  });

  it("keeps a root file as root plus file", async () => {
    const { buildSegments } = await load();
    expect(buildSegments(data([])).map((s) => s.name)).toEqual(["root", "file.md"]);
  });

  it("truncates at five segments", async () => {
    const { buildSegments } = await load();
    const segments = buildSegments(data(["a", "b", "c"]));
    expect(segments.map((s) => s.kind)).toEqual(["folder", "ellipsis", "folder", "file"]);
    expect(segments[1].hidden).toEqual(["a", "b"]);
    expect(segments[2].name).toBe("c");
  });

  it("lists every omitted folder for a six segment path", async () => {
    const { buildSegments } = await load();
    const segments = buildSegments(data(["a", "b", "c", "d"]));
    expect(segments.map((s) => s.name ?? "…")).toEqual(["root", "…", "d", "file.md"]);
    expect(segments[1].hidden).toEqual(["a", "b", "c"]);
  });
});

describe("renderBreadcrumb", () => {
  it("renders buttons for folders and a non-interactive current file", async () => {
    const { renderBreadcrumb } = await load();
    renderBreadcrumb(nav(), data(["guide"]));

    expect(nav().hidden).toBe(false);
    expect(Array.from(nav().querySelectorAll("button")).map((b) => b.textContent)).toEqual(["root", "guide"]);
    const current = nav().querySelector('[aria-current="page"]');
    expect(current.textContent).toBe("file.md");
    expect(current.querySelector("svg")).not.toBeNull();
    expect(current.querySelector("button")).toBeNull();
  });

  it("puts omitted folders in the ellipsis tooltip", async () => {
    const { renderBreadcrumb } = await load();
    renderBreadcrumb(nav(), data(["a", "b", "c", "d"]));

    expect(nav().querySelector(".breadcrumb-ellipsis").title).toBe("a/b/c");
    expect(labels()).toEqual(["root", "…", "d", "file.md"]);
  });

  it("renders names containing markup as literal text", async () => {
    const { renderBreadcrumb } = await load();
    const evil = "<img src=x onerror=alert(1)>";
    renderBreadcrumb(nav(), data([evil], `${evil}.md`));

    expect(nav().querySelector("img")).toBeNull();
    expect(nav().textContent).toContain(evil);
  });

  it("reveals the clicked folder", async () => {
    const { renderBreadcrumb, initBreadcrumb } = await load();
    const reveal = vi.fn();
    initBreadcrumb(reveal);
    renderBreadcrumb(nav(), data(["guide"]));

    nav().querySelector('button[data-path="/root/guide"]').click();

    expect(reveal).toHaveBeenCalledWith("/root/guide");
  });

  it("reveals the root from the first segment", async () => {
    const { renderBreadcrumb, initBreadcrumb } = await load();
    const reveal = vi.fn();
    initBreadcrumb(reveal);
    renderBreadcrumb(nav(), data(["guide"]));

    nav().querySelector("button").click();

    expect(reveal).toHaveBeenCalledWith("/root");
  });
});

describe("updateBreadcrumb", () => {
  it("fetches and shows the breadcrumb for a path", async () => {
    const { updateBreadcrumb } = await load();
    invoke.mockResolvedValue(data(["guide"]));

    await updateBreadcrumb("/root/guide/file.md");

    expect(invoke).toHaveBeenCalledWith("get_breadcrumb", { path: "/root/guide/file.md" });
    expect(labels()).toEqual(["root", "guide", "file.md"]);
  });

  it("hides the bar when no file is displayed", async () => {
    const { updateBreadcrumb, renderBreadcrumb } = await load();
    renderBreadcrumb(nav(), data([]));

    await updateBreadcrumb(null);

    expect(nav().hidden).toBe(true);
    expect(nav().children).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("hides the bar when the lookup fails", async () => {
    const { updateBreadcrumb, renderBreadcrumb } = await load();
    renderBreadcrumb(nav(), data([]));
    invoke.mockRejectedValue("Path is outside the opened folder");

    await updateBreadcrumb("/elsewhere/a.md");

    expect(nav().hidden).toBe(true);
  });

  it("ignores a stale result when a newer path was requested", async () => {
    const { updateBreadcrumb } = await load();
    let resolveFirst;
    invoke.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    invoke.mockResolvedValueOnce(data([], "second.md"));

    const first = updateBreadcrumb("/root/first.md");
    await updateBreadcrumb("/root/second.md");
    resolveFirst(data([], "first.md"));
    await first;

    expect(labels()).toEqual(["root", "second.md"]);
  });

  it("ignores an in-flight result after the bar is cleared", async () => {
    const { updateBreadcrumb, clearBreadcrumb } = await load();
    let resolveFirst;
    invoke.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));

    const pending = updateBreadcrumb("/root/first.md");
    clearBreadcrumb();
    resolveFirst(data([], "first.md"));
    await pending;

    expect(nav().hidden).toBe(true);
    expect(nav().children).toHaveLength(0);
  });
});
