"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  employeesKey,
  type Country,
  type PayrollEmployee,
  type PayrollRun,
} from "@/lib/payroll";
import { PageHead } from "@/components/ui/primitives";
import { PanelSkeleton } from "@/components/ui/feedback";
import { PayrollOnly } from "@/components/payroll/PayrollOnly";
import { readPlace, usePayrollPlace, writePlace, type PayrollTab } from "@/components/payroll/place";
import { PayRunView } from "@/components/payroll/PayRunView";
import { EmployeesView } from "@/components/payroll/EmployeesView";
import { SettingsView } from "@/components/payroll/SettingsView";
import { Note, SelectBox, Surface, UnderlineTabs } from "@/components/payroll/ui";

/**
 * Payroll, laid out like the payroll products people already know: one flat
 * surface, three tabs — Pay run, Employees, Settings — and tables.
 *
 * Where you are lives in the query string (see `place.ts`), so payroll is one
 * tab in the strip and a link to a month or a person still opens exactly that.
 * The statutory machinery — PF, ESI, professional tax, TDS, WPS ids — is all
 * still there, but out of sight unless somebody's deductions are switched on.
 */
export default function PayrollPage() {
  return (
    <PayrollOnly>
      {/* useSearchParams needs a Suspense boundary above it. */}
      <Suspense fallback={<PanelSkeleton lines={8} />}>
        <Payroll />
      </Suspense>
    </PayrollOnly>
  );
}

const TABS: { value: PayrollTab; label: string }[] = [
  { value: "run", label: "Pay run" },
  { value: "employees", label: "Employees" },
  { value: "settings", label: "Settings" },
];

function Payroll() {
  const params = useSearchParams();
  const router = useRouter();
  const place = usePayrollPlace();
  const employees = useSWR<PayrollEmployee[]>(employeesKey());
  const runs = useSWR<PayrollRun[]>("/payroll/runs");

  // The tab and the rail both link to plain `/payroll`; coming back through
  // either returns to where you left off.
  const query = params.toString();
  const stored = query ? null : readPlace();
  useEffect(() => {
    if (query) writePlace(query);
    else if (stored) router.replace(`/payroll?${stored}`, { scroll: false });
  }, [query, stored, router]);
  if (stored) return <PanelSkeleton lines={8} />;

  const { tab, go } = place;
  const error = employees.error ?? runs.error;
  const ready = employees.data && runs.data;

  // The countries anybody is paid in. With one, the page never mentions
  // countries at all; with both, a switch appears.
  const inUse = (["IN", "AE"] as Country[]).filter(
    (c) =>
      (employees.data ?? []).some((e) => e.country === c) || (runs.data ?? []).some((r) => r.country === c),
  );
  const country: Country = place.country ?? inUse[0] ?? "IN";
  const both = inUse.length > 1;

  return (
    <div className="space-y-3">
      <PageHead title="Payroll & invoicing" eyebrow={TABS.find((t) => t.value === tab)!.label} />

      <Surface>
        <UnderlineTabs
          value={tab}
          onChange={(next) => go({ tab: next })}
          options={TABS.map((t) => ({
            ...t,
            count:
              t.value === "employees" && employees.data
                ? employees.data.filter((e) => e.active).length
                : undefined,
          }))}
          right={
            both &&
            (tab === "run" || tab === "employees") && (
              <div className="w-32">
                <SelectBox
                  aria-label="Country"
                  value={country}
                  onChange={(e) => go({ tab, month: place.month, country: e.target.value as Country }, { replace: true })}
                >
                  <option value="IN">India</option>
                  <option value="AE">UAE</option>
                </SelectBox>
              </div>
            )
          }
        />

        <div key={tab}>
          {error ? (
            <Note tone="danger">{error.message ?? "Payroll could not be loaded."}</Note>
          ) : !ready ? (
            <PanelSkeleton lines={8} className="p-4" />
          ) : tab === "run" ? (
            <PayRunView country={country} month={place.month} runId={place.run} go={go} />
          ) : tab === "employees" ? (
            <EmployeesView country={country} showCountry={both} selected={place.employee} go={go} />
          ) : (
            <SettingsView countries={inUse} />
          )}
        </div>
      </Surface>
    </div>
  );
}
