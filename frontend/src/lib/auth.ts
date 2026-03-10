// frontend/src/lib/auth.ts
export const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

export const AUTH_EVENT = "pickmovie-auth-changed";
export const AUTH_MODAL_OPEN_EVENT = "pickmovie-open-auth-modal";
export type AuthModalMode = "login" | "signup";

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

export function reloadAfterAuth(path?: string) {
  if (typeof window === "undefined") return;

  const target = String(path ?? "").trim();
  if (target) {
    // Redirect 목적일 때는 먼저 auth 이벤트를 발행하지 않아야
    // 보호 페이지의 로그인 모달이 잠깐 뜨는 잔상을 막을 수 있다.
    window.location.replace(target);
    return;
  }

  dispatchAuthChanged();
  window.location.reload();
}

export function openAuthModal(mode: AuthModalMode = "login") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_MODAL_OPEN_EVENT, {
      detail: { mode },
    }),
  );
}
