import { describe, it, expect, vi } from "vitest";
import {
  registerRichBlock,
  isRichBlockLang,
  emitRichBlock,
  resetRichBlockCounter,
  encodeSource,
  decodeSource,
  renderRichBlocks,
  setRichBlockTheme,
  richBlockSelector,
} from "./rich-blocks.js";

function fakeRenderer(name, { themeChanges = false } = {}) {
  return {
    selector: `.${name}-block`,
    emit: (encoded, idx) => `<div class="${name}-block" data-idx="${idx}" data-src="${encoded}"></div>`,
    render: vi.fn(async (blocks) => blocks.forEach((b) => (b.textContent = decodeSource(b.dataset.src)))),
    setTheme: vi.fn(() => themeChanges),
  };
}

const alpha = fakeRenderer("alpha", { themeChanges: true });
const beta = fakeRenderer("beta");
registerRichBlock("alpha", alpha);
registerRichBlock("beta", beta);

function mount(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("rich block registry", () => {
  it("recognizes only registered languages", () => {
    expect(isRichBlockLang("alpha")).toBe(true);
    expect(isRichBlockLang("js")).toBe(false);
  });

  it("round-trips non-ASCII source through the container attribute", () => {
    expect(decodeSource(encodeSource("naïve → ✓"))).toBe("naïve → ✓");
  });

  it("numbers containers sequentially until reset", () => {
    resetRichBlockCounter();
    const first = mount(emitRichBlock("alpha", "a")).firstChild;
    const second = mount(emitRichBlock("beta", "b")).firstChild;
    expect([first.dataset.idx, second.dataset.idx]).toEqual(["0", "1"]);
    resetRichBlockCounter();
    expect(mount(emitRichBlock("alpha", "a")).firstChild.dataset.idx).toBe("0");
  });

  it("renders each renderer's own blocks and skips renderers with none", async () => {
    alpha.render.mockClear();
    beta.render.mockClear();
    const root = mount(emitRichBlock("alpha", "one") + emitRichBlock("alpha", "two"));
    await renderRichBlocks(root);
    expect(alpha.render).toHaveBeenCalledTimes(1);
    expect(beta.render).not.toHaveBeenCalled();
    expect(root.textContent).toBe("onetwo");
  });

  it("re-renders only renderers whose output depends on the theme", async () => {
    alpha.render.mockClear();
    beta.render.mockClear();
    const root = mount(emitRichBlock("alpha", "a") + emitRichBlock("beta", "b"));
    await setRichBlockTheme("github-dark", root);
    expect(alpha.setTheme).toHaveBeenCalledWith("github-dark");
    expect(beta.setTheme).toHaveBeenCalledWith("github-dark");
    expect(alpha.render).toHaveBeenCalledTimes(1);
    expect(beta.render).not.toHaveBeenCalled();
  });

  describe("when one renderer rejects while another is pending", () => {
    function deferred() {
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      return { promise, resolve };
    }

    async function expectWaitsForPending(run) {
      const pending = deferred();
      alpha.render.mockImplementationOnce(() => Promise.reject(new Error("import failed")));
      beta.render.mockImplementationOnce(() => pending.promise);
      let settled = false;
      const done = run().then(
        () => (settled = "resolved"),
        (err) => (settled = err.message)
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(settled).toBe(false);
      pending.resolve();
      await done;
      expect(settled).toBe("import failed");
    }

    it("renderRichBlocks waits for every renderer, then rejects", async () => {
      const root = mount(emitRichBlock("alpha", "a") + emitRichBlock("beta", "b"));
      await expectWaitsForPending(() => renderRichBlocks(root));
    });

    it("setRichBlockTheme waits for every renderer, then rejects", async () => {
      beta.setTheme.mockReturnValueOnce(true);
      const root = mount(emitRichBlock("alpha", "a") + emitRichBlock("beta", "b"));
      await expectWaitsForPending(() => setRichBlockTheme("github-dark", root));
    });
  });

  it("builds a selector covering every registered container", () => {
    const root = mount(emitRichBlock("alpha", "a") + emitRichBlock("beta", "b") + "<div class='other'></div>");
    expect(root.querySelectorAll(richBlockSelector())).toHaveLength(2);
  });
});
