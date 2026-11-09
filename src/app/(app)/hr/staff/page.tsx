"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import useSWR from "swr";
import { FolderLock, RotateCcw, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import { date, isoDay, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import {
  EXIT_KINDS,
  STATUS_LABEL,
  type ExitKind,
  type ExitResult,
  type StaffDetail,
  type StaffRow,
  type StaffStatus,
} from "@/lib/staff";
import { Badge, PageHead, type Tone } from "@/components/ui/primitives";
import { PanelSkeleton } from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { Drawer, DrawerSection } from "@/components/payroll/Drawer";
import {
  AreaBox,
  Btn,
  BtnLink,
  Labeled,
  Note,
  SearchBox,
  SelectBox,
  Stats,
  Surface,
  TD,
  TextBox,
  TH,
  Toolbar,
  UnderlineTabs,
} from "@/components/payroll/ui";

type Tab = StaffStatus | "all";

const STATUS_TONE: Record<StaffStatus, Tone> = {
  active: "positive",
  notice: "warn",
  left: "neutral",
  inactive: "neutral",
};

export default function StaffPage() {
  return (
    <HrOnly>
      <Staff />
    </HrOnly>
  );
}

/**
 * Everybody with a Hamdaz login, and whether they still work here.
 *
 * Marking someone as leaving is the one action on this screen, and it is the
 * one that matters: from that moment they take no new work in any team, their
 * sign-in goes off after their last day, and payroll gets the leaving date.
 */
function Staff() {
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const staff = useSWR<StaffRow[]>("/hr/staff");
  const all = staff.data ?? [];

  const count = (s: StaffStatus) => all.filter((r) => r.status === s).length;
  const q = search.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (tab === "all" || r.status === tab) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.teams.some((t) => t.toLowerCase().includes(q))),
  );

  return (
    <div className="space-y-4">
      <PageHead eyebrow="HR · People" title="Staff" />

      <Surface>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: "Active", count: count("active") },
            { value: "notice", label: "Serving notice", count: count("notice") },
            { value: "left", label: "Left", count: count("left") },
            { value: "inactive", label: "Account off", count: count("inactive") },
            { value: "all", label: "All", count: all.length },
          ]}
        />
        {staff.data && (
          <Stats
            items={[
              { label: "Active", value: String(count("active")) },
              { label: "Serving notice", value: String(count("notice")) },
              { label: "Left", value: String(count("left")) },
            ]}
          />
        )}
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, email or team" />
          <span className="tnum text-[12px] text-ink-4">
            {staff.data ? `${rows.length} ${rows.length === 1 ? "person" : "people"}` : ""}
          </span>
        </Toolbar>
        {tab === "inactive" && (
          <Note>
            Accounts switched off without an exit recorded: service accounts, or people turned off
            by hand. Record an exit for anyone here who has actually left.
          </Note>
        )}

        {staff.error ? (
          <Note tone="danger">{staff.error.message}</Note>
        ) : !staff.data ? (
          <PanelSkeleton lines={6} className="p-4" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13px] text-ink-3">
            {q ? "Nobody matches." : "Nobody here."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Name</th>
                  <th className={TH}>Team</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Joined</th>
                  <th className={TH}>Last working day</th>
                  <th className={TH}>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.user_id}
                    onClick={() => setOpen(r.user_id)}
                    className="cursor-pointer hover:bg-panel-2/50"
                  >
                    <td className={TD}>
                      <span className="block font-medium text-ink">{r.name}</span>
                      <span className="block text-[11.5px] text-ink-4">{r.email}</span>
                    </td>
                    <td className={clsx(TD, "text-ink-3")}>{r.teams.join(", ") || "—"}</td>
                    <td className={TD}>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className={clsx(TD, "text-ink-3")}>{date(r.joined_on)}</td>
                    <td className={clsx(TD, r.status === "notice" ? "text-warn" : "text-ink-3")}>
                      {r.exit ? date(r.exit.last_working_day) : "—"}
                    </td>
                    <td className={clsx(TD, "text-ink-3")}>
                      {r.last_login_at ? relative(r.last_login_at) : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {open && (
        <PersonDrawer
          key={open}
          id={open}
          onClose={() => setOpen(null)}
          onChanged={() => staff.mutate()}
        />
      )}
    </div>
  );
}

function PersonDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const person = useSWR<StaffDetail>(`/hr/staff/${id}`);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const p = person.data;

  const withdraw = useAction(() => api.del<ExitResult>(`/hr/staff/${id}/exit`));

  const done = (result: ExitResult | undefined, message: string) => {
    if (!result) return;
    person.mutate(result.person, false);
    onChanged();
    setEditing(false);
    setNotice(
      result.ranking_refreshed
        ? message
        : `${message} The assignment ranking will catch up at the next sync.`,
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={p?.name ?? "…"}
      subtitle={p ? `${p.email}${p.teams.length ? ` · ${p.teams.join(", ")}` : ""}` : undefined}
    >
      {person.error ? (
        <Note tone="danger">{person.error.message}</Note>
      ) : !p ? (
        <PanelSkeleton lines={6} />
      ) : (
        <>
          {notice && (
            <div className="mb-4">
              <Note tone="positive">{notice}</Note>
            </div>
          )}

          <DrawerSection
            title="Employment"
            action={
              <BtnLink href={`/hr/people/${p.user_id}`} icon={FolderLock}>
                HR file
              </BtnLink>
            }
          >
            <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-y-2 text-[13px]">
              <dt className="text-ink-3">Status</dt>
              <dd>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </dd>
              <dt className="text-ink-3">Joined</dt>
              <dd className="text-ink">{date(p.joined_on)}</dd>
              <dt className="text-ink-3">Sign-in</dt>
              <dd className="text-ink">
                {p.is_active ? "On" : "Off"}
                {p.last_login_at && (
                  <span className="text-ink-4"> · last {relative(p.last_login_at)}</span>
                )}
              </dd>
              <dt className="text-ink-3">Payroll</dt>
              <dd className="text-ink">
                {p.payroll_code ? (
                  <>
                    {p.payroll_code}
                    {p.payroll_left_on && (
                      <span className="text-ink-4"> · leaving {date(p.payroll_left_on)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-ink-4">Not linked</span>
                )}
              </dd>
            </dl>
          </DrawerSection>

          <DrawerSection
            title="Leaving"
            action={
              p.exit && !editing ? (
                <div className="flex gap-2">
                  <Btn onClick={() => setEditing(true)}>Correct</Btn>
                  <Btn
                    icon={RotateCcw}
                    disabled={withdraw.pending}
                    onClick={async () => {
                      const verb = p.status === "left" ? "Take back" : "Withdraw the resignation of";
                      if (!window.confirm(`${verb} ${p.name}? They go back into assignment.`)) return;
                      done(
                        await withdraw.run(),
                        p.status === "left"
                          ? `${p.name} is taken back on.`
                          : `${p.name}'s resignation is withdrawn.`,
                      );
                    }}
                  >
                    {p.status === "left" ? "Take back" : "Withdraw"}
                  </Btn>
                </div>
              ) : undefined
            }
          >
            {withdraw.error && (
              <div className="mb-3">
                <Note tone="danger">{withdraw.error}</Note>
              </div>
            )}
            {p.exit && !editing ? (
              <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-y-2 text-[13px]">
                <dt className="text-ink-3">Reason</dt>
                <dd className="text-ink">{p.exit.kind_label}</dd>
                <dt className="text-ink-3">Resigned on</dt>
                <dd className="text-ink">{date(p.exit.resigned_on)}</dd>
                <dt className="text-ink-3">Last working day</dt>
                <dd className="text-ink">{date(p.exit.last_working_day)}</dd>
                {p.exit.note && (
                  <>
                    <dt className="text-ink-3">Note</dt>
                    <dd className="whitespace-pre-wrap text-ink">{p.exit.note}</dd>
                  </>
                )}
                <dt className="text-ink-3">Recorded</dt>
                <dd className="text-ink-3">
                  {p.exit.recorded_by_name ?? "Unknown"} · {relative(p.exit.recorded_at)}
                </dd>
                <dt className="text-ink-3">Assignment</dt>
                <dd className="text-ink">Takes no new work</dd>
              </dl>
            ) : editing ? (
              <ExitForm
                person={p}
                onCancel={() => setEditing(false)}
                onSaved={(r) => done(r, "Saved.")}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-ink-3">
                  Nothing recorded. Marking {p.name} as leaving takes them out of every
                  team&rsquo;s assignment straight away, switches off their sign-in after their
                  last working day, and gives payroll the leaving date.
                </p>
                <Btn variant="accent" icon={UserMinus} onClick={() => setEditing(true)}>
                  Mark as leaving
                </Btn>
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="History">
            {p.events.length === 0 ? (
              <p className="text-[13px] text-ink-4">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line text-[13px]">
                {p.events.map((e, i) => (
                  <li key={i} className="py-2">
                    <p className="text-ink">{e.summary}</p>
                    <p className="text-[11.5px] text-ink-4">
                      {e.actor_name ?? "System"} · {relative(e.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

function ExitForm({
  person,
  onCancel,
  onSaved,
}: {
  person: StaffDetail;
  onCancel: () => void;
  onSaved: (result: ExitResult | undefined) => void;
}) {
  const e = person.exit;
  const [kind, setKind] = useState<ExitKind>(e?.kind ?? "resigned");
  const [resignedOn, setResignedOn] = useState(e?.resigned_on ?? isoDay(new Date()));
  const [lastDay, setLastDay] = useState(e?.last_working_day ?? "");
  const [note, setNote] = useState(e?.note ?? "");
  const save = useAction(() =>
    api.put<ExitResult>(`/hr/staff/${person.user_id}/exit`, {
      kind,
      resigned_on: resignedOn || null,
      last_working_day: lastDay,
      note: note.trim() || null,
    }),
  );

  const past = lastDay && lastDay < isoDay(new Date());

  return (
    <form
      className="space-y-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        onSaved(await save.run());
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Reason" required>
          <SelectBox value={kind} onChange={(ev) => setKind(ev.target.value as ExitKind)}>
            {EXIT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </SelectBox>
        </Labeled>
        <Labeled label="Resigned on">
          <TextBox type="date" value={resignedOn} onChange={(ev) => setResignedOn(ev.target.value)} />
        </Labeled>
        <Labeled label="Last working day" required>
          <TextBox
            type="date"
            required
            value={lastDay}
            min={resignedOn || undefined}
            onChange={(ev) => setLastDay(ev.target.value)}
          />
        </Labeled>
      </div>
      <Labeled label="Note">
        <AreaBox value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Optional" />
      </Labeled>
      {past && (
        <Note tone="warn">
          The last working day has passed, so their sign-in is switched off as soon as this is saved.
        </Note>
      )}
      {save.error && <Note tone="danger">{save.error}</Note>}
      <div className="flex gap-2">
        <Btn type="submit" variant="accent" disabled={save.pending || !lastDay}>
          {e ? "Save" : "Mark as leaving"}
        </Btn>
        <Btn type="button" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </form>
  );
}
