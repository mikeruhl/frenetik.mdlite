const contentEl = document.getElementById("content");
const searchBarEl = document.getElementById("search-bar");
const searchInputEl = document.getElementById("search-input");
const searchRegexBtn = document.getElementById("search-regex");
const searchCaseBtn = document.getElementById("search-case");
const searchCountEl = document.getElementById("search-count");
const searchPrevBtn = document.getElementById("search-prev");
const searchNextBtn = document.getElementById("search-next");
const searchCloseBtn = document.getElementById("search-close");

let searchMatches = [];
let searchCurrentIdx = -1;
let searchIsRegex = false;
let searchCaseSensitive = false;

function clearSearchHighlights() {
  contentEl.querySelectorAll("mark.search-match").forEach((mark) => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  searchMatches = [];
  searchCurrentIdx = -1;
  searchCountEl.textContent = "";
}

export function highlightSearchMatches(query) {
  clearSearchHighlights();
  if (!query) return;

  let regex;
  try {
    const flags = searchCaseSensitive ? "g" : "gi";
    regex = searchIsRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    searchInputEl.classList.remove("search-invalid");
  } catch {
    searchInputEl.classList.add("search-invalid");
    searchCountEl.textContent = "Invalid regex";
    return;
  }

  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const text = node.textContent;
    regex.lastIndex = 0;
    const parts = [];
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      if (match.index > lastIdx) parts.push(document.createTextNode(text.slice(lastIdx, match.index)));
      const mark = document.createElement("mark");
      mark.className = "search-match";
      mark.textContent = match[0];
      parts.push(mark);
      lastIdx = regex.lastIndex;
    }
    if (parts.length === 0) continue;
    if (lastIdx < text.length) parts.push(document.createTextNode(text.slice(lastIdx)));
    const frag = document.createDocumentFragment();
    parts.forEach((p) => frag.appendChild(p));
    node.parentNode.replaceChild(frag, node);
  }

  searchMatches = Array.from(contentEl.querySelectorAll("mark.search-match"));
  if (searchMatches.length > 0) {
    searchCurrentIdx = 0;
    searchMatches[0].classList.add("search-match-current");
    searchMatches[0].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  updateSearchCount();
}

function updateSearchCount() {
  if (searchMatches.length === 0) {
    searchCountEl.textContent = searchInputEl.value ? "No results" : "";
  } else {
    searchCountEl.textContent = searchCurrentIdx + 1 + " of " + searchMatches.length;
  }
}

function searchNavigate(direction) {
  if (searchMatches.length === 0) return;
  searchMatches[searchCurrentIdx].classList.remove("search-match-current");
  searchCurrentIdx = (searchCurrentIdx + direction + searchMatches.length) % searchMatches.length;
  searchMatches[searchCurrentIdx].classList.add("search-match-current");
  searchMatches[searchCurrentIdx].scrollIntoView({ behavior: "smooth", block: "center" });
  updateSearchCount();
}

export function openSearch() {
  searchBarEl.classList.remove("search-hidden");
  searchInputEl.focus();
  searchInputEl.select();
}

function closeSearch() {
  searchBarEl.classList.add("search-hidden");
  clearSearchHighlights();
  searchInputEl.value = "";
  searchInputEl.classList.remove("search-invalid");
}

export function isSearchActive() {
  return searchInputEl.value && !searchBarEl.classList.contains("search-hidden");
}

export function getSearchQuery() {
  return searchInputEl.value;
}

export function bindSearchEvents() {
  let searchDebounce;
  searchInputEl.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => highlightSearchMatches(searchInputEl.value), 150);
  });

  searchInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchNavigate(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  });

  searchRegexBtn.addEventListener("click", () => {
    searchIsRegex = !searchIsRegex;
    searchRegexBtn.classList.toggle("active", searchIsRegex);
    highlightSearchMatches(searchInputEl.value);
  });

  searchCaseBtn.addEventListener("click", () => {
    searchCaseSensitive = !searchCaseSensitive;
    searchCaseBtn.classList.toggle("active", searchCaseSensitive);
    highlightSearchMatches(searchInputEl.value);
  });

  searchPrevBtn.addEventListener("click", () => searchNavigate(-1));
  searchNextBtn.addEventListener("click", () => searchNavigate(1));
  searchCloseBtn.addEventListener("click", closeSearch);
}
