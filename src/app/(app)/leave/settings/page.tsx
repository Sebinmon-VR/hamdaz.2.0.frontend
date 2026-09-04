"use client";

import { useState } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { LeaveSettingsOut, TeamOut } from "@/lib/types";
import { Panel, PageHead, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Toggle } from "@/components/ui/controls";
import { PanelSkeleton, ErrorState, InlineNotice } from "@/components/ui/feedback";

/**
 * The leave rules.
 *
 * Readable by anyone — the numbers explain every decision the system makes, so
 * hiding them would be perverse — but writable only by HR, which is why the
 * form is rendered read-only for everyone else rather than hidden.
 */
export default function LeaveSettingsPage() {
  const session = useSession();
  const settings = useSWR<LeaveSettingsOut>("/leave/settings");
  const teams = useSWR<TeamOut[]>("/teams");

  const [draft, setDraft] = useState<LeaveSettingsOut | null>(null);
  const [saved, setSaved] = useState(false);

  if (settings.data && draft === null) setDraft(settings.data);

  const save = useAction(async () => {
    const next = await api.put<LeaveSettingsOut>("/leave/settings", {
      max_concurrent: draft!.max_concurrent,
      auto_decide: draft!.auto_decide,
      limit_scope: draft!.limit_scope,
      hr_team_slug: draft!.hr_team_slug,
      notify_hr_by_email: draft!.notify_hr_by_email,
      max_days_per_request: draft!.max_days_per_request,
    });
    settings.mutate(next, { revalidate: false });
    setDraft(next);
    setSaved(true);
    return next;
  });

  if (settings.error) {
    return <ErrorState error={settings.error} onRetry={() => settings.mutate()} />;
  }
  if (!draft) return <PanelSkeleton lines={7} />;

  const editable = session.isHr;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.data);

  function set<K extends keyof LeaveSettingsOut>(key: K, value: LeaveSettingsOut[K]) {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Leave"
        title="Leave rules"
        lead="Changing these does not revisit decisions already made."
        actions={
          editable && (
            <Button
              variant="accent"
              icon={Save}
              loading={save.pending}
              disabled={!dirty}
              onClick={() => save.run()}
            >
              Save rules
            </Button>
          )
        }
      />

      {!editable && (
        <InlineNotice tone="info">
          You can read these but not change them — that is limited to the HR team.
        </InlineNotice>
      )}
      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
      {saved && !dirty && (
        <InlineNotice tone="positive">Saved. New requests use these rules.</InlineNotice>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-4">
          <PanelHead title="How many people can be off" />
          <div className="mt-4 space-y-4">
            <Field
              label="Maximum people off at once"
              required
              hint="A request that would take any day in its range past this is refused, unless HR overrides it."
            >
              <Input
                type="number"
                min={1}
                disabled={!editable}
                value={draft.max_concurrent}
                onChange={(e) => set("max_concurrent", Number(e.target.value))}
              />
            </Field>

            <Field
              label="Counted across"
              hint="Organisation-wide, or only within the requester's own teams."
            >
              <Select
                disabled={!editable}
                value={draft.limit_scope}
                onChange={(e) => set("limit_scope", e.target.value)}
              >
                <option value="organisation">The whole organisation</option>
                <option value="team">The requester&apos;s team</option>
              </Select>
            </Field>

            <Field
              label="Longest single request, in days"
              required
              hint="A guard against a typo in a date turning into a year off."
            >
              <Input
                type="number"
                min={1}
                disabled={!editable}
                value={draft.max_days_per_request}
                onChange={(e) => set("max_days_per_request", Number(e.target.value))}
              />
            </Field>
          </div>
        </Panel>

        <Panel className="p-4">
          <PanelHead title="Who decides, and who hears about it" />
          <div className="mt-4 space-y-5">
            <Toggle
              disabled={!editable}
              checked={draft.auto_decide}
              onChange={(next) => set("auto_decide", next)}
              label="Decide requests automatically"
              hint="On: a request under the limit is approved the moment it is made, and one over it is rejected with the reason. Off: everything waits for HR."
            />

            <Toggle
              disabled={!editable}
              checked={draft.notify_hr_by_email}
              onChange={(next) => set("notify_hr_by_email", next)}
              label="Email HR when a request needs a person"
              hint="Sent as the requester, through their own mailbox. Off by default."
            />

            <Field
              label="The HR team"
              hint="Members of this team decide requests and can change these rules. Naming the wrong team here can lock everyone out of the queue."
            >
              {teams.data ? (
                <Select
                  disabled={!editable}
                  value={draft.hr_team_slug}
                  onChange={(e) => set("hr_team_slug", e.target.value)}
                >
                  {/* Kept as an option even if it no longer exists, so a stale
                      setting is visible rather than silently swapped. */}
                  {!teams.data.some((t) => t.slug === draft.hr_team_slug) && (
                    <option value={draft.hr_team_slug}>
                      {draft.hr_team_slug} (no such team)
                    </option>
                  )}
                  {teams.data.map((team) => (
                    <option key={team.id} value={team.slug}>
                      {team.name} (/{team.slug})
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  disabled={!editable}
                  value={draft.hr_team_slug}
                  onChange={(e) => set("hr_team_slug", e.target.value)}
                />
              )}
            </Field>
          </div>
        </Panel>
      </div>
    </div>
  );
}
