import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./history.js", () => ({ pushNavigation: vi.fn() }));

async function loadToc() {
  vi.resetModules();
  document.body.className = "";
  document.body.innerHTML = `
    <div id="main-content"><article id="content"><h1 id="a">A</h1><h2 id="b">B</h2></article></div>
    <aside id="toc-panel"><button id="toc-close"></button><div id="toc-tree"></div></aside>`;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const toc = await import("./toc.js");
  toc.bindTocEvents();
  return toc;
}

const press = (init) =>
  document.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

describe("outline keyboard shortcut", () => {
  beforeEach(() => invoke.mockReset());

  it("Ctrl+Shift+O toggles the outline and syncs the menu state", async () => {
    await loadToc();
    press({ key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
    expect(document.body.classList.contains("toc-visible")).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith("set_outline_visible", { visible: true });

    press({ key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
    expect(document.body.classList.contains("toc-visible")).toBe(false);
    expect(invoke).toHaveBeenLastCalledWith("set_outline_visible", { visible: false });
  });

  it("Cmd+Shift+O works on macOS", async () => {
    await loadToc();
    press({ key: "o", code: "KeyO", metaKey: true, shiftKey: true });
    expect(document.body.classList.contains("toc-visible")).toBe(true);
  });

  it("ignores Ctrl+O without Shift", async () => {
    await loadToc();
    press({ key: "o", code: "KeyO", ctrlKey: true });
    expect(document.body.classList.contains("toc-visible")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
