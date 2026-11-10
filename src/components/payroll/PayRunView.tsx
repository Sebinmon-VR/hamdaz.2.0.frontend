"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import useSWR, { mutate as mutateKey } from "swr";
import {
  AlertTriangle,
  Banknote,
  Check,
  ChevronRight,
  FileArchive,
  FileDown,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Landmark,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, dateShort, dateTime, decimal, isoDay, relative, sumExact } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  COUNTRY_NAME,
  CURRENCY,
  MONTHS,
  employeesKey,
  monthKey,
  parseMonth,
  partOfMonth,
  shiftMonth,
  type Country,
  type PayrollEmployee,
  type PayrollExtra,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunDetail,
  type InvoiceSetup,
  type PayrollSettings,
} from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";
import { Modal, PanelSkeleton } from "@/components/ui/feedback";
import { RunStatusBadge } from "@/components/payroll/badges";
import { LineDialog } from "@/components/payroll/LineDialog";
import { RunInvoice } from "@/components/payroll/RunInvoice";
import {
  estimate,
  fromCents,
  parseTyped,
  serverFigures,
  toCents,
  type Draft,
  type Field,
  type Figures,
} from "@/components/payroll/estimate";
import { AreaBox, Btn, IconBtn, Labeled, MonthArrows, Note, Stats, TD, TH, TextBox, Toolbar } from "@/components/payroll/ui";
import type { Go } from "@/components/payroll/place";

type Ym = { year: number; month: number };

function today(): Ym {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** The month that needs somebody: the latest one not yet paid, else this month. */
function defaultMonth(runs: PayrollRun[]): Ym {
  const open = runs
    .filter((r) => r.status !== "paid")
    .sort((a, b) => b.year - a.year || b.month - a.month)[0];
  return open ? { year: open.year, month: open.month } : today();
}

type Bar = (status: ReactNode, text: ReactNode, actions?: ReactNode) => ReactNode;

/**
 * The pay run: one month, one country, everyone on one sheet.
 *
 * Pick the month, run it, type in the few things that change month to month
 * (unpaid days, a bonus, a deduction), approve, pay. Anything rarer is in the
 * person's payslip panel, one click from their row.
 */
export function PayRunView({
  country,
  month,
  runId,
  go,
}: {
  country: Country;
  month: string | null;
  runId: string | null;
  go: Go;
}) {
  const runs = useSWR<PayrollRun[]>("/payroll/runs");
  const employees = useSWR<PayrollEmployee[]>(employeesKey());

  // Old links and the approval notification name a month by id.
  useEffect(() => {
    if (!runId || !runs.data) return;
    const r = runs.data.find((x) => x.id === runId);
    go(r ? { month: monthKey(r.year, r.month), country: r.country } : {}, { replace: true });
  }, [runId, runs.data, go]);

  if (!runs.data || !employees.data || runId) return <PanelSkeleton lines={8} className="p-4" />;

  const mine = runs.data.filter((r) => r.country === country);
  const at = parseMonth(month) ?? defaultMonth(mine);
  const run = mine.find((r) => r.year === at.year && r.month === at.month) ?? null;
  const people = employees.data.filter((e) => e.country === country && e.active);

  const bar: Bar = (status, text, actions) => (
    <Toolbar>
      <MonthArrows
        label={`${MONTHS[at.month - 1]} ${at.year}`}
        onMove={(by) => {
          const next = shiftMonth(at, by);
          go({ month: monthKey(next.year, next.month) });
        }}
      />
      {status}
      <span className="hidden min-w-0 truncate text-[12px] text-ink-3 lg:block">{text}</span>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </Toolbar>
  );

  return run ? (
    <RunSheet key={run.id} id={run.id} bar={bar} people={people} go={go} />
  ) : (
    <NotRun at={at} country={country} people={people} bar={bar} go={go} />
  );
}

/** A month nobody has run yet: who would be paid, and the one button. */
function NotRun({
  at,
  country,
  people,
  bar,
  go,
}: {
  at: Ym;
  country: Country;
  people: PayrollEmployee[];
  bar: Bar;
  go: Go;
}) {
  const { payroll } = useSession();
  const paid = people.filter((e) => e.current_salary);
  const total = sumExact(paid.map((e) => e.current_salary!.monthly_total)) ?? "0";

  const start = useAction(async () => {
    const run = await api.post<PayrollRunDetail>("/payroll/runs", {
      country,
      year: at.year,
      month: at.month,
    });
    // Seed both caches so the sheet appears at once rather than after a refetch.
    await mutateKey(`/payroll/runs/${run.id}`, run, { revalidate: false });
    await mutateKey("/payroll/runs");
    return run;
  });

  return (
    <>
      {bar(
        <Badge>Not run</Badge>,
        "Running it makes a draft — nothing is paid or sent until it is approved.",
        payroll.can_process && paid.length > 0 && (
          <Btn variant="accent" icon={Play} loading={start.pending} onClick={() => start.run()}>
            Run payroll for {MONTHS[at.month - 1]}
          </Btn>
        ),
      )}
      {start.error && <Note tone="danger">{start.error}</Note>}
      {people.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <p className="text-[14px] font-semibold text-ink">No employees on {COUNTRY_NAME[country]} payroll</p>
          <p className="max-w-sm text-[12.5px] text-ink-3">Add each person with their salary, then run the month.</p>
          {payroll.can_process && (
            <Btn variant="accent" icon={UserPlus} onClick={() => go({ employee: "new" })}>
              Add an employee
            </Btn>
          )}
        </div>
      ) : (
        <>
          <Stats
            items={[
              { label: "Employees", value: String(paid.length) },
              { label: "Monthly salaries", value: amount(total, CURRENCY[country]) },
            ]}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Code</th>
                  <th className={TH}>Employee</th>
                  <th className={TH}>Designation</th>
                  <th className={clsx(TH, "text-right")}>Monthly salary</th>
                </tr>
              </thead>
              <tbody>
                {people.map((e) => (
                  <tr key={e.id}>
                    <td className={clsx(TD, "w-28 text-ink-3")}>{e.code}</td>
                    <td className={clsx(TD, "font-medium text-ink")}>{e.full_name}</td>
                    <td className={clsx(TD, "text-ink-3")}>{e.designation ?? "—"}</td>
                    <td className={clsx(TD, "tnum text-right")}>
                      {e.current_salary ? (
                        amount(e.current_salary.monthly_total)
                      ) : (
                        <span className="text-warn">No salary — left out</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InvoicePreview at={at} country={country} total={total} people={paid.length} />
        </>
      )}
    </>
  );
}

/**
 * What the month's invoice will be, shown before the month is run — so the
 * invoice is visible from the start rather than appearing out of nowhere.
 * The real one is made with the run, under its pay sheet.
 */
function InvoicePreview({
  at,
  country,
  total,
  people,
}: {
  at: Ym;
  country: Country;
  total: string;
  people: number;
}) {
  const settings = useSWR<PayrollSettings>("/payroll/settings");
  const setup = useSWR<InvoiceSetup>("/payroll/invoice-setup");
  if (!settings.data) return null;
  const s = settings.data;
  const currency = s.invoice_currency ?? setup.data?.default_currency ?? "AED";
  const same = currency === CURRENCY[country];
  const rate = setup.data?.default_rate ? Number(setup.data.default_rate) : null;
  return (
    <section className="border-t border-line">
      <Toolbar>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Invoice</span>
        <span className="text-[13px] font-semibold text-ink">Made with the month</span>
        <span className="min-w-0 truncate text-[12px] text-ink-3">
          {s.in_company_name} → {s.ae_company_name} · {currency}
        </span>
      </Toolbar>
      <table className="w-full text-[13px]">
        <tbody>
          <tr>
            <td className={TD}>
              <span className="font-medium text-ink">Salaries</span>
              <span className="ml-2 text-[11px] text-ink-4">from the pay sheet</span>
              <span className="block text-[11.5px] text-ink-4">
                {COUNTRY_NAME[country]} payroll, {MONTHS[at.month - 1]} {at.year} — {people}{" "}
                {people === 1 ? "employee" : "employees"}
              </span>
            </td>
            <td className={clsx(TD, "tnum text-right text-ink")}>
              {same
                ? amount(total, currency)
                : rate
                  ? `≈ ${amount(fromCents(Math.round(toCents(total) / rate)), currency)}`
                  : `${amount(total, CURRENCY[country])}, in ${currency}`}
              {!same && <span className="block text-[11px] text-ink-4">{amount(total, CURRENCY[country])}</span>}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[12px] text-ink-3">
        {!same && (
          <>
            {setup.data?.default_rate_note ?? "Converted at Zoho's rate."} The rate used is Zoho's on the invoice
            date.{" "}
          </>
        )}
        Other charges — rent, internet, anything else — are added under the pay sheet once the month is run. The
        invoice is approved with the month, then created in Zoho.
      </p>
    </section>
  );
}

type Dialog = null | "return" | "reopen" | "paid" | "delete";

function RunSheet({
  id,
  bar,
  people,
  go,
}: {
  id: string;
  bar: Bar;
  people: PayrollEmployee[];
  go: Go;
}) {
  const { payroll, user } = useSession();
  const key = `/payroll/runs/${id}`;
  const run = useSWR<PayrollRunDetail>(key);
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [history, setHistory] = useState(false);
  // What has been typed into each row and not yet confirmed by the backend.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const saver = useLineSaver(key, run.data, run.mutate);

  const done = (next: PayrollRunDetail) => {
    void run.mutate(next, { revalidate: false });
    void mutateKey("/payroll/runs");
    setDialog(null);
    return next;
  };
  // Every step waits for the sheet's saves, so nothing is approved, refreshed
  // or downloaded on figures from before the last thing typed.
  const step = useAction(async (path: string, body?: unknown) => {
    await saver.idle();
    return done(await api.post<PayrollRunDetail>(`${key}/${path}`, body));
  });
  // A super admin both prepares and approves: one click, two steps.
  const approveOwn = useAction(async () => {
    await saver.idle();
    // No approval mail: the one approving is the one sending.
    await api.post<PayrollRunDetail>(`${key}/submit?notify=false`);
    return done(await api.post<PayrollRunDetail>(`${key}/approve`));
  });
  const remove = useAction(async () => {
    await saver.idle();
    await api.del(key);
    await mutateKey("/payroll/runs");
    setDialog(null);
  });
  const download = useAction(async (path: string, name: string) => {
    await saver.idle();
    return api.download(`${key}/${path}`, name);
  });

  const setDraft = useCallback((lineId: string, field: Field, text: string | undefined) => {
    setDrafts((all) => {
      const row = { ...all[lineId] };
      if (text === undefined) delete row[field];
      else row[field] = text;
      const next = { ...all };
      if (Object.keys(row).length) next[lineId] = row;
      else delete next[lineId];
      return next;
    });
  }, []);
  /** Drop a typed value once it is saved — unless something newer was typed meanwhile. */
  const settle = useCallback((lineId: string, field: Field, sent: string) => {
    setDrafts((all) => {
      if (all[lineId]?.[field] !== sent) return all;
      const row = { ...all[lineId] };
      delete row[field];
      const next = { ...all };
      if (Object.keys(row).length) next[lineId] = row;
      else delete next[lineId];
      return next;
    });
  }, []);

  if (!run.data || run.data.id !== id) return <PanelSkeleton lines={8} className="p-4" />;
  const r = run.data;
  const daysInMonth = new Date(r.year, r.month, 0).getDate();

  const draft = r.status === "draft";
  const editable = draft && payroll.can_process;
  const ownSubmission = r.submitted_by_id === user.id;
  const canDecide =
    r.status === "submitted" && payroll.can_approve && (!ownSubmission || payroll.can_admin);
  const selfApprove = payroll.can_process && payroll.can_approve && payroll.can_admin;
  const bankFiles =
    (r.status === "approved" || r.status === "paid") && (payroll.can_process || payroll.can_approve);
  const anyPf = r.lines.some((l) => l.identifiers?.pf_enabled === true);
  const stem = `Payroll ${COUNTRY_NAME[r.country]} ${monthKey(r.year, r.month)}`;
  const payslipOf = (line: PayrollLine) =>
    download.run(
      `payslips.pdf?line=${line.id}`,
      `Payslip ${line.employee_code} ${line.employee_name} ${monthKey(r.year, r.month)}.pdf`,
    );
  const pending = step.pending || approveOwn.pending;
  const error = step.error ?? approveOwn.error ?? remove.error ?? download.error ?? saver.error ?? run.error?.message;

  // Each row as it stands with what has been typed — worked out here, now.
  const rows = r.lines.map((line) => ({
    line,
    server: serverFigures(line),
    figures: estimate(line, drafts[line.id], daysInMonth),
  }));
  const delta = (pick: (f: Figures) => number) =>
    rows.reduce((total, x) => total + pick(x.figures) - pick(x.server), 0);
  const totals = {
    gross: Math.round(Number(r.gross) * 100) + delta((f) => f.gross),
    deductions: Math.round(Number(r.deductions) * 100) + delta((f) => f.deductions),
    net: Math.round(Number(r.net) * 100) + delta((f) => f.net),
    salary: rows.reduce((t, x) => t + x.figures.salary, 0),
    bonus: rows.reduce((t, x) => t + x.figures.bonus, 0),
  };
  const approximate = rows.some((x) => drafts[x.line.id] && x.figures.approximate);
  const invalid = rows.some(({ line }) => {
    const d = drafts[line.id];
    if (!d) return false;
    return (["lop", "bonus", "deduction"] as Field[]).some(
      (f) => d[f] !== undefined && !valid(f, d[f]!, line),
    );
  });
  const typing = Object.keys(drafts).length > 0;

  // Something about the people changed after these figures were worked out.
  const changedSince =
    draft && r.calculated_at
      ? people.some(
          (e) =>
            after(e.updated_at, r.calculated_at!) ||
            e.salaries.some((s) => after(s.created_at, r.calculated_at!)),
        )
      : false;

  function commit(line: PayrollLine, field: Field) {
    const text = drafts[line.id]?.[field];
    if (text === undefined || !valid(field, text, line)) return;
    const n = parseTyped(text)!;
    const server = serverFigures(line);
    const now = field === "lop" ? server.lop : field === "bonus" ? server.bonus / 100 : server.other / 100;
    if (n === now) {
      settle(line.id, field, text);
      return;
    }
    const value = String(n);
    saver
      .save(line.id, (latest) =>
        field === "lop"
          ? { lop_adjust: String(n - Number(latest.leave_lop_days)) }
          : { extras: replaceExtra(latest, field === "bonus" ? "earning" : "deduction", value) },
      )
      .catch(() => undefined)
      .finally(() => settle(line.id, field, text));
  }

  const actions = (
    <>
      {editable && (
        <>
          <Btn
            icon={RefreshCw}
            loading={step.pending}
            onClick={() => step.run("recalculate")}
            title="Re-read salaries, employees and approved unpaid leave"
          >
            Refresh
          </Btn>
          {selfApprove ? (
            <Btn
              variant="accent"
              icon={Check}
              loading={approveOwn.pending}
              disabled={invalid}
              onClick={() => approveOwn.run()}
            >
              Approve
            </Btn>
          ) : (
            <Btn variant="accent" icon={Send} loading={pending} disabled={invalid} onClick={() => step.run("submit")}>
              Send for approval
            </Btn>
          )}
        </>
      )}
      {canDecide && (
        <>
          <Btn icon={Undo2} onClick={() => setDialog("return")}>
            Send back
          </Btn>
          <Btn variant="accent" icon={Check} loading={pending} onClick={() => step.run("approve")}>
            Approve
          </Btn>
        </>
      )}
      {r.status === "approved" && payroll.can_process && (
        <Btn variant="accent" icon={Banknote} onClick={() => setDialog("paid")}>
          Mark as paid
        </Btn>
      )}
    </>
  );

  const openLine = open ? r.lines.find((l) => l.id === open) ?? null : null;
  const money = (cents: number) => amount(fromCents(cents), r.currency);

  return (
    <>
      {bar(
        <RunStatusBadge status={r.status} />,
        saver.inFlight > 0
          ? "Saving…"
          : typing
            ? "Leave the box or press Enter to save."
            : nextStep(r, editable, canDecide, selfApprove),
        actions,
      )}

      {error && <Note tone="danger">{error}</Note>}
      {draft && r.returned_note && (
        <Note tone="warn">
          <b>Sent back:</b> {r.returned_note}
        </Note>
      )}
      {changedSince && editable && (
        <Note>
          An employee or salary changed after these figures were worked out.{" "}
          <button className="font-semibold underline" onClick={() => step.run("recalculate")}>
            Refresh
          </button>
        </Note>
      )}
      {r.warnings.map((w) => (
        <Note key={w} tone="warn">
          {w}
        </Note>
      ))}

      <Stats
        items={[
          { label: "Employees", value: String(r.headcount) },
          { label: "Gross pay", value: (approximate ? "≈ " : "") + money(totals.gross) },
          { label: "Deductions", value: (approximate ? "≈ " : "") + money(totals.deductions) },
          { label: "Net pay", value: (approximate ? "≈ " : "") + money(totals.net), strong: true },
        ]}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Code</th>
              <th className={TH}>Employee</th>
              <th className={clsx(TH, "text-right")}>Monthly salary</th>
              <th className={clsx(TH, "text-right")} title="Loss of pay. Approved unpaid leave is counted automatically.">
                Unpaid days
              </th>
              <th className={clsx(TH, "text-right")}>Bonus</th>
              <th className={clsx(TH, "text-right")}>Deductions</th>
              <th className={clsx(TH, "text-right")}>Net pay</th>
              <th className={clsx(TH, "w-16")} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, figures }) => (
              <SheetRow
                key={line.id}
                line={line}
                at={r}
                figures={figures}
                draft={drafts[line.id]}
                editable={editable}
                onOpen={() => setOpen(line.id)}
                onPayslip={() => payslipOf(line)}
                onType={(field, text) => setDraft(line.id, field, text)}
                onCommit={(field) => commit(line, field)}
              />
            ))}
          </tbody>
          {r.lines.length > 1 && (
            <tfoot>
              <tr className="bg-panel-2 font-semibold">
                <td className={TD} />
                <td className={TD}>Total</td>
                <td className={clsx(TD, "tnum text-right")}>{amount(fromCents(totals.salary))}</td>
                <td className={TD} />
                <td className={clsx(TD, "tnum text-right")}>{orDash(totals.bonus)}</td>
                <td className={clsx(TD, "tnum text-right")}>{orDash(totals.deductions)}</td>
                <td className={clsx(TD, "tnum text-right")}>
                  {approximate && "≈ "}
                  {amount(fromCents(totals.net))}
                </td>
                <td className={TD} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RunInvoice
        run={r}
        salaryDeltas={rows.map((x) => x.figures.gross - x.server.gross)}
        pendingSheet={typing}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <Btn icon={FileText} onClick={() => download.run("payslips.pdf", `${stem} payslips.pdf`)}>
          All payslips (one PDF)
        </Btn>
        <Btn icon={FileArchive} onClick={() => download.run("payslips.zip", `${stem} payslips.zip`)}>
          Payslip per person (ZIP)
        </Btn>
        <Btn icon={FileSpreadsheet} onClick={() => download.run("register.xlsx", `${stem} register.xlsx`)}>
          Salary register
        </Btn>
        {bankFiles &&
          (r.country === "AE" ? (
            <Btn icon={Landmark} onClick={() => download.run("wps.sif", `${stem}.SIF`)}>
              WPS file
            </Btn>
          ) : (
            <Btn icon={Landmark} onClick={() => download.run("bank.csv", `${stem} bank.csv`)}>
              Bank transfer sheet
            </Btn>
          ))}
        {bankFiles && anyPf && (
          <Btn icon={Download} onClick={() => download.run("pf-ecr.txt", `${stem} PF ECR.txt`)}>
            PF return
          </Btn>
        )}
        {!bankFiles && <span className="text-[12px] text-ink-4">Bank file after approval.</span>}
        <div className="ml-auto flex gap-1">
          <Btn variant="ghost" icon={History} onClick={() => setHistory((h) => !h)}>
            {history ? "Hide history" : "History"}
          </Btn>
          {(r.status === "approved" || r.status === "paid") && payroll.can_admin && (
            <Btn variant="ghost" icon={RotateCcw} onClick={() => setDialog("reopen")}>
              Reopen
            </Btn>
          )}
          {editable && (
            <Btn variant="ghost" icon={Trash2} onClick={() => setDialog("delete")}>
              Delete draft
            </Btn>
          )}
        </div>
      </div>

      {history && (
        <ol className="border-t border-line px-4 py-2.5">
          {r.events.map((e) => (
            <li key={e.id} className="flex gap-3 py-1 text-[12px]">
              <span className="w-36 shrink-0 text-ink-4">{dateTime(e.created_at)}</span>
              <span className="text-ink-2">{e.summary}</span>
              <span className="ml-auto shrink-0 text-ink-4">{e.actor_name ?? "system"}</span>
            </li>
          ))}
        </ol>
      )}

      {openLine && (
        <LineDialog
          key={openLine.id}
          run={r}
          line={openLine}
          editable={editable}
          onClose={() => setOpen(null)}
          onSaved={(next) => run.mutate(next, { revalidate: false })}
          onDownload={payslipOf}
          onOpenEmployee={(employeeId) => go({ employee: employeeId })}
        />
      )}

      <ReasonDialog
        open={dialog === "return"}
        title="Send back for changes"
        description="The month goes back to draft so it can be corrected."
        label="What needs changing"
        confirm="Send back"
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
            ? "It goes back to draft and has to be approved again. The salaries have already been paid — this changes the record, not the money."
            : "It goes back to draft and has to be approved again. A bank file already downloaded is not recalled."
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
        description="The month and what was typed into it (unpaid days, bonuses, notes) are deleted. You can run it again afterwards."
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDialog(null)}>
              Keep it
            </Btn>
            <Btn variant="danger" loading={remove.pending} onClick={() => remove.run()}>
              Delete draft
            </Btn>
          </>
        }
      />
    </>
  );
}

function nextStep(r: PayrollRunDetail, editable: boolean, canDecide: boolean, selfApprove: boolean): string {
  switch (r.status) {
    case "draft":
      return editable
        ? `Enter unpaid days, bonuses and deductions, check the invoice below, then ${selfApprove ? "approve both" : "send both for approval"}.`
        : "Being prepared.";
    case "submitted":
      return canDecide
        ? `Sent by ${r.submitted_by_name ?? "—"} ${relative(r.submitted_at)}.`
        : `Waiting for approval. Sent by ${r.submitted_by_name ?? "—"} ${relative(r.submitted_at)}.`;
    case "approved":
      return `Approved by ${r.approved_by_name ?? "—"} ${relative(r.approved_at)}. Pay, then mark as paid.`;
    case "paid":
      return `Paid on ${date(r.paid_on)}${r.paid_by_name ? ` · ${r.paid_by_name}` : ""}.`;
  }
}

/* ── the sheet ──────────────────────────────────────────────────────── */

function after(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
}

/** A blank bonus reads better as a dash than as 0.00. */
function orDash(cents: number): string {
  return cents === 0 ? "—" : amount(fromCents(cents));
}

function extrasOf(line: PayrollLine, kind: PayrollExtra["kind"]): PayrollExtra[] {
  return line.extras.filter((e) => e.kind === kind);
}

/** Whether what was typed into a cell can be saved. */
function valid(field: Field, text: string, line: PayrollLine): boolean {
  const n = parseTyped(text);
  if (n === null) return false;
  return field !== "lop" || n <= Number(line.basis_days);
}

/** The one amount of a kind, as the sheet edits it; several stay in the payslip panel. */
function replaceExtra(line: PayrollLine, kind: PayrollExtra["kind"], value: string): PayrollExtra[] {
  const others = line.extras.filter((e) => e.kind !== kind);
  const existing = extrasOf(line, kind)[0];
  if (!value || Number(value) === 0) return others;
  return [
    ...others,
    {
      name: existing?.name ?? (kind === "earning" ? "Bonus" : "Other deduction"),
      amount: value,
      kind,
      variable: existing?.variable ?? true,
      taxable: existing?.taxable ?? kind === "earning",
    },
  ];
}

type Save = (lineId: string, build: (line: PayrollLine) => Record<string, unknown>) => Promise<void>;

/**
 * Saves sheet edits one at a time, each built from the latest figures.
 *
 * Tabbing from one cell to the next fires two saves before the first answer
 * is back. Sent side by side, the second would be built from the line as it
 * was before the first — and quietly undo it. Queued, each one starts from
 * what the server last said. `idle()` resolves once everything queued is in.
 */
function useLineSaver(
  key: string,
  data: PayrollRunDetail | undefined,
  mutate: (next: PayrollRunDetail, opts: { revalidate: boolean }) => unknown,
) {
  const latest = useRef(data);
  latest.current = data;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);

  const save = useCallback<Save>(
    (lineId, build) => {
      setInFlight((n) => n + 1);
      const job = queue.current.then(async () => {
        const line = latest.current?.lines.find((l) => l.id === lineId);
        if (!line) return;
        try {
          const next = await api.patch<PayrollRunDetail>(`${key}/lines/${lineId}`, build(line));
          latest.current = next;
          mutate(next, { revalidate: false });
          setError(null);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "That change was not saved.");
          throw caught;
        } finally {
          setInFlight((n) => n - 1);
        }
      });
      queue.current = job.catch(() => undefined);
      return job;
    },
    [key, mutate],
  );
  const idle = useCallback(() => queue.current, []);

  return { save, idle, error, inFlight };
}

function SheetRow({
  line,
  at,
  figures,
  draft,
  editable,
  onOpen,
  onPayslip,
  onType,
  onCommit,
}: {
  line: PayrollLine;
  at: { year: number; month: number };
  figures: Figures;
  draft: Draft | undefined;
  editable: boolean;
  onOpen: () => void;
  onPayslip: () => void;
  onType: (field: Field, text: string | undefined) => void;
  onCommit: (field: Field) => void;
}) {
  const bonuses = extrasOf(line, "earning");
  const others = extrasOf(line, "deduction");
  const statutory = line.deductions.filter((d) => d.code !== "EXTRA");
  const leave = Number(line.leave_lop_days);
  const basis = Number(line.basis_days);
  const pendingRow = draft !== undefined;
  const part = partOfMonth(line, at);
  const cell = (field: Field, saved: number, show: string, can: boolean, hint?: string) => (
    <Cell
      editable={editable && can}
      saved={saved === 0 ? "" : String(saved)}
      text={draft?.[field]}
      display={show}
      hint={hint}
      invalid={draft?.[field] !== undefined && !valid(field, draft[field]!, line) ? (field === "lop" ? `0 to ${basis}` : "0 or more") : null}
      label={`${line.employee_name}: ${field === "lop" ? "unpaid days" : field}`}
      onType={(t) => onType(field, t)}
      onCommit={() => onCommit(field)}
    />
  );
  const server = serverFigures(line);

  return (
    <tr className="hover:bg-panel-2/50">
      <td className={clsx(TD, "w-28 text-ink-3")}>{line.employee_code}</td>
      <td className={TD}>
        <button className="text-left" onClick={onOpen}>
          <span className="flex items-center gap-1.5 font-medium text-ink hover:underline">
            {line.employee_name}
            {line.warnings.length > 0 && (
              <AlertTriangle className="size-3 text-warn" aria-label={line.warnings.join(" ")} />
            )}
            {line.on_hold && <Badge tone="warn">On hold</Badge>}
          </span>
          {(figures.paid < basis || part) && (
            <span className="block text-[11px] text-ink-4">
              {part?.joined && <span className="text-accent">Joined {dateShort(part.joined)} · </span>}
              {part?.left && <span className="text-warn">Left {dateShort(part.left)} · </span>}
              {decimal(String(figures.paid), { min: 0 })} of {decimal(line.basis_days, { min: 0 })} days paid
            </span>
          )}
        </button>
      </td>
      <td className={clsx(TD, "tnum text-right text-ink-2")}>{amount(fromCents(figures.salary))}</td>
      <td className={clsx(TD, "text-right")}>
        {cell(
          "lop",
          server.lop,
          server.lop ? decimal(String(server.lop), { min: 0 }) : "—",
          true,
          leave > 0 ? `${decimal(line.leave_lop_days, { min: 0 })} from leave` : undefined,
        )}
      </td>
      <td className={clsx(TD, "text-right")}>
        {cell(
          "bonus",
          server.bonus / 100,
          orDash(server.bonus),
          bonuses.length <= 1,
          bonuses.length > 1 ? `${bonuses.length} items` : undefined,
        )}
      </td>
      <td className={clsx(TD, "text-right")}>
        {cell(
          "deduction",
          server.other / 100,
          orDash(server.other),
          others.length <= 1,
          server.statutory > 0
            ? `+ ${amount(fromCents(server.statutory))} ${statutory.map((d) => d.code).join(", ")}`
            : others.length > 1
              ? `${others.length} items`
              : undefined,
        )}
      </td>
      <td
        className={clsx(TD, "tnum text-right font-semibold", pendingRow ? "text-info" : "text-ink")}
        title={pendingRow ? "Worked out here — confirmed when the change is saved." : undefined}
      >
        {pendingRow && figures.approximate && "≈ "}
        {amount(fromCents(figures.net))}
      </td>
      <td className={clsx(TD, "whitespace-nowrap text-right")}>
        <IconBtn
          icon={FileDown}
          label={`Download ${line.employee_name}'s payslip`}
          bare
          className="inline-grid size-7"
          onClick={onPayslip}
        />
        <IconBtn
          icon={ChevronRight}
          label={`${line.employee_name}: payslip details`}
          bare
          className="inline-grid size-7"
          onClick={onOpen}
        />
      </td>
    </tr>
  );
}

/**
 * A number typed straight into the sheet. While it has a typed value the
 * row's figures are worked out from it on every keystroke; Enter or leaving
 * the box saves it, Escape puts the saved figure back.
 */
function Cell({
  editable,
  saved,
  text,
  display,
  hint,
  invalid,
  label,
  onType,
  onCommit,
}: {
  editable: boolean;
  /** The saved figure, as an editable string ("" for zero). */
  saved: string;
  /** What has been typed, if anything. */
  text: string | undefined;
  display: string;
  hint?: string;
  invalid: string | null;
  label: string;
  onType: (text: string | undefined) => void;
  onCommit: () => void;
}) {
  const cancelled = useRef(false);

  if (!editable) {
    return (
      <span className="block">
        <span className="tnum text-ink-2">{display}</span>
        {hint && <span className="block text-[10.5px] text-ink-4">{hint}</span>}
      </span>
    );
  }

  return (
    <span className="inline-block">
      <input
        aria-label={label}
        inputMode="decimal"
        value={text ?? saved}
        placeholder="0"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onType(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            onType(undefined);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          onCommit();
        }}
        className={clsx(
          "tnum h-7 w-24 rounded-md border bg-panel px-2 text-right text-[13px] text-ink outline-none transition placeholder:text-ink-4 focus:border-accent!",
          invalid ? "border-danger!" : "border-line",
        )}
      />
      {(invalid || hint) && (
        <span className={clsx("block text-[10.5px]", invalid ? "text-danger" : "text-ink-4")}>{invalid ?? hint}</span>
      )}
    </span>
  );
}

/* ── dialogs ────────────────────────────────────────────────────────── */

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
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="accent" loading={pending} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
            {confirm}
          </Btn>
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Labeled label={label} required>
          <AreaBox value={text} onChange={(e) => setText(e.target.value)} />
        </Labeled>
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
      description="The date the salaries left the bank. This closes the month."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="accent" loading={pending} disabled={!paidOn} onClick={() => onConfirm(paidOn)}>
            Mark as paid
          </Btn>
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Labeled label="Paid on" required>
          <TextBox type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Labeled>
      </div>
    </Modal>
  );
}
