let latest = Promise.resolve();

export function trackRichRender(promise) {
  latest = Promise.resolve(promise).catch(() => {});
}

/** Resolves true once the latest Rich Block render settles, or false after `timeoutMs`. */
export function awaitRichRender(timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  return Promise.race([latest.then(() => true), timeout]).finally(() => clearTimeout(timer));
}

/** Adds work to the in-flight render, such as a theme re-render, without superseding it. */
export function joinRichRender(promise) {
  latest = Promise.all([latest, Promise.resolve(promise).catch(() => {})]);
}
