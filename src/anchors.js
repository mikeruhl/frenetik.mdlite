const BADGE_CLASS = "question-badge";
const FLASH_MS = 1600;

/** Maps each anchor id to the questions that reference it, numbered by question order. */
export function groupByAnchor(questions) {
  const groups = new Map();
  questions.forEach((q, i) => {
    if (!q.anchor) return;
    if (!groups.has(q.anchor)) groups.set(q.anchor, []);
    groups.get(q.anchor).push({ id: q.id, number: i + 1 });
  });
  return groups;
}

const READING_LINE = 0.2;

/**
 * Picks the anchor whose section is being read. `positions` are in document order with `top` relative to
 * the scroll viewport. The section is the last anchor above the reading line; at the end of the document
 * it is the last visible anchor; before any anchor reaches the line it is the first visible one.
 */
export function pickActiveAnchor(positions, viewHeight, atBottom) {
  const visible = positions.filter((p) => p.top >= 0 && p.top < viewHeight);
  if (atBottom && visible.length) return visible[visible.length - 1].anchor;
  const passed = positions.filter((p) => p.top <= viewHeight * READING_LINE);
  if (passed.length) return passed[passed.length - 1].anchor;
  return visible.length ? visible[0].anchor : null;
}

export function resolveAnchors(contentEl, groups) {
  const resolved = new Map();
  for (const anchor of groups.keys()) {
    const el = contentEl.querySelector(`[id="${anchor}"]`);
    if (el) {
      resolved.set(anchor, el);
    } else {
      console.warn(`mdlite: anchor "${anchor}" not found in document`);
    }
  }
  return resolved;
}

function buildBadge(entries, onBadge) {
  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.dataset.uiChrome = "";
  for (const { id, number } of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "question-badge-item";
    btn.textContent = `Q${number}`;
    btn.title = `Go to question ${number}`;
    btn.addEventListener("click", () => onBadge(id));
    badge.appendChild(btn);
  }
  return badge;
}

export function flash(el) {
  el.classList.remove("anchor-flash");
  void el.offsetWidth;
  el.classList.add("anchor-flash");
  setTimeout(() => el.classList.remove("anchor-flash"), FLASH_MS);
}

/** The block a reader thinks of as "the section": the anchor's paragraph, or the next block if that paragraph only holds the anchor. */
function sectionBlock(anchorEl, contentEl) {
  let block = anchorEl;
  while (block.parentElement && block.parentElement !== contentEl) block = block.parentElement;
  const onlyAnchor = block !== anchorEl && block.textContent.replace(/Q\d+/g, "").trim() === "";
  return (onlyAnchor && block.nextElementSibling) || block;
}

/**
 * Wires two-way navigation between questions and document anchors, plus scroll sync.
 * `onActivate(ids)` marks the questions for the section in view; `onBadge(id)` jumps to a question;
 * `onResolved(anchors)` reports which anchor ids exist after each render.
 */
export function createAnchorLinks({ contentEl, scrollRoot, questions, onActivate, onBadge, onResolved }) {
  const groups = groupByAnchor(questions);
  let resolved = new Map();
  let activeAnchor = null;
  let frame = 0;

  function syncActive() {
    frame = 0;
    if (!resolved.size) return;
    const viewTop = scrollRoot.getBoundingClientRect().top;
    const positions = [...resolved].map(([anchor, el]) => ({ anchor, top: el.getBoundingClientRect().top - viewTop }));
    const atBottom = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 2;
    const anchor = pickActiveAnchor(positions, scrollRoot.clientHeight, atBottom);
    if (anchor === activeAnchor) return;
    activeAnchor = anchor;
    onActivate(anchor ? groups.get(anchor).map((e) => e.id) : []);
  }

  scrollRoot?.addEventListener("scroll", () => {
    if (!frame) frame = requestAnimationFrame(syncActive);
  });

  function refresh() {
    resolved = resolveAnchors(contentEl, groups);
    for (const [anchor, el] of resolved) {
      el.after(buildBadge(groups.get(anchor), onBadge));
    }
    onResolved(new Set(resolved.keys()));
    activeAnchor = null;
    if (scrollRoot) requestAnimationFrame(syncActive);
  }

  function scrollToAnchor(anchor) {
    const el = resolved.get(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    flash(sectionBlock(el, contentEl));
  }

  return { refresh, scrollToAnchor };
}
