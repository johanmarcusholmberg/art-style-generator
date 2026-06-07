import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * Reusable in-memory localStorage / sessionStorage shim.
 *
 * jsdom already ships one, but we install our own when missing so the
 * suite runs identically under Bun's bare test runner (no DOM) where
 * `localStorage` is undefined. Keeping the shim consistent across
 * environments prevents flakes in export-format and gallery tests.
 */
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key(i: number) {
      return Object.keys(store)[i] ?? null;
    },
    getItem(k: string) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k: string, v: string) {
      store[k] = String(v);
    },
    removeItem(k: string) {
      delete store[k];
    },
    clear() {
      store = {};
    },
  };
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  try {
    // jsdom already provides a working impl — only install when missing.
    if (typeof window !== "undefined" && !(key in window)) {
      Object.defineProperty(window, key, {
        configurable: true,
        writable: true,
        value: createMemoryStorage(),
      });
    }
  } catch {
    /* defineProperty may throw in locked-down envs — ignore */
  }
}
