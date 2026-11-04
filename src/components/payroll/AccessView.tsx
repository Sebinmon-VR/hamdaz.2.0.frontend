"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { PayrollAccessOverview, PayrollMember, PayrollPerson } from "@/lib/payroll";
import { Modal, PanelSkeleton } from "@/components/ui/feedback";
import { Btn, BtnLink, Labeled, SelectBox, TextBox } from "@/components/payroll/ui";

type Editing = { mode: "add" } | { mode: "edit"; member: PayrollMember } | null;

/**
 * Who can see payroll, and who can change it, as plain rows.
 *
 * Shown to every payroll reader, not just super admins: knowing exactly who
 * can see your salary is part of trusting the system with it. Only a super
 * admin changes the list.
 */
export function AccessView() {
  const { payroll } = useSession();
  const view = useSWR<PayrollAccessOverview>("/payroll/access");
  const [editing, setEditing] = useState<Editing>(null);

  if (view.error) return <p className="py-4 text-[13px] text-danger">{view.error.message}</p>;
  if (!view.data) return <PanelSkeleton lines={4} />;
  const v = view.data;
  const admin = payroll.can_admin;
  const byRole = (role: string) =>
    v.role_holders.filter((h) => h.roles.includes(role)).map((h) => h.person.display_name);
  const names = (list: string[]) => (list.length ? list.join(", ") : "Nobody");

  const rows: { who: string; what: string; names: string; action?: ReactNode }[] = [
    {
      who: "Super admins",
      what: "Everything",
      names: names(byRole("super_admin")),
      action: admin && (
        <BtnLink variant="ghost" icon={Pencil} href="/admin/roles/assignments">
          Roles
        </BtnLink>
      ),
    },
    { who: "CEO", what: "Sees and approves", names: names(byRole("ceo")) },
    {
      who: "Accounts team",
      what: "Sees",
      names: v.accounts_team_found
        ? names(v.accounts_members.map((p) => p.display_name))
        : `No team called "${v.accounts_team_slug}"`,
      action: admin && v.accounts_team_found && (
        <BtnLink variant="ghost" icon={Users} href={`/teams/${v.accounts_team_slug}/members`}>
          Members
        </BtnLink>
      ),
    },
  ];

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              <th className="border-b border-line px-3 py-2">Who</th>
              <th className="border-b border-line px-3 py-2">Can</th>
              <th className="border-b border-line px-3 py-2">People</th>
              <th className="w-28 border-b border-line px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.who}>
                <td className="border-b border-line px-3 py-2 font-medium text-ink">{r.who}</td>
                <td className="border-b border-line px-3 py-2 text-ink-3">{r.what}</td>
                <td className="border-b border-line px-3 py-2 text-ink-2">{r.names}</td>
                <td className="border-b border-line px-3 py-1 text-right">{r.action}</td>
              </tr>
            ))}
            {v.members.map((m) => (
              <tr key={m.user_id}>
                <td className="border-b border-line px-3 py-2 font-medium text-ink">{m.display_name}</td>
                <td className="border-b border-line px-3 py-2 text-ink-3">
                  {m.level === "processor" ? "Prepares payroll" : "Sees"}
                </td>
                <td className="border-b border-line px-3 py-2 text-ink-4">{m.note ?? m.email}</td>
                <td className="border-b border-line px-3 py-1 text-right">
                  {admin && (
                    <Btn variant="ghost" icon={Pencil} onClick={() => setEditing({ mode: "edit", member: m })}>
                      Edit
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && (
        <div className="mt-3">
          <Btn icon={UserPlus} onClick={() => setEditing({ mode: "add" })}>
            Add a person
          </Btn>
        </div>
      )}

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
      title={existing ? existing.display_name : "Give payroll access"}
      description="Anyone with access sees everything in payroll — salaries, bank details, payslips."
      footer={
        <>
          {existing &&
            (confirmRemove ? (
              <Btn variant="danger" icon={Trash2} loading={remove.pending} onClick={() => remove.run()}>
                Yes, remove
              </Btn>
            ) : (
              <Btn variant="ghost" icon={Trash2} onClick={() => setConfirmRemove(true)}>
                Remove access
              </Btn>
            ))}
          <span className="flex-1" />
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="accent" disabled={!userId} loading={save.pending} onClick={() => save.run()}>
            {existing ? "Save" : "Give access"}
          </Btn>
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {(save.error || remove.error) && (
          <p className="text-[12.5px] text-danger">{save.error ?? remove.error}</p>
        )}
        {!existing && (
          <Labeled label="Person" required>
            <SelectBox value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose…</option>
              {(people.data ?? [])
                .filter((p) => !taken.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} · {p.email}
                  </option>
                ))}
            </SelectBox>
          </Labeled>
        )}
        <Labeled label="Access">
          <SelectBox value={level} onChange={(e) => setLevel(e.target.value as PayrollMember["level"])}>
            <option value="processor">Prepares payroll — runs months, edits employees and salaries</option>
            <option value="viewer">Sees payroll only</option>
          </SelectBox>
        </Labeled>
        <Labeled label="Note" hint="Optional — why they have it.">
          <TextBox value={note} onChange={(e) => setNote(e.target.value)} />
        </Labeled>
      </div>
    </Modal>
  );
}
