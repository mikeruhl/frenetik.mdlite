const SVG_NS = "http://www.w3.org/2000/svg";
const SNAPSHOT_ID = "mdlite-snapshot-root";
const INHERITED_PROPERTIES = [
  "color",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
];
const PAD = "mdlite-specificity-pad";

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

function closing(selector, open) {
  const close = selector[open] === "(" ? ")" : "]";
  let depth = 0;
  let quote = null;
  for (let i = open; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") i++;
    else if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === selector[open]) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return selector.length;
}

const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
const MATCHES_ANY = new Set(["is", "not", "has", "matches", "-webkit-any"]);

function maxSpecificity(list) {
  return selectorList(list)
    .map(specificity)
    .reduce((max, s) => ((s[0] - max[0] || s[1] - max[1] || s[2] - max[2]) > 0 ? s : max), [0, 0, 0]);
}

/** Selectors Level 4 specificity of `selector` as [ids, classes, types]. */
export function specificity(selector) {
  const total = [0, 0, 0];
  const add = (s) => s.forEach((n, i) => (total[i] += n));
  let i = 0;
  while (i < selector.length) {
    const rest = selector.slice(i);
    let m;
    if ((m = /^(::?)([\w-]+)\(/.exec(rest))) {
      const open = i + m[0].length - 1;
      const close = closing(selector, open);
      const args = selector.slice(open + 1, close);
      const name = m[2].toLowerCase();
      if (m[1] === "::") add([0, 0, 1]);
      else if (MATCHES_ANY.has(name)) add(maxSpecificity(args));
      else if (name !== "where") {
        add([0, 1, 0]);
        const of = /^nth-(last-)?child$/.test(name) && /\sof\s/i.exec(args);
        if (of) add(maxSpecificity(args.slice(of.index + of[0].length)));
      }
      i = close + 1;
    } else if ((m = /^(::?)([\w-]+)/.exec(rest))) {
      add(m[1] === "::" || LEGACY_PSEUDO_ELEMENTS.has(m[2].toLowerCase()) ? [0, 0, 1] : [0, 1, 0]);
      i += m[0].length;
    } else if ((m = /^#(?:[\w-]|\\.)+/.exec(rest))) {
      add([1, 0, 0]);
      i += m[0].length;
    } else if ((m = /^\.(?:[\w-]|\\.)+/.exec(rest))) {
      add([0, 1, 0]);
      i += m[0].length;
    } else if (rest[0] === "[") {
      add([0, 1, 0]);
      i = closing(selector, i) + 1;
    } else if ((m = /^(?:[\w-]|\\.)+/.exec(rest))) {
      add([0, 0, 1]);
      i += m[0].length;
    } else {
      i++;
    }
  }
  return total;
}

function specificityPad([ids, classes, types]) {
  const compound = `#${PAD}`.repeat(ids) + `.${PAD}`.repeat(classes);
  const parts = Array(types).fill(PAD);
  if (compound) parts.push(compound);
  return parts.length ? `:not(${parts.join(" ")})` : "";
}

function scopeTo(compound, scope, pad = "") {
  const pseudoElement = compound.indexOf("::");
  const at = pseudoElement < 0 ? compound.length : pseudoElement;
  return `${compound.slice(0, at)}:where(${scope}, ${scope} *)${pad}${compound.slice(at)}`;
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
    const tail = parts.slice(k + 1).join("");
    if (context.inSnapshot(scopeTo(parts[k], context.scope) + tail) === expected) {
      const pad = specificityPad(specificity(parts.slice(0, k).join("")));
      return scopeTo(parts[k], context.scope, pad) + tail;
    }
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
 * Selectors that depend on ancestors outside `svg` are rewritten to target the snapshot root instead, keeping the
 * original specificity through a never-matching `:not()` in place of the removed ancestors.
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
 * color, fill, stroke, and font styles and, when `withRules` is set, embeds the stylesheet rules that apply to it in a `<style>` element.
 */
export function cloneSvgForSnapshot(svg, { doc = document, withRules = true } = {}) {
  const clone = svg.cloneNode(true);
  const computed = doc.defaultView.getComputedStyle(svg);
  for (const name of INHERITED_PROPERTIES) clone.style.setProperty(name, computed.getPropertyValue(name));
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
