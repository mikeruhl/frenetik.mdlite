// Live Block isolation test (Windows). Requires an mdlite debug build whose main window exposes
// --remote-debugging-port, with e2e/live-isolation/isolation.md open. Usage: node run.mjs [port]
const port = process.argv[2] ?? "9333";
const PROBE = "isolation-test.invalid";

async function targets() {
  return (await fetch(`http://127.0.0.1:${port}/json`)).json();
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    pending.get(msg.id)?.(msg);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression, extra = {}) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...extra });
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.text);
    return reply.result?.result?.value;
  };
  return { ws, send, evaluate };
}

const MAIN_STATE = `(async () => ({
  href: location.href,
  title: document.title,
  theme: document.getElementById("theme-style").textContent.length + ":" + document.getElementById("content").className,
  allowlist: await window.__TAURI_INTERNALS__.invoke("get_image_allowlist"),
  probeConsent: await window.__TAURI_INTERNALS__.invoke("live_consent_check", { path: "${PROBE}", content: "${PROBE}" }),
}))()`;

async function readFrameResults(main) {
  const tree = await main.send("Page.getFrameTree");
  const child = tree.result?.frameTree?.childFrames?.find((f) => /mdlive/.test(f.frame.url));
  if (child) {
    const world = await main.send("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "probe" });
    const contextId = world.result.executionContextId;
    return {
      url: child.frame.url,
      text: await main.evaluate('document.getElementById("results")?.textContent ?? null', { contextId }),
    };
  }
  const frameTarget = (await targets()).find((t) => t.type === "iframe" && /mdlive/.test(t.url));
  if (!frameTarget) return { url: null, text: null };
  const frame = await connect(frameTarget.webSocketDebuggerUrl);
  const text = await frame.evaluate('document.getElementById("results")?.textContent ?? null');
  frame.ws.close();
  return { url: frameTarget.url, text };
}

const failures = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : "  " + detail}`);
  if (!ok) failures.push(label);
};

const page = (await targets()).find((t) => t.type === "page");
const main = await connect(page.webSocketDebuggerUrl);
const pagesBefore = (await targets()).filter((t) => t.type === "page").length;
const before = await main.evaluate(MAIN_STATE);

const clicked = await main.evaluate(`(() => {
  const block = document.querySelector(".live-block");
  const button = block?.querySelector(".live-run");
  if (!button) return false;
  if (block.dataset.liveState === "running") button.click();
  button.click();
  return true;
})()`);
check(clicked, "Run control present");
await new Promise((r) => setTimeout(r, 15000));

const frame = await readFrameResults(main);
check(frame.text && frame.text !== "running", "frame reported results", frame.url ?? "no mdlite frame found");
const out = frame.text && frame.text !== "running" ? JSON.parse(frame.text) : {};

for (const [key, value] of Object.entries(out).filter(([k]) => k.startsWith("invoke "))) {
  check(!String(value).startsWith("RESOLVED"), key, value);
}
check(/^(THREW|REJECTED)/.test(out.parentDocument ?? ""), "parent document unreachable", out.parentDocument);
check(/^(THREW|REJECTED)/.test(out.fetchRemote ?? ""), "remote fetch blocked", out.fetchRemote);
check(/^(THREW|REJECTED)/.test(out.fetchIpc ?? ""), "direct IPC fetch blocked", out.fetchIpc);
check(out.remoteImage === "BLOCKED", "remote image blocked", out.remoteImage);
check(out.windowOpen === 'RESOLVED "null"' || /^THREW/.test(out.windowOpen ?? ""), "window.open blocked", out.windowOpen);
check(
  out.formSubmit === undefined || /^(THREW|REJECTED|RESOLVED "submitted")/.test(out.formSubmit),
  "form submission attempted",
  out.formSubmit
);

const after = await main.evaluate(MAIN_STATE);
const pagesAfter = (await targets()).filter((t) => t.type === "page").length;
check(after.href === before.href, "main window not navigated", after.href);
check(after.title === before.title, "window title unchanged", after.title);
check(after.theme === before.theme, "theme unchanged");
check(JSON.stringify(after.allowlist) === JSON.stringify(before.allowlist), "image allow-list unchanged", JSON.stringify(after.allowlist));
check(after.probeConsent === false, "consent store untouched by the frame");
check(pagesAfter === pagesBefore, "no new windows", `${pagesBefore} -> ${pagesAfter}`);
const frameAfter = await readFrameResults(main);
check(frameAfter.url && /mdlive/.test(frameAfter.url), "frame still on mdlive origin after navigation attempts", frameAfter.url);

main.ws.close();
console.log(failures.length ? `\n${failures.length} isolation check(s) failed` : "\nAll isolation checks passed");
process.exit(failures.length ? 1 : 0);
