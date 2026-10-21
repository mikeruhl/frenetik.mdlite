let latest = Promise.resolve();

export function trackRichRender(promise) {
  latest = Promise.resolve(promise).catch(() => {});
}

/** Resolves true once the latest Rich Block render settles, or false after `timeoutMs`. Work tracked or joined while waiting is also awaited. */
export function awaitRichRender(timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = async () => {
    let current;
    do {
      current = latest;
      await current;
    } while (current !== latest);
    return true;
  };
  return Promise.race([settled(), timeout]).finally(() => clearTimeout(timer));
}

/** Adds work to the in-flight render, such as a theme re-render, without superseding it. */
export function joinRichRender(promise) {
  latest = Promise.all([latest, Promise.resolve(promise).catch(() => {})]);
}
