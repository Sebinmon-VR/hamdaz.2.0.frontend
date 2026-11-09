"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { relative } from "@/lib/format";
import type { ApprovalSettingsIn, ApprovalSettingsOut } from "@/lib/types";
import type { StaffRow } from "@/lib/staff";
import { X } from "lucide-react";
import { Button, Input, Select, Toggle } from "@/components/ui/controls";
import { InlineNotice, Modal } from "@/components/ui/feedback";

type RuleKey = Exclude<keyof ApprovalSettingsIn, "extra_emails" | "named_approver_ids">;

const RULES: { key: RuleKey; label: string; hint: string }[] = [
  {
    key: "notify_team_approvers",
    label: "The team's approvers",
    hint: "Everyone holding the Approver role in the quote's team.",
  },
  {
    key: "notify_team_managers",
    label: "The team's managers",
    hint: "Everyone holding the Team manager role in the quote's team.",
  },
  {
    key: "notify_managers",
    label: "Managers",
    hint: "Everyone with the global Manager role, whatever the team.",
  },
  { key: "notify_ceo", label: "CEO", hint: "Whoever holds the CEO role." },
  {
    key: "notify_super_admins",
    label: "Super admins",
    hint: "Everyone with the Super admin role.",
  },
];

/**
 * Who is emailed when a quote is sent for approval. Super admins only.
 *
 * Only the mail: who may approve is not changed here. The same people hear
 * about a requester's comment and a reopened negotiation.
 */
export function ApprovalSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, error, mutate } = useSWR<ApprovalSettingsOut>(
    open ? "/quote-requests/approval-settings" : null,
    { revalidateOnFocus: false },
  );
  const [draft, setDraft] = useState<ApprovalSettingsIn | null>(null);
  const [emails, setEmails] = useState("");
  const [named, setNamed] = useState<{ user_id: string; name: string }[]>([]);
  // Every local user, for the named-approver picker. A super admin reads it.
  const people = useSWR<StaffRow[]>(open ? "/hr/staff?status=active" : null, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (data) {
      setDraft({
        notify_team_approvers: data.notify_team_approvers,
        notify_team_managers: data.notify_team_managers,
        notify_managers: data.notify_managers,
        notify_ceo: data.notify_ceo,
        notify_super_admins: data.notify_super_admins,
        extra_emails: data.extra_emails,
      });
      setEmails(data.extra_emails.join(", "));
      setNamed((data.named_approvers ?? []).map((p) => ({ user_id: p.user_id, name: p.name })));
    }
  }, [data]);

  const save = useAction(async () => {
    if (!draft) return;
    const next = await api.put<ApprovalSettingsOut>("/quote-requests/approval-settings", {
      ...draft,
      extra_emails: emails
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean),
      named_approver_ids: named.map((p) => p.user_id),
    });
    await mutate(next, { revalidate: false });
    return next;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Approval request settings"
      description="Who is emailed when a quote is sent for approval, and who else may approve. The switches change only the mail; named approvers may also open and decide quotes."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!draft}
            onClick={async () => {
              if (await save.run()) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {error && (
        <InlineNotice tone="danger">
          {error instanceof Error ? error.message : "The settings could not be loaded."}
        </InlineNotice>
      )}
      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

      {draft && (
        <div className="space-y-4">
          <div className="border-b border-line pb-4">
            <span className="block text-[13px] font-medium text-ink">Named approvers</span>
            <span className="mt-1 block text-[12px] text-ink-3">
              Specific people, in any team, who may open and approve any team&rsquo;s quote and
              are always emailed. They see quotes waiting for approval, not drafts.
            </span>
            <ul className="mt-2 divide-y divide-line text-[13px]">
              {named.map((p) => (
                <li key={p.user_id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-ink">{p.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setNamed(named.filter((n) => n.user_id !== p.user_id))}
                    className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-panel-2 hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Select
              className="mt-2 h-9! text-[13px]!"
              value=""
              onChange={(e) => {
                const p = people.data?.find((r) => r.user_id === e.target.value);
                if (p) setNamed([...named, { user_id: p.user_id, name: p.name }]);
              }}
            >
              <option value="">Add a person…</option>
              {(people.data ?? [])
                .filter((r) => !named.some((n) => n.user_id === r.user_id))
                .map((r) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.name} — {r.email}
                  </option>
                ))}
            </Select>
          </div>
          {RULES.map((rule) => (
            <Toggle
              key={rule.key}
              checked={draft[rule.key]}
              onChange={(next) => setDraft({ ...draft, [rule.key]: next })}
              label={rule.label}
              hint={rule.hint}
            />
          ))}
          <label className="block">
            <span className="block text-[13px] font-medium text-ink">Also send to</span>
            <span className="mt-1 block text-[12px] text-ink-3">
              Other addresses, comma-separated: a shared approvals mailbox, a finance lead.
            </span>
            <Input
              className="mt-2"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="approvals@hamdaz.com"
            />
          </label>

          {data && data.preview.length > 0 && (
            <div className="rounded-[12px] bg-panel-2 px-3 py-2.5">
              <p className="micro mb-1.5 text-ink-4">Right now, as saved</p>
              <ul className="space-y-1 text-[12px] leading-snug">
                {data.preview.map((team) => (
                  <li key={team.team_id}>
                    <span className="font-medium">{team.team_name}</span>
                    <span className="text-ink-3">
                      {" — "}
                      {team.recipients.length > 0
                        ? team.recipients.join(", ")
                        : "nobody; the request would not be emailed"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data?.updated_by_name && data.updated_at && (
            <p className="text-[11.5px] text-ink-4">
              Last changed by {data.updated_by_name}, {relative(data.updated_at)}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
