"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { KeyRound, Save, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { ModuleOut, TeamAccessOut, TeamOut } from "@/lib/types";
import { Badge, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, SearchInput } from "@/components/ui/controls";
import {
  PanelSkeleton,
  Empty,
  ErrorState,
  InlineNotice,
} from "@/components/ui/feedback";

/**
 * Which modules each team can reach.
 *
 * Super admin only, straight from the brief — this is the screen that decides
 * what everyone else can see, and it is the one place a mistake is invisible
 * to the person who made it.
 *
 * A grant is per module, optionally narrowed to particular pages. The three
 * states of a module are therefore: not granted, granted whole, and granted
 * with a subset of pages ticked.
 */
export default function AccessPage() {
  const session = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const teams = useSWR<TeamOut[]>("/teams");
  const modules = useSWR<ModuleOut[]>("/modules");

  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldAlert}
        title="Super admin only"
        body="Changing what a team can reach is limited to super admins. Everyone else can see a team's grants on the team's own page."
      />
    );
  }

  const needle = search.trim().toLowerCase();
  const rows = (teams.data ?? [])
    .filter((t) => !t.archived_at)
    .filter((t) => !needle || t.name.toLowerCase().includes(needle));

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Team module access"
        lead="Everything a person can reach comes from the teams they belong to. Grants union across teams — the wider one wins."
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel className="p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Find a team"
            className="mb-3"
          />
          {teams.error ? (
            <ErrorState error={teams.error} onRetry={() => teams.mutate()} />
          ) : !teams.data ? (
            <PanelSkeleton lines={5} />
          ) : (
            <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto">
              {rows.map((team) => (
                <li key={team.id}>
                  <button
                    onClick={() => setSelected(team.slug)}
                    className={clsx(
                      "flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[13.5px] transition",
                      selected === team.slug
                        ? "bg-accent text-[var(--c-accent-ink)] font-medium"
                        : "text-ink-2 hover:bg-inset",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    <span
                      className={clsx(
                        "tnum shrink-0 text-[11.5px]",
                        selected === team.slug ? "opacity-70" : "text-ink-4",
                      )}
                    >
                      {team.member_count ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected ? (
          <TeamAccessEditor slug={selected} modules={modules.data ?? []} />
        ) : (
          <Empty
            icon={KeyRound}
            title="Pick a team"
            body="Choose a team on the left to see and change what it can reach."
          />
        )}
      </div>
    </div>
  );
}

type Draft = Record<string, string[] | "all" | undefined>;

function TeamAccessEditor({ slug, modules }: { slug: string; modules: ModuleOut[] }) {
  const access = useSWR<TeamAccessOut>(`/teams/${slug}/access`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seenFor, setSeenFor] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  // Re-seed whenever a different team is opened, or the server data lands.
  const stamp = `${slug}:${access.data ? "loaded" : "loading"}`;
  if (stamp !== seenFor && access.data) {
    setSeenFor(stamp);
    setSaved(false);
    const seed: Draft = {};
    for (const grant of access.data.modules) {
      seed[grant.module_key] = grant.all_pages ? "all" : grant.pages.map((p) => p.key);
    }
    setDraft(seed);
  }

  const save = useAction(async () => {
    // The PUT replaces the whole set, which is what makes revoking work: a
    // module left out of the payload is a module taken away.
    const payload: Record<string, string[] | null> = {};
    for (const [key, value] of Object.entries(draft ?? {})) {
      if (value === undefined) continue;
      payload[key] = value === "all" ? null : value;
    }
    const next = await api.put<TeamAccessOut>(`/teams/${slug}/access`, {
      modules: payload,
    });
    access.mutate(next, { revalidate: false });
    setSaved(true);
    return next;
  });

  if (access.error) return <ErrorState error={access.error} onRetry={() => access.mutate()} />;
  if (!access.data || !draft) return <PanelSkeleton lines={8} />;

  // Admin-only modules are never granted to a team — reaching them depends on
  // a global admin role, and offering them here would imply a route that does
  // not exist.
  const grantable = modules.filter((m) => !m.admin_only);

  function toggleModule(key: string) {
    setSaved(false);
    setDraft((current) => {
      const next = { ...current };
      if (next[key] === undefined) next[key] = "all";
      else delete next[key];
      return next;
    });
  }

  function togglePage(moduleKey: string, pageKey: string, allPages: string[]) {
    setSaved(false);
    setDraft((current) => {
      const next = { ...current };
      const value = next[moduleKey];
      // Narrowing a whole-module grant starts from every page ticked, so the
      // first click removes one page rather than silently dropping the rest.
      const list = value === "all" ? [...allPages] : [...(value ?? [])];
      next[moduleKey] = list.includes(pageKey)
        ? list.filter((k) => k !== pageKey)
        : [...list, pageKey];
      // Every page ticked is the same thing as the whole module.
      if ((next[moduleKey] as string[]).length === allPages.length) next[moduleKey] = "all";
      return next;
    });
  }

  const dirty = (() => {
    const before: Draft = {};
    for (const grant of access.data.modules) {
      before[grant.module_key] = grant.all_pages ? "all" : grant.pages.map((p) => p.key);
    }
    return JSON.stringify(normalise(before)) !== JSON.stringify(normalise(draft));
  })();

  return (
    <Panel className="p-4">
      <PanelHead
        title={access.data.name}
        hint={`/${access.data.slug}`}
        action={
          <Button
            variant="accent"
            icon={Save}
            loading={save.pending}
            disabled={!dirty}
            onClick={() => save.run()}
          >
            Save access
          </Button>
        }
      />

      {save.error && <InlineNotice tone="danger" className="mt-4">{save.error}</InlineNotice>}
      {saved && !dirty && (
        <InlineNotice tone="positive" className="mt-4">
          Saved. Members of this team see the change on their next page load.
        </InlineNotice>
      )}

      <div className="mt-3 space-y-2">
        {grantable.map((module) => {
          const value = draft[module.key];
          const granted = value !== undefined;
          const allPages = module.pages.map((p) => p.key);
          const chosen = value === "all" ? allPages : (value ?? []);

          return (
            <div
              key={module.key}
              className={clsx(
                "rounded-[18px] border p-4 transition",
                granted ? "border-accent-line bg-accent-soft/40" : "border-line bg-inset",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <button
                  role="switch"
                  aria-checked={granted}
                  aria-label={`Grant ${module.name}`}
                  onClick={() => toggleModule(module.key)}
                  className={clsx(
                    "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition",
                    granted ? "bg-accent" : "bg-line-strong",
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                      granted ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-medium">{module.name}</span>
                    {value === "all" && <Badge tone="accent">All pages</Badge>}
                    {granted && value !== "all" && (
                      <Badge tone="warn">
                        {chosen.length} of {allPages.length} pages
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
                    {module.description}
                  </p>

                  {granted && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {module.pages.map((page) => {
                        const on = chosen.includes(page.key);
                        return (
                          <button
                            key={page.key}
                            onClick={() => togglePage(module.key, page.key, allPages)}
                            className={clsx(
                              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                              on
                                ? "border-transparent bg-accent text-[var(--c-accent-ink)]"
                                : "border-line bg-panel text-ink-3 hover:border-line-strong",
                            )}
                            title={page.path}
                          >
                            {page.name}
                            {page.team_scoped && (
                              <span className="ml-1.5 opacity-60">team</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-4">
        Leave and Quotes are open to every signed-in person whether or not they are
        granted here — their endpoints check nothing beyond a session. Granting them
        changes nothing except that they appear in this team&apos;s dashboard widgets.
      </p>
    </Panel>
  );
}

/** Order-insensitive comparison, so re-ticking pages is not a change. */
function normalise(draft: Draft) {
  return Object.fromEntries(
    Object.entries(draft)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value === "all" ? "all" : [...(value as string[])].sort()]),
  );
}
