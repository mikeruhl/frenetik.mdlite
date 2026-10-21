/**
 * Rich Block registry, keyed by fenced code language.
 *
 * A renderer is `{ selector, emit(encodedSource, idx), render(blocks), setTheme(themeId) }`:
 * `emit` returns the container HTML placed in the document before sanitization, `render`
 * fills the inserted containers, and `setTheme` returns true when existing blocks must re-render.
 */
const renderers = new Map();
let counter = 0;

export function registerRichBlock(lang, renderer) {
  renderers.set(lang, renderer);
}

export function isRichBlockLang(lang) {
  return renderers.has(lang);
}

export function emitRichBlock(lang, source) {
  return renderers.get(lang).emit(encodeSource(source), counter++);
}

export function resetRichBlockCounter() {
  counter = 0;
}

export function encodeSource(text) {
  const bytes = new TextEncoder().encode(text);
  const chars = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i]);
  return btoa(chars.join(""));
}

export function decodeSource(encoded) {
  return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
}

/** CSS selector matching the container of every registered Rich Block. */
export function richBlockSelector() {
  return [...renderers.values()].map((renderer) => renderer.selector).join(", ");
}

function blocksFor(root, renderer) {
  return [...root.querySelectorAll(renderer.selector)];
}

/** Renders every Rich Block under `root`; resolves when all renderers finish. */
export async function renderRichBlocks(root) {
  await Promise.all(
    [...renderers.values()].map((renderer) => {
      const blocks = blocksFor(root, renderer);
      return blocks.length ? renderer.render(blocks) : undefined;
    })
  );
}

/** Applies the app theme to every renderer and re-renders the blocks whose output depends on it. */
export async function setRichBlockTheme(themeId, root) {
  await Promise.all(
    [...renderers.values()].map((renderer) => {
      if (!renderer.setTheme(themeId)) return undefined;
      const blocks = blocksFor(root, renderer);
      return blocks.length ? renderer.render(blocks) : undefined;
    })
  );
}
