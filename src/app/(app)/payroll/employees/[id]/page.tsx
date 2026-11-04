"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, isoDay, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  COUNTRY_NAME,
  blank,
  fyLabel,
  fyOf,
  type Country,
  type EmployeeFields,
  type PayrollEmployee,
  type PayrollEvent,
  type PayrollPerson,
  type SalaryLine,
} from "@/lib/payroll";
import { PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, IconButton, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";
import { PayrollOnly } from "@/components/payroll/PayrollOnly";
import { SalaryEditor, starterLines } from "@/components/payroll/SalaryEditor";
import { CountryBadge } from "@/components/payroll/badges";

export default function PayrollEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PayrollOnly>
      {id === "new" ? <EmployeeForm /> : <ExistingEmployee id={id} />}
    </PayrollOnly>
  );
}

const EMPTY: EmployeeFields = {
  user_id: null,
  code: "",
  full_name: "",
  email: null,
  designation: null,
  department: null,
  joined_on: "",
  left_on: null,
  bank_name: null,
  bank_account: null,
  iban: null,
  bank_routing: null,
  mol_person_id: null,
  ifsc: null,
  pan: null,
  uan: null,
  esi_number: null,
  pt_state: null,
  pf_enabled: true,
  pf_on_actual: false,
  eps_member: true,
  esi_mode: "auto",
  pt_override: null,
  tds_monthly_override: null,
  opening_fy: null,
  opening_taxable: "0",
  opening_tds: "0",
  notes: null,
};

function ExistingEmployee({ id }: { id: string }) {
  const employee = useSWR<PayrollEmployee>(`/payroll/employees/${id}`);
  if (employee.error) return <ErrorState error={employee.error} onRetry={() => employee.mutate()} />;
  if (!employee.data) return <PanelSkeleton lines={8} />;
  return <EmployeeForm existing={employee.data} onSaved={(next) => employee.mutate(next, { revalidate: false })} />;
}

function pick(e: PayrollEmployee): EmployeeFields {
  const out = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof EmployeeFields)[]) {
    (out as Record<string, unknown>)[key] = e[key];
  }
  return out;
}

/** Text inputs hold strings; the API wants null for "not set". */
function payload(f: EmployeeFields): EmployeeFields {
  return {
    ...f,
    code: f.code.trim(),
    full_name: f.full_name.trim(),
    email: blank(f.email),
    designation: blank(f.designation),
    department: blank(f.department),
    left_on: blank(f.left_on),
    bank_name: blank(f.bank_name),
    bank_account: blank(f.bank_account),
    iban: blank(f.iban),
    bank_routing: blank(f.bank_routing),
    mol_person_id: blank(f.mol_person_id),
    ifsc: blank(f.ifsc),
    pan: blank(f.pan),
    uan: blank(f.uan),
    esi_number: blank(f.esi_number),
    pt_state: blank(f.pt_state),
    pt_override: blank(f.pt_override),
    tds_monthly_override: blank(f.tds_monthly_override),
    opening_taxable: blank(f.opening_taxable) ?? "0",
    opening_tds: blank(f.opening_tds) ?? "0",
    notes: blank(f.notes),
  };
}

function EmployeeForm({
  existing,
  onSaved,
}: {
  existing?: PayrollEmployee;
  onSaved?: (next: PayrollEmployee) => void;
}) {
  const router = useRouter();
  const { payroll } = useSession();
  const editable = payroll.can_process;
  const people = useSWR<PayrollPerson[]>("/payroll/people");

  const [country, setCountry] = useState<Country>(existing?.country ?? "AE");
  const [form, setForm] = useState<EmployeeFields>(existing ? pick(existing) : EMPTY);
  const [salary, setSalary] = useState<SalaryLine[]>(starterLines(existing?.country ?? "AE"));
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof EmployeeFields>(key: K, value: EmployeeFields[K]) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }
  const text = (key: keyof EmployeeFields) => ({
    disabled: !editable,
    value: (form[key] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  const save = useAction(async () => {
    if (existing) {
      const next = await api.patch<PayrollEmployee>(`/payroll/employees/${existing.id}`, payload(form));
      onSaved?.(next);
      setSaved(true);
      return next;
    }
    const lines = salary.filter((l) => l.amount.trim());
    const next = await api.post<PayrollEmployee>("/payroll/employees", {
      ...payload(form),
      country,
      salary: lines.length
        ? { effective_from: form.joined_on, components: lines, note: "Salary on joining" }
        : null,
    });
    router.replace(`/payroll/employees/${next.id}`);
    return next;
  });
  const remove = useAction(async () => {
    await api.del(`/payroll/employees/${existing!.id}`);
    router.push("/payroll/employees");
  });

  const uae = country === "AE";

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Payroll · Employees"
        title={existing ? existing.full_name : "Add an employee"}
        count={existing ? existing.code : undefined}
        actions={
          editable && (
            <>
              {existing && (
                <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
                  Delete
                </Button>
              )}
              <Button variant="accent" icon={Save} loading={save.pending} onClick={() => save.run()}>
                {existing ? "Save" : "Add to payroll"}
              </Button>
            </>
          )
        }
      />

      {!editable && (
        <InlineNotice tone="info">Read only. Only a payroll processor can change employees.</InlineNotice>
      )}
      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
      {saved && <InlineNotice tone="positive">Saved. Draft months pick it up when recalculated.</InlineNotice>}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-4">
          <PanelHead title="Who" action={existing && <CountryBadge country={existing.country} />} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {!existing && (
              <Field label="Country" required hint="Decides the currency and the rules. Fixed once added.">
                <Select
                  disabled={!editable}
                  value={country}
                  onChange={(e) => {
                    const next = e.target.value as Country;
                    setCountry(next);
                    setSalary(starterLines(next));
                  }}
                >
                  <option value="AE">UAE (AED)</option>
                  <option value="IN">India (INR)</option>
                </Select>
              </Field>
            )}
            <Field label="Employee code" required>
              <Input {...text("code")} />
            </Field>
            <Field label="Full name" required className="sm:col-span-2">
              <Input {...text("full_name")} />
            </Field>
            <Field label="Designation">
              <Input {...text("designation")} />
            </Field>
            <Field label="Department">
              <Input {...text("department")} />
            </Field>
            <Field label="Email">
              <Input type="email" {...text("email")} />
            </Field>
            <Field label="Login" hint="Links approved unpaid leave from the Leave module into payroll.">
              <Select
                disabled={!editable}
                value={form.user_id ?? ""}
                onChange={(e) => set("user_id", e.target.value || null)}
              >
                <option value="">Not linked</option>
                {(people.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} · {p.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Joined on" required>
              <Input type="date" {...text("joined_on")} />
            </Field>
            <Field label="Last working day" hint="Set when somebody leaves; later months leave them out.">
              <Input type="date" {...text("left_on")} />
            </Field>
          </div>
        </Panel>

        <Panel className="p-4">
          <PanelHead title="Bank" hint={uae ? "Used for the WPS file" : "Used for the bank transfer sheet"} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Bank name">
              <Input {...text("bank_name")} />
            </Field>
            {uae ? (
              <>
                <Field label="IBAN" hint="AE and 21 digits.">
                  <Input {...text("iban")} />
                </Field>
                <Field label="Bank routing code" hint="9 digits — the WPS agent id of their bank or exchange.">
                  <Input {...text("bank_routing")} />
                </Field>
                <Field label="MOHRE person id" hint="14 digits, from the labour card.">
                  <Input {...text("mol_person_id")} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Account number">
                  <Input {...text("bank_account")} />
                </Field>
                <Field label="IFSC">
                  <Input {...text("ifsc")} />
                </Field>
              </>
            )}
          </div>
        </Panel>

        {!uae && (
          <Panel className="p-4 lg:col-span-2">
            <PanelHead title="Statutory (India)" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="PAN">
                <Input {...text("pan")} />
              </Field>
              <Field label="UAN" hint="12 digits, for the PF ECR file.">
                <Input {...text("uan")} />
              </Field>
              <Field label="ESI number">
                <Input {...text("esi_number")} />
              </Field>
              <Field label="Professional tax state" hint="Two letters: KA, MH, KL…">
                <Input {...text("pt_state")} />
              </Field>
              <Field label="ESI">
                <Select
                  disabled={!editable}
                  value={form.esi_mode}
                  onChange={(e) => set("esi_mode", e.target.value as EmployeeFields["esi_mode"])}
                >
                  <option value="auto">By the wage threshold</option>
                  <option value="yes">Always covered</option>
                  <option value="no">Not covered</option>
                </Select>
              </Field>
              <Field label="Fixed professional tax" hint="Instead of the state's slabs. Empty to use the slabs.">
                <Input inputMode="decimal" {...text("pt_override")} />
              </Field>
              <Field label="Fixed monthly TDS" hint="For the old regime or a special case. Empty to calculate.">
                <Input inputMode="decimal" {...text("tds_monthly_override")} />
              </Field>
              <div className="space-y-3">
                <Toggle disabled={!editable} checked={form.pf_enabled} onChange={(v) => set("pf_enabled", v)} label="Provident fund" />
                <Toggle disabled={!editable} checked={form.pf_on_actual} onChange={(v) => set("pf_on_actual", v)} label="PF on actual basic" hint="Above the ceiling." />
                <Toggle disabled={!editable} checked={form.eps_member} onChange={(v) => set("eps_member", v)} label="Pension (EPS) member" />
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-panel-2 p-4">
              <p className="text-[12.5px] font-medium">Earlier in the financial year</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Salary and TDS for months of this financial year paid before this system — without these, TDS
                is projected as if the year started this month.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field label="Financial year">
                  <Select
                    disabled={!editable}
                    value={form.opening_fy ?? ""}
                    onChange={(e) => set("opening_fy", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">None</option>
                    {[0, -1].map((offset) => {
                      const now = new Date();
                      const fy = fyOf(now.getFullYear(), now.getMonth() + 1) + offset;
                      return (
                        <option key={fy} value={fy}>
                          FY {fyLabel(fy)}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
                <Field label="Taxable salary already paid">
                  <Input inputMode="decimal" {...text("opening_taxable")} />
                </Field>
                <Field label="TDS already deducted">
                  <Input inputMode="decimal" {...text("opening_tds")} />
                </Field>
              </div>
            </div>
          </Panel>
        )}

        {!existing && (
          <Panel className="p-4 lg:col-span-2">
            <PanelHead title="Salary on joining" hint={`Monthly, in ${uae ? "AED" : "INR"}. Leave the amounts empty to add it later.`} />
            <div className="mt-4">
              <SalaryEditor country={country} lines={salary} onChange={setSalary} disabled={!editable} />
            </div>
          </Panel>
        )}

        <Panel className="p-4 lg:col-span-2">
          <PanelHead title="Notes" />
          <div className="mt-3">
            <Textarea {...text("notes")} />
          </div>
        </Panel>
      </div>

      {existing && <Salaries employee={existing} editable={editable} onSaved={onSaved} />}
      {existing && <EmployeeLog id={existing.id} />}

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this employee?"
        description={`${existing?.full_name ?? ""} and their salary history are removed. Somebody already in a submitted or approved month cannot be deleted — set a last working day instead.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep
            </Button>
            <Button variant="danger" loading={remove.pending} onClick={() => remove.run()}>
              Delete
            </Button>
          </>
        }
      >
        {remove.error && (
          <div className="pb-4">
            <InlineNotice tone="danger">{remove.error}</InlineNotice>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Salary history, newest first. A revision is a new row from a date, never an edit. */
function Salaries({
  employee,
  editable,
  onSaved,
}: {
  employee: PayrollEmployee;
  editable: boolean;
  onSaved?: (next: PayrollEmployee) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(isoDay(new Date()));
  const [lines, setLines] = useState<SalaryLine[]>(
    employee.current_salary
      ? employee.current_salary.components.map((c) => ({ ...c }))
      : starterLines(employee.country),
  );
  const [note, setNote] = useState("");

  const add = useAction(async () => {
    const next = await api.post<PayrollEmployee>(`/payroll/employees/${employee.id}/salaries`, {
      effective_from: from,
      components: lines.filter((l) => l.amount.trim()),
      note: note.trim() || null,
    });
    onSaved?.(next);
    setAdding(false);
    return next;
  });
  const remove = useAction(async (salaryId: string) => {
    const next = await api.del<PayrollEmployee>(`/payroll/employees/${employee.id}/salaries/${salaryId}`);
    if (next) onSaved?.(next);
    return next;
  });

  return (
    <Panel className="p-4">
      <PanelHead
        title="Salary"
        count={employee.salaries.length}
        hint={
          employee.current_salary
            ? `${amount(employee.current_salary.monthly_total, employee.currency)} a month now`
            : "No salary in force — this person is left out of payroll"
        }
        action={
          editable &&
          !adding && (
            <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
              New salary from a date
            </Button>
          )
        }
      />
      {(add.error || remove.error) && (
        <InlineNotice tone="danger" className="mt-3">
          {add.error ?? remove.error}
        </InlineNotice>
      )}
      {adding && (
        <div className="mt-4 space-y-4 rounded-2xl bg-panel-2 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" required hint="A month uses the structure in force on its last day.">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Reason">
              <Input value={note} placeholder="Annual increment, promotion…" onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <SalaryEditor country={employee.country} lines={lines} onChange={setLines} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="accent" loading={add.pending} onClick={() => add.run()}>
              Save salary
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 divide-y divide-line">
        {employee.salaries.map((s) => (
          <div key={s.id} className="flex flex-wrap items-start gap-3 py-3">
            <div className="w-36 shrink-0">
              <p className="text-[12.5px] font-medium">From {date(s.effective_from)}</p>
              {s.note && <p className="text-[11.5px] text-ink-4">{s.note}</p>}
            </div>
            <div className="min-w-0 flex-1 text-[12px] text-ink-3">
              {s.components.map((c) => `${c.name} ${amount(c.amount)}`).join(" · ")}
            </div>
            <span className="tnum text-[12.5px] font-semibold">{amount(s.monthly_total, employee.currency)}</span>
            {editable && (
              <IconButton
                size="sm"
                icon={Trash2}
                label="Delete this salary"
                onClick={() => remove.run(s.id)}
              />
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-4">
        {COUNTRY_NAME[employee.country]} rules. Approved months keep the figures they were paid with —
        changing a salary here never rewrites them.
      </p>
    </Panel>
  );
}

function EmployeeLog({ id }: { id: string }) {
  const events = useSWR<PayrollEvent[]>(`/payroll/employees/${id}/events`);
  if (!events.data?.length) return null;
  return (
    <Panel className="p-4">
      <PanelHead title="Changes" count={events.data.length} />
      <ol className="mt-3 space-y-2">
        {events.data.map((e) => (
          <li key={e.id} className="text-[12px] leading-relaxed">
            <span className="text-ink-2">{e.summary}</span>
            <span className="text-ink-4"> · {e.actor_name ?? "system"} · {relative(e.created_at)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
