const tocTree = document.getElementById("toc-tree");
const tocClose = document.getElementById("toc-close");
const contentEl = document.getElementById("content");
const mainContent = document.getElementById("main-content");

let visible = false;
let observer = null;
const intersectingHeadings = new Set();

export function toggleToc() {
  visible ? hideToc() : showToc();
}

function showToc() {
  visible = true;
  buildToc();
  document.body.classList.add("toc-visible");
  observeHeadings();
}

function hideToc() {
  visible = false;
  document.body.classList.remove("toc-visible");
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

export function refreshToc() {
  if (!visible) return;
  buildToc();
  observeHeadings();
}

function buildToc() {
  tocTree.innerHTML = "";
  const headings = contentEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
  if (headings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "toc-empty";
    empty.textContent = "No headings found";
    tocTree.appendChild(empty);
    return;
  }

  for (const heading of headings) {
    const level = parseInt(heading.tagName[1]);
    const item = document.createElement("button");
    item.className = "toc-item";
    item.type = "button";
    item.dataset.level = level;
    item.style.paddingLeft = 8 + (level - 1) * 14 + "px";
    item.textContent = heading.textContent;
    item.dataset.targetId = heading.id;

    item.addEventListener("click", () => {
      heading.scrollIntoView({ behavior: "smooth" });
    });

    tocTree.appendChild(item);
  }
}

function observeHeadings() {
  if (observer) {
    observer.disconnect();
  }
  intersectingHeadings.clear();

  const headings = contentEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
  if (headings.length === 0) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          intersectingHeadings.add(entry.target);
        } else {
          intersectingHeadings.delete(entry.target);
        }
      }

      let topVisible = null;
      let topVisibleOffset = Infinity;

      for (const heading of intersectingHeadings) {
        const top = heading.getBoundingClientRect().top;
        if (top < topVisibleOffset) {
          topVisible = heading;
          topVisibleOffset = top;
        }
      }

      if (topVisible) {
        highlightTocItem(topVisible.id);
      }
    },
    {
      root: mainContent,
      rootMargin: "0px 0px -80% 0px",
      threshold: 0,
    }
  );

  for (const heading of headings) {
    observer.observe(heading);
  }
}

function highlightTocItem(id) {
  tocTree.querySelectorAll(".toc-item.active").forEach((el) => el.classList.remove("active"));
  const item = tocTree.querySelector(`.toc-item[data-target-id="${CSS.escape(id)}"]`);
  if (item) {
    item.classList.add("active");
    item.scrollIntoView({ block: "nearest" });
  }
}

export function bindTocEvents() {
  tocClose.addEventListener("click", hideToc);
}
