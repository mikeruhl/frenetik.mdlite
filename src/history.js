const MAX_ENTRIES = 100;

const backStack = [];
const forwardStack = [];
let isNavigating = false;
let getStateFn = null;
let navigateFn = null;

export function initHistory(getState, navigate) {
  getStateFn = getState;
  navigateFn = navigate;
}

export function pushNavigation() {
  if (isNavigating || !getStateFn) return;
  const state = getStateFn();
  const last = backStack[backStack.length - 1];
  if (last && last.filePath === state.filePath && Math.abs(last.scrollTop - state.scrollTop) < 5) {
    return;
  }
  backStack.push({ ...state });
  forwardStack.length = 0;
  if (backStack.length > MAX_ENTRIES) backStack.shift();
}

export async function navigateBack() {
  if (isNavigating || backStack.length === 0 || !navigateFn || !getStateFn) return;
  const state = getStateFn();
  forwardStack.push({ ...state });
  const target = backStack.pop();
  isNavigating = true;
  try {
    await navigateFn(target.filePath, target.scrollTop);
  } finally {
    isNavigating = false;
  }
}

export async function navigateForward() {
  if (isNavigating || forwardStack.length === 0 || !navigateFn || !getStateFn) return;
  const state = getStateFn();
  backStack.push({ ...state });
  const target = forwardStack.pop();
  isNavigating = true;
  try {
    await navigateFn(target.filePath, target.scrollTop);
  } finally {
    isNavigating = false;
  }
}

export function canGoBack() {
  return backStack.length > 0;
}

export function canGoForward() {
  return forwardStack.length > 0;
}

export function isHistoryNavigation() {
  return isNavigating;
}
