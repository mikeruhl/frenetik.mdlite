const SANS = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
const MONO = 'Consolas, "Courier New", monospace';
const FG = "#1f2328";
const MUTED = "#59636e";
const BORDER = "#d1d9e0";
const SUBTLE = "#f6f8fa";

export const ROOT_STYLE = `font-family:${SANS};font-size:16px;line-height:1.5;color:${FG};`;

const heading = (size, extra = "") =>
  `font-size:${size};font-weight:600;line-height:1.25;margin:24px 0 16px;color:${FG};${extra}`;
const ruled = `border-bottom:1px solid ${BORDER};padding-bottom:0.3em;`;

const ALERT_TONES = {
  note: ["#0969da", "#ddf4ff"],
  tip: ["#1a7f37", "#dafbe1"],
  important: ["#8250df", "#fbefff"],
  warning: ["#9a6700", "#fff8c5"],
  caution: ["#cf222e", "#ffebe9"],
};

const STATUS_TONES = {
  neutral: ["#59636e", "#eaeef2"],
  info: ["#0550ae", "#ddf4ff"],
  success: ["#116329", "#dafbe1"],
  note: ["#6639ba", "#fbefff"],
  warning: ["#7d4e00", "#fff8c5"],
  error: ["#a40e26", "#ffebe9"],
};

const TOKEN_COLORS = [
  [".hljs-comment, .hljs-quote, .hljs-code, .hljs-formula", `color:${MUTED};`],
  [".hljs-keyword, .hljs-doctag, .hljs-template-tag, .hljs-template-variable, .hljs-type", "color:#cf222e;"],
  [".hljs-title, .hljs-section", "color:#8250df;"],
  [
    ".hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-variable, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id",
    "color:#0550ae;",
  ],
  [".hljs-regexp, .hljs-string, .hljs-meta .hljs-string", "color:#0a3069;"],
  [".hljs-built_in, .hljs-symbol", "color:#953800;"],
  [".hljs-name, .hljs-selector-tag, .hljs-selector-pseudo", "color:#116329;"],
  [".hljs-bullet", "color:#6e5000;"],
  [".hljs-section", "font-weight:700;"],
  [".hljs-emphasis", "font-style:italic;"],
  [".hljs-strong", "font-weight:700;"],
  [".hljs-addition", "color:#116329;background-color:#dafbe1;"],
  [".hljs-deletion", "color:#82071e;background-color:#ffebe9;"],
];

/**
 * Inline style declarations applied per selector, in order, so later rules override earlier ones.
 * Colors and fonts are fixed literals; nothing refers to theme variables or stylesheets.
 */
export const STYLE_RULES = [
  ["h1", heading("2em", ruled)],
  ["h2", heading("1.5em", ruled)],
  ["h3", heading("1.25em")],
  ["h4", heading("1em")],
  ["h5", heading("0.875em")],
  ["h6", heading("0.85em", `color:${MUTED};`)],
  ["p", "margin:0 0 16px;"],
  ["a", "color:#0969da;text-decoration:underline;"],
  ["strong, b", "font-weight:600;"],
  ["ul, ol", "margin:0 0 16px;padding-left:2em;"],
  ["li", "margin-top:0.25em;"],
  ["li > ul, li > ol", "margin:0;"],
  ["blockquote", `margin:0 0 16px;padding:0 1em;color:${MUTED};border-left:0.25em solid ${BORDER};`],
  ["hr", `height:0.25em;margin:24px 0;padding:0;border:0;background-color:${BORDER};`],
  ["table", "border-collapse:collapse;margin:0 0 16px;"],
  ["th, td", `border:1px solid ${BORDER};padding:6px 13px;`],
  ["th", `font-weight:600;background-color:${SUBTLE};`],
  [
    ":not(pre) > code",
    `font-family:${MONO};font-size:85%;background-color:#eff1f3;padding:0.2em 0.4em;border-radius:6px;`,
  ],
  [
    "pre",
    `margin:0 0 16px;padding:16px;font-family:${MONO};font-size:85%;line-height:1.45;background-color:${SUBTLE};border-radius:6px;white-space:pre-wrap;`,
  ],
  ["pre code", `font-family:${MONO};font-size:100%;background-color:transparent;padding:0;`],
  ["img", "max-width:100%;"],
  ["del, s", `color:${MUTED};`],
  ["details", `margin:0 0 16px;padding:4px 12px;border:1px solid ${BORDER};border-radius:4px;`],
  ["summary", "font-weight:600;"],
  [".footnotes", `margin-top:32px;padding-top:16px;border-top:1px solid ${BORDER};font-size:0.875em;color:${MUTED};`],
  [
    "#frontmatter-panel",
    `margin:0 0 16px;padding:8px 12px;background-color:${SUBTLE};border:1px solid ${BORDER};font-size:12px;color:${MUTED};`,
  ],
  ["#frontmatter-panel table", "margin:0;"],
  ["#frontmatter-panel td", "border:0;padding:2px 8px;"],
  ...TOKEN_COLORS,
  [".markdown-alert", "margin:0 0 16px;padding:8px 16px;border-left:0.25em solid;"],
  [".markdown-alert > p", "margin:0 0 8px;"],
  [".markdown-alert-title", "margin:0 0 4px;font-weight:600;"],
  ...Object.entries(ALERT_TONES).flatMap(([tone, [color, background]]) => [
    [`.markdown-alert-${tone}`, `border-left-color:${color};background-color:${background};`],
    [`.markdown-alert-${tone} > .markdown-alert-title`, `color:${color};`],
  ]),
  ["mark[data-status]", "padding:0 4px;border-radius:3px;font-size:0.75em;font-weight:700;text-transform:uppercase;"],
  ...Object.entries(STATUS_TONES).map(([tone, [color, background]]) => [
    `mark[data-status="${tone}"]`,
    `color:${color};background-color:${background};`,
  ]),
];

export const MATH_STYLE = 'font-family:"Cambria Math", Cambria, serif;font-style:italic;';
export const DIAGRAM_STYLE = "margin:0 0 16px;";
