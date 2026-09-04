"use client";

import clsx from "clsx";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Building2,
  Info,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Trophy,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { LabelOut, PolicyOut, PolicyPreviewOut, RoleOut } from "@/lib/types";
import {
  Badge,
  Figure,
  HeroPanel,
  Meter,
  PageHead,
  Panel,
  PanelHead,
} from "@/components/ui/primitives";
import { Button, ChipPicker, Field, Input, PillRail, Toggle } from "@/components/ui/controls";
import {
  ErrorState,
  InlineNotice,
  PanelSkeleton,
} from "@/components/ui/feedback";

/**
 * The assignment policy: how work should be shared out.
 *
 * **Nothing here assigns anything.** These are the settings and what they would
 * mean for real people — the backend is explicit that the scoring which acts on
 * them is separate, so the ratios can be set up and argued about before any
 * work starts moving.
 *
 * Reading is open to anyone: the rule deciding how much work somebody gets
 * should be visible to the person it applies to. Editing follows the backend's
 * reach rule — super admins and the CEO anywhere, a manager only on teams they
 * belong to — and it tells us the answer per policy in `may_edit`, so this
 * screen never has to guess.
 */
export default function PolicyPage() {
  const session = useSession();
  const [scope, setScope] = useState<string>("default");

  const policies = useSWR<PolicyOut[]>("/assignment/policies");
  const labels = useSWR<LabelOut[]>("/labels");
  const roles = useSWR<RoleOut[]>("/roles");

  const teamPolicies = (policies.data ?? []).filter((p) => p.team_id);
  const current =
    scope === "default"
      ? (policies.data ?? []).find((p) => !p.team_id)
      : teamPolicies.find((p) => p.team_id === scope);

  const preview = useSWR<PolicyPreviewOut>(
    current
      ? scope === "default"
        ? "/assignment/preview"
        : `/assignment/preview?team=${scope}`
      : null,
  );

  // A team that has no policy of its own inherits the default; giving it one
  // is how it stops doing that.
  const teamsWithout = session.teams
    .map((t) => t.team)
    .filter((team) => !teamPolicies.some((p) => p.team_id === team.id));

  const adopt = useAction(async (teamId: string) =>
    api.post(`/assignment/policies/team/${teamId}`),
  );
  const drop = useAction(async (teamId: string) =>
    api.del(`/assignment/policies/team/${teamId}`),
  );

  if (policies.error) {
    return <ErrorState error={policies.error} onRetry={() => policies.mutate()} />;
  }

  return (
    <>
      <PageHead
        eyebrow="Work assignment"
        title="Policy"
        lead="Nothing here moves work — it decides what would happen when it does."
        actions={
          // The share breakdown used to be a screen of its own. It said the
          // same thing this one already does — the capacities are set here —
          // so it went, along with the trip to reach it.
          <Link
            href="/assignment/user-analytics"
            className="inline-flex h-9 items-center gap-2 rounded-[13px] bg-accent px-4 text-[12.5px] font-bold text-accent-ink transition hover:bg-accent-hover"
          >
            <Trophy className="size-3.5" strokeWidth={2.2} />
            Who is next
          </Link>
        }
      />

      {(adopt.error || drop.error) && (
        <InlineNotice tone="danger">{adopt.error ?? drop.error}</InlineNotice>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12.5px] text-ink-3">Governing</span>
        <PillRail
          value={scope}
          onChange={setScope}
          options={[
            { value: "default", label: "Organisation default" },
            ...teamPolicies.map((p) => ({
              value: p.team_id!,
              label: p.team_name ?? "Team",
            })),
          ]}
        />
        {teamsWithout.length > 0 && session.roles.is_admin && (
          <AdoptMenu
            teams={teamsWithout}
            pending={adopt.pending}
            onAdopt={async (teamId) => {
              if ((await adopt.run(teamId)) !== undefined) {
                policies.mutate();
                setScope(teamId);
              }
            }}
          />
        )}
      </div>

      {!policies.data || !current ? (
        <PanelSkeleton lines={8} />
      ) : (
        <PolicyEditor
          key={current.id}
          policy={current}
          labels={labels.data ?? []}
          roles={roles.data ?? []}
          preview={preview.data}
          onSaved={() => {
            policies.mutate();
            preview.mutate();
          }}
          onDropped={
            current.team_id && session.roles.is_admin
              ? async () => {
                  if ((await drop.run(current.team_id!)) !== undefined) {
                    policies.mutate();
                    setScope("default");
                  }
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/* ── the editor ──────────────────────────────────────────────────────── */

function PolicyEditor({
  policy,
  labels,
  roles,
  preview,
  onSaved,
  onDropped,
}: {
  policy: PolicyOut;
  labels: LabelOut[];
  roles: RoleOut[];
  preview?: PolicyPreviewOut;
  onSaved: () => void;
  onDropped?: () => void;
}) {
  const [draft, setDraft] = useState<PolicyOut>(policy);
  const [saved, setSaved] = useState(false);

  const editable = policy.may_edit !== false;
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy);

  const save = useAction(async () => {
    const path = draft.team_id
      ? `/assignment/policies/team/${draft.team_id}`
      : "/assignment/policies/default";
    const next = await api.patch<PolicyOut>(path, {
      name: draft.name,
      description: draft.description,
      enabled: draft.enabled,
      default_capacity: draft.default_capacity,
      capacity_by_label: draft.capacity_by_label,
      default_max_open: draft.default_max_open,
      max_open_by_label: draft.max_open_by_label,
      excluded_labels: draft.excluded_labels,
      excluded_roles: draft.excluded_roles,
      exclude_on_leave: draft.exclude_on_leave,
      new_joiner_days: draft.new_joiner_days,
      new_joiner_from_first_seen: draft.new_joiner_from_first_seen,
      weight_load: draft.weight_load,
      weight_open_count: draft.weight_open_count,
      weight_idle_days: draft.weight_idle_days,
    });
    setDraft(next);
    setSaved(true);
    return next;
  });

  function set<K extends keyof PolicyOut>(key: K, value: PolicyOut[K]) {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // Only seniority and status labels have a capacity worth setting; a skill
  // describes somebody without changing their share.
  const weighted = labels.filter((l) => l.kind === "category" || l.kind === "status");

  const weights = [
    { key: "weight_load" as const, label: "Current load", hint: "How much they already carry" },
    { key: "weight_open_count" as const, label: "Open count", hint: "How many items, regardless of size" },
    { key: "weight_idle_days" as const, label: "Idle days", hint: "How long since they last got something" },
  ];
  const weightTotal = weights.reduce((sum, w) => sum + Number(draft[w.key] || 0), 0);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.58fr_1fr]">
        <HeroPanel className="p-7">
          <div className="flex flex-wrap gap-x-14 gap-y-6">
            <Figure
              label={policy.team_id ? "Governs" : "Governs"}
              value={policy.team_name ?? "Everyone"}
              size="sm"
              sub={policy.team_id ? "this team only" : "every team without its own"}
            />
            <Figure
              label="People who can take work"
              value={num(preview?.assignable ?? 0)}
              sub={
                preview
                  ? preview.inherited
                    ? `of ${num(preview.people.length)} · using the default`
                    : `of ${num(preview.people.length)} checked`
                  : "loading"
              }
            />
            <Figure
              label="Baseline capacity"
              value={draft.default_capacity}
              tone={Number(draft.default_capacity) === 0 ? "second" : undefined}
              sub="for anyone unlabelled"
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Badge tone={draft.enabled ? "positive" : "warn"}>
              {draft.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {policy.updated_by_name && (
              <span className="text-[11.5px] text-ink-4">
                last changed by {policy.updated_by_name} · {dateTime(policy.updated_at)}
              </span>
            )}
            {!editable && (
              <Badge tone="neutral" icon={Lock}>
                Read only
              </Badge>
            )}
          </div>

          {!editable && policy.edit_reason && (
            <InlineNotice tone="info" className="mt-4">
              {policy.edit_reason}
            </InlineNotice>
          )}
          {save.error && (
            <InlineNotice tone="danger" className="mt-4">
              {save.error}
            </InlineNotice>
          )}
          {saved && !dirty && (
            <InlineNotice tone="positive" className="mt-4">
              Saved. The preview below reflects it.
            </InlineNotice>
          )}
        </HeroPanel>

        <Panel className="flex flex-col p-7">
          <PanelHead title="What the scoring weighs" />
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
            Three factors, weighed against each other. They do not have to add to one —
            what matters is their size relative to one another.
          </p>

          <div className="mt-6 space-y-5">
            {weights.map((w) => {
              const value = Number(draft[w.key] || 0);
              const share = weightTotal > 0 ? (value / weightTotal) * 100 : 0;
              return (
                <div key={w.key}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-ink-2">{w.label}</span>
                    <span className="tnum text-[12px] text-ink-4">
                      {Math.round(share)}%
                    </span>
                  </div>
                  <Meter value={value} max={Math.max(1, weightTotal)} height={8} />
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      disabled={!editable}
                      value={draft[w.key]}
                      onChange={(e) => set(w.key, e.target.value)}
                      className="h-9 w-24"
                    />
                    <span className="text-[11px] text-ink-4">{w.hint}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {editable && (
            <Button
              variant="accent"
              icon={Save}
              className="mt-auto w-full"
              loading={save.pending}
              disabled={!dirty}
              onClick={async () => {
                if ((await save.run()) !== undefined) onSaved();
              }}
            >
              Save policy
            </Button>
          )}
        </Panel>
      </div>

      {/* ── capacity by label ─────────────────────────────────────── */}
      <Panel className="p-7">
        <PanelHead
          title="Capacity by label"
          hint="How big a share they take. 1 is a normal share; 0 means they get nothing."
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <CapacityRow
            name="Anyone unlabelled"
            description="The baseline every other number is a multiple of."
            color={null}
            capacity={draft.default_capacity}
            maxOpen={draft.default_max_open}
            editable={editable}
            onCapacity={(v) => set("default_capacity", v)}
            onMaxOpen={(v) => set("default_max_open", v)}
          />

          {weighted.map((label) => (
            <CapacityRow
              key={label.key}
              name={label.name}
              description={label.description}
              color={label.color}
              capacity={draft.capacity_by_label[label.key] ?? ""}
              maxOpen={draft.max_open_by_label[label.key] ?? null}
              excluded={draft.excluded_labels.includes(label.key)}
              editable={editable}
              onCapacity={(v) =>
                set("capacity_by_label", withKey(draft.capacity_by_label, label.key, v))
              }
              onMaxOpen={(v) =>
                set(
                  "max_open_by_label",
                  v === null
                    ? withoutKey(draft.max_open_by_label, label.key)
                    : { ...draft.max_open_by_label, [label.key]: v },
                )
              }
              onExclude={(on) =>
                set(
                  "excluded_labels",
                  on
                    ? [...draft.excluded_labels, label.key]
                    : draft.excluded_labels.filter((k) => k !== label.key),
                )
              }
            />
          ))}
        </div>
      </Panel>

      {/* ── rules ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-7">
          <PanelHead title="Who takes no work" />
          <div className="mt-6 space-y-6">
            <Toggle
              disabled={!editable}
              checked={draft.exclude_on_leave}
              onChange={(next) => set("exclude_on_leave", next)}
              label="Skip anyone on approved leave"
              hint="Read live from the leave module, so it applies the day their leave starts and stops the day it ends."
            />
            {/* Roles, not labels. A manager who quietly ranks first is how a
                team ends up wondering why their lead has twelve proposals. */}
            <div>
              <p className="mb-2 text-[12px] text-ink-3">Roles that are never given work</p>
              <ChipPicker
                disabled={!editable}
                options={roles.map((role) => ({ value: role.key, label: role.name }))}
                selected={draft.excluded_roles}
                onToggle={(value) =>
                  set(
                    "excluded_roles",
                    draft.excluded_roles.includes(value)
                      ? draft.excluded_roles.filter((k) => k !== value)
                      : [...draft.excluded_roles, value],
                  )
                }
              />
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
                Managers run the queue rather than stand in it, so they are excluded by
                default. A working team lead is a real thing, which is why this is editable.
              </p>
            </div>

            <Field
              label="New-joiner window, in days"
              hint="How long the automatic New Joiner label lasts, counted from their joining date."
            >
              <Input
                type="number"
                min={0}
                disabled={!editable}
                value={draft.new_joiner_days}
                onChange={(e) => set("new_joiner_days", Number(e.target.value))}
                className="w-32"
              />
            </Field>

            <Toggle
              disabled={!editable}
              checked={draft.new_joiner_from_first_seen}
              onChange={(next) => set("new_joiner_from_first_seen", next)}
              label="Guess a joining date when none is set"
              hint="Falls back to when the person was first seen. Leave it off until joining dates are filled in — with few of them set, everybody collapses to the new-joiner capacity and the ratio stops telling anyone apart."
            />
            {draft.excluded_labels.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] text-ink-3">Labels that exclude entirely</p>
                <div className="flex flex-wrap gap-1.5">
                  {draft.excluded_labels.map((key) => (
                    <Badge key={key} tone="danger">
                      {labels.find((l) => l.key === key)?.name ?? key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-7">
          <PanelHead title="This policy" />
          <div className="mt-6 space-y-5">
            <Field label="Name">
              <Input
                disabled={!editable}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Description">
              <Input
                disabled={!editable}
                value={draft.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What this policy is for."
              />
            </Field>
            <Toggle
              disabled={!editable}
              checked={draft.enabled}
              onChange={(next) => set("enabled", next)}
              label="Enabled"
              hint="Turning this off leaves the numbers in place but stops the policy governing anything."
            />

            <div className="flex flex-wrap gap-2 border-t border-line pt-5">
              {editable && (
                <Button
                  icon={RotateCcw}
                  disabled={!dirty}
                  onClick={() => {
                    setDraft(policy);
                    setSaved(false);
                  }}
                >
                  Discard changes
                </Button>
              )}
              {onDropped && (
                <Button variant="danger" icon={Trash2} onClick={onDropped}>
                  Fall back to the default
                </Button>
              )}
            </div>

            {policy.team_id && (
              <p className="flex gap-2.5 text-[11.5px] leading-relaxed text-ink-4">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Dropping this policy does not change anything about the team — it simply
                starts being governed by the organisation default again.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function CapacityRow({
  name,
  description,
  color,
  capacity,
  maxOpen,
  excluded,
  editable,
  onCapacity,
  onMaxOpen,
  onExclude,
}: {
  name: string;
  description: string | null;
  color: string | null;
  capacity: string;
  maxOpen: number | null;
  excluded?: boolean;
  editable: boolean;
  onCapacity: (value: string) => void;
  onMaxOpen: (value: number | null) => void;
  onExclude?: (on: boolean) => void;
}) {
  const value = Number(capacity || 0);
  return (
    <div
      className={clsx(
        "rounded-[16px] p-4",
        excluded ? "bg-danger-soft/40 ring-1 ring-danger/25" : "bg-panel-2",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: color ?? "var(--ink-4)" }}
        />
        <span className="min-w-0 truncate text-[13px] font-semibold">{name}</span>
        <span className="fig ml-auto text-[20px]">{capacity || "—"}</span>
      </div>

      {description && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink-4">
          {description}
        </p>
      )}

      <Meter value={value} max={2} height={6} className="mt-3" />

      <div className="mt-3 flex items-end gap-2">
        <Field label="Capacity" className="flex-1">
          <Input
            type="number"
            step="0.1"
            min="0"
            disabled={!editable}
            value={capacity}
            onChange={(e) => onCapacity(e.target.value)}
            className="h-9"
          />
        </Field>
        <Field label="Max open" className="flex-1">
          <Input
            type="number"
            min="0"
            disabled={!editable}
            value={maxOpen ?? ""}
            placeholder="none"
            onChange={(e) =>
              onMaxOpen(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-9"
          />
        </Field>
      </div>

      {onExclude && (
        <button
          disabled={!editable}
          onClick={() => onExclude(!excluded)}
          className={clsx(
            "mt-3 w-full rounded-full py-2 text-[11.5px] font-medium transition disabled:opacity-40",
            excluded
              ? "bg-danger text-white"
              : "bg-panel-3 text-ink-3 hover:text-ink",
          )}
        >
          {excluded ? "Takes no work" : "Give them no work"}
        </button>
      )}
    </div>
  );
}

function AdoptMenu({
  teams,
  pending,
  onAdopt,
}: {
  teams: { id: string; name: string }[];
  pending: boolean;
  onAdopt: (teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button icon={Plus} loading={pending} onClick={() => setOpen((v) => !v)}>
        Give a team its own
      </Button>
      {open && (
        <div className="rise absolute left-0 top-[calc(100%+8px)] z-30 w-56 rounded-[20px] border border-line bg-panel p-1.5 shadow-[var(--shadow-float)]">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => {
                setOpen(false);
                onAdopt(team.id);
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-[13px] px-3 text-left text-[13px] text-ink-2 transition hover:bg-panel-2 hover:text-ink"
            >
              <Building2 className="size-3.5 text-ink-4" />
              {team.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Setting a capacity to blank removes the override rather than storing "". */
function withKey(
  record: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  if (value === "") return withoutKey(record, key);
  return { ...record, [key]: value };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}
