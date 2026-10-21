import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { confirmLink, promptFileType } from "./link-dialog.js";

const html = readFileSync(resolve(cwd(), "index.html"), "utf8");
const overlayMarkup = new DOMParser()
  .parseFromString(html, "text/html")
  .getElementById("link-dialog-overlay").outerHTML;

const $ = (id) => document.getElementById(id);
const CANCELLED = { open: false, trustOrigin: false };

describe("link dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = overlayMarkup;
  });

  it("destination is text, not HTML", async () => {
    const p = confirmLink({ kind: "confirmDocument", path: "C:\\<img src=x onerror=alert(1)>.md" });
    expect(document.querySelector("#link-dialog-destination img")).toBeNull();
    expect($("link-dialog-destination").textContent).toContain("<img");
    $("link-dialog-cancel").click();
    await expect(p).resolves.toEqual(CANCELLED);
  });

  it("cancel has initial focus", async () => {
    const p = confirmLink({ kind: "confirmOpenFile", path: "C:\\a.pdf" });
    expect(document.activeElement.id).toBe("link-dialog-cancel");
    $("link-dialog-cancel").click();
    await p;
  });

  it("uses the title and primary button copy per kind", async () => {
    const cases = [
      [{ kind: "confirmDocument", path: "a" }, "Open document in a new window?", "Open"],
      [{ kind: "confirmOpenFile", path: "a" }, "Open file?", "Open"],
      [{ kind: "confirmReveal", path: "a" }, "Show file in folder?", "Show in Folder"],
      [{ kind: "confirmUrl", url: "http://x.io/", origin: "http://x.io", insecure: false }, "Open web link?", "Open"],
      [{ kind: "confirmNetwork", path: "\\\\h\\s\\a" }, "Open network location?", "Open"],
    ];
    for (const [action, title, button] of cases) {
      const p = confirmLink(action);
      expect($("link-dialog-title").textContent).toBe(title);
      expect($("link-dialog-ok").textContent).toBe(button);
      $("link-dialog-cancel").click();
      await p;
    }
  });

  it("reveal dialog uses Show in Folder", async () => {
    const p = confirmLink({ kind: "confirmReveal", path: "C:\\a.pdf" });
    expect($("link-dialog-ok").textContent).toBe("Show in Folder");
    $("link-dialog-ok").click();
    await expect(p).resolves.toEqual({ open: true, trustOrigin: false });
  });

  it("network dialog explains the remote connection", async () => {
    const p = confirmLink({ kind: "confirmNetwork", path: "\\\\h\\s\\a.md" });
    expect($("link-dialog-note").hidden).toBe(false);
    expect($("link-dialog-note").textContent).toBe(
      "This file is on another computer. mdlite will connect to it only if you choose Open."
    );
    $("link-dialog-cancel").click();
    await p;
  });

  it("escape cancels", async () => {
    const p = confirmLink({ kind: "confirmDocument", path: "C:\\a.md" });
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(p).resolves.toEqual(CANCELLED);
  });

  it("overlay click cancels but dialog click does not", async () => {
    const p = confirmLink({ kind: "confirmDocument", path: "C:\\a.md" });
    $("link-dialog").click();
    expect($("link-dialog-overlay").classList.contains("link-dialog-hidden")).toBe(false);
    $("link-dialog-overlay").click();
    await expect(p).resolves.toEqual(CANCELLED);
    expect($("link-dialog-overlay").classList.contains("link-dialog-hidden")).toBe(true);
  });

  it("url dialog shows origin, warning, and trust checkbox", async () => {
    const p = confirmLink({ kind: "confirmUrl", url: "http://x.io/path", origin: "http://x.io", insecure: true });
    expect($("link-dialog-warning").hidden).toBe(false);
    expect($("link-dialog-warning").textContent).toBe("This link is not encrypted (http).");
    expect($("link-dialog-trust-row").hidden).toBe(false);
    expect($("link-dialog-trust-label").textContent).toBe("Always trust http://x.io");
    expect($("link-dialog-destination").textContent).toBe("http://x.io/path");
    expect($("link-dialog-destination").querySelector("strong").textContent).toBe("x.io");
    $("link-dialog-trust").click();
    $("link-dialog-ok").click();
    await expect(p).resolves.toEqual({ open: true, trustOrigin: true });
  });

  const destinationParts = (action) => {
    const p = confirmLink({ insecure: false, ...action, kind: "confirmUrl" });
    const dest = $("link-dialog-destination");
    const strong = dest.querySelector("strong");
    const parts = {
      text: dest.textContent,
      host: strong?.textContent ?? null,
      before: strong ? (strong.previousSibling?.textContent ?? "") : null,
    };
    $("link-dialog-cancel").click();
    return p.then(() => parts);
  };

  it("emphasizes the real host, not a userinfo lookalike", async () => {
    const parts = await destinationParts({ url: "https://evil.com@evil.com/x", origin: "https://evil.com" });
    expect(parts).toEqual({ text: "https://evil.com@evil.com/x", host: "evil.com", before: "https://evil.com@" });
  });

  it("emphasizes the host regardless of case or port", async () => {
    expect(await destinationParts({ url: "https://X.io:8443/a", origin: "https://x.io" })).toEqual({
      text: "https://X.io:8443/a",
      host: "X.io",
      before: "https://",
    });
  });

  it("emphasizes a punycode host", async () => {
    const parts = await destinationParts({
      url: "https://xn--bcher-kva.example/x",
      origin: "https://xn--bcher-kva.example",
    });
    expect(parts.host).toBe("xn--bcher-kva.example");
  });

  it("shows the url as plain text when the origin cannot be parsed", async () => {
    expect(await destinationParts({ url: "https://x.io/a", origin: "not a url" })).toEqual({
      text: "https://x.io/a",
      host: null,
      before: null,
    });
  });

  it("shows the url as plain text when the host is not where expected", async () => {
    expect(await destinationParts({ url: "https://a.io/x.io", origin: "https://x.io" })).toEqual({
      text: "https://a.io/x.io",
      host: null,
      before: null,
    });
  });

  it("secure url hides the warning and trust is off by default", async () => {
    const p = confirmLink({ kind: "confirmUrl", url: "https://x.io/", origin: "https://x.io", insecure: false });
    expect($("link-dialog-warning").hidden).toBe(true);
    $("link-dialog-ok").click();
    await expect(p).resolves.toEqual({ open: true, trustOrigin: false });
  });

  it("non-url dialogs hide the trust row and input", async () => {
    const p = confirmLink({ kind: "confirmDocument", path: "C:\\a.md" });
    expect($("link-dialog-trust-row").hidden).toBe(true);
    expect($("link-dialog-input").hidden).toBe(true);
    $("link-dialog-ok").click();
    await expect(p).resolves.toEqual({ open: true, trustOrigin: false });
  });

  it("removes listeners after close", async () => {
    const p = confirmLink({ kind: "confirmDocument", path: "C:\\a.md" });
    $("link-dialog-cancel").click();
    await p;
    const q = confirmLink({ kind: "confirmDocument", path: "C:\\b.md" });
    $("link-dialog-ok").click();
    await expect(q).resolves.toEqual({ open: true, trustOrigin: false });
  });

  it("a second dialog cancels the first instead of stacking", async () => {
    const first = confirmLink({ kind: "confirmDocument", path: "C:\\a.md" });
    const second = confirmLink({ kind: "confirmOpenFile", path: "C:\\b.pdf" });
    await expect(first).resolves.toEqual(CANCELLED);
    expect($("link-dialog-title").textContent).toBe("Open file?");
    $("link-dialog-ok").click();
    await expect(second).resolves.toEqual({ open: true, trustOrigin: false });
  });
});

describe("promptFileType", () => {
  beforeEach(() => {
    document.body.innerHTML = overlayMarkup;
  });

  it("returns trimmed input on Add", async () => {
    const p = promptFileType();
    expect($("link-dialog-title").textContent).toBe("Add Safe File Type");
    expect($("link-dialog-ok").textContent).toBe("Add");
    expect($("link-dialog-input").hidden).toBe(false);
    expect($("link-dialog-destination").hidden).toBe(true);
    $("link-dialog-input").value = "  .pdf ";
    $("link-dialog-ok").click();
    await expect(p).resolves.toBe(".pdf");
  });

  it("returns null on cancel", async () => {
    const p = promptFileType();
    $("link-dialog-cancel").click();
    await expect(p).resolves.toBeNull();
  });

  it("returns null on escape and on empty input", async () => {
    const a = promptFileType();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(a).resolves.toBeNull();
    const b = promptFileType();
    $("link-dialog-input").value = "   ";
    $("link-dialog-ok").click();
    await expect(b).resolves.toBeNull();
  });

  it("enter submits and input has focus", async () => {
    const p = promptFileType();
    expect(document.activeElement.id).toBe("link-dialog-input");
    $("link-dialog-input").value = "txt";
    $("link-dialog-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await expect(p).resolves.toBe("txt");
  });
});
