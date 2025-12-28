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

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.append(key, String(value));
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
  // NestJS 기본 에러 형태 대응: { message: string | string[], error, statusCode }
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

  // 204 No Content 같은 경우 대비
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
    credentials: "include", // ✅ 쿠키 기반 인증(Refresh 토큰) 대비
  });

  return handleResponse<T>(res, path);
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = buildUrl(path);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // ✅ 쿠키 기반 인증(Refresh 토큰) 대비
    body: JSON.stringify(body ?? {}),
  });

  return handleResponse<T>(res, path);
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const url = buildUrl(path);

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // ✅ 쿠키 기반 인증(Refresh 토큰) 대비
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response, path);
}
