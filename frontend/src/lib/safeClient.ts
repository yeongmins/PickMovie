// frontend/src/lib/safeClient.ts
type Query = Record<string, string | number | boolean | null | undefined>;

export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function apiBaseUrl(): string {
  // Vite 환경변수 우선, 없으면 로컬 백엔드
  return (
    (import.meta as any)?.env?.VITE_API_BASE_URL || "http://localhost:3000"
  );
}

export async function safeCall<T>(
  fn: (...args: any[]) => Promise<T>,
  arg?: any
): Promise<T> {
  try {
    // 대부분 fn(arg) 형태
    return (await fn(arg)) as T;
  } catch {
    // 어떤 함수는 fn() 형태
    return (await fn()) as T;
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 2000
): Promise<T> {
  const ac = new AbortController();
  const t = window.setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: ac.signal,
      credentials: "include",
      headers: {
        ...(init?.headers || {}),
        "Content-Type": "application/json",
      },
    });

    // JSON 아닌 경우도 있으니 안전 처리
    const text = await res.text().catch(() => "");
    const data = text ? (JSON.parse(text) as T) : (null as any);

    if (!res.ok) {
      // throw하면 UI 깨지니, 호출부에서 null/빈배열로 처리 가능하게
      throw Object.assign(new Error(`HTTP ${res.status}`), {
        status: res.status,
        data,
      });
    }
    return data;
  } finally {
    window.clearTimeout(t);
  }
}

export async function apiGetSafe<T>(
  path: string,
  query?: Query,
  timeoutMs = 2000
): Promise<T | null> {
  try {
    const base = apiBaseUrl();
    const url = new URL(path, base);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return await fetchJson<T>(url.toString(), { method: "GET" }, timeoutMs);
  } catch {
    return null;
  }
}

export async function apiPostSafe<T>(
  path: string,
  body?: unknown,
  query?: Query,
  timeoutMs = 4000
): Promise<T | null> {
  try {
    const base = apiBaseUrl();
    const url = new URL(path, base);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return await fetchJson<T>(
      url.toString(),
      { method: "POST", body: body ? JSON.stringify(body) : undefined },
      timeoutMs
    );
  } catch {
    return null;
  }
}
