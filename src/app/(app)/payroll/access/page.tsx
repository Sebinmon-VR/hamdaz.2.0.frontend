"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { PayrollAccessOverview, PayrollMember, PayrollPerson } from "@/lib/payroll";
import { Avatar, Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, LinkButton, Select } from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";
import { PayrollOnly } from "@/components/payroll/PayrollOnly";

export default function PayrollAccessPage() {
  return (
    <PayrollOnly>
      <PayrollAccess />
    </PayrollOnly>
  );
}

type Editing = { mode: "add" } | { mode: "edit"; member: PayrollMember } | null;

/**
 * Who can see payroll, and who can change it.
 *
 * Shown to every payroll reader, not just super admins: knowing exactly who
 * can see your salary is part of trusting the system with it. Only a super
 * admin changes the list.
 */
function PayrollAccess() {
  const { payroll } = useSession();
  const view = useSWR<PayrollAccessOverview>("/payroll/access");
  const [editing, setEditing] = useState<Editing>(null);

  if (view.error) return <ErrorState error={view.error} onRetry={() => view.mutate()} />;
  if (!view.data) return <PanelSkeleton lines={6} />;
  const v = view.data;
  const admin = payroll.can_admin;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Payroll"
        title="Payroll access"
        actions={
          admin && (
            <Button variant="accent" icon={UserPlus} onClick={() => setEditing({ mode: "add" })}>
              Add a person
            </Button>
          )
        }
      />

      <InlineNotice tone="info">
        <b>Reading</b> payroll: the Accounts team, super admins, the CEO, and everyone on the list
        below. <b>Processing</b> it — employees, salaries, the month&apos;s figures, submitting — the
        processors below and the super admins. <b>Approving</b> a month: a super admin or the CEO;
        the CEO never approves a month they submitted. <b>Super admins can do anything</b>, including
        changing this list.
      </InlineNotice>

      <Panel className="p-4">
        <PanelHead title="Access list" count={v.members.length} hint="Named by a super admin" />
        {v.members.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-ink-3">
            Nobody yet — only the super admins can process payroll.
            {admin ? " Add the person who runs it as a processor." : ""}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-line">
            {v.members.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={m.display_name} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{m.display_name}</p>
                  <p className="text-[11.5px] text-ink-4">
                    {m.email}
                    {m.note ? ` · ${m.note}` : ""} · added {relative(m.created_at)}
                    {m.added_by_name ? ` by ${m.added_by_name}` : ""}
                  </p>
                </div>
                <Badge tone={m.level === "processor" ? "accent" : "neutral"}>
                  {m.level === "processor" ? "Can process" : "Can read"}
                </Badge>
                {admin && (
                  <Button
                    size="sm"
                    icon={Pencil}
                    onClick={() => setEditing({ mode: "edit", member: m })}
                  >
                    Edit
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-4">
          <PanelHead
            title="Accounts team"
            count={v.accounts_members.length}
            hint={`Team "${v.accounts_team_slug}" — reads payroll`}
            action={
              admin &&
              v.accounts_team_found && (
                <LinkButton
                  size="sm"
                  icon={Users}
                  href={`/teams/${v.accounts_team_slug}/members`}
                >
                  Edit members
                </LinkButton>
              )
            }
          />
          {!v.accounts_team_found && (
            <InlineNotice tone="warn" className="mt-3">
              There is no team called &quot;{v.accounts_team_slug}&quot;. Set the right one in{" "}
              <Link className="underline" href="/payroll/settings">
                payroll settings
              </Link>
              .
            </InlineNotice>
          )}
          <PeopleList people={v.accounts_members} />
          <p className="mt-2 text-[11.5px] text-ink-4">
            Reading only — being on the team does not let somebody process payroll. To let one of
            them process it, add them to the access list above as a processor. Which team counts as
            Accounts is set in{" "}
            <Link className="underline" href="/payroll/settings">
              payroll settings
            </Link>
            .
          </p>
        </Panel>
        <Panel className="p-4">
          <PanelHead
            title="By role"
            count={v.role_holders.length}
            hint="Super admins can do anything; the CEO reads and approves"
            action={
              admin && (
                <LinkButton size="sm" icon={Pencil} href="/admin/roles/assignments">
                  Edit roles
                </LinkButton>
              )
            }
          />
          <div className="mt-3 divide-y divide-line">
            {v.role_holders.map((h) => (
              <div key={h.person.id} className="flex items-center gap-3 py-2">
                <Avatar name={h.person.display_name} />
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{h.person.display_name}</span>
                {h.roles.map((r) => (
                  <Badge key={r} tone="info">
                    {r === "ceo" ? "CEO" : "Super admin"}
                  </Badge>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {admin && editing && (
        <MemberDialog
          editing={editing}
          taken={new Set(v.members.map((m) => m.user_id))}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void view.mutate();
          }}
        />
      )}
    </div>
  );
}

function PeopleList({ people }: { people: PayrollPerson[] }) {
  if (!people.length) return <p className="mt-3 text-[12.5px] text-ink-3">Nobody.</p>;
  return (
    <div className="mt-3 divide-y divide-line">
      {people.map((p) => (
        <div key={p.id} className="flex items-center gap-3 py-2">
          <Avatar name={p.display_name} />
          <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.display_name}</span>
          <span className="truncate text-[11.5px] text-ink-4">{p.email}</span>
        </div>
      ))}
    </div>
  );
}

/** Adding somebody, or editing what somebody already on the list may do. */
function MemberDialog({
  editing,
  taken,
  onClose,
  onDone,
}: {
  editing: NonNullable<Editing>;
  taken: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const existing = editing.mode === "edit" ? editing.member : null;
  const people = useSWR<PayrollPerson[]>(existing ? null : "/payroll/people");
  const [userId, setUserId] = useState(existing?.user_id ?? "");
  const [level, setLevel] = useState<PayrollMember["level"]>(existing?.level ?? "processor");
  const [note, setNote] = useState(existing?.note ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = useAction(async () => {
    await api.put(`/payroll/access/${userId}`, { level, note: note.trim() || null });
    onDone();
  });
  const remove = useAction(async () => {
    await api.del(`/payroll/access/${userId}`);
    onDone();
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.display_name}'s access` : "Give somebody payroll access"}
      description="Readers see everything in payroll — salaries, bank details, payslips. Processors can also change it."
      footer={
        <>
          {existing &&
            (confirmRemove ? (
              <Button variant="danger" icon={Trash2} loading={remove.pending} onClick={() => remove.run()}>
                Yes, remove their access
              </Button>
            ) : (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            ))}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!userId} loading={save.pending} onClick={() => save.run()}>
            {existing ? "Save" : "Give access"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {(save.error || remove.error) && (
          <InlineNotice tone="danger">{save.error ?? remove.error}</InlineNotice>
        )}
        <Field label="Person" required>
          {existing ? (
            <Input disabled value={`${existing.display_name} · ${existing.email}`} />
          ) : (
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose…</option>
              {(people.data ?? [])
                .filter((p) => !taken.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} · {p.email}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Access">
          <Select value={level} onChange={(e) => setLevel(e.target.value as PayrollMember["level"])}>
            <option value="processor">Can process — prepare months, edit employees and salaries</option>
            <option value="viewer">Can read only</option>
          </Select>
        </Field>
        <Field label="Note" hint="Optional — why they have it.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
