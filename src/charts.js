import { decodeSource } from "./rich-blocks.js";

const NO_EXTERNAL_DATA = "Charts support inline data only (data.values); external URLs are not loaded.";

let engine = null;
let themeId = null;
const views = new Map();

async function getEngine() {
  if (!engine) {
    engine = Promise.all([import("vega"), import("vega-lite"), import("vega-interpreter")]).then(
      ([vega, vegaLite, interpreter]) => ({ vega, vegaLite, expr: interpreter.expressionInterpreter })
    );
  }
  return engine;
}

function rejectingLoader() {
  const refuse = () => Promise.reject(new Error(NO_EXTERNAL_DATA));
  return { options: {}, load: refuse, sanitize: refuse, http: refuse, file: refuse, fileAccess: false };
}

/** Visits every specification object, skipping inline data records (`data.values`, `datasets`). */
function visitSpec(value, visit, parentKey = null) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitSpec(item, visit, parentKey));
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "datasets" || (parentKey === "data" && key === "values")) continue;
    visitSpec(child, visit, key);
  }
}

function hasExternalUrl(spec) {
  let found = false;
  visitSpec(spec, (node) => {
    if (typeof node.url === "string") found = true;
  });
  return found;
}

/** Removes every specification `href` so no mark becomes a link. */
function stripHrefs(spec) {
  visitSpec(spec, (node) => delete node.href);
  return spec;
}

function withAlpha(color, alpha) {
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function nextFrame() {
  return new Promise((resolve) => (globalThis.requestAnimationFrame ?? setTimeout)(resolve));
}

/** Vega config from the active theme's resolved colors and font. */
export function themeConfig(element) {
  const style = getComputedStyle(element);
  const fg = style.color || "rgb(36, 41, 47)";
  const font = style.fontFamily || "sans-serif";
  const line = withAlpha(fg, 0.35);
  const grid = withAlpha(fg, 0.12);
  const axis = { labelColor: fg, titleColor: fg, domainColor: line, tickColor: line, gridColor: grid };
  return {
    background: "transparent",
    font,
    title: { color: fg },
    axis,
    legend: { labelColor: fg, titleColor: fg },
    header: { labelColor: fg, titleColor: fg },
    view: { stroke: grid },
    text: { color: fg },
  };
}

/** Finalizes every live Chart view so its listeners and timers are released. */
export function disposeCharts() {
  for (const view of views.values()) view.finalize();
  views.clear();
}

function showError(target, message) {
  const pre = document.createElement("pre");
  pre.className = "rich-block-error";
  pre.textContent = "Chart error: " + message;
  target.replaceChildren(pre);
}

async function renderChart(block, { vega, vegaLite, expr }) {
  const target = block.querySelector(".chart-rendered");
  views.get(block)?.finalize();
  views.delete(block);

  let spec;
  try {
    spec = JSON.parse(decodeSource(block.dataset.chart));
  } catch (e) {
    showError(target, "invalid JSON: " + e.message);
    return;
  }
  if (hasExternalUrl(spec)) {
    showError(target, NO_EXTERNAL_DATA);
    return;
  }

  const errors = [];
  const logger = vega.logger(vega.Error);
  logger.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    const config = themeConfig(block);
    const { spec: compiled } = vegaLite.compile(stripHrefs(spec), { config, logger });
    const runtime = vega.parse(compiled, null, { ast: true });
    target.replaceChildren();
    const view = new vega.View(runtime, {
      renderer: "svg",
      container: target,
      hover: true,
      expr,
      loader: rejectingLoader(),
      logger,
    });
    views.set(block, view);
    await view.runAsync();
    if (errors.length) throw new Error(errors[0]);
  } catch (e) {
    views.get(block)?.finalize();
    views.delete(block);
    showError(target, e.message);
  }
}

export const chartRenderer = {
  selector: ".chart-block",

  emit(encoded, idx) {
    return `<div class="chart-block" data-chart-idx="${idx}" data-chart="${encoded}"><div class="chart-rendered"></div></div>`;
  },

  async render(blocks) {
    const loaded = await getEngine();
    await nextFrame();
    for (const block of blocks) {
      if (block.isConnected) await renderChart(block, loaded);
    }
  },

  setTheme(next) {
    const changed = themeId !== null && next !== themeId;
    themeId = next;
    return changed;
  },
};
