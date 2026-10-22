const SVG_NS = "http://www.w3.org/2000/svg";

function selectsWithin(svg, selector) {
  try {
    return svg.matches(selector) || svg.querySelector(selector) !== null;
  } catch {
    return false;
  }
}

function applicableRules(rules, svg) {
  const kept = [];
  for (const rule of rules) {
    if (rule.selectorText !== undefined) {
      if (selectsWithin(svg, rule.selectorText)) kept.push(rule.cssText);
    } else if (rule.conditionText !== undefined && rule.cssRules) {
      const inner = applicableRules(rule.cssRules, svg);
      if (inner.length) kept.push(rule.cssText.slice(0, rule.cssText.indexOf("{") + 1) + inner.join("\n") + "}");
    }
  }
  return kept;
}

/** Stylesheet rules from `doc` whose selectors match `svg` or one of its descendants. Cross-origin sheets are skipped. */
export function collectSvgRules(svg, doc = document) {
  const kept = [];
  for (const sheet of doc.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (rules) kept.push(...applicableRules(rules, svg));
  }
  return kept;
}

/**
 * Clones `svg` for a standalone snapshot: copies the document's `--mdlite-*` theme variables and, when `withRules`
 * is set, embeds the stylesheet rules that apply to it in a `<style>` element.
 */
export function cloneSvgForSnapshot(svg, { doc = document, withRules = true } = {}) {
  const clone = svg.cloneNode(true);
  const rootStyle = doc.documentElement.style;
  for (const name of rootStyle) {
    if (name.startsWith("--mdlite-")) clone.style.setProperty(name, rootStyle.getPropertyValue(name));
  }
  const rules = withRules ? collectSvgRules(svg, doc) : [];
  if (rules.length) {
    const style = doc.createElementNS(SVG_NS, "style");
    style.textContent = rules.join("\n");
    clone.insertBefore(style, clone.firstChild);
  }
  return clone;
}
