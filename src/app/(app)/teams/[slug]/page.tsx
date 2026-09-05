"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Archive,
  ArchiveRestore,
  Crown,
  GaugeCircle,
  KeyRound,
  ListChecks,
  Pencil,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { TeamAccessOut, TeamDetailOut } from "@/lib/types";
import {
  Avatar,
  Badge,
  Panel,
  Meta,
  PageHead,
  PanelHead,
} from "@/components/ui/primitives";
import { Button, Field, Input, LinkButton, Textarea } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";
import { TeamWidgets } from "@/components/widgets/TeamWidgets";
import { PersonHover } from "@/components/people/PersonHover";

export default function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const session = useSession();
  const router = useRouter();

  const team = useSWR<TeamDetailOut>(`/teams/${slug}`);
  // Everyone who can see the team can see what it was granted; changing it is
  // super-admin only and lives on the access screen.
  const access = useSWR<TeamAccessOut>(`/teams/${slug}/access`);

  const [editing, setEditing] = useState(false);
  const archive = useAction(async (restore: boolean) =>
    api.post(`/teams/${slug}/${restore ? "restore" : "archive"}`),
  );
  const remove = useAction(async () => api.del(`/teams/${slug}`));

  if (team.error) return <ErrorState error={team.error} onRetry={() => team.mutate()} />;
  if (!team.data) return <RowsSkeleton rows={6} />;

  const data = team.data;
  const archived = Boolean(data.archived_at);
  const leads = data.members.filter((m) => m.role_keys.includes("team_lead"));
  const isAdmin = session.roles.is_admin;

  // Two different questions, and the link needs both answered yes.
  //
  // *May* they open it: an administrator, or this team's own lead or manager —
  // mirroring what /proposals/team-tasks enforces. Gating on
  // `can("proposals", "team_tasks")` asked whether the *viewer's* team holds
  // the module, which is neither necessary nor sufficient: it hid the link
  // from the lead it was built for and offered it to members who get a 403.
  const heldHere = session.teams.find((t) => t.team.slug === slug)?.role_keys ?? [];
  const oversees =
    isAdmin || heldHere.includes("team_lead") || heldHere.includes("team_manager");

  // *Should* they see it: does this team do proposals at all. HR holds leave,
  // teams, assignment, dashboard and directory — not proposals — so the link
  // opened a screen reading "0 live, 0 due" about work the team was never
  // given. A team page should offer that team's own work, and an empty module
  // it does not hold is not that.
  const holds = (key: string) =>
    Boolean(access.data?.modules.some((m) => m.module_key === key));
  const doesProposals = holds("proposals");
  const showDashboard = session.can("dashboard", "team") && holds("dashboard");

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/teams">Teams</Link>}
        title={data.name}
        lead={data.description ?? undefined}
        actions={
          <>
            {/* Same two questions as Proposals: the viewer's own dashboard
                access says nothing about whether *this* team was given one.
                The cards themselves are on this page now, so this is the way
                to the full-width view and the widget chooser rather than the
                only way to see any numbers at all. */}
            {showDashboard && (
              <LinkButton href={`/teams/${slug}/dashboard`} icon={GaugeCircle}>
                Full dashboard
              </LinkButton>
            )}
            {oversees && doesProposals && (
              <LinkButton href={`/teams/${slug}/proposals`} icon={ListChecks}>
                Proposals
              </LinkButton>
            )}
            {isAdmin && (
              <LinkButton href={`/teams/${slug}/members`} variant="accent" icon={UserPlus}>
                Members
              </LinkButton>
            )}
          </>
        }
      />

      {archived && (
        <InlineNotice tone="warn">
          This team was archived on {date(data.archived_at)}. Its module grants no longer
          reach its members.
        </InlineNotice>
      )}

      {showDashboard && (
        <Panel className="p-4">
          <PanelHead
            title="At a glance"
            hint="This team's dashboard cards"
            action={
              <LinkButton href={`/teams/${slug}/dashboard`} size="sm" icon={GaugeCircle}>
                Open full
              </LinkButton>
            }
          />
          <div className="mt-4">
            <TeamWidgets slug={slug} compact />
          </div>
        </Panel>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-4 lg:col-span-2">
          <PanelHead
            title="Members"
            count={data.members.length}
            action={
              isAdmin && (
                <LinkButton href={`/teams/${slug}/members`} size="sm" icon={Pencil}>
                  Manage
                </LinkButton>
              )
            }
          />
          {data.members.length === 0 ? (
            <Empty
              icon={Users}
              title="Nobody is in this team"
              body="Members are added from the organisation directory."
              className="mt-5"
              action={
                isAdmin && (
                  <LinkButton href={`/teams/${slug}/members`} variant="accent" icon={UserPlus}>
                    Add members
                  </LinkButton>
                )
              }
            />
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {data.members.map((member) => (
                <li key={member.user_id} className="flex items-center gap-2.5 py-2">
                  <PersonHover
                    userId={member.user_id}
                    name={member.display_name}
                    email={member.email}
                  >
                    <Avatar name={member.display_name} seed={member.user_id} />
                  </PersonHover>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {member.display_name}
                      {member.user_id === session.user.id && (
                        <span className="ml-2 text-[11.5px] font-normal text-ink-4">you</span>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-ink-4">{member.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {!member.is_active && <Badge tone="warn">Inactive</Badge>}
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
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHead
              title="About"
              action={
                isAdmin && (
                  <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )
              }
            />
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Meta label="Slug">/{data.slug}</Meta>
              <Meta label="Created">{date(data.created_at)}</Meta>
              <Meta label="Members">{data.members.length}</Meta>
              <Meta label="Leads">
                {leads.length ? leads.map((l) => l.display_name).join(", ") : "None"}
              </Meta>
            </dl>
          </Panel>

          <Panel className="p-4">
            <PanelHead
              title="Module access"
              count={access.data?.modules.length ?? 0}
              action={
                session.roles.is_super_admin && (
                  <LinkButton href="/admin/access" size="sm" icon={KeyRound}>
                    Change
                  </LinkButton>
                )
              }
            />
            {access.error ? (
              <p className="mt-4 text-[13px] text-ink-3">
                You cannot see this team&apos;s grants.
              </p>
            ) : !access.data ? (
              <RowsSkeleton rows={3} />
            ) : access.data.modules.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">
                Nothing granted yet, so its members reach nothing through this team.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {access.data.modules.map((grant) => (
                  <li key={grant.module_key} className="rounded-xl bg-inset px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium">{grant.name}</span>
                      {grant.all_pages ? (
                        <Badge tone="accent" className="ml-auto">
                          All pages
                        </Badge>
                      ) : (
                        <Badge className="ml-auto">{grant.pages.length} pages</Badge>
                      )}
                    </div>
                    {!grant.all_pages && grant.pages.length > 0 && (
                      <p className="mt-1.5 text-[11.5px] text-ink-4">
                        {grant.pages.map((p) => p.name).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {isAdmin && (
            <Panel className="p-4">
              <PanelHead title="Danger zone" />
              <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
                Archiving keeps the team and its history but stops its grants reaching
                anyone. Deleting is permanent and only possible once it is empty.
              </p>
              {(archive.error || remove.error) && (
                <InlineNotice tone="danger" className="mt-4">
                  {archive.error ?? remove.error}
                </InlineNotice>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  icon={archived ? ArchiveRestore : Archive}
                  loading={archive.pending}
                  onClick={async () => {
                    if (await archive.run(archived)) team.mutate();
                  }}
                >
                  {archived ? "Restore team" : "Archive team"}
                </Button>
                <Button
                  variant="danger"
                  icon={Trash2}
                  loading={remove.pending}
                  disabled={data.members.length > 0}
                  title={
                    data.members.length > 0
                      ? "Remove every member before deleting."
                      : undefined
                  }
                  onClick={async () => {
                    if ((await remove.run()) !== undefined) router.push("/teams");
                  }}
                >
                  Delete
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <EditTeam
        team={data}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          setEditing(false);
          // The slug can change, and the URL is built from it.
          if (next !== slug) router.replace(`/teams/${next}`);
          else team.mutate();
        }}
      />
    </div>
  );
}

function EditTeam({
  team,
  open,
  onClose,
  onSaved,
}: {
  team: TeamDetailOut;
  open: boolean;
  onClose: () => void;
  onSaved: (slug: string) => void;
}) {
  const [name, setName] = useState(team.name);
  const [slug, setSlug] = useState(team.slug);
  const [description, setDescription] = useState(team.description ?? "");

  const save = useAction(async () =>
    api.patch<TeamDetailOut>(`/teams/${team.slug}`, {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit team"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!name.trim() || !slug.trim()}
            onClick={async () => {
              const result = await save.run();
              if (result) onSaved(result.slug);
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug" required hint="Changing this changes the team's URL.">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
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
