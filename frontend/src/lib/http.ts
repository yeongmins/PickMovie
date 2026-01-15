// frontend/src/lib/http.ts
export class ApiError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly bodyText?: string;

  constructor(args: { status: number; url: string; bodyText?: string }) {
    super(`API Error ${args.status} - ${args.url}`);
    this.status = args.status;
    this.url = args.url;
    this.bodyText = args.bodyText;
  }
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), ms);

  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(t);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
  };
}

export async function apiGetJson<T>(
  path: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const { signal, cleanup } = withTimeout(opts?.signal, timeoutMs);

  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal,
    });

    const text = await res.text();
    if (!res.ok)
      throw new ApiError({ status: res.status, url, bodyText: text });

    return text ? (JSON.parse(text) as T) : ({} as T);
  } finally {
    cleanup();
  }
}

export async function apiPostJson<TRes, TBody>(
  path: string,
  body: TBody,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<TRes> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const { signal, cleanup } = withTimeout(opts?.signal, timeoutMs);

  const url = `${API_BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    const text = await res.text();
    if (!res.ok)
      throw new ApiError({ status: res.status, url, bodyText: text });

    return text ? (JSON.parse(text) as TRes) : ({} as TRes);
  } finally {
    cleanup();
  }
}
