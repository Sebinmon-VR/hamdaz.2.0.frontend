"use client";

/**
 * What a tool actually returned, rendered rather than dumped.
 *
 * A tool result is JSON from a real endpoint, and until now it was shown as the
 * raw text it arrived as. That is honest but close to unreadable: the useful
 * cases are a list of rows and a single record, and both are perfectly
 * renderable — a table and a set of pairs. So this parses what came back and
 * draws it, and falls back to the text the moment it cannot.
 *
 * **The fallback is not an edge case, and the reason is worth stating.** The
 * backend keeps only the first 500 characters of a result — deliberately, since
 * a run log holding every row anybody's assistant ever read would be a second
 * copy of the database with none of its permissions. So a long result arrives
 * *truncated*, its JSON cut mid-string, and no parser will ever accept it. When
 * that happens the text is shown as it came, labelled for what it is.
 *
 * Which is exactly why a report gets special treatment below: rather than
 * showing 500 characters of a report's JSON, the id is taken out of the call
 * and the real thing is fetched and drawn — through the reader's own session,
 * so a preview can never show them something the API would not have.
 */

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ExternalLink, FileText } from "lucide-react";
import { humanise } from "@/lib/format";
import type { ReportOut } from "@/lib/types";
import { Badge, Panel } from "@/components/ui/primitives";
import { ReportView } from "@/components/reports/ReportView";
import type { ToolStep } from "@/lib/assistant";

/* ── reading the result ──────────────────────────────────────────────── */

/** The parsed result, or null when it was truncated or is not JSON at all. */
export function parseResult(summary: string | undefined): unknown | null {
  if (!summary) return null;
  const text = summary.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * A report id from a call, when the call was about one.
 *
 * Looked for in the arguments first and the result second. The arguments are
 * the reliable half — they are complete, where the result may have been cut —
 * so `reports.get` and `reports.fill` are found there; a freshly started report
 * only exists in the result, and its id is near the front of the payload, which
 * is the part that survives truncation. Hence the regex rather than a parse.
 */
export function reportIdOf(step: ToolStep): string | null {
  if (!step.tool_key.startsWith("reports.")) return null;
  const fromArgs = step.arguments?.report_id ?? step.arguments?.id;
  if (typeof fromArgs === "string" && UUID.test(fromArgs)) return fromArgs;
  const match = step.summary?.match(/"id"\s*:\s*"([0-9a-f-]{36})"/i);
  return match?.[1] ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── drawing it ──────────────────────────────────────────────────────── */

export function ResultPreview({ step }: { step: ToolStep }) {
  const parsed = parseResult(step.summary);

  if (parsed !== null && Array.isArray(parsed) && parsed.length > 0) {
    return <RecordTable rows={parsed} />;
  }
  if (parsed !== null && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    // A page of results: `{ reports: [...], total: 12 }` and its cousins. The
    // list is the answer; the envelope is not worth a row of its own.
    const list = Object.entries(record).find(
      ([, value]) => Array.isArray(value) && value.length > 0 && typeof value[0] === "object",
    );
    if (list) {
      return (
        <div className="space-y-2">
          <RecordTable rows={list[1] as unknown[]} />
          {typeof record.total === "number" && (
            <p className="text-[11px] text-ink-4">
              {record.total} in total; the first {(list[1] as unknown[]).length} came back.
            </p>
          )}
        </div>
      );
    }
    return <PairGrid record={record} />;
  }

  if (!step.summary) return <p className="text-[11.5px] text-ink-4">Nothing came back.</p>;

  return (
    <div>
      <pre className="no-bar max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[9px] bg-panel px-2.5 py-2 text-[11px] leading-relaxed text-ink-3">
        {step.summary}
      </pre>
      <p className="mt-1 text-[10.5px] text-ink-4">
        The first 500 characters, which is all that is kept of a result.
      </p>
    </div>
  );
}

/**
 * A list of records as a table.
 *
 * Columns come from the rows themselves and are capped at five, chosen in the
 * order the API sent them: an endpoint puts its identifying fields first, so
 * taking the first few is a better heading than any guess this file could make
 * about which fields matter. Values that are themselves objects are not
 * flattened — they are marked, and the raw result is one click away.
 */
function RecordTable({ rows }: { rows: unknown[] }) {
  const records = rows.filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object",
  );
  if (records.length === 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {rows.slice(0, 24).map((row, index) => (
          <Badge key={index} tone="neutral">
            {String(row)}
          </Badge>
        ))}
      </div>
    );
  }

  const columns = Object.keys(records[0]).slice(0, 5);
  const shown = records.slice(0, 8);

  return (
    <div className="no-bar overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-left">
        <thead>
          <tr className="micro text-ink-4">
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-2 pb-1 font-medium">
                {humanise(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((record, index) => (
            <tr key={index} className="bg-panel">
              {columns.map((column, position) => (
                <td
                  key={column}
                  className={
                    "max-w-[14rem] truncate px-2.5 py-1.5 text-[11.5px] text-ink-2 " +
                    (position === 0 ? "rounded-l-[9px] " : "") +
                    (position === columns.length - 1 ? "rounded-r-[9px]" : "")
                  }
                  title={cell(record[column])}
                >
                  {cell(record[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length > shown.length && (
        <p className="mt-1 text-[10.5px] text-ink-4">
          {records.length - shown.length} more row
          {records.length - shown.length === 1 ? "" : "s"} came back.
        </p>
      )}
    </div>
  );
}

/** One record as pairs — the same reading as the arguments list, on purpose. */
function PairGrid({ record }: { record: Record<string, unknown> }) {
  const entries = Object.entries(record).slice(0, 14);
  if (entries.length === 0) {
    return <p className="text-[11.5px] text-ink-4">An empty result.</p>;
  }
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex min-w-0 gap-2.5 text-[11.5px]">
          <dt className="w-28 shrink-0 truncate text-ink-4">{humanise(key)}</dt>
          <dd className="min-w-0 flex-1 truncate text-ink-2" title={cell(value)}>
            {cell(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "…";
  return String(value);
}

/* ── the thing itself, not a description of it ───────────────────────── */

/**
 * A report the assistant touched, drawn as the report it is.
 *
 * Fetched rather than reconstructed from the tool result, for two reasons that
 * both matter: the result is truncated at 500 characters and could not be
 * rebuilt anyway, and this request carries the reader's own session — so if the
 * API would refuse them the report, the card simply does not appear. A preview
 * that could show more than the API would is not a preview, it is a leak.
 *
 * Collapsed by default. An answer with three reports quoted in full underneath
 * is an answer nobody scrolls past.
 */
/**
 * Everything a turn produced that is worth showing as itself.
 *
 * Sits under the answer rather than inside the trace, because these are not a
 * record of what the assistant did — they are the thing it was asked about. A
 * person who says "start my daily report" wants the report, and reading it back
 * to them in prose is a worse answer than putting it there.
 *
 * Only reports today. The list is deliberately short and explicit rather than a
 * guess at what any result might render as: a card that appears for the right
 * reasons on four tools is better than one that appears unpredictably on forty.
 * Deduped, because a turn that starts a report and then fills it has touched the
 * same one twice and should not show it twice.
 */
export function TurnArtifacts({ steps, className }: { steps: ToolStep[]; className?: string }) {
  const ids: string[] = [];
  for (const step of steps) {
    if (step.ok === false) continue;
    const id = reportIdOf(step);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return null;

  return (
    <div className={className}>
      <div className="space-y-2">
        {ids.map((id) => (
          <ReportCard key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

export function ReportCard({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useSWR<ReportOut>(`/reports/${id}`, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (error || !data) return null;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <FileText className="size-3.5 shrink-0 text-ink-4" strokeWidth={2.1} />
        <button
          onClick={() => setOpen((was) => !was)}
          className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-ink"
        >
          {data.period_label}
          <span className="ml-2 text-[11px] font-normal text-ink-4">
            {data.team} · {data.author_name}
          </span>
        </button>
        <Badge tone={data.status === "submitted" ? "positive" : "warn"}>
          {data.status === "submitted" ? "Filed" : "Draft"}
        </Badge>
        <Link
          href={`/reports/${id}`}
          title="Open the report"
          className="grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-panel-2 hover:text-ink"
        >
          <ExternalLink className="size-3.5" strokeWidth={2.1} />
        </Link>
      </div>
      {open && (
        <div className="no-bar max-h-[26rem] overflow-y-auto bg-panel-2 p-2.5">
          <ReportView report={data} compact />
        </div>
      )}
    </Panel>
  );
}
