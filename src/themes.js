import hljsLightCss from "highlight.js/styles/github.min.css?inline";
import hljsDarkCss from "highlight.js/styles/github-dark.min.css?inline";

import githubLightCss from "github-markdown-css/github-markdown-light.css?inline";
import githubDarkCss from "github-markdown-css/github-markdown-dark.css?inline";
import githubDarkDimmedCss from "github-markdown-css/github-markdown-dark-dimmed.css?inline";
import githubDarkHcCss from "github-markdown-css/github-markdown-dark-high-contrast.css?inline";
import githubAutoCss from "github-markdown-css/github-markdown.css?inline";
import githubLightCbCss from "github-markdown-css/github-markdown-light-colorblind.css?inline";
import githubDarkCbCss from "github-markdown-css/github-markdown-dark-colorblind.css?inline";
import splendorCss from "./themes/splendor.css?inline";
import retroCss from "./themes/retro.css?inline";
import airCss from "./themes/air.css?inline";
import modestCss from "./themes/modest.css?inline";

import { updateZoomIndicator } from "./zoom.js";

const ghUrl = "https://github.com/sindresorhus/github-markdown-css";
const mdcssUrl = "https://markdowncss.github.io/";

export const themes = {
  github: {
    label: "GitHub Light",
    css: githubLightCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark": {
    label: "GitHub Dark",
    css: githubDarkCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark-dimmed": {
    label: "GitHub Dark Dimmed",
    css: githubDarkDimmedCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark-hc": {
    label: "GitHub Dark HC",
    css: githubDarkHcCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-auto": {
    label: "GitHub Auto",
    css: githubAutoCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-light-cb": {
    label: "GitHub Light (Colorblind)",
    css: githubLightCbCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  "github-dark-cb": {
    label: "GitHub Dark (Colorblind)",
    css: githubDarkCbCss,
    wrapClass: "markdown-body",
    author: "Sindre Sorhus",
    url: ghUrl,
  },
  splendor: {
    label: "Splendor",
    css: splendorCss,
    wrapClass: null,
    contentCss: "",
    author: "John Otander",
    url: mdcssUrl,
  },
  retro: {
    label: "Retro",
    css: retroCss,
    wrapClass: null,
    contentCss: "#content { max-width: 48rem; margin: 6rem auto 1rem; padding: .25rem; }",
    author: "John Otander",
    url: mdcssUrl,
  },
  air: {
    label: "Air",
    css: airCss,
    wrapClass: null,
    contentCss: "#content { max-width: 48rem; margin: 6rem auto 1rem; text-align: center; }",
    author: "John Otander",
    url: mdcssUrl,
  },
  modest: {
    label: "Modest",
    css: modestCss,
    wrapClass: null,
    contentCss: "#content { max-width: 48rem; margin: 0 auto; padding: .25rem; }",
    author: "John Otander",
    url: mdcssUrl,
  },
};

const GITHUB_WRAP_CSS = `
.markdown-body {
  box-sizing: border-box;
  min-width: 200px;
  max-width: 980px;
  margin: 0 auto;
  padding: 32px 45px;
}
@media (max-width: 767px) {
  .markdown-body { padding: 16px; }
}
`;

const contentEl = document.getElementById("content");
const themeStyleEl = document.getElementById("theme-style");
const hljsStyleEl = document.getElementById("hljs-style");
const attributionEl = document.getElementById("attribution");

export function applyTheme(themeId) {
  const theme = themes[themeId] || themes.github;

  let css = theme.css;
  if (theme.wrapClass === "markdown-body") {
    css += GITHUB_WRAP_CSS;
  } else if (theme.contentCss) {
    css += theme.contentCss;
  }
  themeStyleEl.textContent = css;

  if (theme.wrapClass) {
    contentEl.className = theme.wrapClass;
  } else {
    contentEl.className = "";
  }

  attributionEl.textContent = "";
  if (theme.author) {
    attributionEl.appendChild(document.createTextNode("Theme: "));
    const link = document.createElement("a");
    link.href = theme.url;
    link.textContent = theme.label;
    attributionEl.appendChild(link);
    attributionEl.appendChild(document.createTextNode(" by " + theme.author));
  }
  updateZoomIndicator();

  const isDark = themeId.includes("dark");
  document.body.classList.toggle("dark-sidebar", isDark);
  hljsStyleEl.textContent = isDark ? hljsDarkCss : hljsLightCss;

  requestAnimationFrame(() => {
    const bg = getComputedStyle(contentEl).backgroundColor;
    document.body.style.backgroundColor = bg || "";
  });
}
