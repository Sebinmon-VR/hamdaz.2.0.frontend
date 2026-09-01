"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Building2, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { humanise } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { MyTeamOut, OrgUserOut, UserRolesOut } from "@/lib/types";
import { Avatar, Badge, Panel, Meta, PageHead, PanelHead } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/controls";
import { PanelSkeleton, ErrorState } from "@/components/ui/feedback";

/**
 * One person, as Entra has them.
 *
 * Entra is keyed by object id and Hamdaz by its own user id, and the two are
 * only joined once someone has signed in here. So the local half of this page
 * — roles and teams — is looked up separately and simply absent for a person
 * who has never logged in, which is the honest thing to show.
 */
export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();

  const person = useSWR<OrgUserOut>(`/directory/users/${id}`);

  // The local record shares the Entra object id, and the profile endpoint
  // accepts either that or an email. A 404 here just means "never signed in".
  const roles = useSWR<UserRolesOut>(
    person.data ? `/roles/users/${id}` : null,
    { shouldRetryOnError: false },
  );
  const teams = useSWR<MyTeamOut[]>(
    person.data ? `/teams/by-user/${id}` : null,
    { shouldRetryOnError: false },
  );

  if (person.error) {
    return <ErrorState error={person.error} onRetry={() => person.mutate()} />;
  }
  if (!person.data) return <PanelSkeleton lines={6} />;

  const data = person.data;
  const neverSignedIn = Boolean(roles.error) && Boolean(teams.error);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/directory">Directory</Link>}
        title={data.display_name}
        lead={data.job_title ?? undefined}
        actions={
          session.roles.is_admin &&
          !neverSignedIn && (
            <LinkButton href={`/admin/users/${id}`} icon={ShieldCheck}>
              Administer
            </LinkButton>
          )
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-4 lg:col-span-2">
          <div className="flex items-center gap-4">
            <Avatar name={data.display_name} seed={data.object_id} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[20px] font-semibold tracking-tight">
                {data.display_name}
              </p>
              <p className="truncate text-[13px] text-ink-3">
                {data.job_title ?? "No job title in Entra"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.department && <Badge tone="accent">{data.department}</Badge>}
                {data.is_guest && <Badge tone="warn">Guest account</Badge>}
                {!data.account_enabled && <Badge tone="danger">Disabled</Badge>}
              </div>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Meta label="Email">
              {data.email ? (
                <a className="hover:text-accent-text" href={`mailto:${data.email}`}>
                  {data.email}
                </a>
              ) : (
                "—"
              )}
            </Meta>
            <Meta label="User principal name">{data.user_principal_name}</Meta>
            <Meta label="Mobile">{data.mobile_phone ?? "—"}</Meta>
            <Meta label="Office">{data.office_location ?? "—"}</Meta>
            <Meta label="Department">{data.department ?? "—"}</Meta>
            <Meta label="Entra object id">
              <span className="font-mono text-[12px]">{data.object_id}</span>
            </Meta>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] font-medium transition hover:border-ink-4"
              >
                <Mail className="size-4" />
                Email
              </a>
            )}
            {data.mobile_phone && (
              <a
                href={`tel:${data.mobile_phone}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] font-medium transition hover:border-ink-4"
              >
                <Phone className="size-4" />
                Call
              </a>
            )}
            {data.office_location && (
              <span className="inline-flex h-10 items-center gap-2 rounded-full bg-inset px-4 text-[13.5px] text-ink-3">
                <MapPin className="size-4" />
                {data.office_location}
              </span>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <PanelHead title="In Hamdaz" />
            {neverSignedIn ? (
              <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
                This person has no Hamdaz account yet. One is created automatically the
                first time they sign in — or the moment they are added to a team.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">
                    Global roles
                  </p>
                  {roles.data && roles.data.role_keys.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {roles.data.role_keys.map((key) => (
                        <Badge key={key} tone={key === "super_admin" ? "highlight" : "neutral"}>
                          {humanise(key)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-3">None.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">
                    Teams
                  </p>
                  {teams.data && teams.data.length > 0 ? (
                    <ul className="space-y-1.5">
                      {teams.data.map(({ team, role_keys }) => (
                        <li key={team.id}>
                          <Link
                            href={`/teams/${team.slug}`}
                            className="flex items-center gap-2.5 rounded-xl bg-inset px-2.5 py-1.5 text-[13px] transition hover:bg-panel-2"
                          >
                            <Building2 className="size-3.5 shrink-0 text-ink-3" />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {team.name}
                            </span>
                            <span className="shrink-0 text-[11.5px] text-ink-4">
                              {role_keys.map(humanise).join(", ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-ink-3">No teams.</p>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
