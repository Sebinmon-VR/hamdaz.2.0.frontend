"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, CalendarPlus, HandCoins } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { amount, dateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  COUNTRY_NAME,
  MONTHS,
  type Country,
  type PayrollRun,
  type PayrollRunDetail,
} from "@/lib/payroll";
import { PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, PillRail, Select, Textarea } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";
import { NotProcessorNotice, PayrollOnly } from "@/components/payroll/PayrollOnly";
import { CountryBadge, RunStatusBadge } from "@/components/payroll/badges";

export default function PayrollPage() {
  return (
    <PayrollOnly>
      <PayrollMonths />
    </PayrollOnly>
  );
}

type Filter = "all" | Country;

/**
 * Every payroll month, newest first, one row per country per month.
 *
 * The approver's question when they arrive is "is anything waiting for me",
 * so that is answered above the list rather than left to a status filter.
 */
function PayrollMonths() {
  const { payroll, user } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const runs = useSWR<PayrollRun[]>(
    withQuery("/payroll/runs", { country: filter === "all" ? undefined : filter }),
  );

  const waiting = (runs.data ?? []).filter(
    (r) => r.status === "submitted" && r.submitted_by_id !== user.id,
  );

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Payroll"
        title="Payroll months"
        count={runs.data ? `${runs.data.length}` : undefined}
        lead="Prepared by the payroll processors, approved by a super admin or the CEO."
        actions={
          payroll.can_process && (
            <Button variant="accent" icon={CalendarPlus} onClick={() => setCreating(true)}>
              Start a month
            </Button>
          )
        }
      />

      <NotProcessorNotice doing="add employees or start a month" />

      {payroll.can_approve && waiting.length > 0 && (
        <InlineNotice tone="warn">
          {waiting.length === 1 ? "One month is" : `${waiting.length} months are`} waiting for your
          approval:{" "}
          {waiting.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link className="underline" href={`/payroll/runs/${r.id}`}>
                {COUNTRY_NAME[r.country]} {r.label}
              </Link>
            </span>
          ))}
          .
        </InlineNotice>
      )}

      <PillRail
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Both countries" },
          { value: "AE", label: "UAE" },
          { value: "IN", label: "India" },
        ]}
      />

      <Panel className="py-2">
        {runs.error ? (
          <ErrorState error={runs.error} onRetry={() => runs.mutate()} />
        ) : !runs.data ? (
          <RowsSkeleton rows={5} />
        ) : runs.data.length === 0 ? (
          <Empty
            icon={HandCoins}
            title="No payroll months yet"
            body={
              payroll.can_process
                ? "Add the employees and their salaries first, then start a month: everyone employed in it is included and calculated."
                : "Nothing has been prepared yet. The payroll processors start each month."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-ink-4">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">People</th>
                  <th className="px-2 py-2 text-right font-medium">Gross</th>
                  <th className="px-2 py-2 text-right font-medium">Net pay</th>
                  <th className="px-2 py-2 text-right font-medium">Employer cost</th>
                  <th className="px-4 py-2 font-medium">Last step</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr key={run.id} className="border-t border-line hover:bg-panel-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/payroll/runs/${run.id}`} className="flex items-center gap-2">
                        <CountryBadge country={run.country} />
                        <span className="font-medium text-ink">{run.label}</span>
                        {run.warning_count > 0 && run.status === "draft" && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-warn"
                            title="Things to check before submitting"
                          >
                            <AlertTriangle className="size-3" /> {run.warning_count}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="tnum px-2 py-2.5 text-right">{run.headcount}</td>
                    <td className="tnum px-2 py-2.5 text-right">{amount(run.gross, run.currency)}</td>
                    <td className="tnum px-2 py-2.5 text-right font-semibold">
                      {amount(run.net, run.currency)}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right text-ink-3">
                      {amount(run.employer_cost, run.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-3">{lastStep(run)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 md:grid-cols-3">
        <QuickLink href="/payroll/employees" title="Employees on payroll" body="Who is paid, their bank details and salary history." />
        <QuickLink href="/payroll/gratuity" title="Gratuity" body="UAE end-of-service gratuity owed, as of any date." />
        <QuickLink href="/payroll/access" title="Who can see payroll" body="The Accounts team, the access list, and who processes." />
      </div>

      <NewMonth open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function lastStep(run: PayrollRun): string {
  if (run.status === "paid") return `Paid ${run.paid_on ?? ""}${run.paid_by_name ? ` · ${run.paid_by_name}` : ""}`;
  if (run.status === "approved") return `Approved by ${run.approved_by_name ?? "—"}, ${dateTime(run.approved_at)}`;
  if (run.status === "submitted") return `Submitted by ${run.submitted_by_name ?? "—"}, ${dateTime(run.submitted_at)}`;
  if (run.returned_note) return "Returned — see the note";
  return `Started by ${run.created_by_name ?? "—"}`;
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href}>
      <Panel className="h-full p-4 transition hover:bg-panel-2">
        <PanelHead title={title} />
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{body}</p>
      </Panel>
    </Link>
  );
}

function NewMonth({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const today = new Date();
  const [country, setCountry] = useState<Country>("AE");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [note, setNote] = useState("");

  const create = useAction(async () => {
    const run = await api.post<PayrollRunDetail>("/payroll/runs", {
      country,
      year,
      month,
      note: note.trim() || null,
    });
    router.push(`/payroll/runs/${run.id}`);
    return run;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a payroll month"
      description="Everyone on that country's payroll who is employed during the month is added and calculated. Nothing is paid or sent: it starts as a draft."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={create.pending} onClick={() => create.run()}>
            Start {COUNTRY_NAME[country]} {MONTHS[month - 1]} {year}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}
        <Field label="Country">
          <Select value={country} onChange={(e) => setCountry(e.target.value as Country)}>
            <option value="AE">UAE (AED)</option>
            <option value="IN">India (INR)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Month">
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year">
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Note" hint="Optional. Shown on the month for whoever approves it.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
