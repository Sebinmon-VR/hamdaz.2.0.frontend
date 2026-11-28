"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Send, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import {
  COUNTRY_LABEL,
  ORG_KEY,
  POSITION_LABEL,
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
import { Btn, IconBtn, Labeled, Note, SearchBox, SelectBox, Surface, TextBox } from "@/components/payroll/ui";

/** Where the published chart shows. */
const WEBSITE_PAGE = "https://hamdaz.com/people.html";
const PAPER = "#f2f1ed";

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

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · People"
        title="Organisation"
        lead="The chart on the website's Our People page: one chart under the CEO, every department and group in the UAE and India, with each person's photo and a few lines about them."
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
        <>
          {/* publishing */}
          <Surface>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  {state.published ? `On the website: version ${state.published.version}, ${state.published.people} people` : "Not on the website yet"}
                </p>
                <p className="text-[12px] text-ink-3">
                  {state.published
                    ? `Published ${new Date(state.published.published_at).toLocaleString()}${state.published.published_by_name ? ` by ${state.published.published_by_name}` : ""}.`
                    : "Arrange the chart, then publish it to the Our People page."}
                </p>
              </div>
              {state.changes ? <Badge tone="warn">Changes not published</Badge> : <Badge tone="positive">Up to date</Badge>}
              <a href={WEBSITE_PAGE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
                Our People page <ExternalLink className="size-3.5" />
              </a>
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
              <div className="space-y-2 border-t border-line px-4 py-3">
                {publish.error && <Note tone="danger">{publish.error}</Note>}
                {state.problems.length > 0 && (
                  <Note tone="danger">
                    <span className="font-medium">Before you can publish:</span>
                    <List items={state.problems} />
                  </Note>
                )}
                {state.warnings.length > 0 && (
                  <Note tone="warn">
                    <List items={state.warnings} />
                  </Note>
                )}
              </div>
            )}
          </Surface>

          {/* the chart */}
          <Surface className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <p className="text-[12.5px] text-ink-3">
                {state.people.length} {state.people.length === 1 ? "person" : "people"} · {depts.length} {depts.length === 1 ? "department" : "departments"}
              </p>
              <span className="ml-auto" />
              <Btn icon={Plus} onClick={() => setTeamEdit({ parent: null, office: null })}>
                Add department
              </Btn>
            </div>
            <div className="px-4 pb-6 pt-4" style={{ background: PAPER }}>
              <div className="flex justify-center gap-6 pb-6 pt-8">
                {view.md.length === 0 ? (
                  <EmptySlot label="CEO" onClick={() => setEditing({ fresh: fresh({ title: "Chief Executive Officer", position: "md" }) })} />
                ) : (
                  view.md.map((p) => <Tile key={p.id} person={p} size={92} onOpen={() => setEditing({ person: p })} />)
                )}
              </div>
              {depts.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ink-3">No departments here yet. Add the first one with “Add department”.</p>
              ) : (
                <div className="flex flex-wrap items-start justify-center gap-4">
                  {depts.map((d) => {
                    const siblings = view.depts.map((x) => x.team);
                    return (
                      <DeptCard
                        key={d.team.id}
                        dept={d}
                        teams={state.teams}
                        onOpen={(p) => setEditing({ person: p })}
                        onAdd={(team, position) => setEditing({ fresh: fresh({ team_id: team.id, position, office: (d.team.office ?? "AE") as OrgOffice }) })}
                        onTeam={(team) => setTeamEdit({ team })}
                        onAddGroup={() => setTeamEdit({ parent: d.team, office: null })}
                        onMoveTeam={(team, by, sibs) => move(sibs, team, by, "teams")}
                        onMovePerson={(p, by, sibs) => move(sibs, p, by, "people")}
                        first={siblings.indexOf(d.team) === 0}
                        last={siblings.indexOf(d.team) === siblings.length - 1}
                        siblings={siblings}
                      />
                    );
                  })}
                </div>
              )}
              {view.loose.length > 0 && (
                <div className="mt-5 rounded-lg border border-dashed border-warn/60 bg-warn-soft/30 p-3">
                  <p className="mb-2 text-[12px] font-medium text-ink-2">Without a department: open each one and choose where they belong.</p>
                  <div className="flex flex-wrap gap-3 pt-6">
                    {view.loose.map((p) => (
                      <Tile key={p.id} person={p} size={48} onOpen={() => setEditing({ person: p })} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="border-t border-line px-4 py-2 text-[11.5px] text-ink-4">
              Faded faces are not shown on the website. Click a face or a name to edit it; the arrows change the order.
            </p>
          </Surface>
        </>
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

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 list-disc pl-4">
      {items.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

/* ── a department ────────────────────────────────────────────────────── */

function DeptCard({
  dept: d,
  teams,
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
  teams: OrgTeam[];
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
    <div className="w-max min-w-[13rem] max-w-[30rem] rounded-lg border border-line/70 bg-white/60 pb-3">
      <div className="flex items-center gap-1 border-b border-line/70 px-1 py-1.5">
        <IconBtn icon={ChevronLeft} label="Move left" disabled={first} onClick={() => onMoveTeam(d.team, -1, siblings)} />
        <button type="button" className="min-w-0 flex-1 truncate px-1 text-center text-[12.5px] font-semibold uppercase tracking-wide text-ink hover:underline" onClick={() => onTeam(d.team)} title="Edit department">
          {d.team.name}
        </button>
        {d.team.office && <Badge tone="neutral">{COUNTRY_LABEL[d.team.office]}</Badge>}
        <IconBtn icon={ChevronRight} label="Move right" disabled={last} onClick={() => onMoveTeam(d.team, 1, siblings)} />
      </div>
      {d.team.note && <p className="px-3 pt-2 text-center text-[11px] text-ink-4">{d.team.note}</p>}
      <div className="flex justify-center gap-2 px-3 pb-2 pt-8">
        {d.heads.map((p) => (
          <Tile key={p.id} person={p} size={66} onOpen={() => onOpen(p)} />
        ))}
        <EmptySlot label={d.heads.length ? "Add head" : "Head"} small onClick={() => onAdd(d.team, "head")} />
      </div>
      {d.members.length > 0 && <People unit={d} onOpen={onOpen} onMove={onMovePerson} />}
      <div className="flex flex-wrap items-start justify-center gap-3 px-3 pt-2">
        {d.groups.map((g, i) => (
          <GroupBox
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
      </div>
      <div className="flex justify-center gap-3 px-3 pt-3">
        <button type="button" className="text-[11.5px] text-ink-4 hover:text-ink" onClick={() => onAdd(d.team, "member")}>
          + Person
        </button>
        <button type="button" className="text-[11.5px] text-ink-4 hover:text-ink" onClick={onAddGroup}>
          + Group inside {d.team.short_name}
        </button>
      </div>
    </div>
  );
}

function GroupBox({
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
    <div className="w-max min-w-[9.5rem] rounded-md border border-line/60 bg-[#e9ecf1]/70 pb-2">
      <div className="flex items-center gap-1 px-1 py-1">
        <IconBtn icon={ChevronLeft} label="Move left" disabled={first} onClick={() => onMoveGroup(-1)} />
        <button type="button" className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2 hover:underline" onClick={() => onTeam(g.team)} title="Edit group">
          {g.team.name}
        </button>
        <span className="rounded-full bg-[#e0559a] px-1.5 text-[10px] font-semibold text-white">{n}</span>
        <IconBtn icon={ChevronRight} label="Move right" disabled={last} onClick={() => onMoveGroup(1)} />
      </div>
      {g.team.note && <p className="px-2 text-[10.5px] text-ink-4">{g.team.note}</p>}
      {g.heads.length > 0 && (
        <div className="flex justify-center gap-2 pt-6">
          {g.heads.map((p) => (
            <Tile key={p.id} person={p} size={54} onOpen={() => onOpen(p)} />
          ))}
        </div>
      )}
      <People unit={g} onOpen={onOpen} onMove={onMove} />
      <div className="flex justify-center gap-3 pt-1">
        <button type="button" className="text-[11px] text-ink-4 hover:text-ink" onClick={() => onAdd(g.team, "member")}>
          + Person
        </button>
        {g.heads.length === 0 && (
          <button type="button" className="text-[11px] text-ink-4 hover:text-ink" onClick={() => onAdd(g.team, "head")}>
            + Lead
          </button>
        )}
      </div>
    </div>
  );
}

function People({ unit, onOpen, onMove }: { unit: Unit; onOpen: (p: OrgPerson) => void; onMove: (p: OrgPerson, by: number, siblings: OrgPerson[]) => void }) {
  const list = unit.members;
  if (list.length === 0) return null;
  return (
    <div className={clsx("grid justify-center gap-x-1 gap-y-1 px-2 pt-6", list.length > 2 ? "grid-cols-2" : "grid-flow-col")}>
      {list.map((p, i) => (
        <Tile key={p.id} person={p} size={44} onOpen={() => onOpen(p)} onMove={(by) => onMove(p, by, list)} first={i === 0} last={i === list.length - 1} />
      ))}
    </div>
  );
}

/* ── a face on the chart ─────────────────────────────────────────────── */

function Tile({
  person: p,
  size,
  onOpen,
  onMove,
  first,
  last,
}: {
  person: OrgPerson;
  size: number;
  onOpen: () => void;
  onMove?: (by: number) => void;
  first?: boolean;
  last?: boolean;
}) {
  const missing = !p.has_photo ? "No photo" : !p.title ? "No title" : null;
  return (
    <div className="group relative flex w-[6.25rem] flex-col items-center pb-1 text-center">
      <button type="button" onClick={onOpen} className="rounded-full focus-visible:outline-2 focus-visible:outline-accent" title={`Edit ${p.name}`}>
        <Face src={p.has_photo ? photoUrl(p, "cutout") : null} name={p.name} colour={p.colour} size={size} gap={PAPER} dim={!p.on_website} />
      </button>
      <button type="button" onClick={onOpen} className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold leading-tight text-ink hover:underline">
        {p.name}
      </button>
      <span className="line-clamp-1 text-[10px] text-ink-3">{p.title || POSITION_LABEL[p.position]}</span>
      {p.on_website && missing && <span className="text-[9.5px] font-medium text-warn">{missing}</span>}
      {onMove && (
        <span className="absolute -top-1 right-0 hidden gap-0.5 group-hover:flex">
          <IconBtn icon={ArrowUp} label="Earlier" disabled={first} onClick={() => onMove(-1)} />
          <IconBtn icon={ArrowDown} label="Later" disabled={last} onClick={() => onMove(1)} />
        </span>
      )}
    </div>
  );
}

function EmptySlot({ label, small, onClick }: { label: string; small?: boolean; onClick: () => void }) {
  const size = small ? 44 : 92;
  return (
    <button type="button" onClick={onClick} className="flex w-[6.25rem] flex-col items-center gap-1.5 text-ink-4 hover:text-ink">
      <span className="grid place-items-center rounded-full border-2 border-dashed border-current" style={{ width: size, height: size }}>
        <Plus className="size-4" />
      </span>
      <span className="text-[10.5px]">{label}</span>
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
