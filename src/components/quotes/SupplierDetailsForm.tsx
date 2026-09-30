"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Building2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { SupplierDetailsFormOut, SupplierDetailsOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Input } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

type Values = Record<string, string>;

/** The form's text, from what the server holds. Emails are one line, comma-separated. */
function toValues(details: Record<string, unknown>): Values {
  const out: Values = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
  }
  return out;
}

function toPayload(values: Values): Record<string, unknown> {
  return {
    ...values,
    emails: (values.emails ?? "")
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean),
  };
}

function shown(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

/**
 * Who the supplier behind each offer is: address, contacts, registration,
 * bank and terms.
 *
 * Every field is expected and none blocks. A blank one is marked as not given,
 * here and in the approval mail, and the quote still goes. What the supplier's
 * quotation and emails say arrives as suggestions beside the field it fits,
 * applied only when somebody presses Use. The values are kept per offer, field
 * by field, so a supplier library can be built from them later.
 */
export function SupplierDetailsForm({ quoteId }: { quoteId: string }) {
  const { data, error, mutate } = useSWR<SupplierDetailsFormOut>(
    `/quote-requests/${quoteId}/supplier-details`,
    { revalidateOnFocus: false },
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const supplier: SupplierDetailsOut | undefined = useMemo(
    () =>
      data?.suppliers.find((s) => s.supplier_quote_id === chosen) ?? data?.suppliers[0],
    [data, chosen],
  );
  const [values, setValues] = useState<Values>({});
  const [dirty, setDirty] = useState(false);

  // A different offer, or a fresh answer from the server, resets the form.
  useEffect(() => {
    if (supplier) {
      setValues(toValues(supplier.details));
      setDirty(false);
    }
  }, [supplier]);

  const save = useAction(async () => {
    if (!supplier) return;
    const next = await api.put<SupplierDetailsFormOut>(
      `/quote-requests/${quoteId}/supplier-quotes/${supplier.supplier_quote_id}/details`,
      toPayload(values),
    );
    await mutate(next, { revalidate: false });
    return next;
  });

  if (error) {
    return (
      <InlineNotice tone="danger">The supplier details could not be loaded.</InlineNotice>
    );
  }
  if (!data) return null;
  if (data.suppliers.length === 0) {
    return (
      <Panel className="p-5">
        <PanelHead title="Supplier details" />
        <p className="mt-2 text-[12.5px] text-ink-3">
          Attach the supplier&apos;s quotation on the Quote tab first. Its details are filled in
          here, for each offer.
        </p>
      </Panel>
    );
  }
  if (!supplier) return null;

  const editable = supplier.may_edit;
  const suggestions = supplier.suggestions ?? {};
  const pending = Object.keys(suggestions);
  const blank = data.groups
    .flatMap((g) => g.fields)
    .filter((f) => !(values[f.key] ?? "").trim()).length;
  const total = data.groups.flatMap((g) => g.fields).length;

  function set(key: string, value: string) {
    setValues((was) => ({ ...was, [key]: value }));
    setDirty(true);
  }

  function use(key: string) {
    const offered = suggestions[key];
    if (!offered) return;
    if (key === "emails") {
      const had = (values.emails ?? "").split(/[,;\s]+/).filter(Boolean);
      const add = (offered.value as string[]).filter((e) => !had.includes(e));
      set("emails", [...had, ...add].join(", "));
    } else {
      set(key, shown(offered.value));
    }
  }

  return (
    <Panel className="p-5">
      <PanelHead
        title="Supplier details"
        hint={
          blank > 0
            ? `${blank} of ${total} not given`
            : "All given"
        }
        action={
          editable ? (
            <Button
              variant="accent"
              size="sm"
              loading={save.pending}
              disabled={!dirty}
              onClick={() => save.run()}
            >
              Save details
            </Button>
          ) : undefined
        }
      />

      {data.suppliers.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.suppliers.map((s) => (
            <button
              key={s.supplier_quote_id}
              type="button"
              onClick={() => setChosen(s.supplier_quote_id)}
              className={clsx(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition",
                s.supplier_quote_id === supplier.supplier_quote_id
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line text-ink-3 hover:text-ink",
              )}
            >
              <Building2 className="size-3.5" strokeWidth={1.8} />
              {s.supplier_name}
              {s.is_selected && <span className="text-[11px] text-accent">· priced</span>}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[12px] text-ink-3">
        {supplier.supplier_name}
        {supplier.is_selected ? " — the offer this quote is priced from." : "."} Nothing here is
        mandatory, but a blank is shown to the approvers as not given.
      </p>

      {save.error && (
        <InlineNotice tone="danger" className="mt-3">
          {save.error}
        </InlineNotice>
      )}

      {editable && pending.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-accent-soft/60 px-3 py-2 text-[12.5px]">
          <Sparkles className="size-4 shrink-0 text-accent" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            {pending.length} detail{pending.length === 1 ? "" : "s"} read from the supplier&apos;s
            quotation and emails. Check them before saving.
          </span>
          <Button size="sm" onClick={() => pending.forEach(use)}>
            Use all
          </Button>
        </div>
      )}

      <div className="mt-4 space-y-5">
        {data.groups.map((group) => (
          <section key={group.title}>
            <h4 className="micro mb-2 text-ink-4">{group.title}</h4>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {group.fields.map((field) => {
                const value = values[field.key] ?? "";
                const offered = suggestions[field.key];
                const wide = field.key === "address" || field.key === "payment_terms";
                return (
                  <label key={field.key} className={clsx("block", wide && "sm:col-span-2")}>
                    <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                      {field.label}
                      {!value.trim() && (
                        <span className="text-[10.5px] text-warn">not given</span>
                      )}
                    </span>
                    <Input
                      value={value}
                      disabled={!editable}
                      list={field.key === "supplier_type" ? "supplier-types" : undefined}
                      placeholder={field.key === "emails" ? "one or more, comma-separated" : ""}
                      onChange={(e) => set(field.key, e.target.value)}
                      className={clsx(!value.trim() && "border-warn/50!")}
                    />
                    {editable && offered && shown(offered.value) !== value && (
                      <button
                        type="button"
                        onClick={() => use(field.key)}
                        title={`From ${offered.source}`}
                        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-left text-[11px] text-accent"
                      >
                        <Sparkles className="size-3 shrink-0" strokeWidth={2.2} />
                        <span className="truncate">Use “{shown(offered.value)}”</span>
                        <span className="shrink-0 text-ink-4">· {offered.source}</span>
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <datalist id="supplier-types">
        {data.supplier_types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Panel>
  );
}
