// frontend/src/lib/auth.ts
export const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

export const AUTH_EVENT = "pickmovie-auth-changed";
export const AUTH_MODAL_OPEN_EVENT = "pickmovie-open-auth-modal";
export type AuthModalMode = "login" | "signup";
const AUTH_INTENT_KEY = "pickmovie_auth_intent_v1";
const AUTH_INTENT_TTL_MS = 30 * 60 * 1000;

export type AuthIntent = {
  type: "open_playlist_selection";
  source: "search" | "analyze";
  returnTo: string;
  createdAt: number;
  expiresAt: number;
};

function normalizeReturnPath(path: string | null | undefined): string {
  const raw = String(path ?? "").trim();
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

function readAuthIntent(): AuthIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthIntent>;
    if (
      parsed?.type !== "open_playlist_selection" ||
      (parsed?.source !== "search" && parsed?.source !== "analyze")
    ) {
      localStorage.removeItem(AUTH_INTENT_KEY);
      return null;
    }
    const expiresAt = Number(parsed.expiresAt ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(AUTH_INTENT_KEY);
      return null;
    }
    return {
      type: "open_playlist_selection",
      source: parsed.source,
      returnTo: normalizeReturnPath(parsed.returnTo),
      createdAt: Number(parsed.createdAt ?? Date.now()),
      expiresAt,
    };
  } catch {
    try {
      localStorage.removeItem(AUTH_INTENT_KEY);
    } catch {}
    return null;
  }
}

export function setAuthIntent(input: {
  type: "open_playlist_selection";
  source: "search" | "analyze";
  returnTo: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const intent: AuthIntent = {
      type: input.type,
      source: input.source,
      returnTo: normalizeReturnPath(input.returnTo),
      createdAt: now,
      expiresAt: now + AUTH_INTENT_TTL_MS,
    };
    localStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(intent));
  } catch {}
}

export function clearAuthIntent() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_INTENT_KEY);
  } catch {}
}

export function consumeAuthIntent(
  predicate?: (intent: AuthIntent) => boolean,
): AuthIntent | null {
  const intent = readAuthIntent();
  if (!intent) return null;
  if (predicate && !predicate(intent)) return null;
  clearAuthIntent();
  return intent;
}

export function getAuthIntent(): AuthIntent | null {
  return readAuthIntent();
}

export function resolveAuthIntentReturnPath(defaultPath = "/"): string {
  const intent = readAuthIntent();
  if (!intent) return normalizeReturnPath(defaultPath);
  return intent.returnTo || normalizeReturnPath(defaultPath);
}

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
