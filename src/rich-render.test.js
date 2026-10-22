import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { trackRichRender, joinRichRender, awaitRichRender } from "./rich-render.js";

describe("awaitRichRender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    trackRichRender(Promise.resolve());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves true immediately when nothing is pending", async () => {
    await expect(awaitRichRender(10000)).resolves.toBe(true);
  });

  it("waits for the tracked render to finish", async () => {
    let finish;
    trackRichRender(new Promise((r) => (finish = r)));
    let settled = false;
    const result = awaitRichRender(10000).then((v) => {
      settled = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);
    finish();
    await expect(result).resolves.toBe(true);
  });

  it("resolves false when the render exceeds the timeout", async () => {
    trackRichRender(new Promise(() => {}));
    const result = awaitRichRender(10000);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(result).resolves.toBe(false);
  });

  it("treats a rejected render as finished", async () => {
    trackRichRender(Promise.reject(new Error("boom")));
    await expect(awaitRichRender(10000)).resolves.toBe(true);
  });

  it("waits for joined work as well as the tracked render", async () => {
    let finishRender;
    let finishTheme;
    trackRichRender(new Promise((r) => (finishRender = r)));
    joinRichRender(new Promise((r) => (finishTheme = r)));
    let settled = false;
    const result = awaitRichRender(10000).then((v) => {
      settled = true;
      return v;
    });
    finishRender();
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    finishTheme();
    await expect(result).resolves.toBe(true);
  });

  it("waits for the latest tracked render, not an earlier one", async () => {
    trackRichRender(Promise.resolve());
    let finish;
    trackRichRender(new Promise((r) => (finish = r)));
    let settled = false;
    const result = awaitRichRender(10000).then((v) => {
      settled = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    finish();
    await expect(result).resolves.toBe(true);
  });
  it("waits for work joined after waiting starts", async () => {
    let finishRender;
    let finishTheme;
    trackRichRender(new Promise((r) => (finishRender = r)));
    let settled = false;
    const result = awaitRichRender(10000).then((v) => {
      settled = true;
      return v;
    });
    joinRichRender(new Promise((r) => (finishTheme = r)));
    finishRender();
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    finishTheme();
    await expect(result).resolves.toBe(true);
  });

  it("stops waiting on a superseded render once a replacement settles", async () => {
    trackRichRender(new Promise(() => {}));
    let settled = false;
    const result = awaitRichRender(10000).then((v) => {
      settled = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    trackRichRender(Promise.resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    await expect(result).resolves.toBe(true);
  });

  it("still times out when replacement work never settles", async () => {
    let finish;
    trackRichRender(new Promise((r) => (finish = r)));
    const result = awaitRichRender(10000);
    trackRichRender(new Promise(() => {}));
    finish();
    await vi.advanceTimersByTimeAsync(10000);
    await expect(result).resolves.toBe(false);
  });
});
