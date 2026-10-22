import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HEADING = "## Rich Document authoring";

function authoringSection(skill) {
  const text = readFileSync(resolve("plugins/mdlite/skills", skill, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const start = text.indexOf(HEADING);
  if (start === -1) return null;
  const next = text.indexOf("\n## ", start + HEADING.length);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("agent skill authoring sections", () => {
  it("are present and identical in mdlite-decision and mdlite-preview", () => {
    const decision = authoringSection("mdlite-decision");
    expect(decision).not.toBeNull();
    expect(authoringSection("mdlite-preview")).toBe(decision);
  });

  it("tell agents about relative links", () => {
    const read = (skill) =>
      readFileSync(resolve("plugins/mdlite/skills", skill, "SKILL.md"), "utf8").replace(/\s+/g, " ");
    expect(read("mdlite-preview")).toContain(
      "Link related files to each other with relative links; mdlite opens them directly in folder view."
    );
    expect(read("mdlite-decision")).toContain(
      "Relative links to sibling markdown files open in a new mdlite window after the user confirms, so long supporting detail can live in a linked file."
    );
  });
});
