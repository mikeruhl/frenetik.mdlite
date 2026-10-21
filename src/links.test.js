import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { activateLink, initLinks } from "./links.js";

let deps;
beforeEach(() => {
  deps = {
    invoke: vi.fn(),
    navigate: vi.fn(),
    confirm: vi.fn(),
    notify: vi.fn(),
    scrollToFragment: vi.fn(),
  };
});

describe("activateLink", () => {
  it("navigate variant uses sidebar", async () => {
    deps.invoke.mockResolvedValueOnce({ kind: "navigate", path: "C:\\f\\b.md", fragment: "install" });
    await activateLink("b.md#install", deps);
    expect(deps.navigate).toHaveBeenCalledWith("C:\\f\\b.md", "install");
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it("confirm variant follows only on open", async () => {
    deps.invoke.mockResolvedValueOnce({
      kind: "confirmUrl",
      url: "https://x.io",
      origin: "https://x.io",
      insecure: false,
    });
    deps.confirm.mockResolvedValueOnce({ open: true, trustOrigin: true });
    await activateLink("https://x.io", deps);
    expect(deps.invoke).toHaveBeenLastCalledWith("follow_link", { href: "https://x.io", trustOrigin: true });
  });

  it("cancel does not follow", async () => {
    deps.invoke.mockResolvedValueOnce({ kind: "confirmDocument", path: "C:\\d.md" });
    deps.confirm.mockResolvedValueOnce({ open: false, trustOrigin: false });
    await activateLink("d.md", deps);
    expect(deps.invoke).toHaveBeenCalledTimes(1);
  });

  it("openUrl follows without dialog", async () => {
    deps.invoke.mockResolvedValueOnce({ kind: "openUrl", url: "https://t.io" });
    deps.invoke.mockResolvedValueOnce(undefined);
    await activateLink("https://t.io", deps);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.invoke).toHaveBeenLastCalledWith("follow_link", { href: "https://t.io", trustOrigin: false });
  });

  it("notFound and blocked toast", async () => {
    deps.invoke.mockResolvedValueOnce({ kind: "notFound", path: "C:\\x.md" });
    await activateLink("x.md", deps);
    expect(deps.notify).toHaveBeenCalledWith("File not found: C:\\x.md");
    deps.invoke.mockResolvedValueOnce({ kind: "blocked", scheme: "vscode" });
    await activateLink("vscode://x", deps);
    expect(deps.notify).toHaveBeenCalledWith("Link type not supported: vscode");
  });

  it("follow_link failure toasts", async () => {
    deps.invoke.mockResolvedValueOnce({ kind: "openUrl", url: "https://t.io" });
    deps.invoke.mockRejectedValueOnce("boom");
    await activateLink("https://t.io", deps);
    expect(deps.notify).toHaveBeenCalledWith("Could not open link: boom");
  });

  it("resolve_link failure toasts", async () => {
    deps.invoke.mockRejectedValueOnce("bad");
    await activateLink("x", deps);
    expect(deps.notify).toHaveBeenCalledWith("Could not open link: bad");
  });

  it("second activation while first pending is ignored", async () => {
    let release;
    deps.invoke.mockReturnValueOnce(new Promise((r) => (release = r)));
    const first = activateLink("a.md", deps);
    await activateLink("a.md", deps);
    release({ kind: "notFound", path: "a.md" });
    await first;
    expect(deps.invoke).toHaveBeenCalledTimes(1);
  });

  it("activation while a confirm dialog is open is ignored", async () => {
    let answer;
    deps.invoke.mockResolvedValueOnce({
      kind: "confirmUrl",
      url: "https://x.io",
      origin: "https://x.io",
      insecure: false,
    });
    deps.confirm.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const first = activateLink("https://x.io", deps);
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalledTimes(1));
    await activateLink("https://x.io", deps);
    expect(deps.invoke).toHaveBeenCalledTimes(1);
    answer({ open: false, trustOrigin: false });
    await first;
    deps.invoke.mockResolvedValueOnce({ kind: "notFound", path: "n" });
    await activateLink("n", deps);
    expect(deps.invoke).toHaveBeenCalledTimes(2);
  });

  it("confirmNetwork goes through the dialog before follow_link", async () => {
    const action = { kind: "confirmNetwork", path: "\\\\srv\\s\\a.md" };
    deps.invoke.mockResolvedValueOnce(action);
    deps.confirm.mockResolvedValueOnce({ open: true, trustOrigin: false });
    await activateLink("//srv/s/a.md", deps);
    expect(deps.confirm).toHaveBeenCalledWith(action);
    expect(deps.invoke).toHaveBeenLastCalledWith("follow_link", { href: "//srv/s/a.md", trustOrigin: false });
  });
});

describe("initLinks click handling", () => {
  function fire(el, type = "click", init = {}) {
    const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  }

  let dispose;
  afterEach(() => dispose());

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="content"><a id="in" href="x.md">x</a><a id="frag" href="#sec">f</a></div><a id="out" href="y.md">y</a>';
    deps.isTrusted = () => true;
    deps.invoke.mockResolvedValue({ kind: "notFound", path: "x" });
    dispose = initLinks(deps);
  });

  it("prevents default for all links but activates only inside content", async () => {
    const inside = fire(document.getElementById("in"));
    const outside = fire(document.getElementById("out"));
    expect(inside.defaultPrevented).toBe(true);
    expect(outside.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(deps.invoke).toHaveBeenCalledTimes(1));
    expect(deps.invoke).toHaveBeenCalledWith("resolve_link", { href: "x.md" });
  });

  it("outside https anchor is activated", async () => {
    document.body.insertAdjacentHTML("beforeend", '<a id="web" href="HTTPS://github.com/x">w</a>');
    const web = fire(document.getElementById("web"));
    expect(web.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(deps.invoke).toHaveBeenCalledWith("resolve_link", { href: "HTTPS://github.com/x" }));
    await vi.waitFor(() => expect(deps.invoke).toHaveBeenCalledTimes(1));
  });

  it("fragment links scroll in place", () => {
    fire(document.getElementById("frag"));
    expect(deps.scrollToFragment).toHaveBeenCalledWith("sec");
    expect(deps.invoke).not.toHaveBeenCalled();
  });

  it("untrusted click is prevented and not activated", () => {
    deps.isTrusted = () => false;
    const e = fire(document.getElementById("in"));
    expect(e.defaultPrevented).toBe(true);
    expect(deps.invoke).not.toHaveBeenCalled();
  });

  it("auxclick activates for middle button only", async () => {
    const right = fire(document.getElementById("in"), "auxclick", { button: 2 });
    expect(right.defaultPrevented).toBe(false);
    const middle = fire(document.getElementById("in"), "auxclick", { button: 1 });
    expect(middle.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(deps.invoke).toHaveBeenCalledTimes(1));
  });
});
