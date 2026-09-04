"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Check,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise, num } from "@/lib/format";
import { useAction, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { OrgUserPage, RoleOut, UserRolesOut } from "@/lib/types";
import {
  Avatar,
  Badge,
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
  PillRail,
  SearchInput,
  Select,
} from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  RowsSkeleton,
  Spinner,
} from "@/components/ui/feedback";

/**
 * Who holds which global role.
 *
 * Team roles are not here — they are held through a membership and belong on
 * the team's own members screen. Mixing the two would suggest they are granted
 * the same way, which is exactly the confusion two scopes exist to prevent.
 *
 * The list the backend returns is **only people who already hold a role**, so
 * granting somebody their first one has to start from the directory instead.
 * That is what the grant dialog does, and it is the common case: the endpoint
 * accepts an Entra object id and provisions the person on the way in, so an
 * admin can give a role to a colleague who has never signed in here.
 */
export default function AssignmentsPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [granting, setGranting] = useState<UserRolesOut | null | "new">(null);

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

  const counts = useMemo(() => {
    const held = new Map<string, number>();
    for (const row of assignments.data ?? []) {
      for (const key of row.role_keys) held.set(key, (held.get(key) ?? 0) + 1);
    }
    return held;
  }, [assignments.data]);

  const superAdmins = counts.get("super_admin") ?? 0;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/roles">Roles</Link>}
        title="Who holds what"
        count={assignments.data ? `${num(assignments.data.length)} people` : undefined}
        lead="Global roles only — team roles live on each team."
        actions={
          <Button
            variant="accent"
            size="lg"
            icon={UserPlus}
            onClick={() => setGranting("new")}
          >
            Grant a role
          </Button>
        }
      />

      {revoke.error && <InlineNotice tone="danger">{revoke.error}</InlineNotice>}

      {!session.roles.is_super_admin && (
        <InlineNotice tone="info">
          You can grant and revoke roles, but only a super admin may grant super admin —
          otherwise the distinction would not survive its first use.
        </InlineNotice>
      )}

      <HeroPanel className="p-7">
        <div className="flex flex-wrap gap-x-14 gap-y-6">
          <Figure
            label="People with a global role"
            value={num((assignments.data ?? []).length)}
            sub="everyone else has none"
          />
          <Figure
            label="Administrators"
            value={num(
              (assignments.data ?? []).filter((r) =>
                r.role_keys.some((k) => ["super_admin", "ceo", "manager"].includes(k)),
              ).length,
            )}
            sub="may create teams and grant roles"
          />
          <Figure
            label="Super admins"
            value={num(superAdmins)}
            tone={superAdmins > 3 ? "second" : undefined}
            sub={superAdmins > 3 ? "more than is comfortable" : "full control"}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {(roles.data ?? []).map((role) => (
            <span
              key={role.key}
              title={role.description ?? undefined}
              className="inline-flex h-9 items-center gap-2.5 rounded-full bg-panel-2 py-1 pl-3.5 pr-3"
            >
              <span className="text-[12.5px] font-medium text-ink">{role.name}</span>
              <span className="tnum text-[11px] text-ink-4">
                {counts.get(role.key) ?? 0}
              </span>
            </span>
          ))}
        </div>
      </HeroPanel>

      <div className="flex flex-wrap items-center gap-2.5">
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
              : "Nobody holds a global role. The bootstrap super admin is granted at seed time; everything after that starts here."
          }
          action={
            !needle && (
              <Button variant="accent" icon={UserPlus} onClick={() => setGranting("new")}>
                Grant a role
              </Button>
            )
          }
        />
      ) : (
        <Panel tone="slab" className="p-5">
          <div className="flex flex-wrap items-center gap-3 px-2 pb-3.5">
            <span className="text-[16px] font-semibold">Holders</span>
            {superAdmins > 0 && <SolidBadge tone="second">{superAdmins} super</SolidBadge>}
            <span className="tnum ml-auto text-[12px] text-ink-3">{rows.length}</span>
            {/* This list is only people who already hold a role, so the moment
                somebody notices a name missing is right here. Granting starts
                from the org directory, not from this list. */}
            <Button size="sm" variant="accent" icon={UserPlus} onClick={() => setGranting("new")}>
              Grant to someone new
            </Button>
          </div>

          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.user_id}
                className="flex flex-wrap items-center gap-3 rounded-[11px] px-4 py-3 transition hover:bg-slab-row"
              >
                <PersonHover
                  userId={row.user_id}
                  name={row.display_name}
                  email={row.email}
                >
                  <Avatar
                    name={row.display_name}
                    seed={row.user_id}
                    size="sm"
                    className="size-9"
                  />
                </PersonHover>
                <div className="min-w-0 w-56">
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="block truncate text-[13.5px] font-semibold"
                  >
                    {row.display_name}
                  </Link>
                  <p className="truncate text-[11.5px] text-slab-ink-3">{row.email}</p>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {row.roles.map((grant) => (
                    <span
                      key={grant.role.key}
                      title={`Granted ${date(grant.granted_at)}`}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-[11.5px] font-medium",
                        grant.role.key === "super_admin"
                          ? "bg-second text-second-ink"
                          : "bg-slab-row text-slab-ink ring-1 ring-slab-line",
                      )}
                    >
                      {grant.role.key === "super_admin" && (
                        <ShieldCheck className="size-3" strokeWidth={2.4} />
                      )}
                      {grant.role.name}
                      <button
                        aria-label={`Revoke ${grant.role.name} from ${row.display_name}`}
                        className="grid size-4 place-items-center rounded-full opacity-60 transition hover:opacity-100"
                        onClick={async () => {
                          if (
                            (await revoke.run(row.user_id, grant.role.key)) !== undefined
                          ) {
                            assignments.mutate();
                          }
                        }}
                      >
                        <X className="size-2.5" strokeWidth={3} />
                      </button>
                    </span>
                  ))}
                </div>

                <Button size="sm" icon={UserPlus} onClick={() => setGranting(row)}>
                  Grant
                </Button>
              </div>
            ))}
          </div>
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
    </>
  );
}

/* ── granting ────────────────────────────────────────────────────────── */

interface Picked {
  id: string;
  name: string;
  detail: string;
}

/**
 * Grant a role, either to a listed holder or to anyone in the organisation.
 *
 * The "new" path searches Entra rather than the local user table, because the
 * person being given their first role has often never signed in — and the
 * endpoint takes an Entra object id and provisions them on the way through.
 */
function GrantDialog({
  target,
  roles,
  canGrantSuperAdmin,
  onClose,
  onGranted,
}: {
  target: UserRolesOut | null | "new";
  roles: RoleOut[];
  canGrantSuperAdmin: boolean;
  onClose: () => void;
  onGranted: () => void;
}) {
  const fromDirectory = target === "new";
  const existing = target !== "new" ? target : null;

  const [roleKey, setRoleKey] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [seenFor, setSeenFor] = useState<string | undefined>();

  const stamp = target === "new" ? "new" : (target?.user_id ?? undefined);
  if (stamp !== seenFor) {
    setSeenFor(stamp);
    setRoleKey("");
    setSearch("");
    setPicked(null);
  }

  const debounced = useDebounced(search, 350);
  const directory = useSWR<OrgUserPage>(
    fromDirectory && !picked
      ? withQuery("/directory/users", { search: debounced || undefined, limit: 30 })
      : null,
  );

  const subject: Picked | null = picked
    ? picked
    : existing
      ? { id: existing.user_id, name: existing.display_name, detail: existing.email }
      : null;

  const grant = useAction(async () =>
    api.post(`/roles/users/${subject!.id}`, { role_key: roleKey }),
  );

  const held = new Set(existing?.role_keys ?? []);
  const available = roles.filter(
    (role) =>
      !held.has(role.key) && (canGrantSuperAdmin || role.key !== "super_admin"),
  );
  const chosen = available.find((r) => r.key === roleKey);

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      width={fromDirectory ? "lg" : "md"}
      title={subject ? `Grant a role to ${subject.name}` : "Grant a role"}
      description={
        fromDirectory && !picked
          ? "Search the organisation. Anyone in Entra can be given a role, whether or not they have signed in to Hamdaz before."
          : "Global roles take effect immediately, everywhere."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={grant.pending}
            disabled={!subject || !roleKey}
            onClick={async () => {
              if ((await grant.run()) !== undefined) onGranted();
            }}
          >
            Grant role
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {grant.error && <InlineNotice tone="danger">{grant.error}</InlineNotice>}

        {/* step one: who */}
        {fromDirectory &&
          (picked ? (
            <div className="flex items-center gap-3 rounded-[16px] bg-panel-2 p-3">
              <Avatar name={picked.name} seed={picked.id} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{picked.name}</p>
                <p className="truncate text-[11.5px] text-ink-3">{picked.detail}</p>
              </div>
              <Button size="sm" className="ml-auto" onClick={() => setPicked(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search by name or email"
              />
              <div className="max-h-72 overflow-y-auto rounded-[16px] bg-panel-2">
                {directory.isLoading && !directory.data ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-[13px] text-ink-3">
                    <Spinner /> Searching the directory…
                  </div>
                ) : directory.error ? (
                  <p className="p-6 text-[13px] text-ink-3">
                    The organisation directory is unreachable, so people cannot be
                    searched right now.
                  </p>
                ) : (directory.data?.users.length ?? 0) === 0 ? (
                  <p className="p-6 text-[13px] text-ink-3">Nobody matches that.</p>
                ) : (
                  <ul className="p-1.5">
                    {directory.data!.users.map((person) => (
                      <li key={person.object_id}>
                        <button
                          onClick={() =>
                            setPicked({
                              id: person.object_id,
                              name: person.display_name,
                              detail:
                                person.email ??
                                person.user_principal_name ??
                                person.job_title ??
                                "",
                            })
                          }
                          className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition hover:bg-panel-3"
                        >
                          <Avatar
                            name={person.display_name}
                            seed={person.object_id}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">
                              {person.display_name}
                            </p>
                            <p className="truncate text-[11.5px] text-ink-4">
                              {person.email ?? person.user_principal_name}
                              {person.job_title ? ` · ${person.job_title}` : ""}
                            </p>
                          </div>
                          {!person.account_enabled && <Badge tone="warn">Disabled</Badge>}
                          <Check className="size-4 shrink-0 text-ink-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ))}

        {/* step two: which role */}
        {subject && (
          <>
            {available.length === 0 ? (
              <p className="text-[13px] text-ink-3">
                There is no global role left to give this person.
              </p>
            ) : (
              <Field label="Role" required>
                <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
                  <option value="">Choose a role…</option>
                  {available.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {chosen && (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                {chosen.description ?? humanise(chosen.key)}
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
