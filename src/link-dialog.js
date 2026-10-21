const CANCELLED = { open: false, trustOrigin: false };

const COPY = {
  confirmDocument: { title: "Open document in a new window?", primary: "Open" },
  confirmOpenFile: { title: "Open file?", primary: "Open" },
  confirmReveal: { title: "Show file in folder?", primary: "Show in Folder" },
  confirmUrl: { title: "Open web link?", primary: "Open" },
  confirmNetwork: { title: "Open network location?", primary: "Open" },
};

const NETWORK_NOTE = "This file is on another computer. mdlite will connect to it only if you choose Open.";
const INSECURE_WARNING = "This link is not encrypted (http).";

let dismissActive = null;

const byId = (id) => document.getElementById(id);

function fillDestination(el, action) {
  el.replaceChildren();
  if (action.kind !== "confirmUrl") {
    el.textContent = action.path;
    return;
  }
  const { url, origin } = action;
  const host = originHost(origin);
  const at = host ? hostStart(url) : -1;
  if (at < 0 || url.slice(at, at + host.length).toLowerCase() !== host.toLowerCase()) {
    el.textContent = url;
    return;
  }
  const end = at + host.length;
  const strong = document.createElement("strong");
  strong.textContent = url.slice(at, end);
  el.append(document.createTextNode(url.slice(0, at)), strong, document.createTextNode(url.slice(end)));
}

function originHost(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function hostStart(url) {
  const scheme = url.indexOf("//");
  if (scheme < 0) return -1;
  const start = scheme + 2;
  const rest = url.slice(start);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  return start + authority.lastIndexOf("@") + 1;
}

function show({ title, primary, destination, note, warning, trustLabel, withInput, initialFocus, result }) {
  if (dismissActive) dismissActive();

  const overlay = byId("link-dialog-overlay");
  const cancel = byId("link-dialog-cancel");
  const ok = byId("link-dialog-ok");
  const input = byId("link-dialog-input");
  const trust = byId("link-dialog-trust");
  const previouslyFocused = document.activeElement;

  byId("link-dialog-title").textContent = title;
  ok.textContent = primary;

  const dest = byId("link-dialog-destination");
  dest.hidden = !destination;
  if (destination) destination(dest);

  for (const [id, text] of [
    ["link-dialog-note", note],
    ["link-dialog-warning", warning],
  ]) {
    const el = byId(id);
    el.hidden = !text;
    el.textContent = text ?? "";
  }

  byId("link-dialog-trust-row").hidden = !trustLabel;
  byId("link-dialog-trust-label").textContent = trustLabel ?? "";
  trust.checked = false;

  input.hidden = !withInput;
  input.value = "";

  return new Promise((resolve) => {
    function close(value) {
      overlay.classList.add("link-dialog-hidden");
      document.removeEventListener("keydown", onKeydown, true);
      overlay.removeEventListener("click", onOverlayClick);
      cancel.removeEventListener("click", onCancel);
      ok.removeEventListener("click", onOk);
      input.removeEventListener("keydown", onInputKeydown);
      dismissActive = null;
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
      resolve(value);
    }
    const onCancel = () => close(result(false));
    const onOk = () => close(result(true));
    const onOverlayClick = (e) => {
      if (e.target === overlay) onCancel();
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    const onInputKeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onOk();
      }
    };

    dismissActive = onCancel;
    document.addEventListener("keydown", onKeydown, true);
    overlay.addEventListener("click", onOverlayClick);
    cancel.addEventListener("click", onCancel);
    ok.addEventListener("click", onOk);
    input.addEventListener("keydown", onInputKeydown);

    overlay.classList.remove("link-dialog-hidden");
    (initialFocus === "input" ? input : cancel).focus();
  });
}

export function confirmLink(action) {
  const copy = COPY[action.kind];
  if (!copy) return Promise.resolve(CANCELLED);
  const isUrl = action.kind === "confirmUrl";
  return show({
    title: copy.title,
    primary: copy.primary,
    destination: (el) => fillDestination(el, action),
    note: action.kind === "confirmNetwork" ? NETWORK_NOTE : null,
    warning: isUrl && action.insecure ? INSECURE_WARNING : null,
    trustLabel: isUrl ? `Always trust ${action.origin}` : null,
    result: (accepted) =>
      accepted ? { open: true, trustOrigin: isUrl && byId("link-dialog-trust").checked } : CANCELLED,
  });
}

export function promptFileType() {
  return show({
    title: "Add Safe File Type",
    primary: "Add",
    withInput: true,
    initialFocus: "input",
    result: (accepted) => {
      if (!accepted) return null;
      return byId("link-dialog-input").value.trim() || null;
    },
  });
}
