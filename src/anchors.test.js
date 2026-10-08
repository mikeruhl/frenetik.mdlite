import { describe, it, expect, vi } from "vitest";
import { groupByAnchor, pickActiveAnchor, resolveAnchors, createAnchorLinks } from "./anchors.js";

const questions = [
  { id: "a", anchor: "sec-1" },
  { id: "b" },
  { id: "c", anchor: "sec-2" },
  { id: "d", anchor: "sec-1" },
];

describe("anchors", () => {
  it("groups questions by anchor with 1-based numbers", () => {
    const groups = groupByAnchor(questions);
    expect([...groups.keys()]).toEqual(["sec-1", "sec-2"]);
    expect(groups.get("sec-1")).toEqual([
      { id: "a", number: 1 },
      { id: "d", number: 4 },
    ]);
  });

  describe("pickActiveAnchor", () => {
    const at = (...tops) => tops.map((top, i) => ({ anchor: `s${i + 1}`, top }));

    it("uses the last anchor above the reading line", () => {
      expect(pickActiveAnchor(at(-300, 50, 600), 1000, false)).toBe("s2");
    });

    it("uses the first visible anchor before any reaches the line", () => {
      expect(pickActiveAnchor(at(400, 900, 1500), 1000, false)).toBe("s1");
    });

    it("uses the last visible anchor at the end of the document", () => {
      expect(pickActiveAnchor(at(-300, 300, 700), 1000, true)).toBe("s3");
    });

    it("returns null when nothing is above the line or visible", () => {
      expect(pickActiveAnchor(at(1200), 1000, false)).toBeNull();
      expect(pickActiveAnchor([], 1000, false)).toBeNull();
    });
  });

  it("resolves only anchors present in the content and warns for missing ones", () => {
    const content = document.createElement("article");
    content.innerHTML = '<p><a id="sec-1"></a></p>';
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolveAnchors(content, groupByAnchor(questions));
    expect([...resolved.keys()]).toEqual(["sec-1"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sec-2"));
    warn.mockRestore();
  });

  it("inserts one badge per anchor with an entry per question", () => {
    const content = document.createElement("article");
    content.innerHTML = '<p><a id="sec-1"></a></p><p><a id="sec-2"></a>text</p>';
    const onBadge = vi.fn();
    const onResolved = vi.fn();
    const links = createAnchorLinks({
      contentEl: content,
      scrollRoot: null,
      questions,
      onActivate: () => {},
      onBadge,
      onResolved,
    });
    links.refresh();

    const badges = content.querySelectorAll(".question-badge");
    expect(badges).toHaveLength(2);
    expect([...badges[0].querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Q1", "Q4"]);
    expect(badges[0].hasAttribute("data-ui-chrome")).toBe(true);
    badges[0].querySelectorAll("button")[1].click();
    expect(onBadge).toHaveBeenCalledWith("d");
    expect(onResolved).toHaveBeenCalledWith(new Set(["sec-1", "sec-2"]));
  });
});
