// frontend/src/lib/auth.ts
export const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

export const AUTH_EVENT = "pickmovie-auth-changed";

export function isLoggedInFallback(): boolean {
  try {
    return (
      !!localStorage.getItem(AUTH_KEYS.ACCESS) ||
      !!localStorage.getItem(AUTH_KEYS.USER)
    );
  } catch {
    return false;
  }
}

export function dispatchAuthChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(AUTH_EVENT));
  window.dispatchEvent(new Event("pickmovie:auth"));
}
