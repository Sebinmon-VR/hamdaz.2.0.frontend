"use client";

import { Plus, Trash2 } from "lucide-react";
import { blankPortalRow, type PortalRow } from "@/components/quotes/bid";
import {
  CellCheck,
  CellInput,
  CellText,
  Grid,
  GridHead,
  GridRow,
  Sheet,
  SheetHead,
  Td,
  Th,
  YellowNote,
} from "@/components/quotes/sheet/Sheet";

/**
 * Sheet 5 — the portal response fields.
 *
 * The workbook's last tab: clause, field, cell, the value to enter, and a note
 * for whoever is entering it. Bids are not submitted from here — they are
 * submitted in the buyer's own system, usually by filling in a downloaded
 * workbook and uploading it back — and that last step is where bids are lost.
 * A mandatory cell left at its default. An "intend to respond" flag still
 * reading no. A country of origin that stayed on our own country because the
 * portal put it there.
 *
 * Every value on this sheet is decided somewhere else on this screen. What this
 * adds is the map from the decision to the cell, and a tick per row, so the
 * person doing the typing works from a list rather than from memory.
 *
 * The tick is not a workflow state and nothing gates on it.
 */

const COLUMNS = "34px 80px minmax(0,1fr) 92px minmax(0,1.5fr) minmax(0,1fr) 34px";

export function PortalSheet({
  rows,
  editable,
  onChange,
}: {
  rows: PortalRow[];
  editable: boolean;
  onChange: (next: PortalRow[]) => void;
}) {
  function patch(key: string, change: Partial<PortalRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  const done = rows.filter((row) => row.entered).length;
  const missing = rows.filter((row) => row.is_mandatory && !row.value.trim()).length;

  return (
    <Sheet>
      <SheetHead
        title="Portal response fields"
        subtitle={
          rows.length === 0
            ? "Nothing listed yet"
            : `${done} of ${rows.length} entered${
                missing > 0
                  ? ` · ${missing} mandatory ${missing === 1 ? "field" : "fields"} still empty`
                  : ""
              }`
        }
        note="Values to enter before the bid is uploaded back to the buyer's system. Tick a row once it is actually typed in."
      />

      <Grid columns={COLUMNS}>
        <GridHead>
          <Th align="center">✓</Th>
          <Th>Clause</Th>
          <Th>Field</Th>
          <Th>Cell</Th>
          <Th>Value to enter</Th>
          <Th>Note</Th>
          <Th />
        </GridHead>

        {rows.length === 0 ? (
          <GridRow>
            <Td />
            <Td className="col-span-5" muted wrap>
              No checklist on this quote yet. Choosing a supplier starts one off with the
              fields that are usually got wrong, or add rows by hand below.
            </Td>
            <Td />
          </GridRow>
        ) : (
          rows.map((row) => {
            const empty = row.is_mandatory && !row.value.trim();
            return (
              <GridRow
                key={row.key}
                tone={row.entered ? "positive" : empty ? "warn" : undefined}
              >
                <Td align="center">
                  <CellCheck
                    checked={row.entered}
                    editable={editable}
                    onChange={(next) => patch(row.key, { entered: next })}
                    label={`Entered into the portal: ${row.label || "this field"}`}
                  />
                </Td>
                <Td>
                  <CellInput
                    value={row.clause}
                    editable={editable}
                    onChange={(v) => patch(row.key, { clause: v })}
                    placeholder="3.12.1"
                  />
                </Td>
                <Td wrap>
                  <CellInput
                    value={row.label}
                    editable={editable}
                    onChange={(v) => patch(row.key, { label: v })}
                    placeholder="What the portal calls it"
                  />
                </Td>
                <Td>
                  <CellInput
                    value={row.destination}
                    editable={editable}
                    onChange={(v) => patch(row.key, { destination: v })}
                    placeholder="E32"
                  />
                </Td>
                <Td wrap>
                  <CellText
                    value={row.value}
                    editable={editable}
                    rows={1}
                    onChange={(v) => patch(row.key, { value: v })}
                    placeholder={row.is_mandatory ? "Mandatory — nothing entered" : ""}
                  />
                </Td>
                <Td wrap muted>
                  <CellInput
                    value={row.note}
                    editable={editable}
                    onChange={(v) => patch(row.key, { note: v })}
                  />
                </Td>
                <Td align="center">
                  {editable && (
                    <button
                      onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                      aria-label={`Remove ${row.label || "this field"}`}
                      className="grid size-6 place-items-center rounded-[6px] text-ink-4 transition hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3" strokeWidth={1.8} />
                    </button>
                  )}
                </Td>
              </GridRow>
            );
          })
        )}
      </Grid>

      {editable && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2">
          <button
            onClick={() => onChange([...rows, blankPortalRow()])}
            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-ink-4 transition hover:bg-panel-2 hover:text-ink"
          >
            <Plus className="size-3" strokeWidth={2} />
            Add a field
          </button>
          {rows.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-ink-4">
              Mandatory rows are tinted until they have a value.
            </label>
          )}
        </div>
      )}

      {editable && <YellowNote />}
    </Sheet>
  );
}
