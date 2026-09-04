"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  CalendarDays,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  HeldLabelOut,
  LabelKind,
  LabelOut,
  PersonLabelsOut,
  SuggestedLabel,
} from "@/lib/types";
import {
  Avatar,
  Figure,
  HeroPanel,
  PageHead,
  Panel,
  SolidBadge,
} from "@/components/ui/primitives";
import { PersonHover } from "@/components/people/PersonHover";
import {
  Button,
  Field,
  Input,
  PillRail,
  SearchInput,
  Select,
  Textarea,
} from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  RowsSkeleton,
} from "@/components/ui/feedback";

/**
 * Labels.
 *
 * Two things live here, and they are deliberately on one screen: the catalogue
 * of labels that exist, and who holds which. Separating them would mean
 * clicking between "make a label" and "give it to somebody", which is the same
 * task.
 *
 * Some labels are **derived** — On Leave is read live from the leave module,
 * New Joiner from a joining date — so they cannot be assigned or removed by
 * hand. Those show with their reason attached rather than a remove button,
 * because the honest answer to "why does she have this" is a date, not a person.
 *
 * Reading is open to anyone who can reach the module. Editing needs a super
 * admin, the CEO or a manager, and the backend enforces that — the UI hides
 * what it can and reports the refusal when it cannot.
 */
export default function LabelsPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | LabelKind>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LabelOut | null>(null);
  const [assigning, setAssigning] = useState<PersonLabelsOut | null>(null);
  const [dating, setDating] = useState<PersonLabelsOut | null>(null);

  const labels = useSWR<LabelOut[]>("/labels");
  const people = useSWR<PersonLabelsOut[]>("/labels/people");
  const suggested = useSWR<SuggestedLabel[]>("/labels/suggested");

  const mayEdit = session.roles.is_admin;
  // A profile carries somebody's whole record, so the link is offered
  // only to the people allowed to open it.
  const mayOpenProfile = session.roles.is_admin;

  const remove = useAction(async (key: string) => api.del(`/labels/${key}`));
  const unassign = useAction(async (userId: string, labelKey: string) =>
    api.post<PersonLabelsOut>("/labels/unassign", {
      user_id: userId,
      label_key: labelKey,
    }),
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (people.data ?? []).filter(
      (person) =>
        !needle ||
        person.display_name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle) ||
        person.labels.some((l) => l.name.toLowerCase().includes(needle)),
    );
  }, [people.data, search]);

  const catalogue = (labels.data ?? []).filter(
    (label) => kind === "all" || label.kind === kind,
  );

  const counts = useMemo(() => {
    const held = new Map<string, number>();
    for (const person of people.data ?? []) {
      for (const label of person.labels) {
        held.set(label.key, (held.get(label.key) ?? 0) + 1);
      }
    }
    return held;
  }, [people.data]);

  const unlabelled = (people.data ?? []).filter(
    (p) => p.labels.filter((l) => l.kind === "category").length === 0,
  ).length;

  return (
    <>
      <PageHead
        eyebrow="Work assignment"
        title="Labels"
        count={labels.data ? `${num(labels.data.length)} labels` : undefined}
        actions={
          mayEdit && (
            <Button variant="accent" size="lg" icon={Plus} onClick={() => setCreating(true)}>
              New label
            </Button>
          )
        }
      />

      {!mayEdit && (
        <InlineNotice tone="info">
          You can read these but not change them. Assigning a label needs a super admin,
          the CEO or a manager.
        </InlineNotice>
      )}

      {(remove.error || unassign.error) && (
        <InlineNotice tone="danger">{remove.error ?? unassign.error}</InlineNotice>
      )}

      {/* ── the catalogue ─────────────────────────────────────────── */}
      <HeroPanel className="p-7">
        <div className="flex flex-wrap gap-x-14 gap-y-6">
          <Figure
            label="People labelled"
            value={num((people.data ?? []).length - unlabelled)}
            sub={`of ${num((people.data ?? []).length)}`}
          />
          <Figure
            label="Without a seniority label"
            value={num(unlabelled)}
            tone={unlabelled > 0 ? "second" : undefined}
            sub={unlabelled > 0 ? "fall back to the default" : "all covered"}
          />
          <Figure
            label="In the catalogue"
            value={num((labels.data ?? []).length)}
            sub={`${(labels.data ?? []).filter((l) => l.derived).length} automatic`}
          />
        </div>

        <div className="mt-8">
          <PillRail
            value={kind}
            onChange={setKind}
            className="mb-4 w-fit"
            options={[
              { value: "all", label: "All", count: labels.data?.length },
              { value: "category", label: "Seniority" },
              { value: "status", label: "Status" },
              { value: "skill", label: "Skill" },
            ]}
          />

          {labels.error ? (
            <ErrorState error={labels.error} onRetry={() => labels.mutate()} />
          ) : !labels.data ? (
            <RowsSkeleton rows={4} />
          ) : catalogue.length === 0 ? (
            <Empty icon={Tag} title="No labels of this kind" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {catalogue.map((label) => (
                <LabelChip
                  key={label.id}
                  label={label}
                  held={counts.get(label.key) ?? 0}
                  suggestedCapacity={
                    suggested.data?.find((s) => s.key === label.key)?.capacity ?? null
                  }
                  onEdit={mayEdit ? () => setEditing(label) : undefined}
                  onRemove={
                    mayEdit && !label.is_system
                      ? async () => {
                          if ((await remove.run(label.key)) !== undefined) {
                            labels.mutate();
                            people.mutate();
                          }
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </HeroPanel>


      {/* ── people ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name, email or label"
          className="w-full max-w-xs"
        />
        <span className="text-[12.5px] text-ink-3">{num(rows.length)} people</span>
      </div>

      {people.error ? (
        <ErrorState error={people.error} onRetry={() => people.mutate()} />
      ) : !people.data ? (
        <RowsSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <Empty
          icon={UserRound}
          title={search ? "Nobody matches that" : "No people yet"}
          body={
            search
              ? "Try part of a name, an email, or a label."
              : "People appear here once they have signed in to Hamdaz."
          }
        />
      ) : (
        <Panel tone="slab" className="p-5">
          <div className="flex items-center gap-3 px-2 pb-3.5">
            <span className="text-[16px] font-semibold">Who holds what</span>
            {unlabelled > 0 && (
              <SolidBadge tone="second">{unlabelled} unlabelled</SolidBadge>
            )}
            <span className="tnum ml-auto text-[12px] text-slab-ink-3">{rows.length}</span>
          </div>

          <div className="space-y-1">
            {rows.map((person) => (
              <div
                key={person.user_id}
                className="flex flex-wrap items-center gap-3 rounded-[11px] px-4 py-3 transition hover:bg-slab-row"
              >
                <PersonHover
                  userId={person.user_id}
                  name={person.display_name}
                  email={person.email}
                >
                  <Avatar
                    name={person.display_name}
                    seed={person.user_id}
                    size="sm"
                    className="size-9"
                  />
                </PersonHover>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">
                    {mayOpenProfile ? (
                      <Link
                        href={`/admin/users/${person.user_id}`}
                        className="transition hover:text-accent-text"
                      >
                        {person.display_name}
                      </Link>
                    ) : (
                      person.display_name
                    )}
                  </p>
                  <p className="truncate text-[11.5px] text-slab-ink-3">
                    {person.joined_on
                      ? `joined ${date(person.joined_on)}`
                      : person.email}
                  </p>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pl-2">
                  {person.labels.length === 0 ? (
                    <span className="text-[12px] text-slab-ink-3">No labels</span>
                  ) : (
                    person.labels.map((label) => (
                      <HeldChip
                        key={label.key}
                        label={label}
                        onRemove={
                          mayEdit && label.source === "manual"
                            ? async () => {
                                if (
                                  (await unassign.run(person.user_id, label.key)) !==
                                  undefined
                                ) {
                                  people.mutate();
                                }
                              }
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>

                {mayEdit && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" icon={CalendarDays} onClick={() => setDating(person)}>
                      Joined
                    </Button>
                    <Button
                      size="sm"
                      variant="accent"
                      icon={Plus}
                      onClick={() => setAssigning(person)}
                    >
                      Label
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <CreateLabel
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          labels.mutate();
        }}
      />
      <EditLabel
        label={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          labels.mutate();
          people.mutate();
        }}
      />
      <AssignLabel
        person={assigning}
        labels={labels.data ?? []}
        onClose={() => setAssigning(null)}
        onDone={() => {
          setAssigning(null);
          people.mutate();
        }}
      />
      <SetJoinedOn
        person={dating}
        onClose={() => setDating(null)}
        onDone={() => {
          setDating(null);
          people.mutate();
        }}
      />
    </>
  );
}

/* ── chips ───────────────────────────────────────────────────────────── */

function LabelChip({
  label,
  held,
  suggestedCapacity,
  onEdit,
  onRemove,
}: {
  label: LabelOut;
  held: number;
  suggestedCapacity: number | null;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <span
      className="group inline-flex h-9 items-center gap-2.5 rounded-full bg-panel-2 py-1 pl-1 pr-3.5"
      title={label.description ?? undefined}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
        style={{
          background: label.color ?? "var(--panel-3)",
          color: label.color ? "#fff" : "var(--ink-3)",
        }}
      >
        {label.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-[12.5px] font-medium text-ink">{label.name}</span>
      {suggestedCapacity !== null && (
        <span className="tnum text-[11px] text-ink-4">×{suggestedCapacity}</span>
      )}
      <span className="tnum text-[11px] text-ink-4">{held}</span>
      {label.derived && <Sparkles className="size-3 text-accent" />}
      {onEdit && (
        <button
          onClick={onEdit}
          aria-label={`Edit ${label.name}`}
          className="grid size-5 place-items-center rounded-full text-ink-4 opacity-0 transition hover:bg-panel-3 hover:text-ink group-hover:opacity-100"
        >
          <Pencil className="size-3" />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Delete ${label.name}`}
          className="grid size-5 place-items-center rounded-full text-ink-4 opacity-0 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </span>
  );
}

function HeldChip({
  label,
  onRemove,
}: {
  label: HeldLabelOut;
  onRemove?: () => void;
}) {
  const derived = label.source === "derived";
  return (
    <span
      title={label.reason ?? undefined}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 text-[11.5px] font-medium",
        onRemove ? "pr-1" : "pr-2.5",
        derived
          ? "bg-accent-soft text-accent-text"
          : "bg-slab-row text-slab-ink ring-1 ring-slab-line",
      )}
    >
      {derived && <Sparkles className="size-3" />}
      {label.name}
      {label.expires_at && (
        <span className="opacity-60">to {date(label.expires_at)}</span>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${label.name}`}
          className="grid size-4 place-items-center rounded-full opacity-60 transition hover:opacity-100"
        >
          <X className="size-2.5" strokeWidth={3} />
        </button>
      )}
    </span>
  );
}

/* ── dialogs ─────────────────────────────────────────────────────────── */

function CreateLabel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LabelKind>("skill");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3182ce");

  const create = useAction(async () =>
    api.post("/labels", {
      key: key.trim(),
      name: name.trim(),
      kind,
      description: description.trim() || null,
      color: color || null,
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New label"
      description="A label on its own does nothing. It starts mattering when the policy gives it a capacity."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={create.pending}
            disabled={!key.trim() || !name.trim()}
            onClick={async () => {
              if ((await create.run()) !== undefined) {
                setKey("");
                setName("");
                setDescription("");
                onCreated();
              }
            }}
          >
            Create label
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}
        <Field label="Key" required hint="Lowercase, no spaces. Cannot be changed later.">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="switchgear"
          />
        </Field>
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Switchgear specialist"
          />
        </Field>
        <Field
          label="Kind"
          required
          hint="Seniority sets a share of the work; status can take someone out of the pool; a skill is descriptive."
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value as LabelKind)}>
            <option value="category">Seniority</option>
            <option value="status">Status</option>
            <option value="skill">Skill</option>
          </Select>
        </Field>
        <Field label="Colour">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-11 cursor-pointer rounded-2xl border border-line bg-panel-2"
              aria-label="Label colour"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What holding this label says about somebody."
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Renaming a label, not replacing it.
 *
 * The key is missing from this form on purpose: the assignment policy, every
 * assignment and every stored run refer to it, so editing it would detach all
 * of them at once. It is shown, greyed, so nobody goes looking for the field.
 *
 * A system label may be renamed but not re-kinded — the policy reasons about a
 * seniority and a status differently, and the backend refuses the change.
 */
function EditLabel({
  label,
  onClose,
  onSaved,
}: {
  label: LabelOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LabelKind>("skill");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3182ce");
  const [seenFor, setSeenFor] = useState<string | undefined>();

  if (label?.key !== seenFor) {
    setSeenFor(label?.key);
    setName(label?.name ?? "");
    setKind(label?.kind ?? "skill");
    setDescription(label?.description ?? "");
    setColor(label?.color ?? "#3182ce");
  }

  // Only what actually moved is sent, so an untouched field cannot overwrite
  // a value somebody else changed in the meantime.
  const save = useAction(async () => {
    const patch: Record<string, unknown> = {};
    if (name.trim() !== label!.name) patch.name = name.trim();
    if ((description.trim() || null) !== label!.description) {
      patch.description = description.trim() || null;
    }
    if (color !== label!.color) patch.color = color || null;
    if (kind !== label!.kind) patch.kind = kind;
    if (Object.keys(patch).length === 0) return null;
    return api.patch<LabelOut>(`/labels/${label!.key}`, patch);
  });

  return (
    <Modal
      open={Boolean(label)}
      onClose={onClose}
      title={label ? `Edit ${label.name}` : "Edit label"}
      description="The wording and the colour. Who holds it is unaffected."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!name.trim()}
            onClick={async () => {
              if ((await save.run()) !== undefined) onSaved();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        <Field
          label="Key"
          hint="Cannot be changed — the policy, every assignment and every stored run refer to it."
        >
          <Input value={label?.key ?? ""} readOnly disabled />
        </Field>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Kind"
          hint={
            label?.is_system
              ? "Fixed on a built-in label: the policy treats seniority and status differently."
              : undefined
          }
        >
          <Select
            value={kind}
            disabled={label?.is_system}
            onChange={(e) => setKind(e.target.value as LabelKind)}
          >
            <option value="category">Seniority</option>
            <option value="status">Status</option>
            <option value="skill">Skill</option>
          </Select>
        </Field>
        <Field label="Colour">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-11 cursor-pointer rounded-2xl border border-line bg-panel-2"
              aria-label="Label colour"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function AssignLabel({
  person,
  labels,
  onClose,
  onDone,
}: {
  person: PersonLabelsOut | null;
  labels: LabelOut[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [labelKey, setLabelKey] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [seenFor, setSeenFor] = useState<string | undefined>();

  if (person?.user_id !== seenFor) {
    setSeenFor(person?.user_id);
    setLabelKey("");
    setExpires("");
    setNote("");
  }

  const assign = useAction(async () =>
    api.post<PersonLabelsOut>("/labels/assign", {
      user_id: person!.user_id,
      label_key: labelKey,
      expires_at: expires || null,
      note: note.trim() || null,
    }),
  );

  // A derived label is computed, not given, so it is never offered here.
  const held = new Set(person?.labels.map((l) => l.key));
  const available = labels.filter((l) => !l.derived && !held.has(l.key));
  const chosen = labels.find((l) => l.key === labelKey);

  return (
    <Modal
      open={Boolean(person)}
      onClose={onClose}
      title={person ? `Label ${person.display_name}` : "Assign a label"}
      description="Seniority labels are exclusive — giving a second one replaces the first."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={assign.pending}
            disabled={!labelKey}
            onClick={async () => {
              if ((await assign.run()) !== undefined) onDone();
            }}
          >
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {assign.error && <InlineNotice tone="danger">{assign.error}</InlineNotice>}
        {available.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            There is no label left to give this person.
          </p>
        ) : (
          <>
            <Field label="Label" required>
              <Select value={labelKey} onChange={(e) => setLabelKey(e.target.value)}>
                <option value="">Choose a label…</option>
                {(["category", "status", "skill"] as LabelKind[]).map((group) => {
                  const inGroup = available.filter((l) => l.kind === group);
                  if (inGroup.length === 0) return null;
                  return (
                    <optgroup key={group} label={humanise(group)}>
                      {inGroup.map((label) => (
                        <option key={label.key} value={label.key}>
                          {label.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            </Field>
            {chosen?.description && (
              <p className="text-[12px] leading-relaxed text-ink-3">{chosen.description}</p>
            )}
            <Field
              label="Expires"
              hint="Optional. A training or secondment label that lapses on its own."
            >
              <Input
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
            <Field label="Note" hint="Why, for whoever reads this in six months.">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function SetJoinedOn({
  person,
  onClose,
  onDone,
}: {
  person: PersonLabelsOut | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [joined, setJoined] = useState("");
  const [seenFor, setSeenFor] = useState<string | undefined>();

  if (person?.user_id !== seenFor) {
    setSeenFor(person?.user_id);
    setJoined(person?.joined_on ?? "");
  }

  const save = useAction(async () =>
    api.put<PersonLabelsOut>(`/labels/people/${person!.user_id}/joined-on`, {
      joined_on: joined || null,
    }),
  );

  return (
    <Modal
      open={Boolean(person)}
      onClose={onClose}
      title={person ? `When did ${person.display_name} join?` : "Joining date"}
      description="The New Joiner label is worked out from this date and lapses on its own once the policy's window passes. Clearing it removes the label."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            onClick={async () => {
              if ((await save.run()) !== undefined) onDone();
            }}
          >
            Save date
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        <Field label="Joined on">
          <Input type="date" value={joined} onChange={(e) => setJoined(e.target.value)} />
        </Field>
        {joined && (
          <Button size="sm" onClick={() => setJoined("")}>
            Clear the date
          </Button>
        )}
      </div>
    </Modal>
  );
}
