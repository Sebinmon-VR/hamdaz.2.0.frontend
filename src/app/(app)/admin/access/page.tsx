"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Lock,
  Save,
  ShieldAlert,
  UserSearch,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { useAction, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  EffectiveAccessOut,
  ModuleOut,
  OrgUserOut,
  OrgUserPage,
  TeamAccessOut,
  TeamOut,
} from "@/lib/types";
import { Badge, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";

/**
 * Everything the platform is made of, and who can reach it.
 *
 * Super admin only, straight from the brief: this is the screen that decides
 * what everyone else can see, and it is the one place a mistake is invisible
 * to the person who made it.
 *
 * One table. Modules down the side, each opening to its pages; teams across
 * the top; a switch in every cell. That is the whole model — access is granted
 * to a *team*, per module, optionally narrowed to particular pages — laid out
 * so a question like "who can see quote comparisons" is answered by reading
 * one row rather than opening every team in turn.
 *
 * The second view answers the other question, "what can this person reach",
 * and is read-only on purpose: a person's access is the sum of their teams',
 * so the way to change it is to change a team's column, or their membership.
 */
export default function AccessPage() {
  const session = useSession();
  const [view, setView] = useState<"teams" | "people">("teams");

  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldAlert}
        title="Super admin only"
        body="Changing what a team can reach is limited to super admins. Everyone else can see a team's grants on the team's own page."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHead eyebrow="Administration" title="Module access" />

      <div className="flex flex-wrap items-center gap-1.5">
        <ViewTab active={view === "teams"} onClick={() => setView("teams")}>
          By team
        </ViewTab>
        <ViewTab active={view === "people"} onClick={() => setView("people")}>
          By person
        </ViewTab>
      </div>

      {view === "teams" ? <TeamMatrix /> : <PersonLookup />}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition",
        active
          ? "border-transparent bg-accent text-accent-ink"
          : "border-line bg-panel text-ink-3 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

// ── by team: the matrix ────────────────────────────────────────────────

/** module key -> "all" or the page keys ticked. Absent means not granted. */
type Grants = Record<string, "all" | string[]>;
/** team slug -> its grants. */
type Draft = Record<string, Grants>;

function seedFrom(access: TeamAccessOut[]): Draft {
  const draft: Draft = {};
  for (const team of access) {
    const grants: Grants = {};
    for (const grant of team.modules) {
      grants[grant.module_key] = grant.all_pages ? "all" : grant.pages.map((p) => p.key);
    }
    draft[team.slug] = grants;
  }
  return draft;
}

/** Order-insensitive, so re-ticking pages is not a change. */
function normalise(grants: Grants | undefined) {
  return Object.fromEntries(
    Object.entries(grants ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value === "all" ? "all" : [...value].sort()]),
  );
}

function TeamMatrix() {
  const teams = useSWR<TeamOut[]>("/teams");
  const modules = useSWR<ModuleOut[]>("/modules");
  const access = useSWR<TeamAccessOut[]>("/access/teams");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [seenFor, setSeenFor] = useState<string | undefined>();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<string[] | null>(null);

  // Re-seed when the server data lands or is refreshed after a save.
  const stamp = access.data ? JSON.stringify(access.data) : undefined;
  if (stamp && stamp !== seenFor) {
    setSeenFor(stamp);
    setDraft(seedFrom(access.data!));
  }

  const columns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (teams.data ?? [])
      .filter((t) => !t.archived_at)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams.data, search]);

  const before = useMemo(() => (access.data ? seedFrom(access.data) : {}), [access.data]);

  const dirtyTeams = useMemo(() => {
    if (!draft) return [];
    const slugs = new Set([...Object.keys(before), ...Object.keys(draft)]);
    return [...slugs].filter(
      (slug) =>
        JSON.stringify(normalise(before[slug])) !== JSON.stringify(normalise(draft[slug])),
    );
  }, [before, draft]);

  const save = useAction(async () => {
    // One PUT per changed team. The PUT replaces the team's whole set, which
    // is what makes revoking work: a module left out is a module taken away.
    const done: string[] = [];
    for (const slug of dirtyTeams) {
      const payload: Record<string, string[] | null> = {};
      for (const [key, value] of Object.entries(draft?.[slug] ?? {})) {
        payload[key] = value === "all" ? null : value;
      }
      await api.put<TeamAccessOut>(`/teams/${slug}/access`, { modules: payload });
      done.push(slug);
    }
    await access.mutate();
    setSaved(done);
    return done;
  });

  if (teams.error) return <ErrorState error={teams.error} onRetry={() => teams.mutate()} />;
  if (modules.error) return <ErrorState error={modules.error} onRetry={() => modules.mutate()} />;
  if (access.error) return <ErrorState error={access.error} onRetry={() => access.mutate()} />;
  if (!teams.data || !modules.data || !draft) return <PanelSkeleton lines={10} />;

  // Admin-only modules are never granted to a team — reaching them depends on
  // a global admin role. They are listed, because the question this screen
  // answers is "what exists and who reaches it", but they have no switches.
  const grantable = modules.data.filter((m) => !m.admin_only);
  const adminOnly = modules.data.filter((m) => m.admin_only);

  function grantOf(slug: string, moduleKey: string): "all" | string[] | undefined {
    return draft?.[slug]?.[moduleKey];
  }

  function setModule(slug: string, moduleKey: string, on: boolean) {
    setSaved(null);
    setDraft((current) => {
      const next: Draft = { ...current, [slug]: { ...(current?.[slug] ?? {}) } };
      if (on) next[slug][moduleKey] = "all";
      else delete next[slug][moduleKey];
      return next;
    });
  }

  function setPage(slug: string, module: ModuleOut, pageKey: string, on: boolean) {
    setSaved(null);
    setDraft((current) => {
      const next: Draft = { ...current, [slug]: { ...(current?.[slug] ?? {}) } };
      const allPages = module.pages.map((p) => p.key);
      const value = next[slug][module.key];
      // Narrowing a whole-module grant starts from every page ticked, so the
      // first click removes one page rather than silently dropping the rest.
      const list = value === "all" ? [...allPages] : [...(value ?? [])];
      const chosen = on ? [...new Set([...list, pageKey])] : list.filter((k) => k !== pageKey);
      if (chosen.length === 0) delete next[slug][module.key];
      else if (chosen.length === allPages.length) next[slug][module.key] = "all";
      else next[slug][module.key] = chosen;
      return next;
    });
  }

  function setRow(moduleKey: string, on: boolean) {
    for (const team of columns) setModule(team.slug, moduleKey, on);
  }

  const teamNames = Object.fromEntries((teams.data ?? []).map((t) => [t.slug, t.name]));

  return (
    <Panel className="p-4">
      <PanelHead
        title="What each team can reach"
        hint={`${grantable.length} modules · ${columns.length} teams`}
        action={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Find a team" />
            <Button
              variant="accent"
              icon={Save}
              loading={save.pending}
              disabled={dirtyTeams.length === 0}
              onClick={() => save.run()}
            >
              {dirtyTeams.length > 1 ? `Save ${dirtyTeams.length} teams` : "Save changes"}
            </Button>
          </div>
        }
      />

      {save.error && <InlineNotice tone="danger" className="mt-4">{save.error}</InlineNotice>}
      {saved && dirtyTeams.length === 0 && (
        <InlineNotice tone="positive" className="mt-4">
          Saved for {saved.map((s) => teamNames[s] ?? s).join(", ")}. Members see the change
          on their next page load.
        </InlineNotice>
      )}
      {dirtyTeams.length > 0 && (
        <InlineNotice tone="warn" className="mt-4">
          Unsaved changes for {dirtyTeams.map((s) => teamNames[s] ?? s).join(", ")}.
        </InlineNotice>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[18rem] min-w-[16rem] bg-panel px-2 pb-2 align-bottom font-medium text-ink-3">
                Module / page
              </th>
              {columns.map((team) => (
                <th
                  key={team.id}
                  className="min-w-[7.5rem] px-2 pb-2 align-bottom font-medium"
                  title={`/${team.slug}`}
                >
                  <div className="truncate">{team.name}</div>
                  <div className="tnum text-[11px] font-normal text-ink-4">
                    {team.member_count ?? 0} {team.member_count === 1 ? "member" : "members"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grantable.map((module) => {
              const expanded = open[module.key] ?? false;
              const grantedCount = columns.filter((t) => grantOf(t.slug, module.key)).length;
              return (
                <ModuleRows
                  key={module.key}
                  module={module}
                  columns={columns}
                  expanded={expanded}
                  grantedCount={grantedCount}
                  onToggleOpen={() => setOpen((o) => ({ ...o, [module.key]: !expanded }))}
                  grantOf={grantOf}
                  setModule={setModule}
                  setPage={setPage}
                  setRow={setRow}
                />
              );
            })}

            {adminOnly.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-2 pb-1 pt-5 text-[11.5px] font-medium uppercase tracking-wide text-ink-4"
                  >
                    Reached through a global admin role, not by team
                  </td>
                </tr>
                {adminOnly.map((module) => (
                  <tr key={module.key} className="text-ink-3">
                    <td className="sticky left-0 z-10 bg-panel px-2 py-2">
                      <div className="flex items-center gap-2">
                        <Lock className="size-3.5 shrink-0 text-ink-4" />
                        <span className="font-medium">{module.name}</span>
                        <span className="tnum text-[11.5px] text-ink-4">
                          {module.pages.length} {module.pages.length === 1 ? "page" : "pages"}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-4">
                        {module.description}
                      </p>
                    </td>
                    <td colSpan={columns.length} className="px-2 py-2 text-[12px] text-ink-4">
                      Admins and super admins only. Give somebody the role under Who holds what.
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-4">
        A switch on a module row grants the whole module, pages added later included. Open
        the row to grant only some of its pages. Leave and Quotes are open to everyone signed
        in, granted or not; granting them only adds the widgets to a team&apos;s dashboard.
      </p>
    </Panel>
  );
}

function ModuleRows({
  module,
  columns,
  expanded,
  grantedCount,
  onToggleOpen,
  grantOf,
  setModule,
  setPage,
  setRow,
}: {
  module: ModuleOut;
  columns: TeamOut[];
  expanded: boolean;
  grantedCount: number;
  onToggleOpen: () => void;
  grantOf: (slug: string, moduleKey: string) => "all" | string[] | undefined;
  setModule: (slug: string, moduleKey: string, on: boolean) => void;
  setPage: (slug: string, module: ModuleOut, pageKey: string, on: boolean) => void;
  setRow: (moduleKey: string, on: boolean) => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const everyTeam = columns.length > 0 && grantedCount === columns.length;
  return (
    <>
      <tr className="border-t border-line">
        <td className="sticky left-0 z-10 bg-panel px-2 py-2.5 align-top">
          <div className="flex items-start gap-1.5">
            <button
              onClick={onToggleOpen}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} pages of ${module.name}`}
              className="mt-0.5 rounded-md p-0.5 text-ink-4 hover:bg-inset hover:text-ink"
            >
              <Chevron className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium">{module.name}</span>
                <span className="tnum text-[11.5px] text-ink-4">
                  {module.pages.length} {module.pages.length === 1 ? "page" : "pages"}
                </span>
                {grantedCount > 0 && (
                  <Badge tone={everyTeam ? "accent" : "warn"}>
                    {everyTeam ? "every team" : `${grantedCount} of ${columns.length}`}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 max-w-[22rem] text-[12px] leading-relaxed text-ink-4">
                {module.description}
              </p>
              {columns.length > 1 && (
                <button
                  onClick={() => setRow(module.key, !everyTeam)}
                  className="mt-1 text-[11.5px] font-medium text-accent hover:underline"
                >
                  {everyTeam ? "Take away from every team" : "Give to every team"}
                </button>
              )}
            </div>
          </div>
        </td>
        {columns.map((team) => {
          const value = grantOf(team.slug, module.key);
          const granted = value !== undefined;
          const partial = granted && value !== "all";
          return (
            <td key={team.id} className="px-2 py-2.5 align-top">
              <div className="flex flex-col items-start gap-1">
                <CellSwitch
                  on={granted}
                  label={`${module.name} for ${team.name}`}
                  onChange={(next) => setModule(team.slug, module.key, next)}
                />
                {partial && (
                  <span className="tnum text-[11px] text-warn">
                    {(value as string[]).length} of {module.pages.length}
                  </span>
                )}
              </div>
            </td>
          );
        })}
      </tr>

      {expanded &&
        module.pages.map((page) => (
          <tr key={page.key} className="bg-inset/60">
            <td className="sticky left-0 z-10 bg-inset px-2 py-1.5 pl-9">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px]">{page.name}</span>
                {page.team_scoped && (
                  <span className="text-[11px] text-ink-4">team page</span>
                )}
              </div>
              <div className="font-mono text-[11px] text-ink-4">{page.path}</div>
            </td>
            {columns.map((team) => {
              const value = grantOf(team.slug, module.key);
              const granted = value !== undefined;
              const on = value === "all" || (Array.isArray(value) && value.includes(page.key));
              return (
                <td key={team.id} className="px-2 py-1.5">
                  <CellCheck
                    on={on}
                    disabled={!granted}
                    label={`${page.name} for ${team.name}`}
                    onChange={(next) => setPage(team.slug, module, page.key, next)}
                  />
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}

function CellSwitch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx(
        "relative h-5 w-9 shrink-0 rounded-full transition",
        on ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
          on ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function CellCheck({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      title={disabled ? "Grant the module first" : undefined}
      onClick={() => onChange(!on)}
      className={clsx(
        "flex size-5 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-30",
        on ? "border-transparent bg-accent text-accent-ink" : "border-line-strong bg-panel",
      )}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

// ── by person: what somebody can actually reach ────────────────────────

function PersonLookup() {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<OrgUserOut | null>(null);
  const debounced = useDebounced(search, 300);

  const key = debounced.trim()
    ? withQuery("/directory/users", { search: debounced.trim(), limit: 8 })
    : null;
  const people = useSWR<OrgUserPage>(key);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel className="p-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Find a person"
          className="mb-3"
        />
        {people.error ? (
          <ErrorState error={people.error} onRetry={() => people.mutate()} />
        ) : !key ? (
          <p className="text-[12.5px] leading-relaxed text-ink-4">
            Type a name to see what that person can reach, and which of their teams gives it
            to them.
          </p>
        ) : !people.data ? (
          <PanelSkeleton lines={4} />
        ) : people.data.users.length === 0 ? (
          <p className="text-[12.5px] text-ink-4">Nobody matches.</p>
        ) : (
          <ul className="space-y-0.5">
            {people.data.users.map((person) => (
              <li key={person.object_id}>
                <button
                  onClick={() => setPicked(person)}
                  className={clsx(
                    "w-full rounded-2xl px-3 py-2 text-left transition",
                    picked?.object_id === person.object_id
                      ? "bg-accent text-accent-ink"
                      : "text-ink-2 hover:bg-inset",
                  )}
                >
                  <div className="truncate text-[13.5px] font-medium">{person.display_name}</div>
                  <div
                    className={clsx(
                      "truncate text-[11.5px]",
                      picked?.object_id === person.object_id ? "opacity-70" : "text-ink-4",
                    )}
                  >
                    {person.job_title ?? person.email ?? person.user_principal_name}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {picked ? (
        <PersonAccess person={picked} />
      ) : (
        <Empty
          icon={UserSearch}
          title="Pick a person"
          body="Their access is the sum of their teams'. To change it, change a team's column or their membership."
        />
      )}
    </div>
  );
}

function PersonAccess({ person }: { person: OrgUserOut }) {
  const access = useSWR<EffectiveAccessOut>(`/access/users/${person.object_id}`);
  const modules = useSWR<ModuleOut[]>("/modules");

  if (access.error) {
    return <ErrorState error={access.error} onRetry={() => access.mutate()} />;
  }
  if (!access.data || !modules.data) return <PanelSkeleton lines={8} />;

  const reachable = new Map(access.data.modules.map((m) => [m.key, m]));
  const superAdmin = access.data.source === "super_admin";

  return (
    <Panel className="p-4">
      <PanelHead
        title={person.display_name}
        hint={person.email ?? person.user_principal_name}
        action={
          superAdmin ? (
            <Badge tone="accent">Super admin: sees everything</Badge>
          ) : access.data.via_teams.length > 0 ? (
            <Badge>Via {access.data.via_teams.join(", ")}</Badge>
          ) : (
            <Badge tone="warn">In no team</Badge>
          )
        }
      />

      {!superAdmin && access.data.via_teams.length === 0 && (
        <InlineNotice tone="warn" className="mt-4">
          This person is in no team, so they can reach only what is open to everyone. Add them
          to a team to give them more.
        </InlineNotice>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr className="text-ink-3">
              <th className="px-2 pb-2 font-medium">Module</th>
              <th className="w-28 px-2 pb-2 font-medium">Reach</th>
              <th className="px-2 pb-2 font-medium">Pages</th>
            </tr>
          </thead>
          <tbody>
            {modules.data.map((module) => {
              const have = reachable.get(module.key);
              const all = have && have.pages.length === module.pages.length;
              const visible = new Set(have?.pages.map((p) => p.key) ?? []);
              return (
                <tr
                  key={module.key}
                  className={clsx("border-t border-line", !have && "text-ink-4")}
                >
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-center gap-2">
                      {module.admin_only && <Lock className="size-3.5 shrink-0 text-ink-4" />}
                      <span className="font-medium">{module.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    {!have ? (
                      <Badge>No</Badge>
                    ) : all ? (
                      <Badge tone="accent">Whole module</Badge>
                    ) : (
                      <Badge tone="warn">
                        {have.pages.length} of {module.pages.length}
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {module.pages.map((page) => (
                        <span
                          key={page.key}
                          title={page.path}
                          className={clsx(
                            "rounded-full border px-2.5 py-1 text-[11.5px]",
                            visible.has(page.key)
                              ? "border-transparent bg-accent-soft text-ink"
                              : "border-line text-ink-4 line-through decoration-ink-4/50",
                          )}
                        >
                          {page.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-5 flex items-start gap-2 text-[12px] leading-relaxed text-ink-4">
        <KeyRound className="mt-0.5 size-3.5 shrink-0" />
        Access is granted to teams, not people. To change what this person reaches, switch to
        By team and change one of their teams, or change which teams they are in.
      </p>
    </Panel>
  );
}
