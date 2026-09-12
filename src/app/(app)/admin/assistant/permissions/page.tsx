"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import {
  ChevronRight,
  Eye,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { humanise } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ModulePolicyOut, RoleOut, ToolPolicyOut } from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { ChipPicker, Select, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * What the assistant may read and write.
 *
 * The column that matters on this screen is **effective**, not what is set. A
 * tool's own switch, its module's, and the global default all fold together, and
 * a per-tool override is easy to get wrong without seeing the answer they
 * produce — so every row shows what a turn would actually be given, and the
 * controls sit next to it rather than on a separate screen.
 *
 * Worth being clear about what this does and does not do. A policy here can only
 * ever **narrow**: a tool call still goes through the real route carrying the
 * person's own session, so enabling a write for the assistant never grants
 * anybody a right they did not already hold. What it decides is whether the
 * assistant may act on a right somebody has — which is a different question, and
 * the one this screen exists to answer.
 *
 * Every change saves as it is made. There is no draft and no save button: each
 * PATCH returns the whole recomputed matrix, so the effective column is right
 * immediately rather than after a reload.
 */
export default function AssistantPermissionsPage() {
  const session = useSession();
  const policies = useSWR<ModulePolicyOut[]>("/assistant/admin/policies", {
    revalidateOnFocus: false,
  });
  const roles = useSWR<RoleOut[]>("/roles?scope=global", { revalidateOnFocus: false });
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Assistant permissions" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="What the assistant may do on everyone's behalf is a super admin's decision, and the endpoints behind this screen enforce that themselves."
        />
      </>
    );
  }

  /** Every PATCH answers with the whole matrix, so it replaces the cache. */
  async function change(path: string, body: unknown) {
    setFailed(null);
    try {
      const next = await api.patch<ModulePolicyOut[]>(path, body);
      await policies.mutate(next, { revalidate: false });
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : "That change did not save.");
      await policies.mutate();
    }
  }

  const roleOptions = (roles.data ?? []).map((role) => ({
    value: role.key,
    label: role.name,
  }));

  const modules = policies.data ?? [];
  // What the model is actually carrying. With a catalogue this size that is the
  // number worth putting at the top: everything else is a search away, and a
  // long prompt is one the model reads less carefully.
  const reachable = modules.flatMap((module) =>
    module.tools.filter((tool) => tool.status === "live" && tool.effective_enabled),
  );
  const everyday = policies.data ? reachable.filter((tool) => !tool.deferred).length : null;
  const onSearch = reachable.length - (everyday ?? 0);

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Assistant permissions"
        count={modules.length ? `${modules.length} modules` : undefined}
        lead="A policy here can only narrow. Every call still goes through the person's own permissions."
        meta={
          everyday === null
            ? undefined
            : `${everyday} in the prompt · ${onSearch} on search`
        }
      />

      <AssistantAdminNav />

      {failed && <InlineNotice tone="danger">{failed}</InlineNotice>}

      {policies.error ? (
        <ErrorState error={policies.error} onRetry={() => policies.mutate()} />
      ) : !policies.data ? (
        <PanelSkeleton lines={8} />
      ) : (
        <div className="space-y-2.5">
          {modules.map((module) => (
            <Module
              key={module.module_key}
              module={module}
              roles={roleOptions}
              open={open === module.module_key}
              onToggle={() =>
                setOpen((current) => (current === module.module_key ? null : module.module_key))
              }
              onChange={change}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Module({
  module,
  roles,
  open,
  onToggle,
  onChange,
}: {
  module: ModulePolicyOut;
  roles: { value: string; label: string }[];
  open: boolean;
  onToggle: () => void;
  onChange: (path: string, body: unknown) => Promise<void>;
}) {
  const base = `/assistant/admin/policies/modules/${module.module_key}`;
  // Screen tools — press, fill, scroll, read the screen — sit with the reads:
  // they have no route, no write switch and no write roles, and the browser
  // bounds them by what is on the page and by the delete rule.
  const reads = module.tools.filter((tool) => tool.kind !== "write");
  const writes = module.tools.filter((tool) => tool.kind === "write");
  // Counted against the tools that could ever be reached, not against every
  // row: a module with four built tools and three planned ones was reading
  // "4/7" and looking half switched off when it was entirely on.
  const real = module.tools.filter((tool) => tool.status === "live");
  const live = real.filter((tool) => tool.effective_enabled).length;
  const planned = module.tools.length - real.length;

  return (
    <Panel className="overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <ChevronRight
          className={clsx("size-4 shrink-0 text-ink-4 transition-transform", open && "rotate-90")}
          strokeWidth={2.2}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{module.name}</span>
            <GateBadge gate={module.gate} />
            {!module.write_enabled && <Badge tone="neutral">Read only</Badge>}
            {module.has_writes && module.write_roles && module.write_roles.length > 0 && (
              <Badge
                tone="warn"
                title={`Only ${module.write_roles.map((role) => humanise(role)).join(", ")} may have the assistant write here.`}
              >
                Writes limited
              </Badge>
            )}
            {module.allowed_roles && module.allowed_roles.length > 0 && (
              <Badge tone="info">{module.allowed_roles.length} roles only</Badge>
            )}
          </span>
          <span className="mt-1 block truncate text-[11.5px] text-ink-4">
            {module.description}
          </span>
        </span>
        <span className="tnum shrink-0 text-[11.5px] text-ink-4">
          {live}/{real.length} tools{planned > 0 ? ` · ${planned} planned` : ""}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-5 py-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Toggle
              checked={module.read_enabled}
              onChange={(value) => void onChange(base, { read_enabled: value })}
              label="May read"
              hint="Every GET in this module. Off hides them from the model entirely."
            />
            <Toggle
              checked={module.write_enabled}
              onChange={(value) => void onChange(base, { write_enabled: value })}
              label="May write"
              hint="Anything that changes something. On for every module — what holds the sharp ones is who may write, below, and the confirmation pause."
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[12px] text-ink-3">Before a write</p>
              <Select
                value={module.confirm_writes === null ? "inherit" : String(module.confirm_writes)}
                onChange={(event) =>
                  void onChange(base, {
                    confirm_writes:
                      event.target.value === "inherit" ? null : event.target.value === "true",
                  })
                }
              >
                <option value="inherit">
                  Follow the default ({module.effective_confirm ? "ask" : "do not ask"})
                </option>
                <option value="true">Always ask</option>
                <option value="false">Never ask</option>
              </Select>
            </div>

            <div>
              <p className="mb-2 text-[12px] text-ink-3">Only for these roles</p>
              <ChipPicker
                options={roles}
                selected={module.allowed_roles ?? []}
                onToggle={(key) => {
                  const held = module.allowed_roles ?? [];
                  const next = held.includes(key)
                    ? held.filter((role) => role !== key)
                    : [...held, key];
                  // Nothing selected means "no role restriction", which the
                  // backend spells as null. An empty list would read as
                  // "nobody" and switch the module off for everyone.
                  void onChange(base, { allowed_roles: next.length ? next : null });
                }}
              />
              <p className="mt-1.5 text-[11px] text-ink-4">
                {module.allowed_roles?.length
                  ? "Anybody without one of these does not see this module's tools."
                  : "No role restriction — everybody the module gate already admits."}
              </p>
            </div>
          </div>

          {/* Seeing a module and changing it are two questions with different
              answers for the same person, so they are two controls. Everybody
              reads the team list; managers delete a team. If the only lever
              were the one above, buying the second would cost the first. */}
          {module.has_writes ? (
            <div>
              <p className="mb-2 text-[12px] text-ink-3">Who may write here</p>
              <ChipPicker
                options={roles}
                selected={module.write_roles ?? []}
                onToggle={(key) => {
                  const held = module.write_roles ?? [];
                  const next = held.includes(key)
                    ? held.filter((role) => role !== key)
                    : [...held, key];
                  // Empty means "whoever the route already allows" — this is an
                  // extra gate, never a grant, so an empty list must not read
                  // as "nobody".
                  void onChange(base, { write_roles: next.length ? next : null });
                }}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
                {module.write_roles?.length
                  ? "Anybody else can still ask; the write is refused and the reason is said out loud."
                  : "Nobody extra is held back — whoever the route already allows may write."}
                {movedFromDefault(module) && (
                  <>
                    {" "}
                    This has been changed from what the module ships with
                    {module.default_write_roles?.length
                      ? ` (${module.default_write_roles.map((role) => humanise(role)).join(", ")})`
                      : " (no restriction)"}
                    .
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-ink-4">
              This module has no live write, so a write restriction would change nothing
              today. One can still be set on a tool below for the day one arrives.
            </p>
          )}

          {reads.length > 0 && (
            <ToolTable title="Reads" icon={Eye} tools={reads} roles={roles} onChange={onChange} />
          )}
          {writes.length > 0 && (
            <ToolTable
              title="Writes"
              icon={Pencil}
              tools={writes}
              roles={roles}
              onChange={onChange}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

function ToolTable({
  title,
  icon: Icon,
  tools,
  roles,
  onChange,
}: {
  title: string;
  icon: React.ElementType;
  tools: ToolPolicyOut[];
  roles: { value: string; label: string }[];
  onChange: (path: string, body: unknown) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <PanelHead
        title={
          <span className="flex items-center gap-2 text-[12.5px]">
            <Icon className="size-3.5 text-ink-4" strokeWidth={2} />
            {title}
          </span>
        }
        count={tools.length}
      />
      <ul className="mt-2 space-y-1">
        {tools.map((tool) => {
          const expanded = open === tool.tool_key;
          const base = `/assistant/admin/policies/tools/${tool.tool_key}`;
          return (
            <li key={tool.tool_key} className="rounded-[13px] bg-panel-2">
              <button
                onClick={() => setOpen((current) => (current === tool.tool_key ? null : tool.tool_key))}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
              >
                {/* Effective, not `enabled` — the module switch above can be off
                    while this row's own switch is on, and the row has to say
                    what actually happens. */}
                <span
                  className={clsx(
                    "size-1.5 shrink-0 rounded-full",
                    tool.status !== "live"
                      ? "bg-info"
                      : tool.effective_enabled
                        ? "bg-positive"
                        : "bg-ink-4",
                  )}
                  aria-hidden
                />
                <span
                  className={clsx(
                    "min-w-0 flex-1 truncate text-[12.5px]",
                    tool.status === "live" ? "text-ink-2" : "text-ink-4",
                  )}
                >
                  {tool.label}
                </span>
                {/* A roadmap entry, not a switched-off tool. The switches below
                    cannot reach it, so saying so on the row is what stops
                    somebody toggling them and wondering why nothing changed. */}
                {tool.status !== "live" && <Badge tone="info">Planned</Badge>}
                {/* Everything not on the everyday list is a search away. Worth
                    showing: it is the difference between a tool the model
                    always sees and one it has to go looking for, which is the
                    main reason an answer does or does not use it. */}
                {tool.status === "live" && tool.deferred && (
                  <Badge
                    tone="neutral"
                    title="Not in the prompt. The model is told this exists only when it searches for it."
                  >
                    On search
                  </Badge>
                )}
                {tool.warning && (
                  <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={2.2} />
                )}
                {/* The one rule this screen cannot change: a delete reaches
                    managers and above, whatever the write roles below say. */}
                {tool.destructive && (
                  <Badge
                    tone="danger"
                    title="Deletes something. Offered to managers and above only; write roles can narrow that, never widen it."
                  >
                    Managers+
                  </Badge>
                )}
                {tool.kind === "write" && tool.effective_enabled && (
                  <Badge tone={tool.effective_confirm ? "neutral" : "danger"}>
                    {tool.effective_confirm ? "asks" : "immediate"}
                  </Badge>
                )}
                <span className="micro shrink-0 text-ink-4">{tool.method}</span>
                <ChevronRight
                  className={clsx(
                    "size-3 shrink-0 text-ink-4 transition-transform",
                    expanded && "rotate-90",
                  )}
                  strokeWidth={2.4}
                />
              </button>

              {expanded && (
                <div className="space-y-4 px-3.5 pb-3.5">
                  <p className="text-[11.5px] leading-relaxed text-ink-3">{tool.description}</p>
                  <p className="tnum text-[11px] text-ink-4">
                    {tool.method} {tool.path}
                  </p>
                  {tool.warning && (
                    <InlineNotice tone="warn">{tool.warning}</InlineNotice>
                  )}

                  {tool.status !== "live" ? (
                    <InlineNotice tone="info">
                      This one is planned rather than built. It is listed so the catalogue
                      is honest about what is coming, and it is offered to nobody — the
                      resolver builds from the live tools alone, so no setting here can
                      reach it.
                    </InlineNotice>
                  ) : (
                    <Toggle
                      checked={tool.enabled}
                      onChange={(value) => void onChange(base, { enabled: value })}
                      label="This tool is available"
                      hint={
                        tool.enabled && !tool.effective_enabled
                          ? "On here, but the module above has it switched off — so the model never sees it."
                          : "Switched off, the model is never told this tool exists."
                      }
                    />
                  )}

                  {tool.kind === "write" && tool.status === "live" && (
                    <div>
                      <p className="mb-2 text-[12px] text-ink-3">Before this write</p>
                      <Select
                        value={
                          tool.confirm_override === null ? "inherit" : String(tool.confirm_override)
                        }
                        onChange={(event) =>
                          void onChange(base, {
                            confirm_override:
                              event.target.value === "inherit"
                                ? null
                                : event.target.value === "true",
                          })
                        }
                      >
                        <option value="inherit">
                          Follow the module ({tool.effective_confirm ? "ask" : "do not ask"})
                        </option>
                        <option value="true">Always ask</option>
                        <option value="false">Never ask</option>
                      </Select>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[12px] text-ink-3">Only for these roles</p>
                    <ChipPicker
                      options={roles}
                      selected={tool.allowed_roles ?? []}
                      onToggle={(key) => {
                        const held = tool.allowed_roles ?? [];
                        const next = held.includes(key)
                          ? held.filter((role) => role !== key)
                          : [...held, key];
                        void onChange(base, { allowed_roles: next.length ? next : null });
                      }}
                    />
                    {tool.effective_roles && tool.effective_roles.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-ink-4">
                        In effect:{" "}
                        {tool.effective_roles.map((role) => humanise(role)).join(", ")}
                      </p>
                    )}
                  </div>

                  {/* The lever for a module where most writes are everyday work
                      and one is not: leave is anyone's to request and its rules
                      are not anyone's to rewrite. That is one column here, not
                      a new module. */}
                  {tool.kind === "write" && tool.status === "live" && (
                    <div>
                      <p className="mb-2 text-[12px] text-ink-3">Who may run this write</p>
                      <ChipPicker
                        options={roles}
                        selected={tool.write_roles ?? []}
                        onToggle={(key) => {
                          const held = tool.write_roles ?? [];
                          const next = held.includes(key)
                            ? held.filter((role) => role !== key)
                            : [...held, key];
                          void onChange(base, { write_roles: next.length ? next : null });
                        }}
                      />
                      <p className="mt-1.5 text-[11px] text-ink-4">
                        {tool.effective_write_roles && tool.effective_write_roles.length > 0
                          ? `In effect: ${tool.effective_write_roles
                              .map((role) => humanise(role))
                              .join(", ")}`
                          : "In effect: whoever the route already allows."}
                        {tool.write_roles?.length
                          ? " Set here, so it overrides the module's."
                          : " Following the module's."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Whether a module's write restriction has been edited away from what it ships with.
 *
 * Worth saying on the screen because the catalogue's restriction is a starting
 * point, not a rule — a super admin's edit is never overwritten by a later
 * deploy, which is exactly why somebody reading this months later needs to be
 * told that what they are looking at is a decision rather than a default.
 */
function movedFromDefault(module: ModulePolicyOut): boolean {
  const now = [...(module.write_roles ?? [])].sort().join(",");
  const shipped = [...(module.default_write_roles ?? [])].sort().join(",");
  return now !== shipped;
}

/**
 * Who the module's tools are offered to at all.
 *
 * The backend is explicit that this is "a courtesy to the model and a saving of
 * tokens, not the security boundary" — so the badge says what it is rather than
 * implying a lock.
 */
function GateBadge({ gate }: { gate: ModulePolicyOut["gate"] }) {
  if (gate === "admin") {
    return (
      <Badge tone="danger" icon={ShieldCheck} title="Only holders of a global admin role">
        Admin
      </Badge>
    );
  }
  if (gate === "access") {
    return (
      <Badge tone="info" title="Only if the person's effective access includes this module">
        Granted teams
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" title="Everybody signed in, like leave and quotes">
      Everyone
    </Badge>
  );
}
