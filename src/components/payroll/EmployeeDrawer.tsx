"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, dateTime, isoDay } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  NO_STATUTORY,
  WITH_STATUTORY,
  blank,
  employeeGaps,
  fyLabel,
  fyOf,
  hasStatutory,
  suggestCode,
  type Country,
  type EmployeeFields,
  type PayrollEmployee,
  type PayrollEvent,
  type PayrollPerson,
  type PayrollSettings,
  type SalaryLine,
} from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";
import { Toggle } from "@/components/ui/controls";
import { Modal, PanelSkeleton } from "@/components/ui/feedback";
import { AreaBox, Btn, IconBtn, Labeled, Note, SelectBox, TextBox } from "@/components/payroll/ui";
import { Drawer, DrawerSection } from "@/components/payroll/Drawer";
import { SalaryEditor, starterLines } from "@/components/payroll/SalaryEditor";
import { CountryBadge } from "@/components/payroll/badges";

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
  ...NO_STATUTORY,
  opening_fy: null,
  opening_taxable: "0",
  opening_tds: "0",
  notes: null,
};

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

/** One employee — or a new one — in the side panel over the list. */
export function EmployeeDrawer({
  id,
  country,
  employees,
  onClose,
}: {
  id: string;
  country: Country;
  employees: PayrollEmployee[];
  onClose: () => void;
}) {
  const isNew = id === "new";
  const employee = useSWR<PayrollEmployee>(isNew ? null : `/payroll/employees/${id}`);

  if (isNew) {
    return <Editor defaultCountry={country} employees={employees} onClose={onClose} />;
  }
  // keepPreviousData hands back the last person opened until this one arrives;
  // a form seeded from that would save one person's details over another's.
  if (!employee.data || employee.data.id !== id) {
    return (
      <Drawer open onClose={onClose} title="Employee">
        {employee.error ? (
          <p className="text-[13px] text-danger">{employee.error.message}</p>
        ) : (
          <PanelSkeleton lines={8} />
        )}
      </Drawer>
    );
  }
  return (
    <Editor
      key={employee.data.id}
      existing={employee.data}
      defaultCountry={employee.data.country}
      employees={employees}
      onClose={onClose}
      onSalaryChanged={(next) => employee.mutate(next, { revalidate: false })}
    />
  );
}

function Editor({
  existing,
  defaultCountry,
  employees,
  onClose,
  onSalaryChanged,
}: {
  existing?: PayrollEmployee;
  defaultCountry: Country;
  employees: PayrollEmployee[];
  onClose: () => void;
  onSalaryChanged?: (next: PayrollEmployee) => void;
}) {
  const { payroll } = useSession();
  const editable = payroll.can_process;
  const people = useSWR<PayrollPerson[]>("/payroll/people");

  const [country, setCountry] = useState<Country>(existing?.country ?? defaultCountry);
  const original = useMemo(
    () => (existing ? pick(existing) : { ...EMPTY, code: suggestCode(employees, defaultCountry) }),
    // Seeded once per drawer: a list refresh must not rewrite a code being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing],
  );
  const [form, setForm] = useState<EmployeeFields>(original);
  const [salary, setSalary] = useState<SalaryLine[]>(starterLines(country));
  const [deleting, setDeleting] = useState(false);
  const [history, setHistory] = useState(false);

  const statutory = country === "IN" && hasStatutory(form);
  const settings = useSWR<PayrollSettings>(statutory ? "/payroll/settings" : null);

  function set<K extends keyof EmployeeFields>(key: K, value: EmployeeFields[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  const text = (key: keyof EmployeeFields) => ({
    disabled: !editable,
    value: (form[key] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  const dirty = JSON.stringify(form) !== JSON.stringify(original) || country !== (existing?.country ?? defaultCountry);
  const required = [
    !form.full_name.trim() && "name",
    !form.code.trim() && "employee code",
    !form.joined_on && "joining date",
  ].filter(Boolean) as string[];
  const salaryLines = salary.filter((l) => l.amount.trim());

  const save = useAction(async () => {
    if (existing) {
      await api.patch<PayrollEmployee>(`/payroll/employees/${existing.id}`, payload(form));
    } else {
      await api.post<PayrollEmployee>("/payroll/employees", {
        ...payload(form),
        country,
        salary: salaryLines.length
          ? { effective_from: form.joined_on, components: salaryLines, note: "Salary on joining" }
          : null,
      });
    }
    onClose();
  });
  const remove = useAction(async () => {
    await api.del(`/payroll/employees/${existing!.id}`);
    onClose();
  });

  const gaps = existing ? employeeGaps(existing) : [];
  const peopleList = people.data ?? [];
  const linkedMissing =
    form.user_id && existing?.user_name && !peopleList.some((p) => p.id === form.user_id);
  const ptStates = Object.keys(settings.data?.in_pt_slabs ?? {}).sort();

  const footer = editable ? (
    <>
      {existing && (
        <Btn variant="ghost" icon={Trash2} onClick={() => setDeleting(true)}>
          Delete
        </Btn>
      )}
      <span className={`min-w-0 flex-1 truncate text-[12px] ${save.error ? "text-danger" : "text-ink-3"}`}>
        {save.error ?? (required.length && (dirty || !existing) ? `Still needed: ${required.join(", ")}` : "")}
      </span>
      <Btn variant="ghost" onClick={onClose}>
        Cancel
      </Btn>
      <Btn
        variant="accent"
        loading={save.pending}
        disabled={required.length > 0 || (existing ? !dirty : false)}
        onClick={() => save.run()}
      >
        {existing ? "Save" : "Add employee"}
      </Btn>
    </>
  ) : (
    <>
      <span className="flex-1 text-[12px] text-ink-3">Read only — payroll processors change employees.</span>
      <Btn onClick={onClose}>Close</Btn>
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={existing ? existing.full_name : "Add an employee"}
      subtitle={
        existing ? (
          <span className="inline-flex items-center gap-2">
            <CountryBadge country={existing.country} />
            {existing.code}
            {existing.current_salary &&
              ` · ${amount(existing.current_salary.monthly_total, existing.currency)} a month`}
            {!existing.active && ` · left ${date(existing.left_on)}`}
          </span>
        ) : (
          "They are included in every month you run from their joining date."
        )
      }
      footer={footer}
    >
      {gaps.length > 0 && (
        <div className="-mx-5 -mt-4 mb-4 [&+section]:border-t-0 [&+section]:pt-0">
          <Note tone="warn">
            Missing: <b>{gaps.join(", ")}</b>.{" "}
            {gaps.includes("salary") ? "Without a salary they are left out of payroll." : "The bank file needs these."}
          </Note>
        </div>
      )}

      <DrawerSection title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          {!existing && (
            <Labeled label="Country" required>
              <SelectBox
                disabled={!editable}
                value={country}
                onChange={(e) => {
                  const next = e.target.value as Country;
                  setCountry(next);
                  setSalary(starterLines(next));
                  set("code", suggestCode(employees, next));
                }}
              >
                <option value="IN">India (INR)</option>
                <option value="AE">UAE (AED)</option>
              </SelectBox>
            </Labeled>
          )}
          <Labeled label="Login" hint="Picks up their name and email, and their approved unpaid leave.">
            <SelectBox
              disabled={!editable}
              value={form.user_id ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const person = peopleList.find((p) => p.id === id);
                setForm((f) => ({
                  ...f,
                  user_id: id,
                  full_name: person && !f.full_name.trim() ? person.display_name : f.full_name,
                  email: person && !f.email?.trim() ? person.email : f.email,
                }));
              }}
            >
              <option value="">No login</option>
              {linkedMissing && <option value={form.user_id!}>{existing!.user_name}</option>}
              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </SelectBox>
          </Labeled>
          <Labeled label="Name" required>
            <TextBox {...text("full_name")} />
          </Labeled>
          <Labeled label="Employee code" required>
            <TextBox {...text("code")} />
          </Labeled>
          <Labeled label="Designation">
            <TextBox {...text("designation")} />
          </Labeled>
          <Labeled label="Department">
            <TextBox {...text("department")} />
          </Labeled>
          <Labeled label="Joined on" required>
            <TextBox type="date" {...text("joined_on")} />
          </Labeled>
          {existing ? (
            <Labeled label="Last working day" hint="Only when somebody leaves.">
              <TextBox type="date" {...text("left_on")} />
            </Labeled>
          ) : (
            <Labeled label="Email">
              <TextBox type="email" {...text("email")} />
            </Labeled>
          )}
        </div>
      </DrawerSection>

      <DrawerSection title="Salary" hint={`Monthly, in ${country === "AE" ? "AED" : "INR"}`}>
        {existing ? (
          <Salaries employee={existing} editable={editable} onSaved={onSalaryChanged} />
        ) : (
          <SalaryEditor country={country} lines={salary} onChange={setSalary} disabled={!editable} />
        )}
      </DrawerSection>

      <DrawerSection title="Bank details" hint="For the bank transfer">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Bank name">
            <TextBox {...text("bank_name")} />
          </Labeled>
          {country === "AE" ? (
            <>
              <Labeled label="IBAN" hint="AE and 21 digits.">
                <TextBox {...text("iban")} />
              </Labeled>
              <Labeled label="Bank routing code" hint="9 digits, for the WPS file.">
                <TextBox inputMode="numeric" {...text("bank_routing")} />
              </Labeled>
              <Labeled label="MOHRE person id" hint="14 digits, from the labour card.">
                <TextBox inputMode="numeric" {...text("mol_person_id")} />
              </Labeled>
            </>
          ) : (
            <>
              <Labeled label="Account number">
                <TextBox inputMode="numeric" {...text("bank_account")} />
              </Labeled>
              <Labeled label="IFSC" hint="11 characters, e.g. HDFC0001234.">
                <TextBox {...text("ifsc")} />
              </Labeled>
            </>
          )}
        </div>
      </DrawerSection>

      {country === "IN" && (
        <DrawerSection title="Deductions">
          <Toggle
            disabled={!editable}
            checked={statutory}
            onChange={(on) => setForm((f) => ({ ...f, ...(on ? WITH_STATUTORY : NO_STATUTORY) }))}
            label="Deduct PF, ESI, professional tax and TDS"
            hint={
              statutory
                ? "Worked out by law from the salary. The fields below fine-tune it."
                : "Off: nothing is deducted by law — net pay is the salary, less unpaid days and anything typed into the month."
            }
          />
          {statutory && (
            <div className="mt-3 space-y-3 rounded-md border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="PAN" hint="Needed for TDS.">
                  <TextBox {...text("pan")} />
                </Labeled>
                <Labeled label="UAN" hint="12 digits, for the PF return.">
                  <TextBox inputMode="numeric" {...text("uan")} />
                </Labeled>
                <Labeled label="Professional tax state" hint={ptStates.length ? `Slabs set for ${ptStates.join(", ")}.` : "Two letters, e.g. KL."}>
                  <TextBox list="payroll-pt-states" {...text("pt_state")} />
                  <datalist id="payroll-pt-states">
                    {ptStates.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Labeled>
                <Labeled label="ESI">
                  <SelectBox
                    disabled={!editable}
                    value={form.esi_mode}
                    onChange={(e) => set("esi_mode", e.target.value as EmployeeFields["esi_mode"])}
                  >
                    <option value="auto">By the wage limit</option>
                    <option value="yes">Always</option>
                    <option value="no">Never</option>
                  </SelectBox>
                </Labeled>
                <Labeled label="ESI number">
                  <TextBox {...text("esi_number")} />
                </Labeled>
                <Labeled label="Fixed professional tax" hint="Empty to use the state's slabs.">
                  <TextBox inputMode="decimal" {...text("pt_override")} />
                </Labeled>
                <Labeled label="Fixed monthly TDS" hint="Empty to calculate it.">
                  <TextBox inputMode="decimal" {...text("tds_monthly_override")} />
                </Labeled>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Toggle disabled={!editable} checked={form.pf_enabled} onChange={(v) => set("pf_enabled", v)} label="Provident fund" />
                <Toggle disabled={!editable} checked={form.eps_member} onChange={(v) => set("eps_member", v)} label="Pension (EPS)" />
                <Toggle disabled={!editable} checked={form.pf_on_actual} onChange={(v) => set("pf_on_actual", v)} label="PF above the ceiling" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Labeled label="Earlier this FY" hint="Paid before this system.">
                  <SelectBox
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
                  </SelectBox>
                </Labeled>
                <Labeled label="Taxable salary paid">
                  <TextBox inputMode="decimal" {...text("opening_taxable")} />
                </Labeled>
                <Labeled label="TDS already deducted">
                  <TextBox inputMode="decimal" {...text("opening_tds")} />
                </Labeled>
              </div>
            </div>
          )}
        </DrawerSection>
      )}

      <DrawerSection title="Notes">
        <AreaBox {...text("notes")} placeholder="Anything the next person running payroll should know." />
        {existing && (
          <button className="mt-3 text-[12px] font-medium text-ink-3 underline" onClick={() => setHistory((h) => !h)}>
            {history ? "Hide the change history" : "Show the change history"}
          </button>
        )}
        {existing && history && <EmployeeLog id={existing.id} />}
      </DrawerSection>

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this employee?"
        description={`${existing?.full_name ?? ""} and their salary history are removed. Somebody already in an approved month cannot be deleted — set a last working day instead.`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDeleting(false)}>
              Keep
            </Btn>
            <Btn variant="danger" loading={remove.pending} onClick={() => remove.run()}>
              Delete
            </Btn>
          </>
        }
      >
        {remove.error && (
          <p className="pb-4 text-[12.5px] text-danger">{remove.error}</p>
        )}
      </Modal>
    </Drawer>
  );
}

/** The salary in force, a change from a date, and the ones before. */
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
  const [lines, setLines] = useState<SalaryLine[]>([]);
  const [note, setNote] = useState("");

  function start() {
    setLines(
      employee.current_salary
        ? employee.current_salary.components.map((c) => ({ ...c }))
        : starterLines(employee.country),
    );
    setFrom(isoDay(new Date()));
    setNote("");
    setAdding(true);
  }

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
    <div className="space-y-3">
      {(add.error || remove.error) && <p className="text-[12.5px] text-danger">{add.error ?? remove.error}</p>}
      {adding ? (
        <div className="space-y-3 rounded-md border border-line p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="New salary from" required>
              <TextBox type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Labeled>
            <Labeled label="Reason">
              <TextBox value={note} placeholder="Increment, promotion…" onChange={(e) => setNote(e.target.value)} />
            </Labeled>
          </div>
          <SalaryEditor country={employee.country} lines={lines} onChange={setLines} />
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Btn>
            <Btn variant="accent" loading={add.pending} disabled={!from} onClick={() => add.run()}>
              Save salary
            </Btn>
          </div>
        </div>
      ) : (
        editable && (
          <Btn icon={Plus} onClick={start}>
            {employee.salaries.length ? "Change salary" : "Add a salary"}
          </Btn>
        )
      )}
      {employee.salaries.length === 0 && !adding && (
        <p className="text-[12.5px] text-ink-3">No salary yet — they are left out of payroll until one is added.</p>
      )}
      <div className="divide-y divide-line">
        {employee.salaries.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium">
                {amount(s.monthly_total, employee.currency)} from {date(s.effective_from)}
                {employee.current_salary?.id === s.id && (
                  <Badge tone="positive" className="ml-2">
                    Now
                  </Badge>
                )}
              </p>
              <p className="truncate text-[11.5px] text-ink-4">
                {s.components.map((c) => `${c.name} ${amount(c.amount)}`).join(" · ")}
                {s.note ? ` — ${s.note}` : ""}
              </p>
            </div>
            {editable && (
              <IconBtn bare className="size-7" icon={Trash2} label="Delete this salary" onClick={() => remove.run(s.id)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeeLog({ id }: { id: string }) {
  const events = useSWR<PayrollEvent[]>(`/payroll/employees/${id}/events`);
  if (!events.data) return null;
  if (!events.data.length) return <p className="mt-2 text-[12px] text-ink-4">No changes recorded.</p>;
  return (
    <ol className="mt-2 divide-y divide-line rounded-md border border-line">
      {events.data.map((e) => (
        <li key={e.id} className="flex gap-3 px-3 py-1.5 text-[12px]">
          <span className="w-32 shrink-0 text-ink-4">{dateTime(e.created_at)}</span>
          <span className="min-w-0 flex-1 text-ink-2">{e.summary}</span>
          <span className="shrink-0 text-ink-4">{e.actor_name ?? "system"}</span>
        </li>
      ))}
    </ol>
  );
}
