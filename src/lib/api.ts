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

import { mutate } from "swr";

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

/**
 * `team` is not one convention across this API. Four modules take a parameter
 * of that name and they do not agree on what goes in it:
 *
 *   /assignment/preview     uuid    (the team's id)
 *   /labels…                uuid
 *   /analytics/…            slug    (the team's handle)
 *   /proposals/workload     slug
 *   /proposals/team-tasks   slug
 *
 * Sending the wrong one fails as a 422 about an "invalid character" rather
 * than as anything that names the real problem, so the check below turns it
 * into an immediate, readable error while developing. Production skips it —
 * by then the call sites are fixed and a throw would only make a recoverable
 * request fatal.
 */
const TEAM_PARAM: { uuid: RegExp; slug: RegExp } = {
  uuid: /^\/(assignment\/preview|labels)/,
  slug: /^\/(analytics|proposals\/(workload|team-tasks))/,
};

const LOOKS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkTeamParam(path: string, value: string): void {
  if (process.env.NODE_ENV === "production") return;
  const isUuid = LOOKS_UUID.test(value);
  if (TEAM_PARAM.uuid.test(path) && !isUuid) {
    throw new Error(
      `${path} expects team as a UUID, got "${value}". Pass team.id, not team.slug.`,
    );
  }
  if (TEAM_PARAM.slug.test(path) && isUuid) {
    throw new Error(
      `${path} expects team as a slug, got a UUID. Pass team.slug, not team.id.`,
    );
  }
}

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "team") checkTeamParam(path, String(value));
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** An absolute URL for a backend path — for links the browser navigates to. */
export function apiUrl(path: string, query?: Query): string {
  return `${API_ROOT}${withQuery(path, query)}`;
}

/**
 * Modules whose cached reads are dropped after a write to the same module.
 *
 * The shell sets a 60-second `dedupingInterval` and turns revalidation on
 * focus off, both deliberately: the expensive screens sweep SharePoint and
 * Entra, and re-running those because somebody alt-tabbed is waste. The
 * side effect is that SWR also skips revalidate-on-mount inside that window,
 * so navigating back to a list after changing something showed the answer
 * from before the change — nominate six reviewers, return to the cycle, and
 * it still reads none.
 *
 * A screen refreshing its *own* key already handles itself. What it cannot do
 * is know which other screens it invalidated: nominating changes the cycle,
 * the cycles list and each reviewer's own queue; posting an opening changes
 * the opening and the list. Enumerating that at fourteen call sites is how one
 * gets missed, so a write invalidates its module instead.
 *
 * **Only HR is listed**, on purpose. The same staleness exists elsewhere, but
 * widening this would start re-sweeping SharePoint and Zoho on every write in
 * those modules — a real cost, and a change nobody has asked for. Add a prefix
 * here when a module wants the same behaviour.
 */
const REVALIDATE_AFTER_WRITE = ["/hr"];

/** Revalidate — never clear. Screens keep the last answer while the next loads. */
function invalidateModule(path: string): void {
  const prefix = REVALIDATE_AFTER_WRITE.find(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (!prefix) return;
  void mutate(
    (key) =>
      typeof key === "string" &&
      (key === prefix || key.startsWith(`${prefix}/`) || key.startsWith(`${prefix}?`)),
  );
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

  if (response.status === 204) {
    if (method !== "GET") invalidateModule(path);
    return undefined as T;
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, detailOf(payload) ?? response.statusText, payload);
  }
  // Only once it has actually succeeded: a refused write changed nothing, and
  // re-fetching after one would just cost a round trip to prove it.
  if (method !== "GET") invalidateModule(path);
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
 * Sign out and land on the login screen, whatever happens.
 *
 * Two things went wrong with doing this at the call site, and both looked
 * from the outside like the button doing nothing at all:
 *
 * **The redirect was conditional on the request succeeding.** `await signOut()`
 * throws on a network failure, on CORS, and on a session that has already
 * expired — and an uncaught throw inside an onClick means no navigation and no
 * error, just a click that appears to be ignored. Being signed out locally is
 * the point; the server having agreed is not a precondition for leaving.
 *
 * **It was a client-side navigation.** `router.replace` unmounts the shell but
 * leaves SWR's module-level cache intact, so `/auth/me` and every read behind
 * it stay warm — the shell has a 60-second dedupe window and does not
 * revalidate on focus. Coming back inside that window re-mounted a session
 * that had been thrown away. A full page load is the only way to be sure
 * nothing survives, which is exactly what signing out is asking for.
 */
export async function signOutAndReturnToLogin(): Promise<void> {
  try {
    await signOut();
  } catch {
    // Already gone, or unreachable. Either way the local session is finished.
  }
  window.location.assign("/login");
}

/**
 * A URL the browser can open for a file the API streams (quote attachments,
 * comparison documents). These carry the session cookie because they are
 * same-site navigations to the API origin, so no token juggling is needed.
 */
export const files = {
  /**
   * A path the API itself handed back — Zoho attachments carry a
   * `download_url` already pointing at this API, prefix included, so it is
   * resolved against the origin rather than against API_ROOT.
   */
  fromApiPath: (path: string) =>
    /^https?:\/\//.test(path) ? path : `${BASE}${path}`,
  quoteDocument: (quoteId: string, documentId: string) =>
    apiUrl(`/quotes/${quoteId}/documents/${documentId}`),
  comparisonDocument: (comparisonId: string, quoteId: string) =>
    apiUrl(`/comparisons/${comparisonId}/quotes/${quoteId}/document`),
};
