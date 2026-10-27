import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invoke(...args) }));

async function load() {
  vi.resetModules();
  document.body.innerHTML = '<button id="pin-badge" type="button" hidden aria-pressed="false"></button>';
  return import("./always-on-top.js");
}

const badge = () => document.getElementById("pin-badge");

beforeEach(() => {
  invoke.mockReset();
});

describe("applyAlwaysOnTop", () => {
  it("shows the badge as pressed when enabled", async () => {
    const { applyAlwaysOnTop } = await load();

    applyAlwaysOnTop(true);

    expect(badge().hidden).toBe(false);
    expect(badge().getAttribute("aria-pressed")).toBe("true");
  });

  it("hides the badge when disabled", async () => {
    const { applyAlwaysOnTop } = await load();
    applyAlwaysOnTop(true);

    applyAlwaysOnTop(false);

    expect(badge().hidden).toBe(true);
    expect(badge().getAttribute("aria-pressed")).toBe("false");
  });
});

describe("bindPinBadge", () => {
  it("turns always on top off when clicked", async () => {
    const { bindPinBadge } = await load();
    bindPinBadge();

    badge().click();

    expect(invoke).toHaveBeenCalledWith("set_always_on_top", { enabled: false });
  });
});
