"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { withQuery } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { ZohoContact, ZohoItem } from "@/lib/payroll";
import { TextBox } from "@/components/payroll/ui";

/**
 * A text box that searches Zoho as you type and offers what it finds.
 *
 * Typing never requires a pick — an invoice line can be free text — but a pick
 * links the row to the Zoho record, which is what Zoho needs to invoice it.
 */
function Search<T>({
  value,
  onText,
  onPick,
  path,
  render,
  placeholder,
  disabled,
  label,
}: {
  value: string;
  onText: (text: string) => void;
  onPick: (row: T) => void;
  path: string;
  render: (row: T) => ReactNode;
  placeholder?: string;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const q = useDebounced(value.trim(), 300);
  const rows = useSWR<T[]>(open && !disabled ? withQuery(path, { q }) : null);

  return (
    <div className="relative">
      <TextBox
        aria-label={label}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
        }}
      />
      {open && !disabled && (
        <div className="absolute inset-x-0 top-9 z-30 max-h-64 overflow-y-auto rounded-md border border-line bg-panel py-1 shadow-[var(--shadow-float)]">
          {rows.error ? (
            <p className="px-3 py-2 text-[12px] text-danger">Zoho could not be searched: {rows.error.message}</p>
          ) : !rows.data ? (
            <p className="px-3 py-2 text-[12px] text-ink-4">Searching Zoho…</p>
          ) : rows.data.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-ink-4">Nothing in Zoho matches.</p>
          ) : (
            rows.data.map((row, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(row);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-panel-2"
              >
                {render(row)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function CustomerSearch({
  value,
  onText,
  onPick,
  disabled,
}: {
  value: string;
  onText: (text: string) => void;
  onPick: (contact: ZohoContact) => void;
  disabled?: boolean;
}) {
  return (
    <Search<ZohoContact>
      label="Customer"
      path="/payroll/zoho/customers"
      value={value}
      onText={onText}
      onPick={onPick}
      disabled={disabled}
      placeholder="Search Zoho customers"
      render={(c) => (
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-ink">{c.contact_name}</span>
          {c.currency_code && <span className="text-[11px] text-ink-4">{c.currency_code}</span>}
        </span>
      )}
    />
  );
}

export function ItemSearch({
  value,
  onText,
  onPick,
  disabled,
}: {
  value: string;
  onText: (text: string) => void;
  onPick: (item: ZohoItem) => void;
  disabled?: boolean;
}) {
  return (
    <Search<ZohoItem>
      label="Item"
      path="/payroll/zoho/items"
      value={value}
      onText={onText}
      onPick={onPick}
      disabled={disabled}
      placeholder="Item — type, or pick from Zoho"
      render={(item) => (
        <span className="block">
          <span className="block truncate text-ink">{item.name}</span>
          {item.rate && <span className="text-[11px] text-ink-4">Rate {item.rate}</span>}
        </span>
      )}
    />
  );
}
