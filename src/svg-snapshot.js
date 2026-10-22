const SVG_NS = "http://www.w3.org/2000/svg";
const SNAPSHOT_ID = "mdlite-snapshot-root";

function splitTopLevel(selector, isSeparator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") {
      i++;
    } else if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth--;
    } else if (depth === 0) {
      const length = isSeparator(selector, i);
      if (length) {
        parts.push(selector.slice(start, i), selector.slice(i, i + length));
        start = i + length;
        i += length - 1;
      }
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

function selectorList(selectorText) {
  return splitTopLevel(selectorText, (s, i) => (s[i] === "," ? 1 : 0))
    .filter((_, i) => i % 2 === 0)
    .map((part) => part.trim())
    .filter(Boolean);
}

function compounds(selector) {
  return splitTopLevel(selector, (s, i) => {
    const match = /^\s*[>+~]\s*|^\s+/.exec(s.slice(i));
    return match ? match[0].length : 0;
  });
}

function scopeTo(compound, scope) {
  const pseudoElement = compound.indexOf("::");
  const at = pseudoElement < 0 ? compound.length : pseudoElement;
  return `${compound.slice(0, at)}:is(${scope}, ${scope} *)${compound.slice(at)}`;
}

function indexer(root) {
  const elements = [root, ...root.querySelectorAll("*")];
  return (selector) => {
    try {
      return elements.flatMap((el, i) => (el.matches(selector) ? [i] : [])).join(",");
    } catch {
      return null;
    }
  };
}

function snapshotScope(svg) {
  if (!svg.id) return { selector: "#" + SNAPSHOT_ID, id: SNAPSHOT_ID };
  if (/^[A-Za-z_][\w-]*$/.test(svg.id)) return { selector: "#" + svg.id, id: null };
  return { selector: `[id="${svg.id.replace(/["\\]/g, "\\$&")}"]`, id: null };
}

function standaloneSelector(selector, context) {
  const expected = context.inDocument(selector);
  if (!expected) return null;
  if (context.inSnapshot(selector) === expected) return selector;
  const parts = compounds(selector);
  for (let k = 2; k < parts.length; k += 2) {
    const rewritten = [scopeTo(parts[k], context.scope), ...parts.slice(k + 1)].join("");
    if (context.inSnapshot(rewritten) === expected) return rewritten;
  }
  return selector;
}

function applicableRules(rules, context) {
  const kept = [];
  for (const rule of rules) {
    if (rule.selectorText !== undefined) {
      const selectors = selectorList(rule.selectorText)
        .map((selector) => standaloneSelector(selector, context))
        .filter(Boolean);
      if (selectors.length) kept.push(`${selectors.join(", ")} { ${rule.style.cssText} }`);
    } else if (rule.conditionText !== undefined && rule.cssRules) {
      const inner = applicableRules(rule.cssRules, context);
      if (inner.length) kept.push(rule.cssText.slice(0, rule.cssText.indexOf("{") + 1) + inner.join("\n") + "}");
    }
  }
  return kept;
}

/**
 * Stylesheet rules from `doc` whose selectors match `svg` or one of its descendants. Cross-origin sheets are skipped.
 * Selectors that depend on ancestors outside `svg` are rewritten to target the snapshot root instead.
 */
export function collectSvgRules(svg, doc = document) {
  const scope = snapshotScope(svg);
  const probe = svg.cloneNode(true);
  if (scope.id) probe.id = scope.id;
  const context = { scope: scope.selector, inDocument: indexer(svg), inSnapshot: indexer(probe) };
  const kept = [];
  for (const sheet of doc.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (rules) kept.push(...applicableRules(rules, context));
  }
  return kept;
}

/**
 * Clones `svg` for a standalone snapshot: copies the document's `--mdlite-*` theme variables and the SVG's inherited
 * color and font family and, when `withRules` is set, embeds the stylesheet rules that apply to it in a `<style>` element.
 */
export function cloneSvgForSnapshot(svg, { doc = document, withRules = true } = {}) {
  const clone = svg.cloneNode(true);
  const computed = doc.defaultView.getComputedStyle(svg);
  clone.style.setProperty("color", computed.color);
  clone.style.setProperty("font-family", computed.fontFamily);
  const rootStyle = doc.documentElement.style;
  for (const name of rootStyle) {
    if (name.startsWith("--mdlite-")) clone.style.setProperty(name, rootStyle.getPropertyValue(name));
  }
  const rules = withRules ? collectSvgRules(svg, doc) : [];
  if (rules.length) {
    const { id } = snapshotScope(svg);
    if (id) clone.id = id;
    const style = doc.createElementNS(SVG_NS, "style");
    style.textContent = rules.join("\n");
    clone.insertBefore(style, clone.firstChild);
  }
  return clone;
}
