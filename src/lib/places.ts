/**
 * Reading a navigation out of a tool call.
 *
 * The assistant can take somebody to a screen: it calls `app.open`, the API
 * resolves the name against that person's own access, and the answer carries
 * the route. Both ways of talking to the assistant — typing and speaking —
 * report their tool calls in the same shape, so the detection lives here once
 * rather than twice with a chance to disagree.
 *
 * Read from the *result* rather than the arguments, deliberately. The
 * arguments say what the model asked for ("quotes"); the result says what it
 * actually got ("/quotes"), and only one of those is a route. A refused call
 * has no result, which is exactly when nothing should move.
 */

/** The tool result as both transports report it. */
export interface ToolLike {
  tool_key: string;
  ok?: boolean;
  /** The first 500 characters of what the tool returned. */
  summary?: string;
}

export interface Destination {
  path: string;
  /** "Quotes · All quotes". For a person, in a sentence. */
  label: string;
}

/** The tool that moves the app. Nothing else here navigates. */
export const OPEN_TOOL = "app.open";

export function destinationOf(step: ToolLike): Destination | null {
  if (step.tool_key !== OPEN_TOOL || step.ok !== true || !step.summary) return null;
  try {
    const parsed = JSON.parse(step.summary) as { path?: unknown; label?: unknown };
    const path = typeof parsed.path === "string" ? parsed.path : null;
    // Anything that is not one of our own routes is not somewhere to go. A
    // summary is a prefix of the body, so a truncated one parses as nothing
    // and lands here too — a navigation is not worth guessing at.
    if (!path || !path.startsWith("/")) return null;
    return { path, label: typeof parsed.label === "string" ? parsed.label : path };
  } catch {
    return null;
  }
}

/* ── guessing early ──────────────────────────────────────────────────── */

/**
 * The same resolution, done here, so a navigation does not wait on the network.
 *
 * The API is what *decides* — it re-resolves against the caller's access and
 * its answer is authoritative. But the round trip is a POST to our API, which
 * calls its own route, which asks a database three time zones away what this
 * person can reach: comfortably a second, all of it spent after the assistant
 * has already said "opening your leave". So the moment the tool is CALLED, the
 * arguments are resolved against the access payload the session is already
 * holding — the very same list the server reads — and the app moves.
 *
 * If the server then answers with a different path, the caller corrects. In
 * practice it does not, because this reads the same data by the same rules;
 * the cases it cannot settle it declines instead of guessing, and those simply
 * wait for the real answer.
 *
 * Kept deliberately narrower than the server's: no name matching, no partial
 * matching, no team fallback. Those are where two implementations would drift,
 * and being *wrong* early is far worse than being slow.
 */
export function guessDestination(
  access: { modules: { key: string; name: string; pages: { key: string; name: string; path: string }[] }[] },
  page: unknown,
  team?: unknown,
): Destination | null {
  if (typeof page !== "string" || !page.trim()) return null;
  const asked = norm(page);

  for (const module of access.modules ?? []) {
    for (const spec of module.pages ?? []) {
      if (norm(`${module.key}.${spec.key}`) === asked) {
        return finish(module.name, spec, team);
      }
    }
  }

  // A bare module name: the page somebody pictures when they say "quotes".
  // Same order as the server's, and the same reason for it — `mine` beats
  // `overview` because "open reports" means the list, not the figures.
  const module = (access.modules ?? []).find((m) => norm(m.key) === asked);
  if (!module) return null;
  for (const door of ["list", "mine", "overview", "board", "home", "all"]) {
    const spec = (module.pages ?? []).find((p) => p.key === door);
    if (spec) return finish(module.name, spec, team);
  }
  const first = (module.pages ?? []).find((p) => !p.path.includes("["));
  return first ? finish(module.name, first, team) : null;
}

function finish(
  moduleName: string,
  spec: { name: string; path: string },
  team: unknown,
): Destination | null {
  let path = spec.path;
  if (typeof team === "string" && team.trim()) {
    path = path.replace("[slug]", team.trim().replace(/^\/+|\/+$/g, ""));
  }
  // A route still carrying a parameter is a 404 in the browser. The server
  // says so properly; here it is simply not a guess worth making.
  if (path.includes("[")) return null;
  return { path, label: `${moduleName} · ${spec.name}` };
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
