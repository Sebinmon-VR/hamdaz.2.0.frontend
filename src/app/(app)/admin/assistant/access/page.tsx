"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { Ban, Check, KeyRound, Plus, ShieldAlert, Trash2, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  AccessRuleOut,
  AssistantSettingsOut,
  RoleOut,
  RuleEffect,
  RuleSubject,
  TeamOut,
} from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
} from "@/components/ui/feedback";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * Who gets the assistant.
 *
 * Two rules and one mode, and the interaction between them is the whole screen:
 *
 * * in **released to a list**, nobody reaches the assistant without a matching
 *   allow rule — which is how it is given to one team at a time
 * * in **everyone signed in**, allow rules do nothing at all and block rules
 *   take individuals away
 *
 * So an allow rule that is doing nothing is shown as doing nothing, rather than
 * sitting in the list looking like it is holding something open. Getting that
 * wrong is how somebody removes the rule that was not the one keeping the door
 * shut.
 *
 * **A block always beats an allow**, whatever the mode, and however many allow
 * rules name the same person.
 */
export default function AssistantAccessPage() {
  const session = useSession();
  const rules = useSWR<AccessRuleOut[]>("/assistant/admin/rules", { revalidateOnFocus: false });
  const settings = useSWR<AssistantSettingsOut>("/assistant/admin/settings", {
    revalidateOnFocus: false,
  });
  const [adding, setAdding] = useState(false);

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Assistant access" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Releasing the assistant, or withholding it, is a super admin's decision and the endpoints behind this screen enforce that themselves."
        />
      </>
    );
  }

  const allowList = settings.data?.audience_mode === "allow_list";
  const all = rules.data ?? [];
  const allows = all.filter((rule) => rule.effect === "allow");
  const blocks = all.filter((rule) => rule.effect === "block");

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Assistant access"
        count={all.length ? `${all.length} rules` : undefined}
        lead="A block always beats an allow."
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setAdding(true)}>
            Add a rule
          </Button>
        }
      />

      <AssistantAdminNav />

      {settings.data && (
        <InlineNotice tone={allowList ? "info" : "warn"}>
          {allowList ? (
            <>
              The assistant is <strong>released to a list</strong>. Nobody reaches it without
              an allow rule below, so this is the screen that hands it out.
            </>
          ) : (
            <>
              The assistant is open to <strong>everyone signed in</strong>. The allow rules
              below are doing nothing in this mode — only the blocks are. Switch to
              &ldquo;released to a list&rdquo; under{" "}
              <a href="/admin/assistant" className="underline underline-offset-2">
                Assistant settings
              </a>{" "}
              to make them count again.
            </>
          )}
        </InlineNotice>
      )}

      {rules.error ? (
        <ErrorState error={rules.error} onRetry={() => rules.mutate()} />
      ) : !rules.data ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <RuleList
            title="Allowed"
            hint={allowList ? "Reaches the assistant" : "Doing nothing in this mode"}
            icon={UserCheck}
            rules={allows}
            muted={!allowList}
            onChanged={() => void rules.mutate()}
          />
          <RuleList
            title="Blocked"
            hint="Never reaches it, whatever else says otherwise"
            icon={Ban}
            rules={blocks}
            onChanged={() => void rules.mutate()}
          />
        </div>
      )}

      <AddRule
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          void rules.mutate();
        }}
      />
    </>
  );
}

function RuleList({
  title,
  hint,
  icon: Icon,
  rules,
  muted,
  onChanged,
}: {
  title: string;
  hint: string;
  icon: React.ElementType;
  rules: AccessRuleOut[];
  muted?: boolean;
  onChanged: () => void;
}) {
  return (
    <Panel className="p-5">
      <PanelHead
        title={
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-ink-4" strokeWidth={1.9} />
            {title}
          </span>
        }
        count={rules.length}
        hint={hint}
      />

      {rules.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-ink-4">Nothing here.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {rules.map((rule) => (
            <Rule key={rule.id} rule={rule} muted={muted} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Rule({
  rule,
  muted,
  onChanged,
}: {
  rule: AccessRuleOut;
  muted?: boolean;
  onChanged: () => void;
}) {
  const toggle = useAction(async () => {
    await api.patch(`/assistant/admin/rules/${rule.id}`, { enabled: !rule.enabled });
    onChanged();
  });
  const remove = useAction(async () => {
    await api.del(`/assistant/admin/rules/${rule.id}`);
    onChanged();
  });

  const off = !rule.enabled || muted;

  return (
    <li
      className={clsx(
        "flex flex-wrap items-center gap-2.5 rounded-[13px] bg-panel-2 px-3.5 py-2.5 transition",
        off && "opacity-55",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">
          {rule.subject_label}
        </span>
        <span className="block truncate text-[11px] text-ink-4">
          {humanise(rule.subject_type)} · added {date(rule.created_at)}
          {rule.note ? ` · ${rule.note}` : ""}
        </span>
      </span>

      {!rule.enabled && <Badge tone="neutral">Switched off</Badge>}

      <button
        onClick={() => void toggle.run()}
        disabled={toggle.pending}
        title={rule.enabled ? "Switch this rule off, keeping it" : "Switch it back on"}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 transition hover:bg-panel-3 hover:text-ink disabled:opacity-40"
      >
        <Check className="size-3.5" strokeWidth={2.4} />
      </button>
      <button
        onClick={() => void remove.run()}
        disabled={remove.pending}
        title="Delete this rule"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
      >
        <Trash2 className="size-3.5" strokeWidth={1.9} />
      </button>

      {(toggle.error || remove.error) && (
        <p className="w-full text-[11px] text-danger">{toggle.error ?? remove.error}</p>
      )}
    </li>
  );
}

/**
 * Naming somebody.
 *
 * The backend takes a user id, an Entra object id or an email; a team handle or
 * id; or a role key — so the field changes shape with the kind rather than
 * asking for an identifier nobody has to hand. Teams and roles are pickers
 * because both are short, closed lists; a person is typed, because the
 * organisation is neither.
 */
function AddRule({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState<RuleSubject>("team");
  const [subject, setSubject] = useState("");
  const [effect, setEffect] = useState<RuleEffect>("allow");
  const [note, setNote] = useState("");

  const teams = useSWR<TeamOut[]>(open && kind === "team" ? "/teams" : null);
  const roles = useSWR<RoleOut[]>(open && kind === "role" ? "/roles?scope=global" : null);

  const add = useAction(async () => {
    await api.post<AccessRuleOut>("/assistant/admin/rules", {
      subject_type: kind,
      subject: subject.trim(),
      effect,
      enabled: true,
      note: note.trim() || null,
    });
    setSubject("");
    setNote("");
    onAdded();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a rule"
      description="Name a person, a team or a role, and say whether the assistant reaches them."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            icon={KeyRound}
            loading={add.pending}
            disabled={!subject.trim()}
            onClick={() => void add.run()}
          >
            Add the rule
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Applies to">
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as RuleSubject);
                setSubject("");
              }}
            >
              <option value="team">A team</option>
              <option value="role">A role</option>
              <option value="user">One person</option>
            </Select>
          </Field>
          <Field label="Effect">
            <Select
              value={effect}
              onChange={(event) => setEffect(event.target.value as RuleEffect)}
            >
              <option value="allow">Allow — may use the assistant</option>
              <option value="block">Block — never, whatever else says</option>
            </Select>
          </Field>
        </div>

        {kind === "team" ? (
          <Field label="Team" hint="Its handle is what the rule stores.">
            <Select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="">Choose a team</option>
              {(teams.data ?? [])
                .filter((team) => !team.archived_at)
                .map((team) => (
                  <option key={team.id} value={team.slug}>
                    {team.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : kind === "role" ? (
          <Field label="Role" hint="Everybody holding it, now and later.">
            <Select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="">Choose a role</option>
              {(roles.data ?? []).map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label="Person"
            hint="An email address, a Hamdaz user id, or an Entra object id — whichever you have."
          >
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="someone@hamdaz.com"
              autoFocus
            />
          </Field>
        )}

        <Field label="Note" hint="Why, for whoever reads this list in six months.">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Pilot group, agreed with operations"
            maxLength={2000}
          />
        </Field>

        {effect === "block" && (
          <InlineNotice tone="warn">
            A block wins over every allow rule, including one naming the same person
            directly. It is the way to take the assistant away from somebody without
            unpicking why they had it.
          </InlineNotice>
        )}

        {add.error && <p className="text-[12px] text-danger">{add.error}</p>}
      </div>
    </Modal>
  );
}
