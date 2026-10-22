import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path) => "http://mdlive.localhost/" + path,
}));

let invoke;
let live;
let richRender;
let encodeSource;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ invoke } = await import("@tauri-apps/api/core"));
  invoke.mockReset();
  live = await import("./live-blocks.js");
  richRender = await import("./rich-render.js");
  ({ encodeSource } = await import("./rich-blocks.js"));
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

function consent(granted) {
  invoke.mockImplementation((cmd) => {
    if (cmd === "live_consent_check") return Promise.resolve(granted);
    return Promise.resolve();
  });
}

function mount(count = 1, parent = null) {
  const html = Array.from({ length: count }, (_, i) =>
    live.liveBlockRenderer.emit(encodeSource(`<p>${i}</p>`), i)
  ).join("");
  const host = parent ?? document.createElement("div");
  if (!parent) {
    host.id = "content";
    document.body.appendChild(host);
  }
  host.insertAdjacentHTML("beforeend", html);
  return [...host.querySelectorAll(".live-block")];
}

async function renderBlocks(blocks, content = "doc") {
  live.setLiveDocument(content);
  await live.liveBlockRenderer.render(blocks);
}

function post(block, data) {
  const win = block.querySelector(".live-frame").contentWindow;
  window.dispatchEvent(new window.MessageEvent("message", { data, source: win }));
}

function flush() {
  return vi.advanceTimersByTimeAsync(0);
}

describe("snapshots", () => {
  it("renders an SVG snapshot as an image instead of injecting markup", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="x()"/></svg>';
    post(block, { type: "snapshot", svg });
    const img = block.querySelector("img.live-snapshot");
    expect(img.alt).toBe("Live Block output");
    expect(img.getAttribute("src")).toBe("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    expect(block.querySelector("svg, script, rect")).toBeNull();
    expect(block.dataset.hasSnapshot).toBe("true");
  });

  it("ignores an SVG snapshot over the size limit", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    post(block, { type: "snapshot", svg: "<svg>" + "x".repeat(live.SNAPSHOT_LIMIT) + "</svg>" });
    expect(block.querySelector(".live-snapshot")).toBeNull();
  });

  it("renders a PNG snapshot as an image", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    post(block, { type: "snapshot", png: "data:image/png;base64,AAAA" });
    expect(block.querySelector("img.live-snapshot").getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("clears the previous snapshot when a reply has no usable image", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    post(block, { type: "snapshot", png: "data:image/png;base64,AAAA" });
    post(block, { type: "snapshot" });
    expect(block.querySelector(".live-snapshot")).toBeNull();
    expect(block.dataset.hasSnapshot).toBeUndefined();
  });

  it("ignores a PNG snapshot with another scheme", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    post(block, { type: "snapshot", png: "javascript:alert(1)" });
    expect(block.querySelector(".live-snapshot")).toBeNull();
  });
});

describe("print readiness", () => {
  async function readiness() {
    const state = { done: false };
    richRender.awaitRichRender(10000).then((ready) => {
      state.done = true;
      state.ready = ready;
    });
    await flush();
    return state;
  }

  it("waits for each started frame's first snapshot", async () => {
    consent(true);
    const blocks = mount(2);
    await renderBlocks(blocks);
    const state = await readiness();
    post(blocks[0], { type: "snapshot" });
    await flush();
    expect(state.done).toBe(false);
    post(blocks[1], { type: "snapshot", png: "data:image/png;base64,AAAA" });
    await flush();
    expect(state).toEqual({ done: true, ready: true });
  });

  it("stops waiting for a frame that never snapshots after the first-snapshot timeout", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    const state = await readiness();
    await vi.advanceTimersByTimeAsync(live.FIRST_SNAPSHOT_TIMEOUT_MS - 1);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state).toEqual({ done: true, ready: true });
  });

  it("requests a fresh snapshot from each running frame and waits for the reply", async () => {
    consent(true);
    const blocks = mount(2);
    await renderBlocks(blocks);
    blocks.forEach((block) => post(block, { type: "snapshot" }));
    const sent = blocks.map((block) => vi.spyOn(block.querySelector(".live-frame").contentWindow, "postMessage"));
    live.requestLiveSnapshots();
    for (const spy of sent) expect(spy).toHaveBeenCalledWith({ type: "snapshot-request" }, "*");
    const state = await readiness();
    expect(state.done).toBe(false);
    post(blocks[0], { type: "snapshot", png: "data:image/png;base64,AAAA" });
    await flush();
    expect(state.done).toBe(false);
    post(blocks[1], { type: "snapshot" });
    await flush();
    expect(state).toEqual({ done: true, ready: true });
    expect(blocks[0].querySelector("img.live-snapshot").getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("stops waiting for a requested snapshot after the snapshot timeout", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    post(block, { type: "snapshot" });
    live.requestLiveSnapshots();
    const state = await readiness();
    await vi.advanceTimersByTimeAsync(live.FIRST_SNAPSHOT_TIMEOUT_MS - 1);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state).toEqual({ done: true, ready: true });
  });

  it("one snapshot settles both a pending first snapshot and a requested one", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    live.requestLiveSnapshots();
    const state = await readiness();
    post(block, { type: "snapshot" });
    await flush();
    expect(state).toEqual({ done: true, ready: true });
  });

  it("stopping a frame releases the wait", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    const state = await readiness();
    block.querySelector(".live-run").click();
    await flush();
    expect(state).toEqual({ done: true, ready: true });
  });

  it("forgets running frames when a document without Live Blocks replaces them", async () => {
    consent(true);
    const [block] = mount();
    await renderBlocks([block]);
    const pending = await readiness();
    const old = vi.spyOn(block.querySelector(".live-frame").contentWindow, "postMessage");
    live.setLiveDocument("plain");
    document.body.innerHTML = "";
    await flush();
    expect(pending).toEqual({ done: true, ready: true });
    live.requestLiveSnapshots();
    expect(old).not.toHaveBeenCalled();
    const state = await readiness();
    expect(state).toEqual({ done: true, ready: true });
  });

  it("tracks frames started from the Run button", async () => {
    consent(false);
    const [block] = mount();
    await renderBlocks([block]);
    block.querySelector(".live-run").click();
    await flush();
    expect(block.querySelector(".live-frame")).not.toBeNull();
    const state = await readiness();
    expect(state.done).toBe(false);
    post(block, { type: "snapshot" });
    await flush();
    expect(state.done).toBe(true);
  });
});

describe("consent", () => {
  function deferGrant() {
    let release;
    invoke.mockImplementation((cmd) => {
      if (cmd === "live_consent_check") return Promise.resolve(false);
      if (cmd === "live_consent_grant") return new Promise((resolve) => (release = resolve));
      return Promise.resolve();
    });
    return () => release();
  }

  it("runs every valid block and skips one with invalid source", async () => {
    const blocks = mount(2);
    blocks[0].dataset.live = "not base64!";
    const release = deferGrant();
    await renderBlocks(blocks);
    blocks[1].querySelector(".live-run").click();
    release();
    await flush();
    expect(blocks[0].querySelector(".live-frame")).toBeNull();
    expect(blocks[1].querySelector(".live-frame")).not.toBeNull();
  });

  it("runs every block in the document once granted", async () => {
    const blocks = mount(2);
    const release = deferGrant();
    await renderBlocks(blocks);
    blocks[0].querySelector(".live-run").click();
    release();
    await flush();
    expect(blocks.every((b) => b.querySelector(".live-frame"))).toBe(true);
    expect(invoke).toHaveBeenCalledWith("live_consent_grant", { content: "doc" });
  });

  it("aborts when a new document rendered while consent was pending", async () => {
    const blocks = mount(1);
    const release = deferGrant();
    await renderBlocks(blocks, "old");
    blocks[0].querySelector(".live-run").click();
    document.body.innerHTML = "";
    const fresh = mount(1);
    await renderBlocks(fresh, "new");
    release();
    await flush();
    expect(fresh[0].querySelector(".live-frame")).toBeNull();
    expect(fresh[0].dataset.liveState).toBe("source");
  });

  it("aborts when the document is reset without re-rendering", async () => {
    const blocks = mount(2);
    const release = deferGrant();
    await renderBlocks(blocks);
    blocks[0].querySelector(".live-run").click();
    live.setLiveDocument("doc");
    release();
    await flush();
    expect(blocks.some((b) => b.querySelector(".live-frame"))).toBe(false);
  });

  it("aborts when the trigger was detached", async () => {
    const blocks = mount(2);
    const release = deferGrant();
    await renderBlocks(blocks);
    blocks[0].querySelector(".live-run").click();
    blocks[0].remove();
    release();
    await flush();
    expect(blocks[1].querySelector(".live-frame")).toBeNull();
  });

  it("never falls back to running the whole document", async () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const [stray] = mount(1, outside);
    const [inContent] = mount(1);
    const release = deferGrant();
    await renderBlocks([stray, inContent]);
    stray.querySelector(".live-run").click();
    release();
    await flush();
    expect(stray.querySelector(".live-frame")).toBeNull();
    expect(inContent.querySelector(".live-frame")).toBeNull();
  });

  it("skips running blocks when the document changed during the consent check", async () => {
    let answer;
    invoke.mockImplementation((cmd) =>
      cmd === "live_consent_check" ? new Promise((resolve) => (answer = resolve)) : Promise.resolve()
    );
    const blocks = mount(1);
    live.setLiveDocument("old");
    const pending = live.liveBlockRenderer.render(blocks);
    live.setLiveDocument("new");
    answer(true);
    await pending;
    expect(blocks[0].querySelector(".live-frame")).toBeNull();
  });
});

describe("invalid source", () => {
  it("shows an error for an undecodable block and still renders and runs later blocks", async () => {
    consent(true);
    const host = document.createElement("div");
    host.id = "content";
    host.innerHTML = '<div class="live-block"></div>';
    document.body.appendChild(host);
    const blocks = mount(1, host);
    await renderBlocks(blocks);
    expect(blocks[0].querySelector(".live-error").textContent).toBe("Live Block error: invalid source");
    expect(blocks[0].querySelector(".live-frame, .live-run")).toBeNull();
    expect(blocks[1].querySelector(".live-source")).not.toBeNull();
    expect(blocks[1].querySelector(".live-frame")).not.toBeNull();
  });
});
