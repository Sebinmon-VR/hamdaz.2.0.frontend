"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { UserPlus, Users } from "lucide-react";
import { withQuery } from "@/lib/api";
import { amount, date } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Country, PayrollEmployee } from "@/lib/payroll";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { LinkButton, PillRail, SearchInput, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { NotProcessorNotice, PayrollOnly } from "@/components/payroll/PayrollOnly";
import { CountryBadge } from "@/components/payroll/badges";

export default function PayrollEmployeesPage() {
  return (
    <PayrollOnly>
      <Employees />
    </PayrollOnly>
  );
}

type Filter = "all" | Country;

/**
 * Everyone on payroll. Not the same list as the directory: site staff are paid
 * without a login, and a login is not a salary.
 */
function Employees() {
  const { payroll } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [showLeft, setShowLeft] = useState(false);
  const [search, setSearch] = useState("");
  const employees = useSWR<PayrollEmployee[]>(
    withQuery("/payroll/employees", {
      country: filter === "all" ? undefined : filter,
      include_left: showLeft,
    }),
  );

  const q = search.trim().toLowerCase();
  const rows = (employees.data ?? []).filter(
    (e) =>
      !q ||
      e.full_name.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q) ||
      (e.designation ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Payroll"
        title="Employees on payroll"
        count={employees.data ? `${rows.length}` : undefined}
        actions={
          payroll.can_process && (
            <LinkButton href="/payroll/employees/new" variant="accent" icon={UserPlus}>
              Add an employee
            </LinkButton>
          )
        }
      />

      <NotProcessorNotice doing="add or change employees" />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Both countries" },
            { value: "AE", label: "UAE" },
            { value: "IN", label: "India" },
          ]}
        />
        <div className="min-w-56 flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Name, code or designation" />
        </div>
        <div className="w-56">
          <Toggle checked={showLeft} onChange={setShowLeft} label="Include people who left" />
        </div>
      </div>

      <Panel className="py-2">
        {employees.error ? (
          <ErrorState error={employees.error} onRetry={() => employees.mutate()} />
        ) : !employees.data ? (
          <RowsSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <Empty
            icon={Users}
            title={employees.data.length ? "Nobody matches" : "Nobody on payroll yet"}
            body={
              payroll.can_process
                ? "Add each employee with their bank details and a salary structure. They are included in the next month you start."
                : "The payroll processors add employees."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-ink-4">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">Country</th>
                  <th className="px-2 py-2 font-medium">Joined</th>
                  <th className="px-2 py-2 text-right font-medium">Monthly salary</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-line hover:bg-panel-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/payroll/employees/${e.id}`} className="block">
                        <span className="font-medium text-ink">{e.full_name}</span>
                        <span className="block text-[11px] text-ink-4">
                          {e.code}
                          {e.designation ? ` · ${e.designation}` : ""}
                          {e.department ? ` · ${e.department}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <CountryBadge country={e.country} />
                    </td>
                    <td className="px-2 py-2.5 text-ink-3">{date(e.joined_on)}</td>
                    <td className="tnum px-2 py-2.5 text-right">
                      {e.current_salary ? amount(e.current_salary.monthly_total, e.currency) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!e.active && <Badge>Left {date(e.left_on)}</Badge>}
                      {e.active && !e.current_salary && <Badge tone="warn">No salary</Badge>}
                      {e.active && e.user_name && (
                        <span className="text-[11px] text-ink-4" title="Linked login — approved unpaid leave is read from it">
                          {e.user_name}
                        </span>
                      )}
                    </td>
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
