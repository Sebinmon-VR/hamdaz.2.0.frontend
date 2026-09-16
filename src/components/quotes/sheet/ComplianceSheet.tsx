"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ComplianceArea, ComplianceStatus, Severity } from "@/lib/types";
import {
  AREA_ORDER,
  COMPLIANCE_STATUS,
  SEVERITY,
  blankComplianceRow,
  type ComplianceRow,
} from "@/components/quotes/bid";
import {
  Band,
  CellCheck,
  CellInput,
  CellSelect,
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
 * Sheet 2 — the compliance matrix.
 *
 * One row per RFP requirement, in the workbook's own columns: what they asked
 * for, which clause says so, what the supplier actually offered, where that
 * leaves us, and who is fixing it. Banded by section, as the workbook bands it.
 *
 * Every row is open at once. That is the point of a matrix and it is what the
 * previous version of this screen got wrong by collapsing rows behind
 * disclosure arrows: the whole value of the thing is reading *down* the status
 * column and seeing the four reds together. Forty rows of six cells is a
 * spreadsheet, and people read spreadsheets fine.
 */

const AREA_BANDS: Record<ComplianceArea, string> = {
  technical: "Technical — specification",
  commercial: "Commercial — delivery, terms and price",
  documents: "Commercial — bid package documents",
  logistics: "Logistics & customs",
};

const COLUMNS = "56px minmax(0,1.15fr) 92px minmax(0,1.15fr) 116px 104px minmax(0,1fr) 108px 34px";

export function ComplianceSheet({
  rows,
  editable,
  onChange,
}: {
  rows: ComplianceRow[];
  editable: boolean;
  onChange: (next: ComplianceRow[]) => void;
}) {
  function patch(key: string, change: Partial<ComplianceRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  const open = rows.filter((r) => !r.resolved).length;

  return (
    <Sheet>
      <SheetHead
        title="Compliance matrix"
        subtitle={`${rows.length} requirements · ${open} still open`}
        note="Green is compliant. Amber is a deviation — priceable or curable, and carried in the landed cost. Red must be cured or formally declared before anything is submitted."
      />

      <Grid columns={COLUMNS}>
        <GridHead>
          <Th>Ref</Th>
          <Th>RFP requirement</Th>
          <Th>Clause</Th>
          <Th>Supplier's position</Th>
          <Th>Status</Th>
          <Th>Urgency</Th>
          <Th>Action required</Th>
          <Th>Owner</Th>
          <Th align="center">✓</Th>
        </GridHead>

        {AREA_ORDER.map((area) => {
          const inArea = rows.filter((row) => row.area === area);
          if (inArea.length === 0 && !editable) return null;
          return (
            <div key={area}>
              <Band>{AREA_BANDS[area]}</Band>
              {inArea.map((row) => (
                <GridRow
                  key={row.key}
                  faded={row.resolved}
                  tone={row.resolved ? undefined : toneOf(row.status)}
                >
                  <Td>
                    <CellInput
                      value={row.ref}
                      editable={editable}
                      maxLength={20}
                      onChange={(v) => patch(row.key, { ref: v })}
                      placeholder="C4"
                    />
                  </Td>
                  <Td wrap>
                    <CellText
                      value={row.requirement}
                      editable={editable}
                      rows={2}
                      onChange={(v) => patch(row.key, { requirement: v })}
                      placeholder="What the RFP asks for"
                    />
                  </Td>
                  <Td>
                    <CellInput
                      value={row.source_clause}
                      editable={editable}
                      onChange={(v) => patch(row.key, { source_clause: v })}
                      placeholder="Cl. 3.6"
                    />
                  </Td>
                  <Td wrap>
                    <CellText
                      value={row.supplier_position}
                      editable={editable}
                      rows={2}
                      onChange={(v) => patch(row.key, { supplier_position: v })}
                      placeholder="Their words, not a summary of them"
                    />
                  </Td>
                  <Td>
                    <CellSelect
                      value={row.status}
                      editable={editable}
                      onChange={(v) => patch(row.key, { status: v as ComplianceStatus })}
                      options={(Object.keys(COMPLIANCE_STATUS) as ComplianceStatus[]).map(
                        (key) => ({ value: key, label: COMPLIANCE_STATUS[key].label }),
                      )}
                      blank="Open"
                    />
                  </Td>
                  <Td>
                    <CellSelect
                      value={row.severity}
                      editable={editable}
                      onChange={(v) => patch(row.key, { severity: v as Severity | "" })}
                      options={(Object.keys(SEVERITY) as Severity[]).map((key) => ({
                        value: key,
                        label: SEVERITY[key].label,
                      }))}
                      blank="—"
                    />
                  </Td>
                  <Td wrap>
                    <CellText
                      value={row.action}
                      editable={editable}
                      rows={2}
                      onChange={(v) => patch(row.key, { action: v })}
                      placeholder="Concretely, and for whom"
                    />
                  </Td>
                  <Td>
                    <CellInput
                      value={row.owner}
                      editable={editable}
                      onChange={(v) => patch(row.key, { owner: v })}
                      placeholder="A name"
                    />
                  </Td>
                  <Td align="center" className="gap-1">
                    <CellCheck
                      checked={row.resolved}
                      editable={editable}
                      onChange={(next) => patch(row.key, { resolved: next })}
                      label={`Cleared: ${row.ref || row.requirement.slice(0, 30)}`}
                    />
                  </Td>
                </GridRow>
              ))}

              {editable && (
                <div className="border-b border-line px-2.5 py-1.5">
                  <button
                    onClick={() => onChange([...rows, blankComplianceRow(area)])}
                    className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11.5px] text-ink-4 transition hover:bg-panel-2 hover:text-ink"
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    Add a row
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </Grid>

      {editable && rows.length > 0 && (
        <div className="border-t border-line px-4 py-2">
          <details>
            <summary className="cursor-pointer text-[11.5px] text-ink-4 transition hover:text-ink">
              Remove a row
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rows.map((row) => (
                <button
                  key={row.key}
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  className="inline-flex items-center gap-1 rounded-full bg-panel-2 px-2 py-1 text-[11px] text-ink-3 transition hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-3" strokeWidth={1.8} />
                  {row.ref || row.requirement.slice(0, 24) || "untitled"}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      {editable && <YellowNote />}
    </Sheet>
  );
}

function toneOf(status: ComplianceStatus): "warn" | "danger" | "positive" | undefined {
  const tone = COMPLIANCE_STATUS[status].tone;
  if (tone === "danger") return "danger";
  if (tone === "warn") return "warn";
  if (tone === "positive") return "positive";
  return undefined;
}
