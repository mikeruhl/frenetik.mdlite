import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mermaidThemeFor } from "./mermaid-block.js";

describe("mermaidThemeFor", () => {
  it.each([
    ["rgb(255, 255, 255)", "github", "default"],
    ["rgb(13, 17, 23)", "github-dark", "dark"],
    ["rgb(34, 34, 34)", "retro", "dark"],
    ["rgb(250, 250, 250)", "splendor", "default"],
    ["rgba(1, 4, 9, 1)", "github-dark-hc", "dark"],
    ["#fff", "air", "default"],
    ["#222222", "retro", "dark"],
    ["#111", "custom-light-named", "dark"],
  ])("background %s (%s) uses the %s Mermaid theme", (background, themeId, expected) => {
    expect(mermaidThemeFor(background, themeId)).toBe(expected);
  });

  it("falls back to the theme name when the background is unknown", () => {
    expect(mermaidThemeFor("", "github-dark")).toBe("dark");
    expect(mermaidThemeFor(undefined, "github")).toBe("default");
  });
});

describe("Mermaid container styling", () => {
  const css = readFileSync("src/styles.css", "utf8").replace(/\r\n/g, "\n");
  const rule = css.match(/\n\.mermaid-block \{([^}]*)\}/)[1];

  it("paints the container with the theme background, so dark diagrams never sit on a white box", () => {
    expect(rule).toMatch(/background:\s*var\(--theme-bg/);
  });
});
