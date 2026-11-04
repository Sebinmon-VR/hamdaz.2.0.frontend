"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import useSWR, { mutate as mutateKey } from "swr";
import { Check, CloudUpload, FileText, Mail, Plus, Send, Trash2, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { amount, dateTime, isoDay } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  COUNTRY_NAME,
  INVOICE_STATUS,
  MONTHS,
  type InvoiceLine,
  type InvoiceSetup,
  type PayrollInvoiceDetail,
  type PayrollRun,
} from "@/lib/payroll";
import { Badge } from "@/components/ui/primitives";
import { Modal, PanelSkeleton } from "@/components/ui/feedback";
import { Drawer, DrawerSection } from "@/components/payroll/Drawer";
import { CustomerSearch, ItemSearch } from "@/components/payroll/ZohoPicker";
import { fromCents } from "@/components/payroll/estimate";
import { AreaBox, Btn, IconBtn, Labeled, Note, SelectBox, TextBox } from "@/components/payroll/ui";

interface Form {
  customer_zoho_id: string | null;
  customer_name: string;
  currency: string;
  exchange_rate: string;
  invoice_date: string;
  due_date: string;
  payment_terms: string;
  reference_number: string;
  lines: InvoiceLine[];
  adjustment: string;
  adjustment_description: string;
  notes: string;
  terms: string;
  run_id: string | null;
}

const BLANK_LINE: InvoiceLine = {
  item_id: null,
  name: "",
  description: null,
  quantity: "1",
  rate: "",
  tax_id: null,
  tax_name: null,
  tax_percentage: "0",
  run_id: null,
};

function fromInvoice(i: PayrollInvoiceDetail): Form {
  return {
    customer_zoho_id: i.customer_zoho_id,
    customer_name: i.customer_name,
    currency: i.currency,
    exchange_rate: i.exchange_rate ?? "",
    invoice_date: i.invoice_date,
    due_date: i.due_date ?? "",
    payment_terms: i.payment_terms === null ? "" : String(i.payment_terms),
    reference_number: i.reference_number ?? "",
    lines: i.lines.map((l) => ({ ...l, quantity: String(Number(l.quantity)), rate: l.rate })),
    adjustment: Number(i.adjustment) ? i.adjustment : "",
    adjustment_description: i.adjustment_description ?? "",
    notes: i.notes ?? "",
    terms: i.terms ?? "",
    run_id: i.run_id,
  };
}

function fresh(setup: InvoiceSetup): Form {
  const base = /\(([A-Z]{3})\)/.exec(setup.zoho_organization ?? "")?.[1];
  return {
    customer_zoho_id: setup.default_customer_zoho_id,
    customer_name: setup.default_customer_name ?? "",
    currency: base ?? setup.currencies[0] ?? "AED",
    exchange_rate: "",
    invoice_date: isoDay(new Date()),
    due_date: "",
    payment_terms: String(setup.payment_terms),
    reference_number: "",
    lines: [{ ...BLANK_LINE }],
    adjustment: "",
    adjustment_description: "",
    notes: setup.notes ?? "",
    terms: setup.terms ?? "",
    run_id: null,
  };
}

/** What the API takes: empty strings become nulls, amounts stay strings. */
function body(f: Form) {
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  return {
    customer_zoho_id: f.customer_zoho_id,
    customer_name: f.customer_name.trim(),
    currency: f.currency,
    exchange_rate: blank(f.exchange_rate),
    invoice_date: f.invoice_date,
    due_date: blank(f.due_date),
    payment_terms: f.payment_terms.trim() ? Number(f.payment_terms) : null,
    reference_number: blank(f.reference_number),
    lines: f.lines
      .filter((l) => l.name.trim() || l.rate.trim())
      .map((l) => ({
        item_id: l.item_id,
        name: l.name.trim(),
        description: l.description?.trim() || null,
        quantity: l.quantity || "1",
        rate: l.rate || "0",
        tax_id: l.tax_id,
        tax_name: l.tax_name,
        tax_percentage: l.tax_id ? l.tax_percentage : "0",
        run_id: l.run_id,
      })),
    adjustment: f.adjustment.trim() || "0",
    adjustment_description: blank(f.adjustment_description),
    notes: blank(f.notes),
    terms: blank(f.terms),
    run_id: f.run_id,
  };
}

/** Line and invoice totals, as the server will work them out (per-line rounding). */
function figures(f: Form) {
  const lines = f.lines.map((l) => {
    const cents = Math.round(Number(l.quantity || 0) * Number(l.rate || 0) * 100);
    const tax = l.tax_id ? Math.round((cents * Number(l.tax_percentage || 0)) / 100) : 0;
    return { cents: Number.isFinite(cents) ? cents : 0, tax: Number.isFinite(tax) ? tax : 0 };
  });
  const sub = lines.reduce((t, l) => t + l.cents, 0);
  const tax = lines.reduce((t, l) => t + l.tax, 0);
  const adj = Math.round(Number(f.adjustment || 0) * 100) || 0;
  return { lines, sub, tax, adj, total: sub + tax + adj };
}

type Dialog = null | "return" | "delete";

/** One invoice — or a new one — in the side panel. */
export function InvoiceDrawer({
  id,
  onClose,
  onCreated,
}: {
  id: string;
  onClose: () => void;
  /** A new invoice has been saved: show it by its id from here on. */
  onCreated: (id: string) => void;
}) {
  const isNew = id === "new";
  const setup = useSWR<InvoiceSetup>("/payroll/invoice-setup");
  const invoice = useSWR<PayrollInvoiceDetail>(isNew ? null : `/payroll/invoices/${id}`);

  if (!setup.data || (!isNew && (!invoice.data || invoice.data.id !== id))) {
    return (
      <Drawer open wide onClose={onClose} title={isNew ? "New invoice" : "Invoice"}>
        {invoice.error ? (
          <p className="text-[13px] text-danger">{invoice.error.message}</p>
        ) : (
          <PanelSkeleton lines={8} />
        )}
      </Drawer>
    );
  }
  return (
    <Editor
      key={invoice.data?.id ?? "new"}
      setup={setup.data}
      existing={invoice.data}
      onClose={onClose}
      onChanged={(next) => {
        // By key rather than through `invoice`: a new invoice has no key yet,
        // and seeding it means the panel it moves to opens already filled in.
        void mutateKey(`/payroll/invoices/${next.id}`, next, { revalidate: false });
        void mutateKey("/payroll/invoices");
        if (isNew) onCreated(next.id);
      }}
    />
  );
}

function Editor({
  setup,
  existing,
  onClose,
  onChanged,
}: {
  setup: InvoiceSetup;
  existing?: PayrollInvoiceDetail;
  onClose: () => void;
  onChanged: (next: PayrollInvoiceDetail) => void;
}) {
  const { payroll, user } = useSession();
  const original = useMemo(() => (existing ? fromInvoice(existing) : fresh(setup)), [existing, setup]);
  const [form, setForm] = useState<Form>(original);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [payload, setPayload] = useState(false);
  const runs = useSWR<PayrollRun[]>("/payroll/runs");

  const status = existing?.status ?? "draft";
  const editable = status === "draft" && payroll.can_process;
  const own = existing?.submitted_by_id === user.id;
  const canDecide = status === "submitted" && payroll.can_approve && (!own || payroll.can_admin);
  const canZoho = status === "approved" && (payroll.can_process || payroll.can_approve);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const f = figures(form);
  const missing = [
    !form.customer_name.trim() && "customer",
    !form.invoice_date && "invoice date",
    !form.lines.some((l) => l.name.trim() && Number(l.rate) > 0) && "a line with an amount",
  ].filter(Boolean) as string[];

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((x) => ({ ...x, [key]: value }));
  }
  function setLine(i: number, patch: Partial<InvoiceLine>) {
    setForm((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  }

  // Saving first, always: "Send for approval" sends what is on screen.
  const save = useAction(async () => {
    const next = existing
      ? await api.patch<PayrollInvoiceDetail>(`/payroll/invoices/${existing.id}`, body(form))
      : await api.post<PayrollInvoiceDetail>("/payroll/invoices", body(form));
    onChanged(next);
    return next;
  });
  const step = useAction(async (path: string, data?: unknown) => {
    let target = existing;
    if (!target || (editable && dirty)) target = await save.run();
    if (!target) return;
    const next = await api.post<PayrollInvoiceDetail>(`/payroll/invoices/${target.id}/${path}`, data);
    onChanged(next);
    setDialog(null);
    return next;
  });
  const zoho = useAction(async () => {
    try {
      const next = await api.post<PayrollInvoiceDetail>(`/payroll/invoices/${existing!.id}/zoho`);
      onChanged(next);
      return next;
    } finally {
      // A refusal still records why on the invoice; show it.
      void mutateKey(`/payroll/invoices/${existing!.id}`);
    }
  });
  const remove = useAction(async () => {
    await api.del(`/payroll/invoices/${existing!.id}`);
    void mutateKey("/payroll/invoices");
    onClose();
  });
  const pdf = useAction(async () =>
    api.download(`/payroll/invoices/${existing!.id}/pdf`, `${existing!.number}${existing!.zoho_mode === "live" ? "" : " TEST"}.pdf`),
  );

  function addRun(runId: string) {
    const r = runs.data?.find((x) => x.id === runId);
    if (!r) return;
    const same = r.currency === form.currency;
    const line: InvoiceLine = {
      ...BLANK_LINE,
      name: "Salaries",
      description: `${COUNTRY_NAME[r.country]} payroll, ${MONTHS[r.month - 1]} ${r.year} — ${r.headcount} employees${
        same ? "" : ` (${r.currency} ${amount(r.employer_cost)})`
      }`,
      rate: same ? r.employer_cost : "",
      run_id: r.id,
    };
    setForm((x) => ({
      ...x,
      run_id: x.run_id ?? r.id,
      reference_number: x.reference_number || `Payroll ${MONTHS[r.month - 1]} ${r.year}`,
      lines: [...x.lines.filter((l) => l.name.trim() || l.rate.trim()), line],
    }));
  }
  const runMismatch = form.lines.some((l) => {
    const r = l.run_id ? runs.data?.find((x) => x.id === l.run_id) : null;
    return r && r.currency !== form.currency && !Number(l.rate);
  });

  const error = save.error ?? step.error ?? zoho.error ?? remove.error ?? pdf.error;
  const money = (cents: number) => amount(fromCents(cents), form.currency);

  const footer = (
    <>
      {editable && existing && (
        <Btn variant="ghost" icon={Trash2} onClick={() => setDialog("delete")}>
          Delete
        </Btn>
      )}
      {existing && (
        <Btn icon={FileText} loading={pdf.pending} onClick={() => pdf.run()}>
          PDF
        </Btn>
      )}
      <span className={clsx("min-w-0 flex-1 truncate text-[12px]", error ? "text-danger" : "text-ink-3")}>
        {error ?? (editable && missing.length ? `Still needed: ${missing.join(", ")}` : "")}
      </span>
      <Btn variant="ghost" onClick={onClose}>
        Close
      </Btn>
      {editable && (
        <>
          <Btn loading={save.pending} disabled={!dirty && !!existing} onClick={() => save.run()}>
            Save draft
          </Btn>
          <Btn variant="accent" icon={Send} loading={step.pending} disabled={missing.length > 0} onClick={() => step.run("submit")}>
            Send for approval
          </Btn>
        </>
      )}
      {canDecide && (
        <>
          <Btn icon={Undo2} onClick={() => setDialog("return")}>
            Send back
          </Btn>
          <Btn variant="accent" icon={Check} loading={step.pending} onClick={() => step.run("approve")}>
            Approve
          </Btn>
        </>
      )}
      {canZoho && existing?.zoho_mode !== "live" && (
        <Btn variant="accent" icon={CloudUpload} loading={zoho.pending} onClick={() => zoho.run()}>
          {existing?.zoho_mode === "test" ? "Check in Zoho again" : "Create in Zoho"}
          {!setup.zoho_live && <span className="ml-1 rounded bg-accent-ink/15 px-1 text-[10px] font-bold">TEST</span>}
        </Btn>
      )}
      {canZoho && existing?.zoho_mode && (
        <Btn icon={Mail} loading={step.pending} onClick={() => step.run("report")}>
          Send report
        </Btn>
      )}
    </>
  );

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={existing ? `Invoice ${existing.number}` : "New invoice"}
      subtitle={
        existing ? (
          <span className="inline-flex items-center gap-2">
            <Badge tone={INVOICE_STATUS[existing.status].tone}>{INVOICE_STATUS[existing.status].label}</Badge>
            {existing.customer_name} · {amount(existing.total, existing.currency)}
            {existing.zoho_mode === "live" && ` · Zoho ${existing.zoho_invoice_number}`}
          </span>
        ) : (
          `Created in Zoho Books once approved${setup.zoho_organization ? ` — ${setup.zoho_organization}` : ""}.`
        )
      }
      footer={footer}
    >
      <div className="-mx-5 -mt-4 mb-4 [&+section]:border-t-0 [&+section]:pt-0">
        {!setup.zoho_live && (
          <Note>
            <b>Zoho test mode.</b> &ldquo;Create in Zoho&rdquo; checks the invoice against Zoho Books and writes
            nothing. The report then carries this app&apos;s PDF, marked TEST.
          </Note>
        )}
        {setup.zoho_error && <Note tone="warn">Zoho could not be read: {setup.zoho_error}</Note>}
        <StatusNotes invoice={existing} setup={setup} />
      </div>

      <DrawerSection title="Customer">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
          <Labeled
            label="Customer"
            required
            hint={
              form.customer_zoho_id
                ? "Linked to the Zoho contact."
                : form.customer_name
                  ? "Not linked to Zoho yet — pick it from the list."
                  : "The Zoho contact this invoice is raised to."
            }
          >
            <CustomerSearch
              disabled={!editable}
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
          <Labeled label="Currency" hint="Zoho bills a customer in theirs.">
            <SelectBox disabled={!editable} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {[...new Set([form.currency, ...setup.currencies])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
          </Labeled>
          <Labeled label="Exchange rate" hint="Optional.">
            <TextBox disabled={!editable} inputMode="decimal" value={form.exchange_rate} onChange={(e) => set("exchange_rate", e.target.value)} />
          </Labeled>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Labeled label="Invoice date" required>
            <TextBox type="date" disabled={!editable} value={form.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} />
          </Labeled>
          <Labeled label="Payment terms" hint="Days.">
            <TextBox disabled={!editable} inputMode="numeric" value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
          </Labeled>
          <Labeled label="Due date" hint="Instead of terms.">
            <TextBox type="date" disabled={!editable} value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </Labeled>
          <Labeled label="Reference">
            <TextBox disabled={!editable} value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)} />
          </Labeled>
        </div>
      </DrawerSection>

      <DrawerSection
        title="Items"
        action={
          editable && (
            <div className="w-64">
              <SelectBox aria-label="Add a payroll month" value="" onChange={(e) => e.target.value && addRun(e.target.value)}>
                <option value="">Add a payroll month…</option>
                {(runs.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {COUNTRY_NAME[r.country]} {r.label} · {r.currency} {amount(r.employer_cost)} · {r.status}
                  </option>
                ))}
              </SelectBox>
            </div>
          )
        }
      >
        <div className="rounded-md border border-line">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_6.5rem_10.5rem_6.5rem_2rem] gap-2 border-b border-line bg-panel-2 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
            <span>Item and description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span>Tax</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {form.lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_4rem_6.5rem_10.5rem_6.5rem_2rem] items-start gap-2 border-b border-line px-2.5 py-2 last:border-b-0">
              <div className="min-w-0 space-y-1.5">
                <ItemSearch
                  disabled={!editable}
                  value={line.name}
                  onText={(t) => setLine(i, { name: t })}
                  onPick={(item) => {
                    const tax = item.tax_id ? setup.taxes.find((t) => t.tax_id === item.tax_id) : undefined;
                    setLine(i, {
                      item_id: item.item_id,
                      name: item.name,
                      description: line.description || item.description,
                      rate: line.rate || (item.rate ?? ""),
                      ...(tax ? { tax_id: tax.tax_id, tax_name: tax.tax_name, tax_percentage: tax.tax_percentage } : {}),
                    });
                  }}
                />
                <TextBox
                  disabled={!editable}
                  placeholder="Description"
                  value={line.description ?? ""}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
                {line.item_id && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">
                    Zoho item
                    {editable && (
                      <button className="hover:text-danger" aria-label="Unlink the Zoho item" onClick={() => setLine(i, { item_id: null })}>
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                )}
              </div>
              <TextBox className="text-right tnum" disabled={!editable} inputMode="decimal" aria-label="Quantity" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <TextBox className="text-right tnum" disabled={!editable} inputMode="decimal" aria-label="Rate" placeholder="0.00" value={line.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
              <SelectBox
                disabled={!editable}
                aria-label="Tax"
                value={line.tax_id ?? ""}
                onChange={(e) => {
                  const tax = setup.taxes.find((t) => t.tax_id === e.target.value);
                  setLine(i, tax
                    ? { tax_id: tax.tax_id, tax_name: tax.tax_name, tax_percentage: tax.tax_percentage }
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
              <span className="tnum pt-1.5 text-right text-[13px] text-ink">{amount(fromCents(f.lines[i]?.cents ?? 0))}</span>
              {editable ? (
                <IconBtn bare icon={X} label="Remove line" className="size-7" onClick={() => set("lines", form.lines.filter((_, j) => j !== i))} />
              ) : (
                <span />
              )}
            </div>
          ))}
          {editable && (
            <div className="px-2.5 py-1.5">
              <Btn variant="ghost" icon={Plus} onClick={() => set("lines", [...form.lines, { ...BLANK_LINE }])}>
                Add a line
              </Btn>
            </div>
          )}
        </div>
        {runMismatch && (
          <p className="mt-2 text-[12px] text-warn">
            The payroll is in another currency than this invoice — enter the {form.currency} amount for the salaries line.
          </p>
        )}

        <div className="mt-3 flex flex-wrap justify-between gap-4">
          <div className="grid w-full max-w-sm grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <Labeled label="Adjustment" hint="After tax, e.g. rounding. Negative to reduce.">
              <TextBox disabled={!editable} placeholder="Description" value={form.adjustment_description} onChange={(e) => set("adjustment_description", e.target.value)} />
            </Labeled>
            <Labeled label="Amount">
              <TextBox className="text-right tnum" disabled={!editable} inputMode="decimal" placeholder="0.00" value={form.adjustment} onChange={(e) => set("adjustment", e.target.value)} />
            </Labeled>
          </div>
          <dl className="ml-auto w-64 text-[13px]">
            <Row label="Sub total" value={money(f.sub)} />
            <Row label="Tax" value={money(f.tax)} />
            {f.adj !== 0 && <Row label={form.adjustment_description || "Adjustment"} value={money(f.adj)} />}
            <div className="mt-1 flex justify-between border-t border-line pt-1.5 font-semibold">
              <dt>Total</dt>
              <dd className="tnum">{money(f.total)}</dd>
            </div>
          </dl>
        </div>
      </DrawerSection>

      <DrawerSection title="On the invoice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Customer notes">
            <AreaBox disabled={!editable} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Labeled>
          <Labeled label="Terms and conditions">
            <AreaBox disabled={!editable} value={form.terms} onChange={(e) => set("terms", e.target.value)} />
          </Labeled>
        </div>
      </DrawerSection>

      {existing?.zoho_payload && (
        <DrawerSection
          title="What Zoho receives"
          action={
            <button className="text-[12px] text-ink-3 underline" onClick={() => setPayload((x) => !x)}>
              {payload ? "Hide" : "Show"}
            </button>
          }
        >
          {payload && (
            <pre className="max-h-72 overflow-auto rounded-md border border-line bg-panel-2 p-3 text-[11.5px] leading-relaxed text-ink-2">
              {JSON.stringify(existing.zoho_payload, null, 2)}
            </pre>
          )}
        </DrawerSection>
      )}

      {existing && existing.events.length > 0 && (
        <DrawerSection title="History">
          <ol className="divide-y divide-line rounded-md border border-line">
            {existing.events.map((e) => (
              <li key={e.id} className="flex gap-3 px-3 py-1.5 text-[12px]">
                <span className="w-32 shrink-0 text-ink-4">{dateTime(e.created_at)}</span>
                <span className="min-w-0 flex-1 text-ink-2">{e.summary}</span>
                <span className="shrink-0 text-ink-4">{e.actor_name ?? "system"}</span>
              </li>
            ))}
          </ol>
        </DrawerSection>
      )}

      <Modal
        open={dialog === "return"}
        onClose={() => setDialog(null)}
        title="Send back for changes"
        description="It goes back to draft so the accountant can correct it."
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Btn>
            <Btn variant="accent" loading={step.pending} disabled={!note.trim()} onClick={() => step.run("return", { note: note.trim() })}>
              Send back
            </Btn>
          </>
        }
      >
        <div className="pb-4">
          <Labeled label="What needs changing" required>
            <AreaBox value={note} onChange={(e) => setNote(e.target.value)} />
          </Labeled>
        </div>
      </Modal>
      <Modal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title="Delete this draft?"
        description="The invoice is removed. The history keeps a line saying it existed."
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDialog(null)}>
              Keep it
            </Btn>
            <Btn variant="danger" loading={remove.pending} onClick={() => remove.run()}>
              Delete
            </Btn>
          </>
        }
      />
    </Drawer>
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

/** Where the invoice is, and what happens next, in a line or two. */
function StatusNotes({ invoice: i, setup }: { invoice?: PayrollInvoiceDetail; setup: InvoiceSetup }) {
  if (!i) return null;
  const mailWord = setup.mail ? "" : " (mail is off in settings — nothing is sent)";
  return (
    <>
      {i.status === "draft" && i.returned_note && (
        <Note tone="warn">
          <b>Sent back:</b> {i.returned_note}
        </Note>
      )}
      {i.status === "submitted" && (
        <Note>
          Sent for approval by {i.submitted_by_name ?? "—"} {dateTime(i.submitted_at)}. The super admins
          are asked to check it{mailWord}.
        </Note>
      )}
      {i.status === "approved" && !i.zoho_mode && (
        <Note tone="positive">
          Approved by {i.approved_by_name ?? "—"} {dateTime(i.approved_at)}. Next: <b>Create in Zoho</b>, which also
          sends the report to the super admins, the CEO and Accounts{mailWord}.
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
          <Note>
            Report not mailed — mail is off in payroll settings. It would go to {i.report_to.join(", ") || "nobody"}.
          </Note>
        ))}
    </>
  );
}

