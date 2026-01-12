// frontend/src/lib/apiClient.ts
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  payload: any;
  path: string;

  constructor(message: string, status: number, payload: any, path: string) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.path = path;
  }
}

// ✅ PickMovie에서 쓰는 access token 키 (Header.tsx에서 쓰던 키와 맞춰주세요)
const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
} as const;

function getAccessToken(): string | null {
  try {
    return localStorage.getItem(AUTH_KEYS.ACCESS);
  } catch {
    return null;
  }
}

function buildHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra ?? {}),
  };

  // ✅ 토큰이 있으면 Bearer도 같이 전송 (쿠키 인증이어도 문제 없음)
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

function normalizeParamValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value === "") return null;

  if (Array.isArray(value)) {
    const filtered = value
      .map((v) => (v === undefined || v === null ? "" : String(v)))
      .filter(Boolean);
    return filtered.length ? filtered.join(",") : null;
  }

  if (typeof value === "object") {
    if (key === "page") {
      const v: any = value as any;
      const cand = v?.page ?? v?.value ?? v?.current ?? v?.index;
      if (typeof cand === "number" || typeof cand === "string") {
        const n = Number(cand);
        return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : "1";
      }
      if ((import.meta as any).env?.DEV) {
        console.warn(`[apiClient] invalid page object dropped:`, value);
      }
      return null;
    }

    if ((import.meta as any).env?.DEV) {
      console.warn(`[apiClient] object param dropped: "${key}"`, value);
    }
    return null;
  }

  return String(value);
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    // ✅ key 정렬로 URL을 안정화(= dedupe/cache hit 확률↑)
    const keys = Object.keys(params).sort();
    for (const key of keys) {
      const normalized = normalizeParamValue(key, (params as any)[key]);
      if (normalized === null) continue;
      url.searchParams.set(key, normalized);
    }
  }

  return url.toString();
}

async function parseBodySafe(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: any): string {
  if (!payload) return "요청 처리 중 오류가 발생했습니다.";

  const msg = payload?.message;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg) && msg.length > 0) return String(msg[0]);

  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload === "string") return payload;

  return "요청 처리 중 오류가 발생했습니다.";
}

async function handleResponse<T>(response: Response, path: string): Promise<T> {
  const payload = await parseBodySafe(response);

  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new ApiError(message, response.status, payload, path);
  }

  if (response.status === 204) return null as unknown as T;
  return payload as T;
}

/* ===========================
   ✅ 최적화 옵션 (NEW)
   - timeoutMs: 일정 시간 지나면 Abort -> caller는 catch로 fallback 처리
   - dedupe: 같은 URL GET 중복 호출을 하나로 합침
   - cacheTtlMs: GET 응답 메모리 캐시
   - staleWhileRevalidate: 캐시가 "만료"여도 일단 즉시 반환 + 뒤에서 갱신(실패해도 무시)
   =========================== */

export type ApiRequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  dedupe?: boolean;

  cacheTtlMs?: number; // GET 전용
  staleWhileRevalidate?: boolean; // GET 전용

  retry?: number; // 네트워크/timeout성 실패 재시도 횟수(기본 0)
  retryDelayMs?: number; // 재시도 간격(기본 200ms)
};

type CacheEntry = {
  value: any;
  expiresAt: number;
};

const GET_INFLIGHT = new Map<string, Promise<any>>();
const GET_CACHE = new Map<string, CacheEntry>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function combineSignals(
  a?: AbortSignal,
  b?: AbortSignal
): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (!a && b) return b;

  const A: any = AbortSignal as any;
  if (A && typeof A.any === "function") {
    return A.any([a!, b!]);
  }

  // fallback: 수동 결합
  const controller = new AbortController();
  const onAbort = () => {
    if (controller.signal.aborted) return;
    controller.abort();
  };

  const cleanups: Array<() => void> = [];
  const add = (sig: AbortSignal) => {
    if (sig.aborted) {
      onAbort();
      return;
    }
    const fn = () => onAbort();
    sig.addEventListener("abort", fn, { once: true });
    cleanups.push(() => sig.removeEventListener("abort", fn));
  };

  add(a!);
  add(b!);

  if (controller.signal.aborted) {
    cleanups.forEach((c) => c());
  }

  return controller.signal;
}

function makeTimeoutSignal(timeoutMs?: number): {
  signal?: AbortSignal;
  cancel: () => void;
} {
  if (!timeoutMs || timeoutMs <= 0)
    return { signal: undefined, cancel: () => {} };

  const controller = new AbortController();
  const id = window.setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);

  return {
    signal: controller.signal,
    cancel: () => window.clearTimeout(id),
  };
}

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    String(err?.message || "")
      .toLowerCase()
      .includes("aborted")
  );
}

async function requestJson<T>(args: {
  method: "GET" | "POST" | "DELETE";
  path: string;
  params?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
  options?: ApiRequestOptions;
}): Promise<T> {
  const { method, path, params, body, headers, options } = args;

  const url = buildUrl(path, params);
  const timeoutMs =
    typeof options?.timeoutMs === "number"
      ? options!.timeoutMs
      : method === "GET"
      ? 8000
      : 12000;

  const retry = Math.max(0, Number(options?.retry ?? 0));
  const retryDelayMs = Math.max(0, Number(options?.retryDelayMs ?? 200));

  // ✅ GET 캐시 (fresh hit)
  if (method === "GET") {
    const ttl = Math.max(0, Number(options?.cacheTtlMs ?? 0));
    const cached = ttl > 0 ? GET_CACHE.get(url) : undefined;
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value as T;
    }

    // ✅ stale-while-revalidate: 만료여도 즉시 반환 + 뒤에서 갱신
    if (cached && options?.staleWhileRevalidate) {
      // 백그라운드 갱신(실패는 조용히 무시)
      void (async () => {
        try {
          await requestJson<T>({
            method: "GET",
            path,
            params,
            options: { ...options, staleWhileRevalidate: false },
          });
        } catch {}
      })();

      return cached.value as T;
    }

    // ✅ GET dedupe
    const dedupe = options?.dedupe !== false; // 기본 true
    if (dedupe) {
      const inflight = GET_INFLIGHT.get(url);
      if (inflight) return inflight as Promise<T>;
    }
  }

  const doFetch = async () => {
    const timeout = makeTimeoutSignal(timeoutMs);
    const mergedSignal = combineSignals(options?.signal, timeout.signal);

    try {
      const res = await fetch(url, {
        method,
        headers: buildHeaders(headers),
        credentials: "include",
        body:
          method === "POST" || method === "DELETE"
            ? JSON.stringify(body ?? {})
            : undefined,
        signal: mergedSignal,
      });

      return await handleResponse<T>(res, path);
    } catch (e: any) {
      // ✅ timeout/abort는 빠르게 fallback 갈 수 있게 408으로 통일
      if (isAbortError(e)) {
        throw new ApiError("요청 시간이 초과되었습니다.", 408, null, path);
      }
      throw e;
    } finally {
      timeout.cancel();
    }
  };

  const runner = (async () => {
    let lastErr: any = null;

    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        const data = await doFetch();

        // ✅ GET 캐시 저장
        if (method === "GET") {
          const ttl = Math.max(0, Number(options?.cacheTtlMs ?? 0));
          if (ttl > 0) {
            GET_CACHE.set(url, { value: data, expiresAt: Date.now() + ttl });
          }
        }

        return data;
      } catch (e: any) {
        lastErr = e;

        // abort/timeout은 재시도해도 체감상 의미 없어서(기본) 바로 던짐
        if (e instanceof ApiError && e.status === 408) throw e;

        // 명시적 ApiError(HTTP 에러)는 보통 재시도 불필요(원하면 retry 옵션 사용)
        if (e instanceof ApiError) {
          if (attempt >= retry) throw e;
        } else {
          if (attempt >= retry) throw e;
        }

        if (retryDelayMs > 0) await sleep(retryDelayMs);
      }
    }

    throw lastErr;
  })();

  // ✅ GET inflight 등록/해제
  if (method === "GET") {
    const dedupe = options?.dedupe !== false; // 기본 true
    if (dedupe) GET_INFLIGHT.set(url, runner as Promise<any>);
    try {
      return await runner;
    } finally {
      if (dedupe) GET_INFLIGHT.delete(url);
    }
  }

  return runner;
}

/* ===========================
   ✅ Public APIs (기존 호환 + 옵션 추가)
   =========================== */

// overloads
export async function apiGet<T>(
  path: string,
  params?: Record<string, any>
): Promise<T>;
export async function apiGet<T>(
  path: string,
  params: Record<string, any> | undefined,
  options: ApiRequestOptions
): Promise<T>;
export async function apiGet<T>(
  path: string,
  params: Record<string, any> = {},
  options?: ApiRequestOptions
): Promise<T> {
  return requestJson<T>({
    method: "GET",
    path,
    params,
    options,
  });
}

export async function apiPost<T>(
  path: string,
  body: any,
  options?: ApiRequestOptions
): Promise<T> {
  return requestJson<T>({
    method: "POST",
    path,
    body,
    headers: { "Content-Type": "application/json" },
    options,
  });
}

export async function apiDelete<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return requestJson<T>({
    method: "DELETE",
    path,
    body,
    headers: { "Content-Type": "application/json" },
    options,
  });
}
