"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import useSWR, { mutate as mutateKey } from "swr";
import { CloudUpload, FileText, Mail, Pencil, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, dateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { InvoiceCharge, InvoiceSetup, PayrollRunDetail, RunInvoice } from "@/lib/payroll";
import { Drawer, DrawerSection } from "@/components/payroll/Drawer";
import { CustomerSearch, ItemSearch } from "@/components/payroll/ZohoPicker";
import { fromCents, toCents } from "@/components/payroll/estimate";
import { AreaBox, Btn, IconBtn, Labeled, Note, SelectBox, TD, TH, TextBox, Toolbar } from "@/components/payroll/ui";

/**
 * The month's invoice, under its pay sheet.
 *
 * The India payroll is billed to the UAE company: the salary lines are read
 * off the payslips (and move as unpaid days or bonuses are typed into the
 * sheet above), the other charges are added here. It is approved with the
 * month, and after that it goes to Zoho and the report goes out.
 */
export function RunInvoice({
  run,
  salaryDeltas,
  pendingSheet,
}: {
  run: PayrollRunDetail;
  /** Per payslip, in order: what typed-but-unsaved sheet edits add to its cost, in paise. */
  salaryDeltas: number[];
  /** Whether the sheet has edits the backend has not confirmed yet. */
  pendingSheet: boolean;
}) {
  const { payroll } = useSession();
  const key = `/payroll/runs/${run.id}/invoice`;
  const invoice = useSWR<RunInvoice>(key);
  const setup = useSWR<InvoiceSetup>("/payroll/invoice-setup");
  const [editing, setEditing] = useState(false);

  const draft = run.status === "draft";
  const editable = draft && payroll.can_process;
  const approved = run.status === "approved" || run.status === "paid";
  const canZoho = approved && (payroll.can_process || payroll.can_approve);

  const zoho = useAction(async () => {
    try {
      const next = await api.post<RunInvoice>(`${key}/zoho`);
      await invoice.mutate(next, { revalidate: false });
      return next;
    } finally {
      // A refusal still records why on the invoice; show it.
      void mutateKey(key);
    }
  });
  const report = useAction(async () => {
    const next = await api.post<RunInvoice>(`${key}/report`);
    await invoice.mutate(next, { revalidate: false });
    return next;
  });
  const pdf = useAction(async () => {
    const i = invoice.data!;
    return api.download(`/payroll/runs/${run.id}/invoice.pdf`, `${i.number ?? "Invoice"}${i.zoho_mode === "live" ? "" : " TEST"}.pdf`);
  });

  if (invoice.error) return <Note tone="danger">The invoice could not be loaded: {invoice.error.message}</Note>;
  if (!invoice.data) return null;
  const i = invoice.data;

  // The sheet's unsaved edits, carried into the salary lines straight away.
  const convert = (cents: number) =>
    i.currency === i.run_currency ? cents : i.exchange_rate ? Math.round(cents / Number(i.exchange_rate)) : 0;
  const totalDelta = convert(salaryDeltas.reduce((a, b) => a + b, 0));
  let salaryIndex = 0;
  const lines = i.lines.map((line) => {
    if (line.source !== "salary") return { ...line, cents: toCents(line.amount) };
    const delta = i.salary_lines === "single" ? totalDelta : convert(salaryDeltas[salaryIndex++] ?? 0);
    return { ...line, cents: toCents(line.amount) + delta };
  });
  const sub = toCents(i.sub_total) + totalDelta;
  const total = toCents(i.total) + totalDelta;
  const money = (cents: number) => amount(fromCents(cents), i.currency);
  const error = zoho.error ?? report.error ?? pdf.error;

  return (
    <section className="border-t border-line">
      <Toolbar>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Invoice</span>
        <span className="text-[13px] font-semibold text-ink">{i.number ?? "Not numbered yet"}</span>
        <span className="hidden min-w-0 truncate text-[12px] text-ink-3 md:block">
          {i.issuer_name} → {i.customer_name} · {i.currency} · {date(i.invoice_date)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editable && (
            <Btn icon={Pencil} onClick={() => setEditing(true)}>
              Edit invoice
            </Btn>
          )}
          <Btn icon={FileText} loading={pdf.pending} onClick={() => pdf.run()}>
            Invoice PDF
          </Btn>
          {canZoho && i.zoho_mode !== "live" && (
            <Btn variant="accent" icon={CloudUpload} loading={zoho.pending} onClick={() => zoho.run()}>
              {i.zoho_mode === "test" ? "Check in Zoho again" : "Create in Zoho"}
              {setup.data && !setup.data.zoho_live && (
                <span className="ml-1 rounded bg-accent-ink/15 px-1 text-[10px] font-bold">TEST</span>
              )}
            </Btn>
          )}
          {canZoho && i.zoho_mode && (
            <Btn icon={Mail} loading={report.pending} onClick={() => report.run()}>
              Send report
            </Btn>
          )}
        </div>
      </Toolbar>

      {error && <Note tone="danger">{error}</Note>}
      {i.needs_rate && (
        <Note tone="warn">
          The invoice is in {i.currency} but the payroll is in {i.run_currency}: give the exchange rate in Edit
          invoice, or the salaries are billed at 0.
        </Note>
      )}
      {!i.customer_zoho_id && (
        <Note>
          {i.customer_name} is not linked to a Zoho contact yet — link it in Edit invoice or in Settings →
          Invoicing. Zoho needs it.
        </Note>
      )}
      <ZohoNotes invoice={i} setup={setup.data} approved={approved} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Item and description</th>
              <th className={clsx(TH, "text-right")}>Qty</th>
              <th className={clsx(TH, "text-right")}>Rate</th>
              <th className={TH}>Tax</th>
              <th className={clsx(TH, "text-right")}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, n) => (
              <tr key={n}>
                <td className={TD}>
                  <span className="font-medium text-ink">{line.name}</span>
                  {line.source === "salary" && (
                    <span className="ml-2 text-[11px] text-ink-4">from the pay sheet</span>
                  )}
                  {line.description && <span className="block text-[11.5px] text-ink-4">{line.description}</span>}
                </td>
                <td className={clsx(TD, "tnum text-right text-ink-2")}>{Number(line.quantity)}</td>
                <td className={clsx(TD, "tnum text-right text-ink-2")}>
                  {amount(fromCents(line.source === "salary" ? line.cents : toCents(line.rate)))}
                </td>
                <td className={clsx(TD, "text-ink-3")}>
                  {line.tax_id ? `${line.tax_name ?? "Tax"} ${Number(line.tax_percentage)} %` : "—"}
                </td>
                <td className={clsx(TD, "tnum text-right", pendingSheet && line.source === "salary" ? "text-info" : "text-ink")}>
                  {amount(fromCents(line.cents))}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td className={clsx(TD, "text-ink-4")} colSpan={5}>
                  Nothing to invoice yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-72 px-4 py-2.5 text-[13px]">
        <Row label="Sub total" value={money(sub)} />
        <Row label="Tax" value={money(toCents(i.tax_total))} />
        {Number(i.adjustment) !== 0 && (
          <Row label={i.adjustment_description || "Adjustment"} value={money(toCents(i.adjustment))} />
        )}
        <div className="mt-1 flex justify-between border-t border-line pt-1.5 font-semibold">
          <dt>Invoice total</dt>
          <dd className="tnum">{money(total)}</dd>
        </div>
      </dl>

      {editing && setup.data && (
        <InvoiceEditor
          run={run}
          invoice={i}
          setup={setup.data}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            void invoice.mutate(next, { revalidate: false });
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

/** Where the invoice is with Zoho and the report, in a line or two. */
function ZohoNotes({ invoice: i, setup, approved }: { invoice: RunInvoice; setup?: InvoiceSetup; approved: boolean }) {
  const mailOff = setup && !setup.mail ? " Mail is off in Settings → Invoicing, so nothing is sent." : "";
  return (
    <>
      {approved && !i.zoho_mode && !i.zoho_error && (
        <Note tone="positive">
          Approved with the month. Next: <b>Create in Zoho</b>, which also sends the report — the invoice and the
          salary register — to the super admins, the CEO and Accounts.{mailOff}
        </Note>
      )}
      {i.zoho_error && <Note tone="danger">Not ready for Zoho: {i.zoho_error}</Note>}
      {i.zoho_mode === "test" && (
        <Note>
          Checked against Zoho {dateTime(i.zoho_at)} by {i.zoho_by_name ?? "—"} — <b>test mode, nothing written</b>.
        </Note>
      )}
      {i.zoho_mode === "live" && (
        <Note tone="positive">
          In Zoho Books as <b>{i.zoho_invoice_number}</b>, created {dateTime(i.zoho_at)} by {i.zoho_by_name ?? "—"}.
        </Note>
      )}
      {i.zoho_mode &&
        (i.report_sent_at ? (
          <Note tone="positive">
            Report mailed {dateTime(i.report_sent_at)} to {i.report_to.join(", ")}.
          </Note>
        ) : i.report_error ? (
          <Note tone="danger">Report not sent: {i.report_error}</Note>
        ) : (
          <Note>Report not mailed — mail is off. It would go to {i.report_to.join(", ") || "nobody"}.</Note>
        ))}
    </>
  );
}

/* ── editing ───────────────────────────────────────────────────────── */

interface Form {
  customer_zoho_id: string | null;
  customer_name: string;
  customer_address: string;
  currency: string;
  exchange_rate: string;
  invoice_date: string;
  due_date: string;
  payment_terms: string;
  reference_number: string;
  salary_lines: "single" | "per_employee";
  charges: InvoiceCharge[];
  adjustment: string;
  adjustment_description: string;
  notes: string;
  terms: string;
}

const BLANK: InvoiceCharge = {
  item_id: null,
  name: "",
  description: null,
  quantity: "1",
  rate: "",
  tax_id: null,
  tax_name: null,
  tax_percentage: "0",
};

function toForm(i: RunInvoice): Form {
  return {
    customer_zoho_id: i.customer_zoho_id,
    customer_name: i.customer_name,
    customer_address: i.customer_address ?? "",
    currency: i.currency,
    exchange_rate: i.exchange_rate ?? "",
    invoice_date: i.invoice_date,
    due_date: i.due_date ?? "",
    payment_terms: i.payment_terms === null ? "" : String(i.payment_terms),
    reference_number: i.reference_number ?? "",
    salary_lines: i.salary_lines,
    charges: i.charges.map((c) => ({ ...c, quantity: String(Number(c.quantity)) })),
    adjustment: Number(i.adjustment) ? i.adjustment : "",
    adjustment_description: i.adjustment_description ?? "",
    notes: i.notes ?? "",
    terms: i.terms ?? "",
  };
}

function toBody(f: Form) {
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  return {
    customer_zoho_id: f.customer_zoho_id,
    customer_name: f.customer_name.trim(),
    customer_address: blank(f.customer_address),
    currency: f.currency,
    exchange_rate: blank(f.exchange_rate),
    invoice_date: f.invoice_date,
    due_date: blank(f.due_date),
    payment_terms: f.payment_terms.trim() ? Number(f.payment_terms) : null,
    reference_number: blank(f.reference_number),
    salary_lines: f.salary_lines,
    charges: f.charges
      .filter((c) => c.name.trim() || c.rate.trim())
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        description: c.description?.trim() || null,
        quantity: c.quantity || "1",
        rate: c.rate || "0",
        tax_percentage: c.tax_id ? c.tax_percentage : "0",
      })),
    adjustment: f.adjustment.trim() || "0",
    adjustment_description: blank(f.adjustment_description),
    notes: blank(f.notes),
    terms: blank(f.terms),
  };
}

function InvoiceEditor({
  run,
  invoice,
  setup,
  onClose,
  onSaved,
}: {
  run: PayrollRunDetail;
  invoice: RunInvoice;
  setup: InvoiceSetup;
  onClose: () => void;
  onSaved: (next: RunInvoice) => void;
}) {
  const original = useMemo(() => toForm(invoice), [invoice]);
  const [form, setForm] = useState<Form>(original);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((x) => ({ ...x, [key]: value }));
  }
  function setCharge(n: number, patch: Partial<InvoiceCharge>) {
    setForm((x) => ({ ...x, charges: x.charges.map((c, j) => (j === n ? { ...c, ...patch } : c)) }));
  }

  const save = useAction(async () => {
    const next = await api.put<RunInvoice>(`/payroll/runs/${run.id}/invoice`, toBody(form));
    onSaved(next);
    return next;
  });

  // Live figures: salaries as the backend last worked them out (in the
  // invoice currency as saved), charges as typed.
  const sameCurrency = form.currency === invoice.run_currency;
  const salaryCents =
    form.currency === invoice.currency
      ? toCents(invoice.salaries)
      : sameCurrency
        ? toCents(run.employer_cost)
        : form.exchange_rate
          ? Math.round(toCents(run.employer_cost) / Number(form.exchange_rate))
          : 0;
  const charges = form.charges.map((c) => {
    const cents = Math.round(Number(c.quantity || 0) * Number(c.rate || 0) * 100) || 0;
    return { cents, tax: c.tax_id ? Math.round((cents * Number(c.tax_percentage || 0)) / 100) : 0 };
  });
  const sub = salaryCents + charges.reduce((t, c) => t + c.cents, 0);
  const tax = charges.reduce((t, c) => t + c.tax, 0);
  const adj = Math.round(Number(form.adjustment || 0) * 100) || 0;
  const money = (cents: number) => amount(fromCents(cents), form.currency);

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={`Invoice ${invoice.number ?? ""}`.trim()}
      subtitle={`${invoice.issuer_name} → ${form.customer_name || "…"} · approved with the month`}
      footer={
        <>
          <span className={clsx("min-w-0 flex-1 truncate text-[12px]", save.error ? "text-danger" : "text-ink-3")}>
            {save.error ?? (!form.customer_name.trim() ? "Still needed: the customer" : "")}
          </span>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="accent" loading={save.pending} disabled={!dirty || !form.customer_name.trim()} onClick={() => save.run()}>
            Save invoice
          </Btn>
        </>
      }
    >
      <DrawerSection title="Customer">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]">
          <Labeled
            label="Bill to"
            required
            hint={form.customer_zoho_id ? "Linked to the Zoho contact." : "Search Zoho to link the contact; Zoho needs it."}
          >
            <CustomerSearch
              value={form.customer_name}
              onText={(t) => setForm((x) => ({ ...x, customer_name: t, customer_zoho_id: null }))}
              onPick={(c) =>
                setForm((x) => ({
                  ...x,
                  customer_name: c.contact_name,
                  customer_zoho_id: c.contact_id,
                  currency: c.currency_code ?? x.currency,
                }))
              }
            />
          </Labeled>
          <Labeled label="Currency" hint={`Payroll is in ${invoice.run_currency}.`}>
            <SelectBox value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {[...new Set([form.currency, invoice.run_currency, ...setup.currencies])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
          </Labeled>
          {!sameCurrency && (
            <Labeled label={`${invoice.run_currency} per ${form.currency}`} required hint="To convert the salaries.">
              <TextBox inputMode="decimal" value={form.exchange_rate} onChange={(e) => set("exchange_rate", e.target.value)} />
            </Labeled>
          )}
        </div>
        <div className="mt-3">
          <Labeled label="Address on the invoice">
            <AreaBox value={form.customer_address} onChange={(e) => set("customer_address", e.target.value)} />
          </Labeled>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Labeled label="Invoice date" required>
            <TextBox type="date" value={form.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} />
          </Labeled>
          <Labeled label="Payment terms" hint="Days.">
            <TextBox inputMode="numeric" value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
          </Labeled>
          <Labeled label="Due date" hint="Instead of terms.">
            <TextBox type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </Labeled>
          <Labeled label="Reference">
            <TextBox value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)} />
          </Labeled>
        </div>
      </DrawerSection>

      <DrawerSection title="Salaries" hint="From the pay sheet">
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          {(
            [
              ["single", "One line — Salaries"],
              ["per_employee", "A line per employee"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="salary_lines"
                checked={form.salary_lines === value}
                onChange={() => set("salary_lines", value)}
              />
              {label}
            </label>
          ))}
          <span className="ml-auto tnum text-ink-2">{money(salaryCents)}</span>
        </div>
      </DrawerSection>

      <DrawerSection title="Other charges" hint="Rent, internet, anything else billed with the month">
        <div className="rounded-md border border-line">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_6.5rem_10.5rem_6.5rem_2rem] gap-2 border-b border-line bg-panel-2 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
            <span>Item and description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span>Tax</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {form.charges.length === 0 && <p className="px-2.5 py-2 text-[12px] text-ink-4">No other charges.</p>}
          {form.charges.map((c, n) => (
            <div key={n} className="grid grid-cols-[minmax(0,1fr)_4rem_6.5rem_10.5rem_6.5rem_2rem] items-start gap-2 border-b border-line px-2.5 py-2 last:border-b-0">
              <div className="min-w-0 space-y-1.5">
                <ItemSearch
                  value={c.name}
                  onText={(t) => setCharge(n, { name: t })}
                  onPick={(item) => {
                    const t = item.tax_id ? setup.taxes.find((x) => x.tax_id === item.tax_id) : undefined;
                    setCharge(n, {
                      item_id: item.item_id,
                      name: item.name,
                      description: c.description || item.description,
                      rate: c.rate || (item.rate ?? ""),
                      ...(t ? { tax_id: t.tax_id, tax_name: t.tax_name, tax_percentage: t.tax_percentage } : {}),
                    });
                  }}
                />
                <TextBox placeholder="Description" value={c.description ?? ""} onChange={(e) => setCharge(n, { description: e.target.value })} />
                {c.item_id && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">
                    Zoho item
                    <button className="hover:text-danger" aria-label="Unlink the Zoho item" onClick={() => setCharge(n, { item_id: null })}>
                      <X className="size-3" />
                    </button>
                  </span>
                )}
              </div>
              <TextBox className="text-right tnum" inputMode="decimal" aria-label="Quantity" value={c.quantity} onChange={(e) => setCharge(n, { quantity: e.target.value })} />
              <TextBox className="text-right tnum" inputMode="decimal" aria-label="Rate" placeholder="0.00" value={c.rate} onChange={(e) => setCharge(n, { rate: e.target.value })} />
              <SelectBox
                aria-label="Tax"
                value={c.tax_id ?? ""}
                onChange={(e) => {
                  const t = setup.taxes.find((x) => x.tax_id === e.target.value);
                  setCharge(n, t
                    ? { tax_id: t.tax_id, tax_name: t.tax_name, tax_percentage: t.tax_percentage }
                    : { tax_id: null, tax_name: null, tax_percentage: "0" });
                }}
              >
                <option value="">No tax</option>
                {setup.taxes.map((t) => (
                  <option key={t.tax_id} value={t.tax_id}>
                    {t.tax_name} ({Number(t.tax_percentage)} %)
                  </option>
                ))}
              </SelectBox>
              <span className="tnum pt-1.5 text-right text-[13px] text-ink">{amount(fromCents(charges[n]?.cents ?? 0))}</span>
              <IconBtn bare icon={X} label="Remove charge" className="size-7" onClick={() => set("charges", form.charges.filter((_, j) => j !== n))} />
            </div>
          ))}
          <div className="px-2.5 py-1.5">
            <Btn variant="ghost" icon={Plus} onClick={() => set("charges", [...form.charges, { ...BLANK }])}>
              Add a charge
            </Btn>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-between gap-4">
          <div className="grid w-full max-w-sm grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <Labeled label="Adjustment" hint="After tax, e.g. rounding. Negative to reduce.">
              <TextBox placeholder="Description" value={form.adjustment_description} onChange={(e) => set("adjustment_description", e.target.value)} />
            </Labeled>
            <Labeled label="Amount">
              <TextBox className="text-right tnum" inputMode="decimal" placeholder="0.00" value={form.adjustment} onChange={(e) => set("adjustment", e.target.value)} />
            </Labeled>
          </div>
          <dl className="ml-auto w-64 text-[13px]">
            <Row label="Salaries" value={money(salaryCents)} />
            <Row label="Other charges" value={money(sub - salaryCents)} />
            <Row label="Tax" value={money(tax)} />
            {adj !== 0 && <Row label={form.adjustment_description || "Adjustment"} value={money(adj)} />}
            <div className="mt-1 flex justify-between border-t border-line pt-1.5 font-semibold">
              <dt>Invoice total</dt>
              <dd className="tnum">{money(sub + tax + adj)}</dd>
            </div>
          </dl>
        </div>
      </DrawerSection>

      <DrawerSection title="On the invoice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Customer notes">
            <AreaBox value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Labeled>
          <Labeled label="Terms and conditions">
            <AreaBox value={form.terms} onChange={(e) => set("terms", e.target.value)} />
          </Labeled>
        </div>
      </DrawerSection>
    </Drawer>
  );
}
