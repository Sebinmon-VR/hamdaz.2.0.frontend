"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, ShieldAlert, ShieldCheck, Users, X } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { RoleOut, UserRolesOut } from "@/lib/types";
import { Avatar, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, LinkButton, PillRail, SearchInput, Select } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";

/**
 * Who holds which global role.
 *
 * Team roles are not shown here — they are held through a membership and
 * belong on the team's own members screen. Mixing the two would suggest they
 * are granted the same way, which is exactly the confusion the two scopes
 * exist to prevent.
 */
export default function AssignmentsPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [granting, setGranting] = useState<UserRolesOut | null>(null);

  const assignments = useSWR<UserRolesOut[]>("/roles/assignments");
  const roles = useSWR<RoleOut[]>(withQuery("/roles", { scope: "global" }));

  const revoke = useAction(async (userId: string, roleKey: string) =>
    api.del(`/roles/users/${userId}/${roleKey}`),
  );

  const needle = search.trim().toLowerCase();
  const rows = (assignments.data ?? [])
    .filter((row) => filter === "all" || row.role_keys.includes(filter))
    .filter(
      (row) =>
        !needle ||
        row.display_name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle),
    );

  const counts = new Map<string, number>();
  for (const row of assignments.data ?? []) {
    for (const key of row.role_keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/admin/roles">Roles</Link>}
        title="Global role assignments"
        lead="Only global roles appear here. Team roles are granted on each team's members screen."
        actions={
          <LinkButton href="/directory" icon={Users}>
            Find someone
          </LinkButton>
        }
      />

      {revoke.error && <InlineNotice tone="danger">{revoke.error}</InlineNotice>}

      {!session.roles.is_super_admin && (
        <InlineNotice tone="info">
          You can grant and revoke roles, but only a super admin may grant super admin —
          otherwise the distinction would not survive its first use.
        </InlineNotice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name or email"
          className="w-full max-w-xs"
        />
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Everyone", count: assignments.data?.length },
            ...(roles.data ?? []).map((role) => ({
              value: role.key,
              label: role.name,
              count: counts.get(role.key),
            })),
          ]}
        />
      </div>

      {assignments.error ? (
        <ErrorState error={assignments.error} onRetry={() => assignments.mutate()} />
      ) : !assignments.data ? (
        <RowsSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Empty
          icon={ShieldAlert}
          title={needle || filter !== "all" ? "Nobody matches" : "No roles granted yet"}
          body={
            needle || filter !== "all"
              ? "Try a different name or role."
              : "Nobody holds a global role. The bootstrap super admin is granted at seed time."
          }
        />
      ) : (
        <Panel className="p-4">
          <PanelHead title="Holders" count={rows.length} />
          <ul className="mt-2 divide-y divide-[var(--c-line)]">
            {rows.map((row) => (
              <li key={row.user_id} className="flex flex-wrap items-center gap-2.5 py-2">
                <Avatar name={row.display_name} seed={row.user_id} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="block truncate text-[14px] font-medium"
                  >
                    {row.display_name}
                  </Link>
                  <p className="truncate text-[12px] text-ink-4">{row.email}</p>
                </div>

                <div className="flex flex-wrap justify-end gap-1.5">
                  {row.roles.length === 0 ? (
                    <span className="text-[12.5px] text-ink-4">No global roles</span>
                  ) : (
                    row.roles.map((grant) => (
                      <span
                        key={grant.role.key}
                        className={
                          grant.role.key === "super_admin"
                            ? "inline-flex items-center gap-1.5 rounded-full bg-highlight-soft px-2.5 py-1 text-[11.5px] font-medium text-highlight-text"
                            : "inline-flex items-center gap-1.5 rounded-full bg-panel-3 px-2.5 py-1 text-[11.5px] font-medium text-ink-2"
                        }
                        title={`Granted ${date(grant.granted_at)}`}
                      >
                        {grant.role.key === "super_admin" && (
                          <ShieldCheck className="size-3.5" strokeWidth={2.2} />
                        )}
                        {grant.role.name}
                        <button
                          aria-label={`Revoke ${grant.role.name} from ${row.display_name}`}
                          className="opacity-50 transition hover:opacity-100"
                          onClick={async () => {
                            if (
                              (await revoke.run(row.user_id, grant.role.key)) !== undefined
                            ) {
                              assignments.mutate();
                            }
                          }}
                        >
                          <X className="size-3" strokeWidth={3} />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <Button size="sm" icon={Plus} onClick={() => setGranting(row)}>
                  Grant
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <GrantDialog
        target={granting}
        roles={roles.data ?? []}
        canGrantSuperAdmin={session.roles.is_super_admin}
        onClose={() => setGranting(null)}
        onGranted={() => {
          setGranting(null);
          assignments.mutate();
        }}
      />
    </div>
  );
}

function GrantDialog({
  target,
  roles,
  canGrantSuperAdmin,
  onClose,
  onGranted,
}: {
  target: UserRolesOut | null;
  roles: RoleOut[];
  canGrantSuperAdmin: boolean;
  onClose: () => void;
  onGranted: () => void;
}) {
  const [roleKey, setRoleKey] = useState("");

  const available = roles.filter(
    (role) =>
      !target?.role_keys.includes(role.key) &&
      (canGrantSuperAdmin || role.key !== "super_admin"),
  );

  const grant = useAction(async () =>
    api.post(`/roles/users/${target!.user_id}`, { role_key: roleKey }),
  );

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target ? `Grant a role to ${target.display_name}` : "Grant a role"}
      description="Global roles take effect immediately, everywhere."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={grant.pending}
            disabled={!roleKey}
            onClick={async () => {
              if ((await grant.run()) !== undefined) {
                setRoleKey("");
                onGranted();
              }
            }}
          >
            Grant role
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {grant.error && <InlineNotice tone="danger">{grant.error}</InlineNotice>}
        {available.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            There is no global role left to give this person.
          </p>
        ) : (
          <>
            <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              <option value="">Choose a role…</option>
              {available.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </Select>
            {roleKey && (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                {available.find((r) => r.key === roleKey)?.description ??
                  humanise(roleKey)}
              </p>
            )}
            {roleKey === "super_admin" && (
              <InlineNotice tone="warn">
                A super admin can do anything on this platform, including granting super
                admin to somebody else.
              </InlineNotice>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
