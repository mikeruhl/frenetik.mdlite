import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let resizeCallbacks;
let posted;
let rootHeight;
let listeners;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  resizeCallbacks = [];
  rootHeight = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
    }
  );
  document.body.innerHTML = '<div id="root"></div>';
  document.body.style.margin = "5px";
  const root = document.getElementById("root");
  root.getBoundingClientRect = () => ({ height: rootHeight });
  Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => rootHeight });
  posted = [];
  listeners = [];
  const addEventListener = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
    listeners.push([type, listener]);
    addEventListener(type, listener);
  });
  vi.spyOn(window, "postMessage").mockImplementation((message) => posted.push(message));
  await import("./live-frame.js");
});

afterEach(() => {
  for (const [type, listener] of listeners) window.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.removeAttribute("style");
});

function send(data) {
  window.dispatchEvent(new window.MessageEvent("message", { data, source: window }));
}

function sizes() {
  return posted.filter((message) => message.type === "size").map((message) => message.height);
}

describe("live frame", () => {
  it("reports a height that grows and shrinks with the content", () => {
    rootHeight = 800;
    send({ type: "run", source: "<p>tall</p>" });
    rootHeight = 100;
    resizeCallbacks.forEach((callback) => callback());
    expect(sizes()).toEqual([810, 110]);
  });

  it("answers a snapshot request immediately once it has run", () => {
    send({ type: "snapshot-request" });
    expect(posted.some((message) => message.type === "snapshot")).toBe(false);
    send({ type: "run", source: "<p>x</p>" });
    send({ type: "snapshot-request" });
    expect(posted.filter((message) => message.type === "snapshot")).toEqual([{ type: "snapshot" }]);
    vi.advanceTimersByTime(5000);
    expect(posted.filter((message) => message.type === "snapshot")).toHaveLength(1);
  });
});
