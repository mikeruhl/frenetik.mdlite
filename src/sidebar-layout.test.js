import { describe, it, expect } from "vitest";
import { clampWidth, parseStoredWidth, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH } from "./sidebar-layout.js";

describe("clampWidth", () => {
  it("returns the width when inside the range", () => {
    expect(clampWidth(300, 1600)).toBe(300);
  });

  it("raises widths below the minimum", () => {
    expect(clampWidth(10, 1600)).toBe(MIN_WIDTH);
  });

  it("caps widths at the absolute maximum on wide viewports", () => {
    expect(clampWidth(900, 3000)).toBe(MAX_WIDTH);
  });

  it("caps widths at 60% of a narrow viewport", () => {
    expect(clampWidth(900, 800)).toBe(480);
  });

  it("never drops below the minimum on tiny viewports", () => {
    expect(clampWidth(400, 200)).toBe(MIN_WIDTH);
  });
});

describe("parseStoredWidth", () => {
  it("returns the default when nothing is stored", () => {
    expect(parseStoredWidth(null, 1600)).toBe(DEFAULT_WIDTH);
  });

  it("returns the default for non-numeric values", () => {
    expect(parseStoredWidth("abc", 1600)).toBe(DEFAULT_WIDTH);
    expect(parseStoredWidth("", 1600)).toBe(DEFAULT_WIDTH);
    expect(parseStoredWidth("NaN", 1600)).toBe(DEFAULT_WIDTH);
    expect(parseStoredWidth("Infinity", 1600)).toBe(DEFAULT_WIDTH);
  });

  it("clamps out-of-range values", () => {
    expect(parseStoredWidth("20", 1600)).toBe(MIN_WIDTH);
    expect(parseStoredWidth("5000", 1600)).toBe(MAX_WIDTH);
    expect(parseStoredWidth("700", 800)).toBe(480);
  });

  it("returns valid values unchanged", () => {
    expect(parseStoredWidth("320", 1600)).toBe(320);
  });

  it("uses the supplied fallback for missing or invalid values", () => {
    expect(parseStoredWidth(null, 1600, 340)).toBe(340);
    expect(parseStoredWidth("abc", 1600, 340)).toBe(340);
  });

  it("clamps the fallback to the viewport", () => {
    expect(parseStoredWidth(null, 400, 340)).toBe(240);
  });
});
