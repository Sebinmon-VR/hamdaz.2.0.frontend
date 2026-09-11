"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FolderKanban, Map as MapIcon, Plus, ShieldAlert } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { dateShort, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { ProjectIn, ProjectOut, ProjectPage, TeamOut } from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  Row,
  RowHead,
  StatBox,
} from "@/components/ui/primitives";
import {
  Button,
  Field,
  Input,
  LinkButton,
  PillRail,
  SearchInput,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  RowsSkeleton,
} from "@/components/ui/feedback";
import {
  PROJECT_STATUS_LABELS,
  ProgressBar,
  ProjectStatusBadge,
  RagChip,
  Roadmap,
  toRoadmap,
  Trend,
} from "@/components/projects/ProjectBits";

/**
 * Every project this person may see.
 *
 * **The listing is already narrowed by the backend** — the projects you are
 * on, all of your team's if you run it, and everyone's if you run the company
 * — so there is no permission logic on this screen and there must not be. The
 * filters here narrow further, never wider, and a team whose projects
 * somebody cannot see comes back empty rather than refused.
 *
 * "Mine" means the projects you are *on*, and deliberately not the forty your
 * team runs: a team lead asking for mine means the ones they are working in.
 * That distinction is the backend's and the toggle inherits it.
 */
export default function ProjectsPage() {
  const session = useSession();
  const [mine, setMine] = useState(false);
  const [status, setStatus] = useState("open");
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // List or roadmap. Both read the same rows — the roadmap is a second drawing
  // of this listing, not a second screen with its own filters to keep in step.
  const [view, setView] = useState("list");
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR<ProjectPage>(
    session.can("projects")
      ? withQuery("/projects", {
          mine_only: mine || undefined,
          team: team || undefined,
          // "Open" is three statuses rather than one — planned, active and on
          // hold are all work that is expected to happen — and the parameter
          // repeats, which `withQuery` cannot express. So the common case is
          // sent as the backend's own default (no filter) plus a client-side
          // narrowing below, and the two named cases are sent as one value.
          status: status === "open" || status === "all" ? undefined : status,
          include_archived: status === "all" ? true : undefined,
          limit: 200,
        })
      : null,
    { keepPreviousData: true },
  );

  if (!session.can("projects")) {
    return (
      <>
        <PageHead eyebrow="Projects" title="All projects" />
        <Empty
          icon={ShieldAlert}
          title="Not your module yet"
          body="Projects has not been granted to a team you are on. An administrator grants it under Team access."
        />
      </>
    );
  }

  const OPEN = ["planned", "active", "on_hold"];
  const all = data?.projects ?? [];
  const needle = search.trim().toLowerCase();
  const rows = all
    .filter((project) => (status === "open" ? OPEN.includes(project.status) : true))
    .filter(
      (project) =>
        !needle ||
        project.name.toLowerCase().includes(needle) ||
        (project.code?.toLowerCase().includes(needle) ?? false) ||
        project.team.toLowerCase().includes(needle) ||
        (project.lead?.name.toLowerCase().includes(needle) ?? false),
    );

  const late = rows.reduce(
    (sum, project) => sum + project.rollup.milestones_overdue + project.rollup.tasks_overdue,
    0,
  );
  const stale = rows.filter((project) => project.health_stale).length;
  // Whoever runs a team may start one. A member may not: a project commits
  // other people's time. Asked of the session rather than of the API because
  // there is nothing to ask until a team is chosen.
  const canCreate =
    session.roles.is_admin ||
    session.roles.is_super_admin ||
    session.teams.some(
      (entry) =>
        entry.role_keys.includes("team_lead") || entry.role_keys.includes("team_manager"),
    );

  return (
    <>
      <PageHead
        eyebrow="Projects"
        title="All projects"
        count={data ? num(data.total) : undefined}
        actions={
          <>
            <Toggle checked={mine} onChange={setMine} label="Mine" />
            <LinkButton href="/projects/portfolio" icon={MapIcon}>
              Portfolio
            </LinkButton>
            {canCreate && (
              <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
                Start a project
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="In this list" value={num(rows.length)} />
        <StatBox
          label="Overdue work"
          value={num(late)}
          tone={late > 0 ? "danger" : undefined}
          hint="Tasks and milestones past their date, across every project shown."
        />
        <StatBox
          label="Dials unconfirmed"
          value={num(stale)}
          tone={stale > 0 ? "second" : undefined}
          hint="Nobody has assessed these for a fortnight. A green nobody has looked at is not a green."
        />
        <StatBox
          label="Average complete"
          value={
            rows.length
              ? `${Math.round(
                  rows.reduce((sum, p) => sum + p.rollup.percent_complete, 0) / rows.length,
                )}%`
              : "—"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name, code, team or lead"
          className="w-full max-w-xs"
        />
        <PillRail
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: "Live" },
            { value: "active", label: "Active" },
            { value: "on_hold", label: "On hold" },
            { value: "done", label: "Delivered" },
            { value: "all", label: "Everything" },
          ]}
        />
        <Select
          value={team}
          onChange={(event) => setTeam(event.target.value)}
          className="w-48"
          aria-label="Team"
        >
          <option value="">Every team</option>
          {session.teams.map((entry) => (
            <option key={entry.team.id} value={entry.team.slug}>
              {entry.team.name}
            </option>
          ))}
        </Select>
        <PillRail
          className="ml-auto"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "List" },
            { value: "roadmap", label: "Roadmap" },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <Panel className="py-2">
          <RowsSkeleton rows={7} />
        </Panel>
      ) : rows.length === 0 ? (
        <Empty
          icon={FolderKanban}
          title={mine ? "You are not on a project" : "Nothing to show"}
          body={
            mine
              ? "Being assigned a task on a project puts you on it. Turn Mine off to see everything you can read."
              : "No project you can see matches this view. Somebody who runs a team starts one; being on the team is not enough."
          }
          action={
            canCreate && (
              <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
                Start a project
              </Button>
            )
          }
        />
      ) : view === "roadmap" ? (
        <Panel className="px-2 py-4">
          <Roadmap
            projects={rows.map(toRoadmap)}
            // Only when the listing actually spans teams — one team's name
            // repeated above every row is a heading that says nothing.
            groupByTeam={!team}
            onOpen={(id) => router.push(`/projects/${id}`)}
          />
        </Panel>
      ) : (
        <Panel className="py-2">
          <RowHead>
            <span className="micro w-18.5 shrink-0 text-ink-4">Health</span>
            <span className="micro min-w-0 flex-1 text-ink-4">Project</span>
            <span className="micro hidden w-32 shrink-0 text-ink-4 lg:block">Team</span>
            <span className="micro w-28 shrink-0 text-ink-4">Complete</span>
            <span className="micro hidden w-16 shrink-0 text-right text-ink-4 md:block">
              Open
            </span>
            <span className="micro hidden w-16 shrink-0 text-right text-ink-4 md:block">
              Late
            </span>
            <span className="micro hidden w-20 shrink-0 text-ink-4 sm:block">Target</span>
            <span className="w-24 shrink-0" />
          </RowHead>

          {rows.map((project) => {
            const behind =
              project.rollup.tasks_overdue + project.rollup.milestones_overdue;
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Row>
                  <span className="flex w-18.5 shrink-0 items-center">
                    <RagChip value={project.rag_overall} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {project.name}
                    {project.code && (
                      <span className="ml-2 text-[11px] text-ink-4">{project.code}</span>
                    )}
                    {project.lead && (
                      <span className="ml-2 text-[11.5px] text-ink-4">
                        {project.lead.name}
                      </span>
                    )}
                  </span>
                  <span className="hidden w-32 shrink-0 truncate text-[12px] text-ink-3 lg:block">
                    {project.team}
                  </span>
                  <span className="flex w-28 shrink-0 items-center gap-1.5">
                    <ProgressBar
                      percent={project.rollup.percent_complete}
                      rag={project.rag_overall}
                      height={4}
                      className="w-14"
                    />
                    <span className="tnum text-[11px] text-ink-3">
                      {project.rollup.percent_complete}%
                    </span>
                  </span>
                  <span className="tnum hidden w-16 shrink-0 text-right text-[12px] text-ink-3 md:block">
                    {project.rollup.tasks_open}
                  </span>
                  <span
                    className={
                      behind > 0
                        ? "tnum hidden w-16 shrink-0 text-right text-[12px] font-semibold text-danger md:block"
                        : "tnum hidden w-16 shrink-0 text-right text-[12px] text-ink-4 md:block"
                    }
                  >
                    {behind || "—"}
                  </span>
                  <span className="tnum hidden w-20 shrink-0 text-[11.5px] text-ink-4 sm:block">
                    {project.target_end_on ? dateShort(project.target_end_on) : "—"}
                  </span>
                  <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                    {project.health_stale && (
                      <Badge tone="neutral" title="Nobody has confirmed the dials for a fortnight.">
                        Stale
                      </Badge>
                    )}
                    <Trend value={project.trend_overall} />
                    <ProjectStatusBadge value={project.status} />
                  </span>
                </Row>
              </Link>
            );
          })}
        </Panel>
      )}

      <StartProject open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

/* ── starting one ────────────────────────────────────────────────────── */

/**
 * Only somebody running a team may start a project, and the team list here is
 * narrowed to the ones they run for exactly that reason — offering the rest
 * would be offering a 403. A super admin gets every team, which is what makes
 * the module testable against a real team without first joining it.
 */
function StartProject({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const router = useRouter();
  const everyTeam = useSWR<TeamOut[]>(
    open && session.roles.is_super_admin ? "/teams" : null,
    { revalidateOnFocus: false },
  );

  const teams = session.roles.is_super_admin
    ? (everyTeam.data ?? []).filter((team) => !team.archived_at)
    : session.teams
        .filter(
          (entry) =>
            session.roles.is_admin ||
            entry.role_keys.includes("team_lead") ||
            entry.role_keys.includes("team_manager"),
        )
        .map((entry) => entry.team);

  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [objective, setObjective] = useState("");
  const [status, setStatus] = useState("planned");
  const [startOn, setStartOn] = useState("");
  const [targetEnd, setTargetEnd] = useState("");

  const chosen = teamId || teams[0]?.id || "";

  const create = useAction(async () => {
    const body: ProjectIn = {
      team_id: chosen,
      name: name.trim(),
      code: code.trim() || null,
      objective: objective.trim() || null,
      status: status as ProjectIn["status"],
      start_on: startOn || null,
      target_end_on: targetEnd || null,
    };
    return api.post<ProjectOut>("/projects", body);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a project"
      description="A project is a named piece of work a team owns. You are put on it as its lead unless somebody else is named later."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={create.pending}
            disabled={!chosen || !name.trim()}
            onClick={async () => {
              const made = await create.run();
              if (made) {
                onClose();
                router.push(`/projects/${made.id}`);
              }
            }}
          >
            Start it
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}
        {teams.length === 0 ? (
          <InlineNotice tone="info">
            You do not run a team, so there is nowhere to start one. Creating a project
            commits other people&rsquo;s time, which is why it sits with whoever runs the
            team rather than with anybody on it.
          </InlineNotice>
        ) : (
          <>
            <Field label="Team" required>
              <Select value={chosen} onChange={(event) => setTeamId(event.target.value)}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" required>
              <Input
                value={name}
                placeholder="Warehouse automation phase 2"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field
              label="Code"
              hint="How people refer to it in a meeting. Unique within the team, not across the company."
            >
              <Input
                value={code}
                placeholder="WH-2"
                maxLength={32}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field label="Objective" hint="What it is for, in a line or two.">
              <Textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                maxLength={4000}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Status">
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {Object.entries(PROJECT_STATUS_LABELS)
                    .filter(([key]) => key !== "cancelled")
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Starts">
                <Input
                  type="date"
                  value={startOn}
                  onChange={(event) => setStartOn(event.target.value)}
                />
              </Field>
              <Field label="Target end">
                <Input
                  type="date"
                  value={targetEnd}
                  onChange={(event) => setTargetEnd(event.target.value)}
                />
              </Field>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
