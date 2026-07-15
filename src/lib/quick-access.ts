export const QUICK_ACCESS_TOKEN_KEY = "sumi.quickAccessToken";

export function getQuickAccessToken() {
  try {
    return window.localStorage.getItem(QUICK_ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setQuickAccessToken(token: string) {
  window.localStorage.setItem(QUICK_ACCESS_TOKEN_KEY, token);
}

export function clearQuickAccessToken() {
  try {
    window.localStorage.removeItem(QUICK_ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
