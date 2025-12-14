// frontend/src/lib/apiClient.ts

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.append(key, String(value));
    });
  }

  return url.toString();
}

async function handleResponse<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Request to ${path} failed with status ${response.status}. ${text}`
    );
  }
  return (await response.json()) as T;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(buildUrl(path, params), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return handleResponse<T>(response, path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, API_BASE_URL).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response, path);
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, API_BASE_URL).toString(), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response, path);
}
