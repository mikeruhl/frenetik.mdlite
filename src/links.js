let inFlight = false;

const CONFIRM_KINDS = new Set(["confirmDocument", "confirmOpenFile", "confirmReveal", "confirmUrl", "confirmNetwork"]);

export async function activateLink(href, deps) {
  if (inFlight) return;
  inFlight = true;
  try {
    const action = await deps.invoke("resolve_link", { href });
    if (action.kind === "navigate") {
      await deps.navigate(action.path, action.fragment);
    } else if (action.kind === "openUrl") {
      await deps.invoke("follow_link", { href, trustOrigin: false });
    } else if (CONFIRM_KINDS.has(action.kind)) {
      const decision = await deps.confirm(action);
      if (decision?.open) {
        await deps.invoke("follow_link", { href, trustOrigin: decision.trustOrigin === true });
      }
    } else if (action.kind === "notFound") {
      deps.notify("File not found: " + action.path);
    } else if (action.kind === "blocked") {
      deps.notify("Link type not supported: " + action.scheme);
    }
  } catch (err) {
    deps.notify("Could not open link: " + err);
  } finally {
    inFlight = false;
  }
}

export function initLinks(deps) {
  const handle = (e) => {
    if (!(deps.isTrusted ?? ((ev) => ev.isTrusted))(e)) return;
    if (e.type === "auxclick" && e.button !== 1) return;
    const anchor = e.target.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    e.preventDefault();
    if (href.startsWith("#")) {
      deps.scrollToFragment(href.slice(1));
      return;
    }
    if (!anchor.closest("#content")) return;
    activateLink(href, deps);
  };
  document.addEventListener("click", handle);
  document.addEventListener("auxclick", handle);
  return () => {
    document.removeEventListener("click", handle);
    document.removeEventListener("auxclick", handle);
  };
}
