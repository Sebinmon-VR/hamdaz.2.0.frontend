"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Landmark } from "lucide-react";
import { withQuery } from "@/lib/api";
import { amount, date, decimal, isoDay, sumExact } from "@/lib/format";
import type { GratuityRow } from "@/lib/payroll";
import { PageHead, Panel, StatBox } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, RowsSkeleton } from "@/components/ui/feedback";
import { PayrollOnly } from "@/components/payroll/PayrollOnly";

export default function GratuityPage() {
  return (
    <PayrollOnly>
      <Gratuity />
    </PayrollOnly>
  );
}

/**
 * UAE end-of-service gratuity owed on a date — the liability accounts carries,
 * and the figure for a leaver's final settlement.
 */
function Gratuity() {
  const [asOf, setAsOf] = useState(isoDay(new Date()));
  const rows = useSWR<GratuityRow[]>(withQuery("/payroll/gratuity", { as_of: asOf || undefined }));
  const total = rows.data ? sumExact(rows.data.map((r) => r.gratuity)) : null;

  return (
    <div className="space-y-4">
      <PageHead eyebrow="Payroll · UAE" title="End-of-service gratuity" count={rows.data ? `${rows.data.length}` : undefined} />

      <InlineNotice tone="info">
        21 days&apos; basic for each of the first five years and 30 days&apos; for each year after, nothing
        before a full year, never more than two years&apos; basic; a day&apos;s basic is the monthly basic
        / 30. Unpaid absence is not deducted from service here — adjust for it on a final settlement.
      </InlineNotice>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <Field label="Owed as of">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
        </Panel>
        <StatBox label="Total owed" value={amount(total ?? "0", "AED")} tone="second" />
        <StatBox label="People" value={rows.data?.length ?? "—"} />
      </div>

      <Panel className="py-2">
        {rows.error ? (
          <ErrorState error={rows.error} onRetry={() => rows.mutate()} />
        ) : !rows.data ? (
          <RowsSkeleton rows={5} />
        ) : rows.data.length === 0 ? (
          <Empty icon={Landmark} title="Nobody on UAE payroll on that date" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-ink-4">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">Joined</th>
                  <th className="px-2 py-2 text-right font-medium">Basic</th>
                  <th className="px-2 py-2 text-right font-medium">Years</th>
                  <th className="px-4 py-2 text-right font-medium">Gratuity</th>
                </tr>
              </thead>
              <tbody>
                {rows.data.map((r) => (
                  <tr key={r.employee_id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link href={`/payroll/employees/${r.employee_id}`} className="font-medium text-ink">
                        {r.full_name}
                      </Link>
                      <span className="block text-[11px] text-ink-4">
                        {r.code}
                        {r.left_on ? ` · left ${date(r.left_on)}` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-ink-3">{date(r.joined_on)}</td>
                    <td className="tnum px-2 py-2.5 text-right">{amount(r.basic)}</td>
                    <td className="tnum px-2 py-2.5 text-right">{decimal(r.service_years)}</td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold">{amount(r.gratuity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
