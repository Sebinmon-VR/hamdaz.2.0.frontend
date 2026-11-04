"use client";

import { useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { AlertTriangle, Check, UserPlus } from "lucide-react";
import { withQuery } from "@/lib/api";
import { amount, date, isoDay } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  employeeGaps,
  employeesKey,
  type Country,
  type GratuityRow,
  type PayrollEmployee,
} from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";
import { PanelSkeleton } from "@/components/ui/feedback";
import { EmployeeDrawer } from "@/components/payroll/EmployeeDrawer";
import { Btn, Note, SearchBox, TD, TH, Toolbar } from "@/components/payroll/ui";
import type { Go } from "@/components/payroll/place";

/**
 * Everyone on payroll, as a plain table. A row opens the person in the side
 * panel; so does "Add employee".
 *
 * Not the same list as the directory: site staff are paid without a login,
 * and a login is not a salary.
 */
export function EmployeesView({
  country,
  showCountry,
  selected,
  go,
}: {
  country: Country;
  /** Whether both countries are in use, so the table is filtered to one. */
  showCountry: boolean;
  selected: string | null;
  go: Go;
}) {
  const { payroll } = useSession();
  const [showLeft, setShowLeft] = useState(false);
  const [search, setSearch] = useState("");
  const employees = useSWR<PayrollEmployee[]>(employeesKey(showLeft));
  const all = employees.data ?? [];
  const hasUae = all.some((e) => e.country === "AE" && e.active);
  // UAE gratuity owed today, as a column rather than a report of its own.
  const gratuity = useSWR<GratuityRow[]>(
    hasUae ? withQuery("/payroll/gratuity", { as_of: isoDay(new Date()) }) : null,
  );
  const owed = new Map((gratuity.data ?? []).map((g) => [g.employee_id, g.gratuity]));

  const q = search.trim().toLowerCase();
  const rows = all.filter(
    (e) =>
      (!showCountry || e.country === country) &&
      (!q ||
        e.full_name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.designation ?? "").toLowerCase().includes(q)),
  );
  const uaeColumn = hasUae && (!showCountry || country === "AE");

  return (
    <>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search name or code" />
        <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} />
          Include people who left
        </label>
        <span className="tnum text-[12px] text-ink-4">
          {employees.data ? `${rows.length} ${rows.length === 1 ? "employee" : "employees"}` : ""}
        </span>
        {payroll.can_process && (
          <span className="ml-auto">
            <Btn variant="accent" icon={UserPlus} onClick={() => go({ employee: "new" })}>
              Add employee
            </Btn>
          </span>
        )}
      </Toolbar>

      {employees.error ? (
        <Note tone="danger">{employees.error.message}</Note>
      ) : !employees.data ? (
        <PanelSkeleton lines={5} className="p-4" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13px] text-ink-3">
          {all.length
            ? "Nobody matches."
            : payroll.can_process
              ? "No employees yet. Add each person with their salary and bank details."
              : "No employees yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Code</th>
                <th className={TH}>Employee</th>
                <th className={TH}>Designation</th>
                <th className={TH}>Joined</th>
                <th className={clsx(TH, "text-right")}>Monthly salary</th>
                {uaeColumn && <th className={clsx(TH, "text-right")}>Gratuity owed</th>}
                <th className={TH}>Bank details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const gaps = employeeGaps(e).filter((g) => g !== "salary");
                return (
                  <tr
                    key={e.id}
                    onClick={() => go({ employee: e.id })}
                    className="cursor-pointer hover:bg-panel-2/50"
                  >
                    <td className={clsx(TD, "w-28 text-ink-3")}>{e.code}</td>
                    <td className={TD}>
                      <button
                        className="font-medium text-ink hover:underline"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          go({ employee: e.id });
                        }}
                      >
                        {e.full_name}
                      </button>
                      {!e.active && <Badge className="ml-2">Left {date(e.left_on)}</Badge>}
                    </td>
                    <td className={clsx(TD, "text-ink-3")}>{e.designation ?? "—"}</td>
                    <td className={clsx(TD, "text-ink-3")}>{date(e.joined_on)}</td>
                    <td className={clsx(TD, "tnum text-right")}>
                      {e.current_salary ? (
                        amount(e.current_salary.monthly_total, e.currency)
                      ) : (
                        <span className="text-warn">No salary</span>
                      )}
                    </td>
                    {uaeColumn && (
                      <td className={clsx(TD, "tnum text-right text-ink-3")}>
                        {e.country === "AE" ? amount(owed.get(e.id) ?? "0") : ""}
                      </td>
                    )}
                    <td className={TD}>
                      {gaps.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-positive">
                          <Check className="size-3.5" /> Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-warn" title={gaps.join(", ")}>
                          <AlertTriangle className="size-3.5" /> Missing {gaps.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <EmployeeDrawer key={selected} id={selected} country={country} employees={all} onClose={() => go({})} />
      )}
    </>
  );
}
