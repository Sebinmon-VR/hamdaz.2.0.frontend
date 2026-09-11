"use client";

import useSWR from "swr";
import { KeyRound, ShieldAlert, Users } from "lucide-react";
import { humanise } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { PermissionRuleOut } from "@/lib/types";
import { Avatar, Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";

/**
 * Who may do what, in the parts that run on their own.
 *
 * These rules live in backend code — a role check at the top of a router, a
 * function that decides whether one person may read another's report — and a
 * frontend cannot derive them from any endpoint. So the API restates them in
 * words and this screen prints them, for a plain reason: an administration
 * section that cannot explain *why* somebody was refused produces support
 * questions instead of answering them.
 *
 * **It answers "who can actually do this today", not only "which role can".**
 * Every rule carries the people who currently hold the roles it names, so the
 * question a super admin actually has — is anybody other than me able to turn
 * the intake's writing on — is answered by reading rather than by cross
 * referencing this against the roles screen.
 *
 * Where the answer is not a role at all — "its author", "anybody on a team that
 * has the module" — the rule says so in its note and names nobody, because
 * listing every person who satisfies a condition like that would be a different
 * and much longer answer.
 */
export default function AdminPermissionsPage() {
  const session = useSession();
  const { data, error, mutate } = useSWR<PermissionRuleOut[]>("/admin/permissions", {
    revalidateOnFocus: false,
  });

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Who may do what" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Reading the rules behind the administration screens — and who holds each role today — is a super admin's business, and the endpoint behind this enforces that itself."
        />
      </>
    );
  }

  // Grouped by area, in the order the API gave them: it lists them in the order
  // somebody would meet them, and re-sorting alphabetically would scatter that.
  const areas: { area: string; rules: PermissionRuleOut[] }[] = [];
  for (const rule of data ?? []) {
    const last = areas[areas.length - 1];
    if (last && last.area === rule.area) last.rules.push(rule);
    else areas.push({ area: rule.area, rules: [rule] });
  }

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Who may do what"
        lead="The rules behind these screens, in words, with who holds each role today."
        count={data ? `${data.length} rules` : undefined}
        actions={
          <>
            <LinkButton href="/admin/roles/assignments" icon={Users}>
              Who holds what
            </LinkButton>
            <LinkButton href="/admin/access" icon={KeyRound}>
              Team access
            </LinkButton>
          </>
        }
      />

      <InlineNotice tone="info">
        These are restatements of checks that live in the backend, not switches. Changing
        who can do something means granting or removing a role under{" "}
        <a
          href="/admin/roles/assignments"
          className="text-accent-text underline underline-offset-2"
        >
          Who holds what
        </a>
        .
      </InlineNotice>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <PanelSkeleton lines={8} />
      ) : (
        <div className="space-y-4">
          {areas.map((group) => (
            <Panel key={group.area} className="p-5">
              <PanelHead title={humanise(group.area)} count={group.rules.length} />
              <ul className="mt-4 space-y-2.5">
                {group.rules.map((rule) => (
                  <li key={`${rule.area}-${rule.what}`} className="rounded-[13px] bg-panel-2 p-3.5">
                    <p className="text-[12.5px] font-medium text-ink">{rule.what}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {rule.who.length > 0 ? (
                        rule.who.map((role) => (
                          <Badge key={role} tone="accent">
                            {humanise(role)}
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="neutral">Not a role</Badge>
                      )}
                    </div>

                    {rule.note && (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{rule.note}</p>
                    )}

                    {/* The half that makes this worth a screen: the rule says
                        which role, this says who that is this morning. */}
                    {rule.who.length > 0 && (
                      <div className="mt-2.5">
                        <p className="micro mb-1.5 text-ink-4">
                          {rule.holders.length === 0
                            ? "Nobody holds these roles"
                            : `${rule.holders.length} ${
                                rule.holders.length === 1 ? "person" : "people"
                              } can do this today`}
                        </p>
                        {rule.holders.length === 0 ? (
                          <p className="text-[11.5px] leading-relaxed text-warn">
                            Which means nobody can do it at all. That is worth knowing before
                            somebody goes looking for the person who can.
                          </p>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {rule.holders.map((holder) => (
                              <li
                                key={`${holder.user_id}-${holder.display_name}`}
                                className="inline-flex items-center gap-1.5 rounded-full bg-panel py-1 pl-1 pr-3"
                                title={holder.email ?? undefined}
                              >
                                <Avatar
                                  name={holder.display_name}
                                  seed={holder.user_id}
                                  size="xs"
                                />
                                <span className="text-[11.5px] text-ink-2">
                                  {holder.display_name}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
