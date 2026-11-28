"use client";

import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Send, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import {
  COUNTRY_LABEL,
  ORG_KEY,
  chartOf,
  photoUrl,
  type Dept,
  type OrgOffice,
  type OrgPerson,
  type OrgStaffProfile,
  type OrgState,
  type OrgTeam,
  type OrgTeamIn,
  type Unit,
} from "@/lib/org";
import type { StaffRow } from "@/lib/staff";
import { HrOnly } from "@/components/hr/HrOnly";
import { Face } from "@/components/hr/org/Face";
import { PersonDrawer, type NewFace } from "@/components/hr/org/PersonDrawer";
import { Badge, PageHead } from "@/components/ui/primitives";
import { Modal, PanelSkeleton } from "@/components/ui/feedback";
import { Btn, Labeled, Note, SearchBox, SelectBox, Surface, TextBox } from "@/components/payroll/ui";

/** Where the published chart shows. */
const WEBSITE_PAGE = "https://hamdaz.com/people.html";

type Editing = { person: OrgPerson } | { fresh: NewFace };
type TeamEditing = { team: OrgTeam } | { parent: OrgTeam | null; office: OrgOffice | null };

/**
 * The organisation chart behind the website's Our People page.
 *
 * One chart for the whole company: the CEO, and under them every department,
 * the UAE's and India's side by side (Sales, Business Operations, Finance…). A
 * department has one or more heads, people of its own, and groups inside it
 * (Technicians, IT & HSE…), each with an optional lead; its office is only a
 * label. HR arranges it here and fills in what the page says about each person;
 * a face can also be edited from its staff record. Nothing is public until
 * Publish, which checks the chart is complete first.
 *
 * Drawn flat and dense: one surface, the departments as columns in one row
 * (scrolling sideways on a narrow screen rather than wrapping), each person a
 * line with a small face, and the order arrows only on hover.
 */
function OrganisationPage() {
  const chart = useSWR<OrgState>(ORG_KEY);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [picking, setPicking] = useState(false);
  const [teamEdit, setTeamEdit] = useState<TeamEditing | null>(null);
  const state = chart.data;
  const view = useMemo(() => (state ? chartOf(state) : null), [state]);

  const publish = useAction(() => api.post<OrgState>(`${ORG_KEY}/publish`));
  const reorder = useAction((ids: string[], what: "teams" | "people") => api.put<void>(`${ORG_KEY}/${what}/order`, { ids }));
  const refresh = () => void chart.mutate();

  /** Swap an item with its neighbour among its siblings. Teams are ordered as one list; people per team. */
  async function move<T extends { id: string }>(siblings: T[], item: T, by: number, what: "teams" | "people") {
    const other = siblings[siblings.indexOf(item) + by];
    if (!other) return;
    const base = what === "teams" ? sortedTeams.map((t) => t.id) : siblings.map((s) => s.id);
    const ids = base.map((id) => (id === item.id ? other.id : id === other.id ? item.id : id));
    await reorder.run(ids, what);
    refresh();
  }

  const fresh = (over: Partial<NewFace>): NewFace => ({ user_id: null, name: "", title: "", office: "AE", ...over });
  const depts = view ? view.depts : [];
  const sortedTeams = state ? [...state.teams].sort((a, b) => a.sort_order - b.sort_order) : [];
  const onWebsite = state ? state.people.filter((p) => p.on_website).length : 0;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · People"
        title="Organisation"
        lead="The chart on the website's Our People page: one chart under the CEO, every department and group in the UAE and India."
        actions={
          <div className="flex gap-2">
            <Btn icon={UserPlus} onClick={() => setPicking(true)}>
              Add from staff
            </Btn>
            <Btn icon={Plus} onClick={() => setEditing({ fresh: fresh({}) })}>
              Add someone else
            </Btn>
          </div>
        }
      />

      {!state || !view ? (
        chart.error ? <Note tone="danger">{chart.error.message}</Note> : <PanelSkeleton lines={8} className="p-4" />
      ) : (
        <Surface className="overflow-hidden">
          {/* publishing, in one line */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2">
            <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
              <span className="font-semibold text-ink">
                {state.published ? `On the website: version ${state.published.version}` : "Not on the website yet"}
              </span>
              <span className="text-ink-3">
                {state.published
                  ? ` · published ${new Date(state.published.published_at).toLocaleString()}${state.published.published_by_name ? ` by ${state.published.published_by_name}` : ""}`
                  : ` · ${state.people.length} people, ${onWebsite} to show, ${depts.length} departments`}
              </span>
            </p>
            {state.changes ? <Badge tone="warn">Changes not published</Badge> : <Badge tone="positive">Up to date</Badge>}
            <a href={WEBSITE_PAGE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              Our People page <ExternalLink className="size-3.5" />
            </a>
            <Btn icon={Plus} onClick={() => setTeamEdit({ parent: null, office: null })}>
              Add department
            </Btn>
            <Btn
              variant="accent"
              icon={Send}
              loading={publish.pending}
              disabled={!state.changes || state.problems.length > 0}
              onClick={async () => {
                if (!window.confirm("Publish the chart? It goes live on hamdaz.com straight away.")) return;
                if (await publish.run()) refresh();
              }}
            >
              Publish
            </Btn>
          </div>
          {(state.problems.length > 0 || state.warnings.length > 0 || publish.error) && (
            <div className="space-y-1 border-b border-line px-4 py-1.5 text-[12px]">
              {publish.error && <p className="text-danger">{publish.error}</p>}
              {state.problems.length > 0 && (
                <p className="text-danger">
                  <span className="font-medium">Before you can publish:</span> {state.problems.join(" ")}
                </p>
              )}
              {state.warnings.length > 0 && <Warnings items={state.warnings} />}
            </div>
          )}

          {/* the CEO */}
          <div className="flex justify-center border-b border-line px-4 py-2">
            {view.md.length === 0 ? (
              <AddLink onClick={() => setEditing({ fresh: fresh({ title: "Chief Executive Officer", position: "md" }) })}>+ Add the CEO</AddLink>
            ) : (
              view.md.map((p) => <PersonRow key={p.id} person={p} size={34} strong onOpen={() => setEditing({ person: p })} />)
            )}
          </div>

          {/* every department in one row */}
          {depts.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">No departments yet. Add the first one with “Add department”.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid auto-cols-[minmax(11rem,1fr)] grid-flow-col divide-x divide-line">
                {depts.map((d, i) => {
                  const siblings = depts.map((x) => x.team);
                  return (
                    <DeptColumn
                      key={d.team.id}
                      dept={d}
                      onOpen={(p) => setEditing({ person: p })}
                      onAdd={(team, position) => setEditing({ fresh: fresh({ team_id: team.id, position, office: (d.team.office ?? "AE") as OrgOffice }) })}
                      onTeam={(team) => setTeamEdit({ team })}
                      onAddGroup={() => setTeamEdit({ parent: d.team, office: null })}
                      onMoveTeam={(team, by, sibs) => move(sibs, team, by, "teams")}
                      onMovePerson={(p, by, sibs) => move(sibs, p, by, "people")}
                      first={i === 0}
                      last={i === depts.length - 1}
                      siblings={siblings}
                    />
                  );
                })}
              </div>
            </div>
          )}
          {view.loose.length > 0 && (
            <div className="border-t border-line px-4 py-2">
              <p className="mb-1 text-[12px] font-medium text-warn">Without a department: open each one and choose where they belong.</p>
              <div className="flex flex-wrap gap-x-4">
                {view.loose.map((p) => (
                  <PersonRow key={p.id} person={p} onOpen={() => setEditing({ person: p })} />
                ))}
              </div>
            </div>
          )}
          <p className="border-t border-line px-4 py-1.5 text-[11.5px] text-ink-4">
            Faded people are not shown on the website. Click a name to edit it; hover a line for the arrows that change the order.
          </p>
        </Surface>
      )}

      {editing && state && (
        <PersonDrawer
          key={"person" in editing ? editing.person.id : `new-${editing.fresh.user_id ?? ""}-${editing.fresh.position ?? ""}-${editing.fresh.team_id ?? ""}`}
          person={"person" in editing ? editing.person : undefined}
          fresh={"fresh" in editing ? editing.fresh : undefined}
          teams={state.teams}
          onClose={() => {
            setEditing(null);
            refresh();
          }}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {picking && state && (
        <StaffPicker
          on={state.people}
          onClose={() => setPicking(false)}
          onPick={(f) => {
            setPicking(false);
            setEditing({ fresh: f });
          }}
        />
      )}
      {teamEdit && state && (
        <TeamDialog
          editing={teamEdit}
          teams={state.teams}
          onClose={() => setTeamEdit(null)}
          onSaved={() => {
            setTeamEdit(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <HrOnly>
      <OrganisationPage />
    </HrOnly>
  );
}

/* ── what to check before publishing, in one line ────────────────────── */

/** The backend says each one per person ("Feba has no photo yet; …"); here they are counted by kind. */
const WARNING_KINDS: { label: string; match: RegExp }[] = [
  { label: "No photo yet (initials show)", match: /^(.+?) has no photo yet/ },
  { label: "No title", match: /^(.+?) has no title/ },
  { label: "Left Hamdaz, kept off the page", match: /^(.+?) has left Hamdaz/ },
];

function Warnings({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const kinds = WARNING_KINDS.map((k) => ({
    label: k.label,
    names: items.map((w) => w.match(k.match)?.[1]).filter((n): n is string => Boolean(n)),
  })).filter((k) => k.names.length > 0);
  const other = items.filter((w) => !WARNING_KINDS.some((k) => k.match.test(w)));
  return (
    <div className="text-ink-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <TriangleAlert className="size-3.5 shrink-0 text-warn" />
        {kinds.map((k) => (
          <span key={k.label}>
            {k.label}: <span className="font-medium tabular-nums text-ink-2">{k.names.length}</span>
          </span>
        ))}
        {other.map((w) => (
          <span key={w}>{w}</span>
        ))}
        {kinds.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-ink-2 underline-offset-2 hover:underline">
            {open ? "Hide" : "Show who"}
          </button>
        )}
      </p>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-5.5">
          {kinds.map((k) => (
            <li key={k.label}>
              <span className="text-ink-2">{k.label}:</span> {k.names.join(", ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── a department: one column ────────────────────────────────────────── */

function DeptColumn({
  dept: d,
  onOpen,
  onAdd,
  onTeam,
  onAddGroup,
  onMoveTeam,
  onMovePerson,
  first,
  last,
  siblings,
}: {
  dept: Dept;
  onOpen: (p: OrgPerson) => void;
  onAdd: (team: OrgTeam, position: "head" | "member") => void;
  onTeam: (team: OrgTeam) => void;
  onAddGroup: () => void;
  onMoveTeam: (team: OrgTeam, by: number, siblings: OrgTeam[]) => void;
  onMovePerson: (p: OrgPerson, by: number, siblings: OrgPerson[]) => void;
  first: boolean;
  last: boolean;
  siblings: OrgTeam[];
}) {
  const groups = d.groups.map((g) => g.team);
  return (
    <div className="min-w-0 pb-2">
      <div className="group flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => onTeam(d.team)}
          title="Edit department"
          className="min-w-0 truncate text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink hover:underline"
        >
          {d.team.name}
        </button>
        {d.team.office && <span className="text-[10.5px] text-ink-4">{COUNTRY_LABEL[d.team.office]}</span>}
        <span className="ml-auto" />
        <Arrows dir="x" first={first} last={last} onMove={(by) => onMoveTeam(d.team, by, siblings)} />
      </div>
      {d.team.note && <p className="px-2.5 pt-1 text-[11px] leading-snug text-ink-4">{d.team.note}</p>}
      <div className="px-1 pt-1">
        {d.heads.map((p, i) => (
          <PersonRow key={p.id} person={p} strong onOpen={() => onOpen(p)} onMove={(by) => onMovePerson(p, by, d.heads)} first={i === 0} last={i === d.heads.length - 1} />
        ))}
        {d.members.map((p, i) => (
          <PersonRow key={p.id} person={p} indent onOpen={() => onOpen(p)} onMove={(by) => onMovePerson(p, by, d.members)} first={i === 0} last={i === d.members.length - 1} />
        ))}
      </div>
      {d.groups.map((g, i) => (
        <GroupRows
          key={g.team.id}
          group={g}
          onOpen={onOpen}
          onAdd={onAdd}
          onTeam={onTeam}
          onMove={onMovePerson}
          onMoveGroup={(by) => onMoveTeam(g.team, by, groups)}
          first={i === 0}
          last={i === d.groups.length - 1}
        />
      ))}
      <div className="flex flex-wrap gap-x-3 px-2.5 pt-1.5">
        <AddLink onClick={() => onAdd(d.team, "head")}>{d.heads.length ? "+ Head" : "+ Head (needed)"}</AddLink>
        <AddLink onClick={() => onAdd(d.team, "member")}>+ Person</AddLink>
        <AddLink onClick={onAddGroup}>+ Group</AddLink>
      </div>
    </div>
  );
}

/** A group inside a department: a divider, its name and count, its lead, then its people under the lead. */
function GroupRows({
  group: g,
  onOpen,
  onAdd,
  onTeam,
  onMove,
  onMoveGroup,
  first,
  last,
}: {
  group: Unit;
  onOpen: (p: OrgPerson) => void;
  onAdd: (team: OrgTeam, position: "head" | "member") => void;
  onTeam: (team: OrgTeam) => void;
  onMove: (p: OrgPerson, by: number, siblings: OrgPerson[]) => void;
  onMoveGroup: (by: number) => void;
  first: boolean;
  last: boolean;
}) {
  const n = g.heads.length + g.members.length;
  return (
    <div className="mt-1.5 border-t border-line/70 px-1 pt-1">
      <div className="group flex items-center gap-1.5 px-1.5 py-0.5">
        <button
          type="button"
          onClick={() => onTeam(g.team)}
          title="Edit group"
          className="min-w-0 truncate text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-3 hover:text-ink hover:underline"
        >
          {g.team.name}
        </button>
        <span className="text-[10.5px] tabular-nums text-ink-4">{n}</span>
        <span className="ml-auto" />
        <Arrows dir="y" first={first} last={last} onMove={onMoveGroup} />
      </div>
      {g.team.note && <p className="px-1.5 pb-0.5 text-[10.5px] leading-snug text-ink-4">{g.team.note}</p>}
      {g.heads.map((p, i) => (
        <PersonRow key={p.id} person={p} strong onOpen={() => onOpen(p)} onMove={(by) => onMove(p, by, g.heads)} first={i === 0} last={i === g.heads.length - 1} />
      ))}
      {g.members.map((p, i) => (
        <PersonRow
          key={p.id}
          person={p}
          indent={g.heads.length > 0}
          onOpen={() => onOpen(p)}
          onMove={(by) => onMove(p, by, g.members)}
          first={i === 0}
          last={i === g.members.length - 1}
        />
      ))}
      <div className="flex gap-x-3 px-1.5 pt-0.5">
        <AddLink onClick={() => onAdd(g.team, "member")}>+ Person</AddLink>
        {g.heads.length === 0 && <AddLink onClick={() => onAdd(g.team, "head")}>+ Lead</AddLink>}
      </div>
    </div>
  );
}

/* ── one person: a line with a small face ────────────────────────────── */

function PersonRow({
  person: p,
  size = 26,
  strong,
  indent,
  onOpen,
  onMove,
  first,
  last,
}: {
  person: OrgPerson;
  size?: number;
  /** A head or a lead. */
  strong?: boolean;
  /** Under a head or a lead. */
  indent?: boolean;
  onOpen: () => void;
  onMove?: (by: number) => void;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div className={clsx("group flex items-center gap-2 rounded-md py-0.5 pr-1 hover:bg-panel-2", indent ? "pl-4" : "pl-1.5")}>
      <button type="button" onClick={onOpen} title={`Edit ${p.name}`} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-accent">
        <Face src={p.has_photo ? photoUrl(p, "cutout") : null} name={p.name} colour={p.colour} size={size} dim={!p.on_website} />
      </button>
      <button type="button" onClick={onOpen} className={clsx("min-w-0 flex-1 text-left leading-tight", !p.on_website && "opacity-50")}>
        <span className={clsx("block truncate text-[12.5px] text-ink", strong ? "font-semibold" : "font-medium")}>{p.name}</span>
        <span className="block truncate text-[11px] text-ink-3">{p.title || <span className="text-warn">No title</span>}</span>
      </button>
      {onMove && !(first && last) && <Arrows dir="y" first={first} last={last} onMove={onMove} />}
    </div>
  );
}

/** Small order arrows, shown while the line is hovered or focused. */
function Arrows({ dir, first, last, onMove }: { dir: "x" | "y"; first?: boolean; last?: boolean; onMove: (by: number) => void }) {
  if (first && last) return null;
  const [Back, Forward] = dir === "x" ? [ChevronLeft, ChevronRight] : [ArrowUp, ArrowDown];
  const btn = "grid size-5 place-items-center rounded text-ink-4 hover:bg-panel-2 hover:text-ink disabled:opacity-30";
  return (
    <span className="hidden shrink-0 gap-0.5 group-focus-within:flex group-hover:flex">
      <button type="button" className={btn} aria-label={dir === "x" ? "Move left" : "Move up"} title={dir === "x" ? "Move left" : "Move up"} disabled={first} onClick={() => onMove(-1)}>
        <Back className="size-3.5" />
      </button>
      <button type="button" className={btn} aria-label={dir === "x" ? "Move right" : "Move down"} title={dir === "x" ? "Move right" : "Move down"} disabled={last} onClick={() => onMove(1)}>
        <Forward className="size-3.5" />
      </button>
    </span>
  );
}

function AddLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-ink-4 hover:text-ink">
      {children}
    </button>
  );
}

/* ── choosing a member of staff ──────────────────────────────────────── */

function StaffPicker({ on, onClose, onPick }: { on: OrgPerson[]; onClose: () => void; onPick: (fresh: NewFace) => void }) {
  const staff = useSWR<StaffRow[]>("/hr/staff");
  const [q, setQ] = useState("");
  const taken = new Set(on.map((p) => p.user_id).filter(Boolean));
  const rows = (staff.data ?? [])
    .filter((s) => (s.status === "active" || s.status === "notice") && !taken.has(s.user_id))
    .filter((s) => !q || `${s.name} ${s.email}`.toLowerCase().includes(q.toLowerCase()));
  const pick = useAction(async (s: StaffRow) => {
    const found = await api.get<OrgStaffProfile>(`/hr/org/staff/${s.user_id}`);
    onPick({ user_id: s.user_id, ...found.prefill });
    return true;
  });
  return (
    <Modal open onClose={onClose} title="Add from staff" description="Their name, designation and office are filled in from their record." width="md">
      <div className="space-y-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search by name or email" />
        <div className="max-h-80 overflow-y-auto rounded-md border border-line">
          {!staff.data ? (
            <PanelSkeleton lines={5} className="p-3" />
          ) : rows.length === 0 ? (
            <p className="p-4 text-center text-[12.5px] text-ink-3">Nobody left to add{q ? " for that search" : ""}.</p>
          ) : (
            rows.map((s) => (
              <button
                key={s.user_id}
                type="button"
                disabled={pick.pending}
                onClick={() => pick.run(s)}
                className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-panel-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{s.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-4">{s.email}</span>
                </span>
                {s.status === "notice" && <Badge tone="warn">On notice</Badge>}
              </button>
            ))
          )}
        </div>
        {pick.error && <Note tone="danger">{pick.error}</Note>}
      </div>
    </Modal>
  );
}

/* ── a department or group ───────────────────────────────────────────── */

function TeamDialog({ editing, teams, onClose, onSaved }: { editing: TeamEditing; teams: OrgTeam[]; onClose: () => void; onSaved: () => void }) {
  const team = "team" in editing ? editing.team : null;
  const [form, setForm] = useState<OrgTeamIn>({
    name: team?.name ?? "",
    short_name: team?.short_name ?? "",
    parent_id: team ? team.parent_id : "parent" in editing ? (editing.parent?.id ?? null) : null,
    office: team ? team.office : "office" in editing ? editing.office : null,
    note: team?.note ?? null,
  });
  const set = <K extends keyof OrgTeamIn>(k: K, v: OrgTeamIn[K]) => setForm((f) => ({ ...f, [k]: v }));
  const departments = teams.filter((t) => !t.parent_id && t.id !== team?.id);
  const isGroup = Boolean(form.parent_id);
  const save = useAction(() => {
    const body = { ...form, name: form.name.trim(), short_name: form.short_name.trim(), note: form.note?.trim() || null, office: isGroup ? null : form.office };
    return team ? api.put<OrgTeam>(`${ORG_KEY}/teams/${team.id}`, body) : api.post<OrgTeam>(`${ORG_KEY}/teams`, body);
  });
  const remove = useAction(async () => {
    await api.del<void>(`${ORG_KEY}/teams/${team?.id}`);
    return true;
  });
  const noun = isGroup ? "group" : "department";
  return (
    <Modal
      open
      onClose={onClose}
      title={team ? `${isGroup ? "Group" : "Department"}: ${team.name}` : `Add a ${noun}`}
      width="sm"
      footer={
        <>
          {team && (
            <Btn
              variant="danger"
              icon={Trash2}
              className="mr-auto"
              loading={remove.pending}
              onClick={async () => {
                if (!window.confirm(`Remove ${team.name}? Its people stay, without a ${noun}.`)) return;
                if (await remove.run()) onSaved();
              }}
            >
              Remove
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="accent"
            icon={team ? Pencil : Plus}
            loading={save.pending}
            disabled={!form.name.trim()}
            onClick={async () => {
              if (await save.run()) onSaved();
            }}
          >
            {team ? "Save" : `Add ${noun}`}
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Labeled label="Name" required>
          <TextBox autoFocus maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={isGroup ? "Technicians" : "Business Operations"} />
        </Labeled>
        <Labeled label="Short name" hint="Printed under a head's name on the chart. Leave blank to use the name.">
          <TextBox maxLength={40} value={form.short_name} onChange={(e) => set("short_name", e.target.value)} />
        </Labeled>
        <Labeled label="Inside" hint="A group sits inside a department, under its head.">
          <SelectBox value={form.parent_id ?? ""} onChange={(e) => set("parent_id", e.target.value || null)}>
            <option value="">Nothing: it is a department</option>
            {departments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectBox>
        </Labeled>
        {!isGroup && (
          <Labeled label="Office" hint="A label on the department. Every department is on the one chart.">
            <SelectBox value={form.office ?? ""} onChange={(e) => set("office", (e.target.value || null) as OrgOffice | null)}>
              <option value="">Both offices</option>
              <option value="AE">UAE</option>
              <option value="IN">India</option>
            </SelectBox>
          </Labeled>
        )}
        <Labeled label="Note" hint="Optional line on the chart, e.g. Technical reporting: Althaf Hussein, VP Technology.">
          <TextBox maxLength={200} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </Labeled>
        {save.error && <Note tone="danger">{save.error}</Note>}
        {remove.error && <Note tone="danger">{remove.error}</Note>}
      </div>
    </Modal>
  );
}
