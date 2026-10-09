import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { showToast, isEditableTarget } from "./toast.js";

describe("showToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="main-content"><div id="toast" role="status" hidden></div></div>`;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the text then hides on its own", () => {
    const el = document.getElementById("toast");
    showToast("Path copied");
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("Path copied");
    vi.advanceTimersByTime(1800);
    expect(el.hidden).toBe(true);
  });

  it("reuses one element and restarts the timer on repeat", () => {
    const el = document.getElementById("toast");
    showToast("Path copied");
    vi.advanceTimersByTime(1500);
    showToast("Path copied");
    vi.advanceTimersByTime(1500);
    expect(el.hidden).toBe(false);
    expect(document.querySelectorAll("#toast")).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(el.hidden).toBe(true);
  });

  it("does not move focus", () => {
    document.body.insertAdjacentHTML("beforeend", `<button id="b"></button>`);
    const button = document.getElementById("b");
    button.focus();
    showToast("Path copied");
    expect(document.activeElement).toBe(button);
  });
});

describe("isEditableTarget", () => {
  it("detects text inputs and textareas", () => {
    document.body.innerHTML = `<input id="i" /><textarea id="t"></textarea><div id="d"></div>`;
    expect(isEditableTarget(document.getElementById("i"))).toBe(true);
    expect(isEditableTarget(document.getElementById("t"))).toBe(true);
    expect(isEditableTarget(document.getElementById("d"))).toBe(false);
  });

  it("detects contenteditable", () => {
    document.body.innerHTML = `<div id="c" contenteditable="true"></div>`;
    const el = document.getElementById("c");
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isEditableTarget(el)).toBe(true);
  });

  it("ignores non-elements", () => {
    expect(isEditableTarget(document)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
