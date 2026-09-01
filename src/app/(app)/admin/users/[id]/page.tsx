"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Building2, Crown, Eraser, ShieldCheck, Trash2 } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { ResetResult, UserProfileOut } from "@/lib/types";
import { Avatar, Badge, Panel, Meta, PageHead, PanelHead, Stat } from "@/components/ui/primitives";
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
 */
export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const router = useRouter();

  const profile = useSWR<UserProfileOut>(
    withQuery(`/users/${id}`, { include: "identity,directory,roles,teams,activity" }),
  );

  const [confirming, setConfirming] = useState<"reset" | "purge" | null>(null);
  const [outcome, setOutcome] = useState<ResetResult | null>(null);

  if (profile.error) {
    return <ErrorState error={profile.error} onRetry={() => profile.mutate()} />;
  }
  if (!profile.data) return <PanelSkeleton lines={8} />;

  const data = profile.data;
  const identity = data.sections.identity as IdentitySection | undefined;
  const directory = data.sections.directory as DirectorySection | null | undefined;
  const roles = data.sections.roles as RolesSection | undefined;
  const teams = data.sections.teams as TeamsSection | undefined;
  const activity = data.sections.activity as ActivitySection | undefined;

  const isSelf = data.user_id === session.user.id;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/admin/roles/assignments">Administration</Link>}
        title={data.display_name}
        lead={data.email}
        actions={
          <>
            {directory && (
              <Button
                onClick={() => router.push(`/directory/${directory.object_id}`)}
                icon={Building2}
              >
                In the directory
              </Button>
            )}
          </>
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
              <Meta label="Last signed in">
                {identity.last_login_at ? relative(identity.last_login_at) : "Never"}
              </Meta>
              <Meta label="Account created">{date(identity.created_at)}</Meta>
              <Meta label="Last changed">{date(identity.updated_at)}</Meta>
              <Meta label="Job title">{directory?.job_title ?? "—"}</Meta>
              <Meta label="Department">{directory?.department ?? "—"}</Meta>
              <Meta label="Office">{directory?.office_location ?? "—"}</Meta>
              <Meta label="Hamdaz id">
                <span className="font-mono text-[12px]">{identity.id}</span>
              </Meta>
              <Meta label="Entra object id">
                <span className="font-mono text-[12px]">{identity.entra_object_id}</span>
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

      <Panel className="p-4">
        <PanelHead title="Danger zone" />
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
