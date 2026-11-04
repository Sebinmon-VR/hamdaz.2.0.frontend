"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  Banknote,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { amount, dateTime, decimal, isoDay, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  COUNTRY_NAME,
  type PayItem,
  type PayrollExtra,
  type PayrollLine,
  type PayrollRunDetail,
} from "@/lib/payroll";
import { Badge, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import {
  Button,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/controls";
import {
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
} from "@/components/ui/feedback";
import { PayrollOnly } from "@/components/payroll/PayrollOnly";
import { CountryBadge, RunStatusBadge } from "@/components/payroll/badges";

export default function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PayrollOnly>
      <PayrollRunScreen id={id} />
    </PayrollOnly>
  );
}

type Dialog = null | "return" | "reopen" | "paid" | "delete";

function PayrollRunScreen({ id }: { id: string }) {
  const router = useRouter();
  const { payroll, user } = useSession();
  const key = `/payroll/runs/${id}`;
  const run = useSWR<PayrollRunDetail>(key);
  const [open, setOpen] = useState<PayrollLine | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const step = useAction(async (path: string, body?: unknown) => {
    const next = await api.post<PayrollRunDetail>(`${key}/${path}`, body);
    run.mutate(next, { revalidate: false });
    setDialog(null);
    return next;
  });
  const remove = useAction(async () => {
    await api.del(key);
    router.push("/payroll");
  });
  const download = useAction(async (path: string, name: string) => api.download(`${key}/${path}`, name));

  if (run.error) return <ErrorState error={run.error} onRetry={() => run.mutate()} />;
  if (!run.data) return <PanelSkeleton lines={8} />;
  const r = run.data;

  const draft = r.status === "draft";
  const editable = draft && payroll.can_process;
  const ownSubmission = r.submitted_by_id === user.id;
  // Super admins may approve their own submission; the CEO may not.
  const canDecide =
    r.status === "submitted" && payroll.can_approve && (!ownSubmission || payroll.can_admin);
  const bankFiles =
    (r.status === "approved" || r.status === "paid") && (payroll.can_process || payroll.can_approve);
  const stem = `Payroll ${COUNTRY_NAME[r.country]} ${r.year}-${String(r.month).padStart(2, "0")}`;
  const error = step.error ?? remove.error ?? download.error;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={`Payroll · ${COUNTRY_NAME[r.country]}`}
        title={`${COUNTRY_NAME[r.country]} payroll · ${r.label}`}
        count={`${r.headcount} people`}
        actions={
          <>
            {editable && (
              <>
                <Button
                  icon={RefreshCw}
                  loading={step.pending}
                  onClick={() => step.run("recalculate")}
                  title="Re-read employees, salaries and approved unpaid leave"
                >
                  Recalculate
                </Button>
                <Button variant="accent" icon={Send} loading={step.pending} onClick={() => step.run("submit")}>
                  Submit for approval
                </Button>
              </>
            )}
            {canDecide && (
              <>
                <Button icon={Undo2} onClick={() => setDialog("return")}>
                  Return
                </Button>
                <Button variant="accent" icon={Check} loading={step.pending} onClick={() => step.run("approve")}>
                  Approve
                </Button>
              </>
            )}
            {r.status === "approved" && payroll.can_process && (
              <Button variant="accent" icon={Banknote} onClick={() => setDialog("paid")}>
                Mark paid
              </Button>
            )}
          </>
        }
      />

      {error && <InlineNotice tone="danger">{error}</InlineNotice>}

      <Panel className="flex flex-wrap items-center gap-3 p-4">
        <CountryBadge country={r.country} />
        <RunStatusBadge status={r.status} />
        <span className="text-[12px] text-ink-3">{statusLine(r)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" icon={FileText} onClick={() => download.run("payslips.pdf", `${stem}.pdf`)}>
            All payslips
          </Button>
          <Button size="sm" icon={FileSpreadsheet} onClick={() => download.run("register.xlsx", `${stem} register.xlsx`)}>
            Register
          </Button>
          {bankFiles && r.country === "AE" && (
            <Button size="sm" icon={Landmark} onClick={() => download.run("wps.sif", `${stem}.SIF`)}>
              WPS file
            </Button>
          )}
          {bankFiles && r.country === "IN" && (
            <>
              <Button size="sm" icon={Landmark} onClick={() => download.run("bank.csv", `${stem} bank.csv`)}>
                Bank sheet
              </Button>
              <Button size="sm" icon={Download} onClick={() => download.run("pf-ecr.txt", `${stem} PF ECR.txt`)}>
                PF ECR
              </Button>
            </>
          )}
          {(r.status === "approved" || r.status === "paid") && payroll.can_admin && (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setDialog("reopen")}>
              Reopen
            </Button>
          )}
          {editable && (
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => setDialog("delete")}>
              Delete draft
            </Button>
          )}
        </div>
      </Panel>

      {r.status === "submitted" && ownSubmission && payroll.can_approve && !payroll.can_admin && (
        <InlineNotice tone="info">
          You submitted this month, so a super admin has to approve it.
        </InlineNotice>
      )}
      {r.status === "submitted" && !payroll.can_approve && (
        <InlineNotice tone="info">
          Waiting for a super admin or the CEO to approve. It is locked until then.
        </InlineNotice>
      )}
      {draft && r.returned_note && (
        <InlineNotice tone="warn">
          <b>Returned:</b> {r.returned_note}
        </InlineNotice>
      )}
      {r.note && <InlineNotice tone="info">{r.note}</InlineNotice>}
      {r.warnings.length > 0 && (
        <InlineNotice tone="warn">
          <ul className="list-disc space-y-1 pl-4">
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </InlineNotice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBox label="Gross" value={amount(r.gross, r.currency)} />
        <StatBox label="Deductions" value={amount(r.deductions, r.currency)} />
        <StatBox label="Net pay" value={amount(r.net, r.currency)} tone="second" />
        <StatBox
          label="Employer cost"
          value={amount(r.employer_cost, r.currency)}
          hint={r.country === "AE" ? "Gross pay plus the gratuity provision" : "Gross pay plus employer PF, EDLI, admin and ESI"}
        />
      </div>

      <Panel className="py-2">
        <PanelHead
          className="px-4 py-2"
          title="Payslips"
          count={r.lines.length}
          hint={editable ? "Open a person to enter unpaid days, overtime or one-off amounts." : undefined}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-4">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-2 py-2 text-right font-medium">Days paid</th>
                <th className="px-2 py-2 text-right font-medium">Gross</th>
                <th className="px-2 py-2 text-right font-medium">Deductions</th>
                <th className="px-2 py-2 text-right font-medium">Net pay</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {r.lines.map((line) => (
                <tr
                  key={line.id}
                  onClick={() => setOpen(line)}
                  className="cursor-pointer border-t border-line hover:bg-panel-2"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{line.employee_name}</div>
                    <div className="text-[11px] text-ink-4">
                      {line.employee_code}
                      {line.designation ? ` · ${line.designation}` : ""}
                    </div>
                  </td>
                  <td className="tnum px-2 py-2.5 text-right">
                    {decimal(line.paid_days, { min: 0 })} / {decimal(line.basis_days, { min: 0 })}
                  </td>
                  <td className="tnum px-2 py-2.5 text-right">{amount(line.gross)}</td>
                  <td className="tnum px-2 py-2.5 text-right">{amount(line.total_deductions)}</td>
                  <td className="tnum px-2 py-2.5 text-right font-semibold">{amount(line.net)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {line.on_hold && <Badge tone="warn">On hold</Badge>}
                      {line.extras.length > 0 && <Badge>{line.extras.length} extra</Badge>}
                      {line.warnings.length > 0 && (
                        <span title={line.warnings.join("\n")} className="inline-flex items-center gap-1 text-[11px] text-warn">
                          <AlertTriangle className="size-3" /> {line.warnings.length}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="p-4">
        <PanelHead title="What happened" count={r.events.length} />
        <ol className="mt-3 space-y-2">
          {r.events.map((e) => (
            <li key={e.id} className="text-[12px] leading-relaxed">
              <span className="text-ink-2">{e.summary}</span>
              <span className="text-ink-4">
                {" "}
                · {e.actor_name ?? "system"} · {relative(e.created_at)}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      {open && (
        <LineDialog
          run={r}
          line={r.lines.find((l) => l.id === open.id) ?? open}
          editable={editable}
          onClose={() => setOpen(null)}
          onSaved={(next) => run.mutate(next, { revalidate: false })}
          onDownload={(line) =>
            download.run(`payslips.pdf?line=${line.id}`, `Payslip ${line.employee_code} ${r.year}-${r.month}.pdf`)
          }
        />
      )}

      <ReasonDialog
        open={dialog === "return"}
        title="Return to the processor"
        description="The month goes back to draft so it can be corrected. Say what needs changing."
        label="What needs changing"
        confirm="Return it"
        pending={step.pending}
        error={step.error}
        onClose={() => setDialog(null)}
        onConfirm={(note) => step.run("return", { note })}
      />
      <ReasonDialog
        open={dialog === "reopen"}
        title={r.status === "paid" ? "Reopen a paid month" : "Reopen an approved month"}
        description={
          r.status === "paid"
            ? "It goes back to draft and has to be submitted and approved again. The salaries have already been paid — reopening changes the record, not the money; settle any difference with the bank or in next month's payroll."
            : "It goes back to draft and has to be submitted and approved again. Bank files already downloaded are not recalled — check with the bank first."
        }
        label="Why it is being reopened"
        confirm="Reopen"
        pending={step.pending}
        error={step.error}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => step.run("reopen", { reason })}
      />
      <PaidDialog
        open={dialog === "paid"}
        pending={step.pending}
        error={step.error}
        onClose={() => setDialog(null)}
        onConfirm={(paid_on) => step.run("paid", { paid_on })}
      />
      <Modal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title="Delete this draft?"
        description="The month and its inputs (overtime, extras, notes) are deleted. The log keeps a line saying it existed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={remove.pending} onClick={() => remove.run()}>
              Delete draft
            </Button>
          </>
        }
      />
    </div>
  );
}

function statusLine(r: PayrollRunDetail): string {
  const parts = [];
  if (r.calculated_at) parts.push(`Calculated ${relative(r.calculated_at)}`);
  if (r.submitted_at) parts.push(`submitted by ${r.submitted_by_name} ${dateTime(r.submitted_at)}`);
  if (r.approved_at) parts.push(`approved by ${r.approved_by_name} ${dateTime(r.approved_at)}`);
  if (r.paid_on) parts.push(`paid ${r.paid_on}`);
  return parts.join(" · ");
}

function ReasonDialog({
  open,
  title,
  description,
  label,
  confirm,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  confirm: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={pending} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
            {confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        <Field label={label} required>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function PaidDialog({
  open,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (paidOn: string) => void;
}) {
  const [paidOn, setPaidOn] = useState(isoDay(new Date()));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as paid"
      description="Record the date the salaries left the bank. This closes the month."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={pending} disabled={!paidOn} onClick={() => onConfirm(paidOn)}>
            Mark paid
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        <Field label="Paid on" required>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** One person's month: the payslip as calculated, and — in a draft — its inputs. */
function LineDialog({
  run,
  line,
  editable,
  onClose,
  onSaved,
  onDownload,
}: {
  run: PayrollRunDetail;
  line: PayrollLine;
  editable: boolean;
  onClose: () => void;
  onSaved: (next: PayrollRunDetail) => void;
  onDownload: (line: PayrollLine) => void;
}) {
  const [lop, setLop] = useState(line.lop_adjust);
  const [otNormal, setOtNormal] = useState(line.ot_normal_hours);
  const [otPremium, setOtPremium] = useState(line.ot_premium_hours);
  const [tds, setTds] = useState(line.tds_override ?? "");
  const [hold, setHold] = useState(line.on_hold);
  const [note, setNote] = useState(line.note ?? "");
  const [extras, setExtras] = useState<PayrollExtra[]>(line.extras);

  const save = useAction(async () => {
    const next = await api.patch<PayrollRunDetail>(`/payroll/runs/${run.id}/lines/${line.id}`, {
      lop_adjust: lop || "0",
      ot_normal_hours: otNormal || "0",
      ot_premium_hours: otPremium || "0",
      tds_override: tds.trim() ? tds.trim() : null,
      on_hold: hold,
      note: note.trim() || null,
      extras: extras.map((e) => ({ ...e, name: e.name.trim(), amount: e.amount.trim() })),
    });
    onSaved(next);
    return next;
  });

  const cur = run.currency;
  const uae = run.country === "AE";

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={line.employee_name}
      description={`${line.employee_code}${line.designation ? ` · ${line.designation}` : ""} · ${run.label}`}
      footer={
        <>
          <Button variant="ghost" icon={FileText} onClick={() => onDownload(line)}>
            Payslip PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {editable && (
            <Button variant="accent" loading={save.pending} onClick={() => save.run()}>
              Save and recalculate
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        {line.warnings.length > 0 && (
          <InlineNotice tone="warn">
            <ul className="list-disc space-y-1 pl-4">
              {line.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </InlineNotice>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Items title="Earnings" items={line.earnings} total={line.gross} totalLabel="Gross" currency={cur} />
          <Items
            title="Deductions"
            items={line.deductions}
            total={line.total_deductions}
            totalLabel="Total deductions"
            currency={cur}
          />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-panel-2 px-4 py-3">
          <span className="text-[13px] font-semibold">Net pay</span>
          <span className="fig text-[20px]">{amount(line.net, cur)}</span>
        </div>
        {line.employer.length > 0 && (
          <p className="text-[12px] text-ink-3">
            Employer cost, not deducted:{" "}
            {line.employer.map((e) => `${e.name} ${amount(e.amount)}`).join(" · ")}
          </p>
        )}
        <Workings line={line} uae={uae} currency={cur} />

        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Unpaid days from leave"
            hint="Approved unpaid leave in this month, read from Leave. Recalculating re-reads it."
          >
            <Input disabled value={decimal(line.leave_lop_days, { min: 0 })} />
          </Field>
          <Field label="Extra unpaid days" hint="Absences not booked as leave. Negative to cancel some.">
            <Input disabled={!editable} inputMode="decimal" value={lop} onChange={(e) => setLop(e.target.value)} />
          </Field>
          {uae ? (
            <>
              <Field label="Overtime hours" hint="Ordinary overtime.">
                <Input disabled={!editable} inputMode="decimal" value={otNormal} onChange={(e) => setOtNormal(e.target.value)} />
              </Field>
              <Field label="Night / rest-day / holiday hours" hint="The higher overtime rate.">
                <Input disabled={!editable} inputMode="decimal" value={otPremium} onChange={(e) => setOtPremium(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="TDS this month" hint="Leave empty to calculate it. A figure here replaces the calculation for this month only.">
              <Input disabled={!editable} inputMode="decimal" placeholder="Calculated" value={tds} onChange={(e) => setTds(e.target.value)} />
            </Field>
          )}
        </div>

        <ExtrasEditor extras={extras} onChange={setExtras} editable={editable} uae={uae} />

        <Toggle
          disabled={!editable}
          checked={hold}
          onChange={setHold}
          label="Hold this salary"
          hint="Stays in the register and on the payslip, but is left out of the bank file."
        />
        <Field label="Note">
          <Textarea disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Items({
  title,
  items,
  total,
  totalLabel,
  currency,
}: {
  title: string;
  items: PayItem[];
  total: string;
  totalLabel: string;
  currency: string;
}) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <p className="micro mb-2 text-ink-4">{title}</p>
      {items.length === 0 && <p className="text-[12px] text-ink-4">None</p>}
      {items.map((item, i) => (
        <div key={`${item.code}-${i}`} className="flex justify-between gap-3 py-0.5 text-[12.5px]">
          <span className="text-ink-2">{item.name}</span>
          <span className="tnum">{amount(item.amount)}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-line pt-2 text-[12.5px] font-semibold">
        <span>{totalLabel}</span>
        <span className="tnum">{amount(total, currency)}</span>
      </div>
    </div>
  );
}

function Workings({ line, uae, currency }: { line: PayrollLine; uae: boolean; currency: string }) {
  const w = line.workings ?? {};
  const days = w.days as Record<string, string> | undefined;
  const tax = w.tax as Record<string, string | number> | undefined;
  const pf = w.pf as Record<string, string> | undefined;
  const gratuity = w.gratuity as Record<string, string> | undefined;
  const rows: [string, string][] = [];
  if (days) rows.push(["Days", `${decimal(days.paid, { min: 0 })} paid of ${decimal(days.basis, { min: 0 })} (${days.rule})`]);
  if (uae && gratuity) rows.push(["Gratuity owed at month end", amount(gratuity.liability, currency)]);
  if (pf) rows.push(["PF wages", `${amount(pf.pf_wages)} — contributions on ${amount(pf.epf_wages)}`]);
  if (tax) {
    if (tax.projected_salary !== undefined) {
      rows.push([
        "Tax projection",
        `${amount(String(tax.projected_salary))} salary for the year − ${amount(String(tax.standard_deduction))} standard deduction = ${amount(String(tax.taxable_income))} taxable; tax ${amount(String(tax.total))} (table FY ${tax.table_fy})`,
      ]);
      rows.push([
        "TDS",
        `${amount(String(tax.total))} − ${amount(String(tax.tds_before))} already deducted, over ${Number(tax.months_after) + 1} month(s) = ${amount(String(tax.monthly))}`,
      ]);
    } else {
      rows.push(["TDS", `${amount(String(tax.monthly))}, ${tax.method}`]);
    }
  }
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl bg-panel-2 px-4 py-3">
      <p className="micro mb-1.5 text-ink-4">How it was worked out</p>
      {rows.map(([k, v]) => (
        <p key={k} className="text-[12px] leading-relaxed">
          <span className="text-ink-3">{k}: </span>
          <span className="text-ink-2">{v}</span>
        </p>
      ))}
    </div>
  );
}

function ExtrasEditor({
  extras,
  onChange,
  editable,
  uae,
}: {
  extras: PayrollExtra[];
  onChange: (next: PayrollExtra[]) => void;
  editable: boolean;
  uae: boolean;
}) {
  function set(index: number, patch: Partial<PayrollExtra>) {
    onChange(extras.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-ink-3">
        One-off amounts this month — a bonus, arrears, an advance recovered.
        {uae ? " Variable pay is reported separately in the WPS file." : " Taxable earnings count towards TDS."}
      </p>
      {extras.map((extra, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Select
              disabled={!editable}
              value={extra.kind}
              onChange={(e) => set(index, { kind: e.target.value as PayrollExtra["kind"] })}
            >
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </Select>
          </div>
          <Input
            className="min-w-40 flex-1"
            disabled={!editable}
            placeholder="Name on the payslip"
            value={extra.name}
            onChange={(e) => set(index, { name: e.target.value })}
          />
          <Input
            className="w-32 text-right tnum"
            disabled={!editable}
            inputMode="decimal"
            placeholder="0.00"
            value={extra.amount}
            onChange={(e) => set(index, { amount: e.target.value })}
          />
          {extra.kind === "earning" && (
            <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <input
                type="checkbox"
                disabled={!editable}
                checked={uae ? extra.variable : extra.taxable}
                onChange={(e) => set(index, uae ? { variable: e.target.checked } : { taxable: e.target.checked })}
              />
              {uae ? "Variable pay" : "Taxable"}
            </label>
          )}
          {editable && (
            <IconButton size="sm" icon={X} label="Remove" onClick={() => onChange(extras.filter((_, i) => i !== index))} />
          )}
        </div>
      ))}
      {editable && (
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          onClick={() =>
            onChange([...extras, { name: "", amount: "", kind: "earning", variable: true, taxable: true }])
          }
        >
          Add a one-off amount
        </Button>
      )}
    </div>
  );
}
