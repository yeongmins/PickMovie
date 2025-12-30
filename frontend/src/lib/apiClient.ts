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

function normalizeParamValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value === "") return null;

  // ✅ 배열은 "a,b,c"로
  if (Array.isArray(value)) {
    const filtered = value
      .map((v) => (v === undefined || v === null ? "" : String(v)))
      .filter(Boolean);
    return filtered.length ? filtered.join(",") : null;
  }

  // ✅ 객체가 들어오면 [object Object] 방지
  if (typeof value === "object") {
    // 🔥 핵심: page가 객체로 들어오는 케이스 방어
    if (key === "page") {
      const v: any = value as any;
      const cand = v?.page ?? v?.value ?? v?.current ?? v?.index;
      if (typeof cand === "number" || typeof cand === "string") {
        const n = Number(cand);
        return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : "1";
      }
      // page 객체면 그냥 제거해서 서버가 default page(보통 1) 쓰게 함
      if ((import.meta as any).env?.DEV) {
        console.warn(`[apiClient] invalid page object dropped:`, value);
      }
      return null;
    }

    // 그 외 객체는 실수 가능성 ↑ → DEV 경고 + 제거
    if ((import.meta as any).env?.DEV) {
      console.warn(`[apiClient] object param dropped: "${key}"`, value);
    }
    return null;
  }

  // ✅ number/string/boolean
  return String(value);
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      const normalized = normalizeParamValue(key, value);
      if (normalized === null) return;
      // ✅ append 대신 set: 중복 쿼리 누적 방지
      url.searchParams.set(key, normalized);
    });
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

export async function apiGet<T>(
  path: string,
  params: Record<string, any> = {}
): Promise<T> {
  const url = buildUrl(path, params);

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  return handleResponse<T>(res, path);
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = buildUrl(path);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  });

  return handleResponse<T>(res, path);
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const url = buildUrl(path);

  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response, path);
}
