let latest = Promise.resolve();
let wake = () => {};
let changed = new Promise((resolve) => (wake = resolve));

function setLatest(promise) {
  latest = promise;
  const notify = wake;
  changed = new Promise((resolve) => (wake = resolve));
  notify();
}

export function trackRichRender(promise) {
  setLatest(Promise.resolve(promise).catch(() => {}));
}

/**
 * Resolves true once the latest Rich Block render settles, or false after `timeoutMs`. Work tracked or joined while
 * waiting is also awaited; a replacement render releases the wait on the render it superseded.
 */
export function awaitRichRender(timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = async () => {
    let current;
    do {
      current = latest;
      await Promise.race([current, changed]);
    } while (current !== latest);
    return true;
  };
  return Promise.race([settled(), timeout]).finally(() => clearTimeout(timer));
}

/** Adds work to the in-flight render, such as a theme re-render, without superseding it. */
export function joinRichRender(promise) {
  setLatest(Promise.all([latest, Promise.resolve(promise).catch(() => {})]));
}
