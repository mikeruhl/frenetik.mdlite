import { describe, it, expect, vi, beforeEach } from "vitest";

const platform = { windows: true };

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path, protocol) =>
    platform.windows
      ? `http://${protocol}.localhost/${encodeURIComponent(path)}`
      : `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

async function loadImages() {
  vi.resetModules();
  return import("./images.js");
}

describe("imageProxyUrl", () => {
  it("uses the http://mdimg.localhost form on Windows", async () => {
    platform.windows = true;
    const { imageProxyUrl } = await loadImages();
    expect(imageProxyUrl("https://example.com/a b.png?x=1&y=2")).toBe(
      "http://mdimg.localhost/?u=https%3A%2F%2Fexample.com%2Fa%20b.png%3Fx%3D1%26y%3D2"
    );
  });

  it("uses the mdimg://localhost form on other platforms", async () => {
    platform.windows = false;
    const { imageProxyUrl } = await loadImages();
    expect(imageProxyUrl("https://example.com/a.png")).toBe("mdimg://localhost/?u=https%3A%2F%2Fexample.com%2Fa.png");
  });
});

describe("parseRemoteUrl", () => {
  it.each([
    ["https://example.com/a.png", "https://example.com/a.png"],
    ["  http://Example.com/a.png", "http://example.com/a.png"],
    ["//example.com/a.png", "https://example.com/a.png"],
    ["https:example.com/a.png", "https://example.com/a.png"],
    ["https:/example.com/a.png", "https://example.com/a.png"],
    ["http:example.com/a.png", "http://example.com/a.png"],
  ])("parses %s", async (src, expected) => {
    const { parseRemoteUrl } = await loadImages();
    expect(parseRemoteUrl(src).href).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "a.png",
    "./a.png",
    "/a.png",
    "data:image/png;base64,AA",
    "file:///c:/a.png",
    "javascript:x",
  ])("rejects %s", async (src) => {
    const { parseRemoteUrl } = await loadImages();
    expect(parseRemoteUrl(src)).toBeNull();
  });
});

describe("placeholder actions", () => {
  let images;

  beforeEach(async () => {
    platform.windows = true;
    images = await loadImages();
    document.body.innerHTML = `
      <div id="root">
        <span class="remote-image-placeholder" data-remote-src="https://example.com/a.png" data-alt="Logo">
          <span class="remote-image-alt">Logo</span><span class="remote-image-host">trusted.org</span>
        </span>
        <span class="remote-image-placeholder" data-remote-src="https://example.com/a.png" data-alt="Logo again"></span>
        <span class="remote-image-placeholder" data-remote-src="https://example.com/b.png" data-alt="Other"></span>
      </div>`;
  });

  it("attaches Load once and Always allow actions using the host from data-remote-src", () => {
    const onLoadOnce = vi.fn();
    const onAllowHost = vi.fn();
    const root = document.getElementById("root");
    images.bindImagePlaceholders(root, { onLoadOnce, onAllowHost });
    images.bindImagePlaceholders(root, { onLoadOnce, onAllowHost });

    const first = root.querySelector(".remote-image-placeholder");
    const buttons = first.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[1].textContent).toBe("Always allow example.com");

    buttons[0].click();
    expect(onLoadOnce).toHaveBeenCalledWith("https://example.com/a.png");
    buttons[1].click();
    expect(onAllowHost).toHaveBeenCalledWith("example.com");
  });

  it("keeps placeholder action clicks from activating an enclosing link", () => {
    document.body.innerHTML = `
      <a id="root" href="https://example.com/page">
        <span class="remote-image-placeholder" data-remote-src="https://example.com/logo.png"></span>
      </a>`;
    const onLoadOnce = vi.fn();
    const linkHandler = vi.fn();
    document.addEventListener("click", linkHandler);
    document.addEventListener("auxclick", linkHandler);
    const root = document.getElementById("root");
    images.bindImagePlaceholders(root, { onLoadOnce, onAllowHost: vi.fn() });

    const button = root.querySelector("button");
    const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    const middle = new window.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    button.dispatchEvent(middle);
    document.removeEventListener("click", linkHandler);
    document.removeEventListener("auxclick", linkHandler);

    expect(onLoadOnce).toHaveBeenCalledWith("https://example.com/logo.png");
    expect(linkHandler).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(middle.defaultPrevented).toBe(true);
  });

  it("reveals every placeholder for the loaded URL through the proxy", () => {
    const root = document.getElementById("root");
    images.revealPlaceholders(root, "https://example.com/a.png");
    const imgs = root.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("src")).toBe("http://mdimg.localhost/?u=https%3A%2F%2Fexample.com%2Fa.png");
    expect([...imgs].map((img) => img.alt)).toEqual(["Logo", "Logo again"]);
    expect(root.querySelectorAll(".remote-image-placeholder")).toHaveLength(1);
  });

  it("matches session URLs exactly and hosts case-insensitively", () => {
    const url = new URL("https://Example.com/a.png");
    expect(images.isImageAllowed(url, { hosts: ["example.com"] })).toBe(true);
    expect(images.isImageAllowed(url, { urls: new Set(["https://example.com/a.png"]) })).toBe(true);
    expect(images.isImageAllowed(url, {})).toBe(false);
  });
});
