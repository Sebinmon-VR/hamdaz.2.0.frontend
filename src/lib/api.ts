/**
 * The one place that talks to the backend.
 *
 * Authentication is a session cookie set by the backend during the Entra
 * redirect dance, which is why every request here sends `credentials:
 * "include"` and why the API origin must appear in the backend's CORS_ORIGINS
 * — a wildcard origin is illegal alongside credentialed requests.
 *
 * A 401 anywhere means the session has gone. Rather than let every caller
 * handle that, `request` throws a tagged ApiError and the app shell turns an
 * `unauthorised` one into a bounce to /login.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREFIX = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api/v1";

export const API_ROOT = `${BASE}${PREFIX}`;

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  get unauthorised() {
    return this.status === 401;
  }

  get forbidden() {
    return this.status === 403;
  }

  get missing() {
    return this.status === 404;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** An absolute URL for a backend path — for links the browser navigates to. */
export function apiUrl(path: string, query?: Query): string {
  return `${API_ROOT}${withQuery(path, query)}`;
}

interface RequestOptions {
  method?: string;
  /** Sent as JSON. Use `form` for multipart instead. */
  body?: unknown;
  form?: FormData;
  query?: Query;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, query, signal } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  // Content-Type is deliberately unset for FormData: the browser has to add
  // the multipart boundary itself.
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(apiUrl(path, query), {
      method,
      headers,
      credentials: "include",
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (cause) {
    // A network-level failure, a CORS rejection, or the API being down all
    // land here indistinguishably — the browser will not say which.
    throw new ApiError(0, "Could not reach the Hamdaz API.", cause);
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, detailOf(payload) ?? response.statusText, payload);
  }
  return payload as T;
}

/** FastAPI puts the human-readable message in `detail`, sometimes as a list. */
function detailOf(payload: unknown): string | null {
  if (typeof payload === "string" && payload) return payload;
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) {
      const where = Array.isArray(first.loc) ? first.loc.slice(1).join(".") : "";
      return where ? `${where}: ${first.msg}` : first.msg;
    }
  }
  return null;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>(path, { method: "POST", body, query }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
};

/** The SWR fetcher. A key is the API path, optionally with its query string. */
export const fetcher = <T>(key: string) => api.get<T>(key);

/**
 * Sends the browser to Microsoft. A full navigation, not a fetch: the whole
 * point is that the backend gets to set cookies on the redirect chain, which
 * XHR could not do.
 */
export function beginSignIn(next?: string) {
  const target = next && next.startsWith("/") ? next : undefined;
  window.location.href = apiUrl("/auth/login", { next: target });
}

export async function signOut() {
  await api.post("/auth/logout");
}

/**
 * A URL the browser can open for a file the API streams (quote attachments,
 * comparison documents). These carry the session cookie because they are
 * same-site navigations to the API origin, so no token juggling is needed.
 */
export const files = {
  quoteDocument: (quoteId: string, documentId: string) =>
    apiUrl(`/quotes/${quoteId}/documents/${documentId}`),
  comparisonDocument: (comparisonId: string, quoteId: string) =>
    apiUrl(`/comparisons/${comparisonId}/quotes/${quoteId}/document`),
};
