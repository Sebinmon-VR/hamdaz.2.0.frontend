"use client";

import { useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { FilePlus2 } from "lucide-react";
import { amount, date } from "@/lib/format";
import { useSession } from "@/lib/session";
import { INVOICE_STATUS, type InvoiceSetup, type InvoiceStatus, type PayrollInvoice } from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";
import { PanelSkeleton } from "@/components/ui/feedback";
import { InvoiceDrawer } from "@/components/payroll/InvoiceDrawer";
import { Btn, Note, SearchBox, SelectBox, TD, TH, Toolbar } from "@/components/payroll/ui";
import type { Go } from "@/components/payroll/place";

/**
 * Invoices raised from payroll — the month's salaries, rent, anything else —
 * on their way to Zoho Books. A row opens the invoice in the side panel.
 */
export function InvoicesView({ selected, go }: { selected: string | null; go: Go }) {
  const { payroll } = useSession();
  const invoices = useSWR<PayrollInvoice[]>("/payroll/invoices");
  const setup = useSWR<InvoiceSetup>("/payroll/invoice-setup");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");

  const q = search.trim().toLowerCase();
  const rows = (invoices.data ?? []).filter(
    (i) =>
      (status === "all" || i.status === status) &&
      (!q ||
        i.number.toLowerCase().includes(q) ||
        i.customer_name.toLowerCase().includes(q) ||
        (i.reference_number ?? "").toLowerCase().includes(q) ||
        (i.zoho_invoice_number ?? "").toLowerCase().includes(q)),
  );

  return (
    <>
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Number, customer, reference" />
        <div className="w-44">
          <SelectBox aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All invoices</option>
            <option value="draft">Drafts</option>
            <option value="submitted">Waiting for approval</option>
            <option value="approved">Approved</option>
          </SelectBox>
        </div>
        {setup.data && (
          <span className="text-[12px] text-ink-4">
            Zoho: {setup.data.zoho_live ? "live" : "test mode — nothing is written"}
            {setup.data.zoho_organization ? ` · ${setup.data.zoho_organization}` : ""}
          </span>
        )}
        {payroll.can_process && (
          <span className="ml-auto">
            <Btn variant="accent" icon={FilePlus2} onClick={() => go({ invoice: "new" })}>
              New invoice
            </Btn>
          </span>
        )}
      </Toolbar>

      {invoices.error ? (
        <Note tone="danger">{invoices.error.message}</Note>
      ) : !invoices.data ? (
        <PanelSkeleton lines={5} className="p-4" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13px] text-ink-3">
          {invoices.data.length
            ? "Nothing matches."
            : payroll.can_process
              ? "No invoices yet. New invoice raises one — a payroll month, rent, anything else — to a Zoho customer."
              : "No invoices yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Number</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Date</th>
                <th className={TH}>Due</th>
                <th className={clsx(TH, "text-right")}>Total</th>
                <th className={TH}>Status</th>
                <th className={TH}>Zoho</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => go({ invoice: i.id })} className="cursor-pointer hover:bg-panel-2/50">
                  <td className={clsx(TD, "font-medium text-ink")}>{i.number}</td>
                  <td className={TD}>
                    <span className="text-ink">{i.customer_name}</span>
                    {i.reference_number && <span className="block text-[11px] text-ink-4">{i.reference_number}</span>}
                  </td>
                  <td className={clsx(TD, "text-ink-3")}>{date(i.invoice_date)}</td>
                  <td className={clsx(TD, "text-ink-3")}>
                    {i.due_date ? date(i.due_date) : i.payment_terms !== null ? `${i.payment_terms} days` : "—"}
                  </td>
                  <td className={clsx(TD, "tnum text-right font-semibold")}>{amount(i.total, i.currency)}</td>
                  <td className={TD}>
                    <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                  </td>
                  <td className={clsx(TD, "text-[12px]")}>
                    {i.zoho_mode === "live" ? (
                      <span className="text-positive">{i.zoho_invoice_number}</span>
                    ) : i.zoho_mode === "test" ? (
                      <span className="text-ink-3">Checked (test)</span>
                    ) : i.zoho_error ? (
                      <span className="text-danger">Not ready</span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <InvoiceDrawer
          key={selected}
          id={selected}
          onClose={() => go({})}
          onCreated={(id) => go({ invoice: id }, { replace: true })}
        />
      )}
    </>
  );
}
