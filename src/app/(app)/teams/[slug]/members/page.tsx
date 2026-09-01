"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, Crown, Trash2, UserPlus, Users } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise } from "@/lib/format";
import { useAction, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { MemberOut, OrgUserPage, RoleOut, TeamDetailOut } from "@/lib/types";
import { Avatar, Badge, Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, ChipPicker, SearchInput } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  RowsSkeleton,
  Spinner,
} from "@/components/ui/feedback";

export default function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const session = useSession();

  const team = useSWR<TeamDetailOut>(`/teams/${slug}`);
  // Only team-scoped roles can be held through a membership; the global ones
  // are granted on the roles screen and would be meaningless here.
  const roles = useSWR<RoleOut[]>(withQuery("/roles", { scope: "team" }));

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MemberOut | null>(null);

  const remove = useAction(async (userId: string) =>
    api.del(`/teams/${slug}/members/${userId}`),
  );

  if (team.error) return <ErrorState error={team.error} onRetry={() => team.mutate()} />;
  if (!team.data) return <RowsSkeleton rows={6} />;

  const data = team.data;
  const roleOptions = (roles.data ?? []).map((r) => ({ value: r.key, label: r.name }));

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href={`/teams/${slug}`}>{data.name}</Link>}
        title="Members"
        lead="Everyone here holds at least one team role. What the team can reach is set separately, under module access."
        actions={
          <Button variant="accent" icon={UserPlus} onClick={() => setAdding(true)}>
            Add people
          </Button>
        }
      />

      {remove.error && <InlineNotice tone="danger">{remove.error}</InlineNotice>}

      <Panel className="p-4">
        <PanelHead title="In this team" count={data.members.length} />
        {data.members.length === 0 ? (
          <Empty
            icon={Users}
            title="Nobody yet"
            body="Add people from the organisation directory. They are created locally on first sign-in, so anyone in Entra can be added."
            className="mt-5"
            action={
              <Button variant="accent" icon={UserPlus} onClick={() => setAdding(true)}>
                Add people
              </Button>
            }
          />
        ) : (
          <ul className="mt-2 divide-y divide-[var(--c-line)]">
            {data.members.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center gap-2.5 py-2">
                <Avatar name={member.display_name} seed={member.user_id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{member.display_name}</p>
                  <p className="truncate text-[12px] text-ink-4">
                    {member.email} · joined {date(member.joined_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {member.role_keys.map((key) => (
                    <Badge
                      key={key}
                      tone={key === "team_lead" ? "highlight" : "neutral"}
                      icon={key === "team_lead" ? Crown : undefined}
                    >
                      {humanise(key)}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setEditing(member)}>
                    Roles
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    onClick={async () => {
                      if (
                        (await remove.run(member.user_id)) !== undefined ||
                        !remove.error
                      ) {
                        team.mutate();
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AddMembers
        slug={slug}
        open={adding}
        existing={new Set(data.members.map((m) => m.entra_object_id))}
        roleOptions={roleOptions}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          team.mutate();
        }}
      />

      <EditRoles
        slug={slug}
        member={editing}
        roleOptions={roleOptions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          team.mutate();
        }}
      />
    </div>
  );
}

/**
 * Adding people means searching Entra, not the local user table — someone who
 * has never signed in does not exist locally yet, and they are exactly the
 * person being added. The backend provisions them on the way in.
 */
function AddMembers({
  slug,
  open,
  existing,
  roleOptions,
  onClose,
  onAdded,
}: {
  slug: string;
  open: boolean;
  existing: Set<string>;
  roleOptions: { value: string; label: string }[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 350);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [withRoles, setWithRoles] = useState<string[]>(["member"]);

  const directory = useSWR<OrgUserPage>(
    open ? withQuery("/directory/users", { search: debounced || undefined, limit: 40 }) : null,
  );

  const add = useAction(async () =>
    api.post(`/teams/${slug}/members/bulk`, {
      user_ids: Object.keys(picked),
      role_keys: withRoles,
    }),
  );

  const chosen = Object.entries(picked);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Add people to this team"
      description="Searches the organisation directory. Anyone in Entra can be added, whether or not they have signed in here before."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={add.pending}
            disabled={chosen.length === 0 || withRoles.length === 0}
            onClick={async () => {
              if ((await add.run()) !== undefined) {
                setPicked({});
                setSearch("");
                onAdded();
              }
            }}
          >
            Add {chosen.length || ""} {chosen.length === 1 ? "person" : "people"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {add.error && <InlineNotice tone="danger">{add.error}</InlineNotice>}

        <div>
          <p className="mb-2 text-[12.5px] font-medium text-ink-2">Roles they will hold</p>
          <ChipPicker
            options={roleOptions}
            selected={withRoles}
            onToggle={(value) =>
              setWithRoles((current) =>
                current.includes(value)
                  ? current.filter((v) => v !== value)
                  : [...current, value],
              )
            }
          />
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email" />

        {chosen.length > 0 && (
          <div className="flex flex-wrap gap-1.5 rounded-2xl bg-inset p-3">
            {chosen.map(([id, name]) => (
              <button
                key={id}
                onClick={() =>
                  setPicked((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-[var(--c-accent-ink)]"
              >
                {name}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto rounded-2xl border border-line">
          {directory.isLoading && !directory.data ? (
            <div className="flex items-center justify-center gap-2 p-8 text-[13px] text-ink-3">
              <Spinner /> Searching the directory…
            </div>
          ) : directory.error ? (
            <p className="p-6 text-[13px] text-ink-3">
              The organisation directory is unreachable, so people cannot be searched
              right now.
            </p>
          ) : (directory.data?.users.length ?? 0) === 0 ? (
            <p className="p-6 text-[13px] text-ink-3">Nobody matches that.</p>
          ) : (
            <ul className="divide-y divide-[var(--c-line)]">
              {directory.data!.users.map((person) => {
                const already = existing.has(person.object_id);
                const on = person.object_id in picked;
                return (
                  <li key={person.object_id}>
                    <button
                      disabled={already}
                      onClick={() =>
                        setPicked((current) => {
                          const next = { ...current };
                          if (on) delete next[person.object_id];
                          else next[person.object_id] = person.display_name;
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-inset disabled:opacity-45"
                    >
                      <Avatar
                        name={person.display_name}
                        seed={person.object_id}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">
                          {person.display_name}
                        </p>
                        <p className="truncate text-[11.5px] text-ink-4">
                          {person.email ?? person.user_principal_name}
                          {person.job_title ? ` · ${person.job_title}` : ""}
                        </p>
                      </div>
                      {already ? (
                        <Badge>Already in</Badge>
                      ) : on ? (
                        <span className="grid size-6 place-items-center rounded-full bg-accent text-[var(--c-accent-ink)]">
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="size-6 rounded-full border border-line-strong" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function EditRoles({
  slug,
  member,
  roleOptions,
  onClose,
  onSaved,
}: {
  slug: string;
  member: MemberOut | null;
  roleOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [keys, setKeys] = useState<string[]>([]);
  // Re-seeded whenever a different member is opened.
  const seeded = useMemo(() => member?.user_id, [member]);
  const [seenFor, setSeenFor] = useState<string | undefined>();
  if (seeded !== seenFor) {
    setSeenFor(seeded);
    setKeys(member?.role_keys ?? []);
  }

  const save = useAction(async () =>
    api.patch(`/teams/${slug}/members/${member!.user_id}`, { role_keys: keys }),
  );

  return (
    <Modal
      open={Boolean(member)}
      onClose={onClose}
      title={member ? `Roles for ${member.display_name}` : "Roles"}
      description="A membership must carry at least one role. Removing the last one removes them from the team."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={keys.length === 0}
            onClick={async () => {
              if ((await save.run()) !== undefined) onSaved();
            }}
          >
            Save roles
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        <ChipPicker
          options={roleOptions}
          selected={keys}
          onToggle={(value) =>
            setKeys((current) =>
              current.includes(value)
                ? current.filter((v) => v !== value)
                : [...current, value],
            )
          }
        />
      </div>
    </Modal>
  );
}
