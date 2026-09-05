"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Building2,
  CalendarDays,
  Crown,
  Eraser,
  IdCard,
  ListChecks,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction, useProgressive } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  EffectiveAccessOut,
  ResetResult,
  SectionInfo,
  UserProfileOut,
} from "@/lib/types";
import { Avatar, Badge, Panel, Meta, PageHead, PanelHead, Stat } from "@/components/ui/primitives";
import {
  LabelsHeld,
  ProfileRefused,
  ProposalWork,
  RankingStanding,
  mayViewProfile,
} from "@/components/people/WorkSections";
import { Button, Field, Input } from "@/components/ui/controls";
import { PanelSkeleton, ErrorState, InlineNotice, Modal } from "@/components/ui/feedback";

/* The section payloads, transcribed from app/profiles/sections.py. */
interface IdentitySection {
  id: string;
  email: string;
  display_name: string;
  entra_object_id: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  has_signed_in: boolean;
}
interface DirectorySection {
  object_id: string;
  display_name: string;
  email: string | null;
  user_principal_name: string;
  job_title: string | null;
  department: string | null;
  office_location: string | null;
  mobile_phone: string | null;
  account_enabled: boolean;
  is_guest: boolean;
}
interface RolesSection {
  keys: string[];
  is_admin: boolean;
  is_super_admin: boolean;
  grants: { key: string; name: string; granted_at: string; granted_by_id: string | null }[];
}
interface TeamsSection {
  count: number;
  memberships: {
    team_id: string;
    slug: string;
    name: string;
    archived: boolean;
    role_keys: string[];
    is_lead: boolean;
  }[];
}
interface ActivitySection {
  roles_granted: number;
  team_members_added: number;
}

/**
 * One person, as the ERP holds them.
 *
 * The backend assembles this from independent sections and reports per-section
 * failure rather than failing the page, so the directory half can be missing
 * while the local half is fine — which is exactly what happens when Graph is
 * unreachable.
 *
 * Everything about the person is on this one screen, including the three
 * things that used to be elsewhere: what they are carrying on the Proposals
 * list, the labels the assignment policy reads, and where they sit in each of
 * their teams' next ranking. Those three read SharePoint and Entra live, so
 * each loads on its own and paints when it lands rather than holding the page.
 *
 * **Administrators only** — see `mayViewProfile` for what that does and does
 * not guarantee.
 */
export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const router = useRouter();

  // Which sections a profile can contain is the backend's catalogue, not a
  // list held here — so a section added there arrives without a frontend
  // change. Asked for first because the profile request depends on it.
  const sections = useSWR<SectionInfo[]>("/users/sections", {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
  });
  const include = (sections.data ?? []).map((s) => s.key).join(",");

  // The Entra section is the slow one here, so the local sections paint first.
  const profile = useProgressive<UserProfileOut>(include ? `/users/${id}` : null, {
    include,
  });
  // What this person can actually reach, resolved by the backend rather than
  // inferred from their teams here — a super admin reaches everything without
  // belonging to anything, and that rule lives on the server.
  const access = useSWR<EffectiveAccessOut>(`/access/users/${id}`, {
    shouldRetryOnError: false,
  });

  const [confirming, setConfirming] = useState<"reset" | "purge" | null>(null);
  const [outcome, setOutcome] = useState<ResetResult | null>(null);

  // Checked after the hooks because hooks cannot be conditional, and before
  // anything is rendered because a colleague should not read the answer off
  // the screen while the refusal loads.
  if (!mayViewProfile(session, id)) {
    return (
      <>
        <PageHead eyebrow="People" title="Profile" />
        <ProfileRefused />
      </>
    );
  }

  if (profile.error) {
    return <ErrorState error={profile.error} onRetry={() => profile.mutate()} />;
  }
  if (!profile.data) return <PanelSkeleton lines={8} />;

  const data = profile.data;
  const identity = data.sections.identity as IdentitySection | undefined;
  // undefined and null are different answers here, and the progressive load
  // makes the difference load-bearing: undefined means the Entra section has
  // not arrived yet (the local-only pass skips it), null means it arrived and
  // the person has no directory record. Only the second is worth reporting.
  const directory = data.sections.directory as DirectorySection | null | undefined;
  const roles = data.sections.roles as RolesSection | undefined;
  const teams = data.sections.teams as TeamsSection | undefined;
  const activity = data.sections.activity as ActivitySection | undefined;

  const isSelf = data.user_id === session.user.id;
  const resettable = (sections.data ?? []).filter((s) => s.resettable);

  return (
    <div className="space-y-4">
      {/* No "open it elsewhere" buttons: every section this page can show is
          already fetched by the time the header paints, so sending somebody to
          another screen to read it was a click that bought nothing. */}
      <PageHead
        title={data.display_name}
        lead={data.email}
        meta={
          identity?.last_login_at
            ? `last seen ${relative(identity.last_login_at)}`
            : "never signed in"
        }
      />

      {Object.keys(data.errors).length > 0 && (
        <InlineNotice tone="warn">
          {Object.entries(data.errors).map(([key, message]) => (
            <p key={key}>
              <strong>{humanise(key)}</strong> could not be loaded: {message}
            </p>
          ))}
        </InlineNotice>
      )}

      {outcome && (
        <InlineNotice tone="positive">
          {outcome.account_deleted
            ? `${outcome.display_name} has been removed from the ERP.`
            : `${outcome.display_name} has been reset.`}{" "}
          Removed:{" "}
          {Object.entries(outcome.removed)
            .map(([what, count]) => `${count} ${humanise(what).toLowerCase()}`)
            .join(", ") || "nothing"}
          .
        </InlineNotice>
      )}

      {/* Your own profile opens with what you can do next, not with a
          SharePoint sweep reporting zero.

          The proposal panel below is genuinely the point when an
          administrator is looking somebody up — "what is this person
          carrying" is the question a colleague's profile is opened to answer.
          It is not the question you open your own with: you already know, and
          the answer in full is one click away on My tasks. So it is shown
          about other people and replaced here. */}
      {isSelf ? <Shortcuts /> : null}

      {!isSelf && <ProposalWork email={data.email} name={data.display_name} />}

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={data.display_name} seed={data.user_id} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[20px] font-semibold tracking-tight">
                {data.display_name}
                {isSelf && (
                  <span className="ml-2 text-[12px] font-normal text-ink-4">this is you</span>
                )}
              </p>
              <p className="truncate text-[13px] text-ink-3">{data.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roles?.is_super_admin && (
                  <Badge tone="highlight" icon={ShieldCheck}>
                    Super admin
                  </Badge>
                )}
                {roles?.is_admin && !roles.is_super_admin && (
                  <Badge tone="accent">Administrator</Badge>
                )}
                {identity && !identity.is_active && <Badge tone="danger">Deactivated</Badge>}
                {identity && !identity.has_signed_in && (
                  <Badge tone="warn">Never signed in</Badge>
                )}
                {directory?.is_guest && <Badge tone="warn">Guest in Entra</Badge>}
              </div>
            </div>
          </div>

          {identity && (
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Meta label="Job title">{directory?.job_title ?? "—"}</Meta>
              <Meta label="Department">{directory?.department ?? "—"}</Meta>
              <Meta label="Office">{directory?.office_location ?? "—"}</Meta>
              <Meta label="Mobile">{directory?.mobile_phone ?? "—"}</Meta>
              <Meta label="Sign-in name">
                {directory?.user_principal_name ?? data.email}
              </Meta>
              <Meta label="Entra account">
                {directory === undefined
                  ? "reading…"
                  : directory === null
                    ? "no longer present"
                    : directory.account_enabled
                      ? directory.is_guest
                        ? "enabled · guest"
                        : "enabled"
                      : "disabled"}
              </Meta>
              <Meta label="Last signed in">
                {identity.last_login_at ? relative(identity.last_login_at) : "Never"}
              </Meta>
              <Meta label="Account created">{date(identity.created_at)}</Meta>
              <Meta label="Last changed">{date(identity.updated_at)}</Meta>
              <Meta label="Hamdaz id">
                <span className="font-mono text-[12px]">{identity.id}</span>
              </Meta>
              <Meta label="Entra object id">
                <span className="font-mono text-[12px]">{identity.entra_object_id}</span>
              </Meta>
              <Meta label="Signed in before">
                {identity.has_signed_in ? "Yes" : "No — provisioned only"}
              </Meta>
            </dl>
          )}

          {directory === null && (
            <p className="mt-6 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-3">
              This account has no matching record in Entra any more. That usually means the
              person has left and their directory account was removed.
            </p>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHead title="Global roles" count={roles?.grants.length ?? 0} />
            {!roles || roles.grants.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">None held.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {roles.grants.map((grant) => (
                  <li
                    key={grant.key}
                    className="flex items-center gap-2.5 rounded-xl bg-inset px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {grant.name}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-4">
                      {date(grant.granted_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-4">
            <PanelHead
              title="Can reach"
              count={access.data?.modules.length ?? 0}
              hint={
                access.data?.source === "super_admin" ? "everything, as a super admin" : undefined
              }
            />
            {access.error ? (
              <p className="mt-4 text-[13px] text-ink-3">
                You cannot see this person&apos;s effective access.
              </p>
            ) : !access.data ? (
              <p className="mt-4 text-[13px] text-ink-3">Working it out…</p>
            ) : access.data.modules.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">
                Nothing. They belong to no team that has been granted a module.
              </p>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {access.data.modules.map((module) => (
                    <span key={module.key} title={module.pages.map((p) => p.name).join(", ")}>
                      <Badge tone={module.admin_only ? "second" : "accent"}>
                        {module.name}
                      </Badge>
                    </span>
                  ))}
                </div>
                {access.data.via_teams.length > 0 && (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
                    Through {access.data.via_teams.join(", ")}.
                  </p>
                )}
              </>
            )}
          </Panel>

          <Panel className="p-4">
            <PanelHead title="Teams" count={teams?.count ?? 0} />
            {!teams || teams.memberships.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">
                Not a member of any team, so they reach nothing through one.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {teams.memberships.map((membership) => (
                  <li key={membership.team_id}>
                    <Link
                      href={`/teams/${membership.slug}`}
                      className="flex items-center gap-2.5 rounded-xl bg-inset px-2.5 py-1.5 transition hover:bg-panel-2"
                    >
                      {membership.is_lead ? (
                        <Crown className="size-3.5 shrink-0 text-highlight-text" />
                      ) : (
                        <Building2 className="size-3.5 shrink-0 text-ink-3" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {membership.name}
                      </span>
                      {membership.archived && <Badge tone="warn">Archived</Badge>}
                      <span className="shrink-0 text-[11.5px] text-ink-4">
                        {membership.role_keys.map(humanise).join(", ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {activity && (activity.roles_granted > 0 || activity.team_members_added > 0) && (
        <Panel className="p-4">
          <PanelHead
            title="What they have done to others"
            hint="These references are nulled rather than cascaded when an account is removed."
          />
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            <Stat value={num(activity.roles_granted)} label="roles granted" />
            <Stat value={num(activity.team_members_added)} label="people added to teams" />
          </div>
        </Panel>
      )}

      {/* The labels the policy reads, and their standing in each of their
          teams' next ranking. Both are per-team by design on the backend, so
          they are per-team here too rather than averaged into one number. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <LabelsHeld userId={data.user_id} />
        <div className="space-y-3 lg:col-span-2">
          <RankingStanding
            userId={data.user_id}
            teams={(teams?.memberships ?? [])
              .filter((m) => !m.archived)
              .map((m) => ({ slug: m.slug, name: m.name }))}
          />
        </div>
      </div>

      <Panel className="p-4">
        <PanelHead title="Danger zone" />
        {resettable.length > 0 && (
          <p className="mt-3 text-[12px] text-ink-4">
            Resetting clears: {resettable.map((s) => s.label.toLowerCase()).join(", ")}.
          </p>
        )}
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          <strong className="text-ink">Reset</strong> strips every module&apos;s data —
          roles, memberships, and anything else a module owns — while keeping the account,
          so the person can sign in again and start clean.{" "}
          <strong className="text-ink">Remove</strong> deletes the account outright.
          Neither touches Entra: the person keeps their Microsoft account either way, and a
          removed account is recreated on their next sign-in.
        </p>

        {isSelf && (
          <InlineNotice tone="warn" className="mt-4">
            This is your own account. Resetting it would strip your own roles, including
            the one letting you see this screen.
          </InlineNotice>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button icon={Eraser} onClick={() => setConfirming("reset")}>
            Reset this account
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirming("purge")}>
            Remove from the ERP
          </Button>
        </div>
      </Panel>

      <DangerDialog
        mode={confirming}
        profile={data}
        onClose={() => setConfirming(null)}
        onDone={(result) => {
          setConfirming(null);
          setOutcome(result);
          if (result.account_deleted) router.push("/admin/roles/assignments");
          else profile.mutate();
        }}
      />
    </div>
  );
}

/**
 * Both destructive actions behind the same confirmation: type the email.
 *
 * Heavy-handed on purpose. These are the two calls in the app that destroy
 * data an admin cannot get back from this screen, and an admin who is about to
 * reset the wrong person almost always has the right person's name in mind and
 * the wrong page open.
 */
function DangerDialog({
  mode,
  profile,
  onClose,
  onDone,
}: {
  mode: "reset" | "purge" | null;
  profile: UserProfileOut;
  onClose: () => void;
  onDone: (result: ResetResult) => void;
}) {
  const [typed, setTyped] = useState("");
  const [seenFor, setSeenFor] = useState<string | null>(null);

  if (mode !== seenFor) {
    setSeenFor(mode);
    setTyped("");
  }

  const act = useAction(async () =>
    mode === "purge"
      ? api.del<ResetResult>(`/users/${profile.user_id}`)
      : api.post<ResetResult>(`/users/${profile.user_id}/reset`),
  );

  const matches = typed.trim().toLowerCase() === profile.email.toLowerCase();

  return (
    <Modal
      open={Boolean(mode)}
      onClose={onClose}
      title={
        mode === "purge"
          ? `Remove ${profile.display_name} from the ERP?`
          : `Reset ${profile.display_name}?`
      }
      description={
        mode === "purge"
          ? "The account and everything it owns is deleted. Their Microsoft account is untouched, and signing in again creates a fresh account with no roles or teams."
          : "Every role and team membership is removed. The account itself survives, so they can sign in and be set up again."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            icon={mode === "purge" ? Trash2 : Eraser}
            loading={act.pending}
            disabled={!matches}
            onClick={async () => {
              const result = await act.run();
              if (result) onDone(result);
            }}
          >
            {mode === "purge" ? "Remove permanently" : "Reset"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {act.error && <InlineNotice tone="danger">{act.error}</InlineNotice>}
        <Field
          label={`Type ${profile.email} to confirm`}
          required
          error={typed && !matches ? "That does not match." : null}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={profile.email}
            autoComplete="off"
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * What you can do next, on your own profile.
 *
 * Replaces the proposal sweep that used to lead this page for its owner. That
 * panel answers "what is this person carrying", which is a question about
 * somebody else — on your own record it reported a number you already knew,
 * after a slow read of SharePoint, above the thing you actually came for.
 *
 * Every entry is gated on what the viewer can genuinely reach, so this is the
 * same list the rail would show, minus everything that is not personal. A
 * shortcut to a page that 403s is worse than no shortcut.
 */
function Shortcuts() {
  const session = useSession();

  const links: { label: string; hint: string; href: string; icon: LucideIcon }[] = [];

  if (session.can("proposals", "my_tasks")) {
    links.push({
      label: "My tasks",
      hint: "Enquiries assigned to you",
      href: "/proposals/my-tasks",
      icon: ListChecks,
    });
  }
  if (session.can("leave")) {
    links.push({
      label: "My leave",
      hint: "Balance, and what is booked",
      href: "/leave",
      icon: CalendarDays,
    });
  }
  if (session.can("hr", "my_reviews")) {
    links.push({
      label: "Reviews to write",
      hint: "Colleagues who nominated you",
      href: "/hr/my-reviews",
      icon: Star,
    });
  }
  if (session.can("hr", "my_record")) {
    links.push({
      label: "My HR record",
      hint: "Documents HR has shared with you",
      href: "/hr/me",
      icon: IdCard,
    });
  }
  links.push({
    label: "Settings",
    hint: "Appearance, and signing out",
    href: "/settings",
    icon: Settings,
  });

  return (
    <Panel className="p-4">
      <PanelHead title="Yours" hint="Only you see these" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-xl bg-inset px-3 py-2.5 transition hover:bg-panel-3"
            >
              <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.9} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{link.label}</span>
                <span className="block truncate text-[11.5px] text-ink-4">{link.hint}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
