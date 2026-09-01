"use client";

import { useState } from "react";
import useSWR from "swr";
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";

import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { RoleOut, RoleScope, UserRolesOut } from "@/lib/types";
import { Badge, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, LinkButton, Textarea, Select } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";

export default function RolesPage() {
  const session = useSession();
  const roles = useSWR<RoleOut[]>("/roles");
  // Only to say how many people hold each role — the catalogue itself carries
  // no counts, and "can this be deleted" is the question people bring here.
  const assignments = useSWR<UserRolesOut[]>("/roles/assignments");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleOut | null>(null);

  const remove = useAction(async (key: string) => api.del(`/roles/${key}`));

  const held = new Map<string, number>();
  for (const row of assignments.data ?? []) {
    for (const key of row.role_keys) held.set(key, (held.get(key) ?? 0) + 1);
  }

  const global = (roles.data ?? []).filter((r) => r.scope === "global");
  const team = (roles.data ?? []).filter((r) => r.scope === "team");

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Roles"
        lead="Global roles confer authority across the organisation. Team roles are held per team and mean nothing outside one."
        actions={
          <>
            <LinkButton href="/admin/roles/assignments" icon={Users}>
              Who holds what
            </LinkButton>
            <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
              New role
            </Button>
          </>
        }
      />

      {remove.error && <InlineNotice tone="danger">{remove.error}</InlineNotice>}

      {roles.error ? (
        <ErrorState error={roles.error} onRetry={() => roles.mutate()} />
      ) : !roles.data ? (
        <RowsSkeleton rows={6} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <RoleGroup
            title="Global"
            hint="Held once, and everywhere."
            roles={global}
            held={held}
            onEdit={setEditing}
            onRemove={async (key) => {
              if ((await remove.run(key)) !== undefined) roles.mutate();
            }}
            canDeleteSuperAdmin={session.roles.is_super_admin}
          />
          <RoleGroup
            title="Team"
            hint="Held per team, through a membership."
            roles={team}
            held={held}
            onEdit={setEditing}
            onRemove={async (key) => {
              if ((await remove.run(key)) !== undefined) roles.mutate();
            }}
            canDeleteSuperAdmin={session.roles.is_super_admin}
          />
        </div>
      )}

      <RoleDialog
        role={editing}
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          roles.mutate();
        }}
      />
    </div>
  );
}

function RoleGroup({
  title,
  hint,
  roles,
  held,
  onEdit,
  onRemove,
  canDeleteSuperAdmin,
}: {
  title: string;
  hint: string;
  roles: RoleOut[];
  held: Map<string, number>;
  onEdit: (role: RoleOut) => void;
  onRemove: (key: string) => void;
  canDeleteSuperAdmin: boolean;
}) {
  return (
    <Panel className="p-4">
      <PanelHead title={title} count={roles.length} hint={hint} />
      {roles.length === 0 ? (
        <Empty title="No roles in this scope" className="mt-5" />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {roles.map((role) => {
            const count = held.get(role.key) ?? 0;
            return (
              <li key={role.key} className="rounded-xl bg-inset px-3 py-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[14px] font-medium">{role.name}</span>
                  <code className="rounded-full bg-panel px-2 py-0.5 font-mono text-[11px] text-ink-4">
                    {role.key}
                  </code>
                  {role.is_system && (
                    <Badge icon={Lock} tone="neutral">
                      Built in
                    </Badge>
                  )}
                  {role.key === "super_admin" && (
                    <Badge tone="highlight" icon={ShieldCheck}>
                      Full control
                    </Badge>
                  )}
                  <span className="ml-auto text-[12px] text-ink-4">
                    {count} {count === 1 ? "holder" : "holders"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Pencil}
                    aria-label={`Edit ${role.name}`}
                    onClick={() => onEdit(role)}
                  />
                  {/* System roles are load-bearing — the guards read their
                      keys by name — so the backend refuses to delete them and
                      offering it here would only produce a 400. */}
                  {!role.is_system && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      aria-label={`Delete ${role.name}`}
                      disabled={count > 0}
                      title={count > 0 ? "Revoke it from everyone first." : undefined}
                      onClick={() => onRemove(role.key)}
                    />
                  )}
                </div>
                {role.description && (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
                    {role.description}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function RoleDialog({
  role,
  open,
  onClose,
  onSaved,
}: {
  role: RoleOut | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(role);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<RoleScope>("team");
  const [description, setDescription] = useState("");
  const [seenFor, setSeenFor] = useState<string | null | undefined>();

  if (role?.key !== seenFor) {
    setSeenFor(role?.key ?? null);
    setKey(role?.key ?? "");
    setName(role?.name ?? "");
    setScope(role?.scope ?? "team");
    setDescription(role?.description ?? "");
  }

  const save = useAction(async () =>
    editing
      ? api.patch(`/roles/${role!.key}`, {
          name: name.trim(),
          description: description.trim() || null,
        })
      : api.post("/roles", {
          key: key.trim(),
          name: name.trim(),
          scope,
          description: description.trim() || null,
        }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${role!.name}` : "New role"}
      description={
        editing
          ? "A role's key and scope are fixed once it exists — code and grants both refer to them."
          : "Custom roles carry no authority of their own. They are labels the platform can group people by."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!name.trim() || (!editing && !key.trim())}
            onClick={async () => {
              if ((await save.run()) !== undefined) onSaved();
            }}
          >
            {editing ? "Save changes" : "Create role"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        {!editing && (
          <>
            <Field label="Key" required hint="Lowercase, no spaces. Cannot be changed later.">
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                placeholder="bid_reviewer"
              />
            </Field>
            <Field label="Scope" required hint="Whether it is held organisation-wide or per team.">
              <Select value={scope} onChange={(e) => setScope(e.target.value as RoleScope)}>
                <option value="team">Team</option>
                <option value="global">Global</option>
              </Select>
            </Field>
          </>
        )}
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bid Reviewer" />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What someone holding this is expected to do."
          />
        </Field>
      </div>
    </Modal>
  );
}
