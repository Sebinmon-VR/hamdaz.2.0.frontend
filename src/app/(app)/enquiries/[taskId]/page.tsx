"use client";

import { Fragment, use, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Info,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCw,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { bytes, date, dateTime, decimal } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  EnquiryAnalysisOut,
  EnquiryDocumentOut,
  EnquiryHistoryEntry,
  EnquiryLineOut,
  EnquiryLogEntry,
  EnquiryLineStatus,
  EnquirySupplier,
  EnquiryTaskOut,
} from "@/lib/types";
import { Badge, Meta, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import { Button, FileDrop, IconButton, PillRail, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton, Spinner } from "@/components/ui/feedback";

/**
 * One pre-sales task's enquiry, read: what the customer asks for, and for each
 * item whether we have met it before — where, from whom, at what rate — or
 * who might supply it if it is new.
 *
 * The run happens on the server and takes minutes, so this page polls while
 * one is going and shows the stage it has reached. Documents uploaded here go
 * into the task's folder in the Proposal Team Channel library, where the team
 * already keeps them, and are read on the next run.
 */

type Tab = "items" | "documents" | "summary";
type Filter = "all" | EnquiryLineStatus;

const STATUS: Record<EnquiryLineStatus, { label: string; tone: "positive" | "info" | "warn" }> = {
  recent: { label: "Seen recently", tone: "positive" },
  history: { label: "In our history", tone: "info" },
  new: { label: "New item", tone: "warn" },
};

const SOURCE: Record<string, string> = {
  supplier_quote: "Supplier quote",
  quote_request: "Our quote",
  zoho_item: "Zoho item",
  zoho_po: "Zoho PO",
  zoho_bill: "Zoho bill",
  zoho_estimate: "Zoho quote",
  this_enquiry: "Offered for this enquiry",
  web: "Web",
};

const DOC_SOURCE: Record<EnquiryDocumentOut["source"], string> = {
  attachment: "List attachment",
  folder: "Task folder",
  upload: "Uploaded here",
};

const DOC_KIND: Record<string, string> = {
  requirement: "Requirement",
  supplier_quote: "Supplier quote",
  other: "Other",
};

export default function EnquiryAnalysisPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const key = `/enquiries/task/${encodeURIComponent(taskId)}`;
  const { data, error, isLoading, mutate } = useSWR<EnquiryTaskOut>(key, {
    revalidateOnFocus: false,
    // Poll while a run is going; stop the moment it ends.
    refreshInterval: (latest) => (latest?.analysis?.status === "running" ? 3000 : 0),
  });
  const [tab, setTab] = useState<Tab>("items");
  const [webSearch, setWebSearch] = useState<boolean | null>(null);
  const [showLog, setShowLog] = useState(true);

  const start = useAction(async () => {
    const analysis = await api.post<EnquiryAnalysisOut>(`${key}/run`, {
      web_search: webSearch ?? data?.web_search_default ?? true,
    });
    await mutate((prev) => (prev ? { ...prev, analysis } : prev), { revalidate: false });
  });
  const upload = useAction(async (files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append("files", file);
    const analysis = await api.upload<EnquiryAnalysisOut>(`${key}/documents`, body);
    await mutate((prev) => (prev ? { ...prev, analysis } : prev), { revalidate: false });
  });
  const pdf = useAction(async () => api.download(`${key}/report.pdf`, "enquiry-analysis.pdf"));
  const book = useAction(async () => api.download(`${key}/workbook.xlsx`, "enquiry-analysis.xlsx"));

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data) return null;

  const { task, analysis } = data;
  const running = analysis?.status === "running";
  const hasResult = Boolean(analysis && (analysis.status === "done" || analysis.lines.length > 0));
  const web = webSearch ?? data.web_search_default;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href="/enquiries">Enquiry analyses</Link>}
        title={task.title}
        meta={analysis?.finished_at ? `Analysed ${dateTime(analysis.finished_at)}` : undefined}
        actions={
          <>
            <IconButton
              icon={showLog ? PanelRightClose : PanelRightOpen}
              label={showLog ? "Hide activity" : "Show activity"}
              onClick={() => setShowLog((v) => !v)}
            />
            {hasResult && (
              <>
                <IconButton
                  icon={FileText}
                  label={pdf.pending ? "Preparing the PDF…" : "Report PDF"}
                  disabled={pdf.pending}
                  onClick={() => pdf.run()}
                />
                <IconButton
                  icon={Download}
                  label={book.pending ? "Preparing the workbook…" : "Excel workbook"}
                  disabled={book.pending}
                  onClick={() => book.run()}
                />
              </>
            )}
            <Button
              variant="accent"
              icon={analysis?.finished_at ? RotateCw : Play}
              loading={start.pending || running}
              disabled={!data.can_run}
              onClick={() => start.run()}
            >
              {running ? "Analysing…" : analysis?.finished_at ? "Run again" : "Analyse enquiry"}
            </Button>
          </>
        }
      />

      {(start.error || upload.error || pdf.error || book.error) && (
        <InlineNotice tone="danger">{start.error || upload.error || pdf.error || book.error}</InlineNotice>
      )}
      {!data.can_run && (
        <InlineNotice tone="warn">
          The analysis reads documents with Claude, and no Anthropic API key is configured on the server.
        </InlineNotice>
      )}
      {running && (
        <InlineNotice tone="info">
          <span className="inline-flex items-center gap-2">
            <Spinner />
            {analysis?.stage || "Working"}… This takes a few minutes; you can leave the page.
          </span>
        </InlineNotice>
      )}
      {analysis?.status === "failed" && analysis.error && (
        <InlineNotice tone="danger">{analysis.error}</InlineNotice>
      )}
      {analysis?.filing_error && <InlineNotice tone="warn">{analysis.filing_error}</InlineNotice>}

      <div className={clsx("grid items-start gap-4", showLog && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
      <div className="min-w-0 space-y-4">
      <Panel className="p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Meta label="Customer / end user">{analysis?.customer || task.end_user || "—"}</Meta>
          <Meta label="Bid closing">{task.bid_closing_date ? date(task.bid_closing_date) : analysis?.deadline || "—"}</Meta>
          <Meta label="Task folder">
            {analysis?.drive_folder_url ? (
              <a
                href={analysis.drive_folder_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-accent-text hover:underline"
              >
                <FolderOpen className="size-3.5" />
                {analysis.drive_folder}
              </a>
            ) : (
              analysis?.drive_folder || "Found on the first run"
            )}
          </Meta>
          <Meta label="Last run">
            {analysis?.finished_at
              ? `${analysis.run_by_name ?? "—"} · ${analysis.model ?? ""} · $${decimal(analysis.cost_usd, { min: 2 })}`
              : "Not run yet"}
          </Meta>
        </dl>
        <div className="mt-4 border-t border-line pt-4">
          <Toggle
            checked={web}
            onChange={setWebSearch}
            disabled={running}
            label="Look new items up on the web"
            hint="Finds the manufacturer, likely suppliers and a rough price for items we have never handled. Costs a little per run."
          />
        </div>
      </Panel>

      {analysis && hasResult && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Items asked for" value={analysis.lines.length} />
          <StatBox label="Seen recently" value={analysis.counts.recent ?? 0} />
          <StatBox label="In our history" value={analysis.counts.history ?? 0} />
          <StatBox label="New items" value={analysis.counts.new ?? 0} tone="second" />
        </div>
      )}

      <nav className="flex min-w-0 max-w-full gap-0.5 overflow-x-auto rounded-xl bg-panel-2 p-1" aria-label="Sections">
        {(
          [
            { value: "items", label: "Items", count: analysis?.lines.length },
            { value: "documents", label: "Documents", count: analysis?.documents.length },
            { value: "summary", label: "Summary" },
          ] as { value: Tab; label: string; count?: number }[]
        ).map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTab(o.value)}
            aria-current={tab === o.value ? "page" : undefined}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] transition",
              tab === o.value ? "bg-panel font-semibold text-ink shadow-sm" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="tnum text-[11px] text-ink-4">{o.count}</span>}
          </button>
        ))}
      </nav>

      {tab === "items" && <Items analysis={analysis} />}
      {tab === "documents" && (
        <Documents
          analysis={analysis}
          busy={upload.pending}
          disabled={running}
          onFiles={(files) => upload.run(files)}
        />
      )}
      {tab === "summary" && <Summary analysis={analysis} />}
      </div>
      {showLog && <Activity entries={analysis?.run_log ?? []} running={running} />}
      </div>
    </div>
  );
}

/* ── activity ──────────────────────────────────────────────────────── */

const LEVEL: Record<EnquiryLogEntry["level"], { icon: typeof Info; className: string }> = {
  step: { icon: CircleDot, className: "text-accent-text" },
  info: { icon: Info, className: "text-ink-4" },
  ok: { icon: CheckCircle2, className: "text-positive" },
  warn: { icon: AlertTriangle, className: "text-warn" },
  error: { icon: XCircle, className: "text-danger" },
};

/**
 * What the background run is doing, line by line. The server writes each line
 * as it happens and the page polls every few seconds while a run is going, so
 * this fills in as it works; after the run it stays as the record of what
 * happened. Follows the newest line unless the reader has scrolled up.
 */
function Activity({ entries, running }: { entries: EnquiryLogEntry[]; running: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <Panel className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden xl:sticky xl:top-20">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[13px] font-semibold text-ink">Activity</span>
        {running ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-accent-text">
            <Spinner className="size-3" /> live
          </span>
        ) : (
          <span className="text-[11.5px] text-ink-4">last run</span>
        )}
        <span className="tnum ml-auto text-[11px] text-ink-4">{entries.length}</span>
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-[160px] flex-1 overflow-y-auto px-3 py-2"
      >
        {entries.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-ink-4">
            Nothing yet. Each step of the next run is shown here as it happens.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {entries.map((e, i) => {
              const { icon: Icon, className } = LEVEL[e.level] ?? LEVEL.info;
              return (
                <li key={i} className={clsx("flex gap-2 text-[12px] leading-snug", e.level === "step" && "pt-1.5")}>
                  <Icon className={clsx("mt-[2px] size-3.5 shrink-0", className)} />
                  <div className="min-w-0">
                    <span
                      className={clsx(
                        "break-words",
                        e.level === "step" ? "font-semibold text-ink" : e.level === "error" ? "text-danger" : "text-ink-2",
                      )}
                    >
                      {e.message}
                    </span>
                    <span className="tnum ml-1.5 text-[10.5px] text-ink-4">{clock(e.at)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function clock(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ── items ─────────────────────────────────────────────────────────── */

function Items({ analysis }: { analysis: EnquiryAnalysisOut | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  if (!analysis || analysis.lines.length === 0) {
    return (
      <Panel className="p-6">
        <Empty
          icon={FileText}
          title={analysis?.finished_at ? "No items found in the documents" : "Not analysed yet"}
          body={
            analysis?.finished_at
              ? "Check the Documents tab: the requirement documents may be missing, or unreadable."
              : "Run the analysis to read the task's attachments and its folder. Add any missing documents on the Documents tab first."
          }
        />
      </Panel>
    );
  }

  const lines = analysis.lines.filter((l) => filter === "all" || l.status === filter);
  return (
    <Panel className="overflow-hidden">
      <div className="p-4">
        <PillRail<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: analysis.lines.length },
            { value: "recent", label: "Seen recently", count: analysis.counts.recent ?? 0 },
            { value: "history", label: "In our history", count: analysis.counts.history ?? 0 },
            { value: "new", label: "New", count: analysis.counts.new ?? 0 },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-y border-line bg-panel-2">
              {["", "#", "Item", "Qty", "Status", "Last seen", "Suppliers", "Web"].map((h, i) => (
                <th key={i} className="micro px-4 py-2 text-left font-medium text-ink-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const expanded = open === line.id;
              const seen = latest(line);
              return (
                <Fragment key={line.id}>
                  <tr
                    className="cursor-pointer border-b border-line/60 align-top hover:bg-panel-2/60"
                    onClick={() => setOpen(expanded ? null : line.id)}
                  >
                    <td className="px-3 py-2.5 text-ink-4">
                      {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </td>
                    <td className="tnum px-2 py-2.5 text-[12.5px] text-ink-3">{line.position + 1}</td>
                    <td className="max-w-[340px] px-4 py-2.5 text-[12.5px]">
                      <div className="font-medium text-ink">{line.description}</div>
                      {(line.part_number || line.brand) && (
                        <div className="mt-0.5 text-[11.5px] text-ink-3">
                          {[line.part_number && `P/N ${line.part_number}`, line.brand].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-2.5 text-[12.5px]">
                      {line.quantity ? decimal(line.quantity, { min: 0 }) : "—"} {line.unit ?? ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS[line.status].tone}>{STATUS[line.status].label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-2">{seen ? <SeenText h={seen} /> : "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-2">
                      {(line.suppliers ?? []).slice(0, 2).map((s) => (
                        <div key={s.name} className="truncate">
                          {s.name}
                          <span className="text-ink-4"> · {SOURCE[s.source] ?? s.source}</span>
                        </div>
                      ))}
                      {(line.suppliers?.length ?? 0) > 2 && (
                        <div className="text-ink-4">+{(line.suppliers?.length ?? 0) - 2} more</div>
                      )}
                      {!line.suppliers?.length && "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-2">
                      {line.web ? (
                        <>
                          {line.web.manufacturer && <div>{line.web.manufacturer}</div>}
                          {line.web.price_low && (
                            <div className="tnum text-ink-3">
                              {line.web.currency} {decimal(line.web.price_low)}
                              {line.web.price_high && line.web.price_high !== line.web.price_low
                                ? `–${decimal(line.web.price_high)}`
                                : ""}
                            </div>
                          )}
                          {!line.web.manufacturer && !line.web.price_low && <span className="text-ink-4">Nothing found</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-line/60 bg-panel-2/40">
                      <td colSpan={8} className="px-6 py-4">
                        <LineDetail line={line} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11.5px] text-ink-4">
        Web prices come from public pages. Treat them as a guide, not a quotation. Partnership status will show once the supplier library is built.
      </p>
    </Panel>
  );
}

function latest(line: EnquiryLineOut): EnquiryHistoryEntry | null {
  const entries = (line.history ?? []).filter((h) => h.date);
  if (!entries.length) return line.history?.[0] ?? null;
  return entries.reduce((a, b) => ((b.date ?? "") > (a.date ?? "") ? b : a));
}

function SeenText({ h }: { h: EnquiryHistoryEntry }) {
  const rate = h.rate ?? h.cost_rate;
  return (
    <>
      <div>
        {SOURCE[h.source] ?? h.source} {h.ref && <span className="text-ink-3">{h.ref}</span>}
      </div>
      <div className="text-ink-3">
        {[h.date && date(h.date), h.supplier || h.counterparty, rate && `${h.currency ?? ""} ${decimal(rate)}`.trim()]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </>
  );
}

function LineDetail({ line }: { line: EnquiryLineOut }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        {line.specification && (
          <p className="mb-3 text-[12.5px] text-ink-2">
            <span className="text-ink-4">Specification: </span>
            {line.specification}
          </p>
        )}
        <h4 className="micro mb-2 text-ink-4">Where we met it</h4>
        {line.history?.length ? (
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {line.history.map((h, i) => (
                <tr key={i} className="border-b border-line/50 align-top">
                  <td className="py-1.5 pr-3 text-ink-3">{SOURCE[h.source] ?? h.source}</td>
                  <td className="py-1.5 pr-3">
                    <div>{h.ref}</div>
                    <div className="text-ink-4">{h.description}</div>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-ink-3">{h.date ? date(h.date) : "—"}</td>
                  <td className="py-1.5 pr-3">{h.supplier || h.counterparty || "—"}</td>
                  <td className="tnum whitespace-nowrap py-1.5 text-right">
                    {h.rate ? `${h.currency ?? ""} ${decimal(h.rate)}` : h.cost_rate ? `cost ${decimal(h.cost_rate)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[12.5px] text-ink-3">Not in our supplier quotes, our quotes or Zoho.</p>
        )}
      </div>
      <div>
        <h4 className="micro mb-2 text-ink-4">Who might supply it</h4>
        {line.suppliers?.length ? (
          <ul className="space-y-2">
            {line.suppliers.map((s) => (
              <SupplierItem key={`${s.source}-${s.name}`} s={s} />
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-ink-3">No supplier known yet.</p>
        )}
        {line.web && (line.web.notes || line.web.product_url) && (
          <div className="mt-3 text-[12px] text-ink-2">
            {line.web.notes && <p>{line.web.notes}</p>}
            {line.web.product_url && (
              <a href={line.web.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <ExternalLink className="size-3" /> Product page
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SupplierItem({ s }: { s: EnquirySupplier }) {
  return (
    <li className="rounded-xl bg-panel px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{s.name}</span>
        <Badge tone={s.source === "web" ? "neutral" : "accent"} icon={s.source === "web" ? Globe : undefined}>
          {SOURCE[s.source] ?? s.source}
        </Badge>
        {s.role && s.role !== "unknown" && <span className="text-ink-4">{s.role}</span>}
        {s.partner === true && <Badge tone="positive">Partner</Badge>}
        {s.last_rate && (
          <span className="tnum ml-auto text-ink-2">
            {s.currency} {decimal(s.last_rate)}
            {s.last_date && <span className="text-ink-4"> · {date(s.last_date)}</span>}
          </span>
        )}
      </div>
      {(s.website || s.email || s.phone || s.country) && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-ink-3">
          {s.website && (
            <a href={s.website} target="_blank" rel="noreferrer" className="hover:underline">
              {s.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {s.email && <span>{s.email}</span>}
          {s.phone && <span>{s.phone}</span>}
          {s.country && <span>{s.country}</span>}
        </div>
      )}
      {s.evidence && <div className="mt-1 text-ink-4">{s.evidence}</div>}
    </li>
  );
}

/* ── documents ─────────────────────────────────────────────────────── */

function Documents({
  analysis,
  busy,
  disabled,
  onFiles,
}: {
  analysis: EnquiryAnalysisOut | null;
  busy: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const docs = analysis?.documents ?? [];
  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <PanelHead
          title="Add documents"
          hint="Saved into the task's folder in the Proposal Team Channel library, then read on the next run."
        />
        <FileDrop
          className="mt-3"
          onFiles={onFiles}
          busy={busy || disabled}
          accept=".pdf,.xlsx,.xls,.csv,.docx,.jpg,.jpeg,.png"
          hint="Tender, RFQ, BOQ, specifications, supplier quotations. PDF, Excel, Word, CSV or images."
        />
      </Panel>
      <Panel className="overflow-hidden">
        <div className="p-4">
          <PanelHead
            title="Documents"
            count={docs.length}
            hint="The task's list attachments and every file in its folder. This app's own reports are left out."
          />
        </div>
        {docs.length === 0 ? (
          <div className="px-6 pb-6">
            <Empty
              icon={FolderOpen}
              title="No documents yet"
              body="They are collected when the analysis runs, or add them above."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-y border-line bg-panel-2">
                  {["Document", "From", "Read as", "Note"].map((h) => (
                    <th key={h} className="micro px-5 py-2 text-left font-medium text-ink-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-line/60 align-top">
                    <td className="px-5 py-2 text-[12.5px]">
                      {d.web_url ? (
                        <a href={d.web_url} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                          {d.path || d.file_name}
                        </a>
                      ) : (
                        d.path || d.file_name
                      )}
                      {d.size ? <span className="ml-2 text-ink-4">{bytes(d.size)}</span> : null}
                    </td>
                    <td className="px-5 py-2 text-[12.5px] text-ink-3">{DOC_SOURCE[d.source]}</td>
                    <td className="px-5 py-2">
                      <Badge
                        tone={
                          d.status === "failed"
                            ? "danger"
                            : d.status === "skipped"
                              ? "neutral"
                              : d.kind === "supplier_quote"
                                ? "second"
                                : d.status === "pending"
                                  ? "neutral"
                                  : "accent"
                        }
                      >
                        {d.status === "pending" ? "Not read yet" : d.status === "read" ? DOC_KIND[d.kind ?? ""] ?? "Read" : d.status === "skipped" ? "Skipped" : "Failed"}
                      </Badge>
                    </td>
                    <td className="px-5 py-2 text-[12px] text-ink-3">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ── summary ───────────────────────────────────────────────────────── */

function Summary({ analysis }: { analysis: EnquiryAnalysisOut | null }) {
  if (!analysis?.finished_at) {
    return (
      <Panel className="p-6">
        <Empty icon={FileText} title="Not analysed yet" body="The summary appears after the first run." />
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="p-5 lg:col-span-2">
        <PanelHead title="What the customer wants" />
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{analysis.summary || "—"}</p>
      </Panel>
      <ListPanel title="Conditions" hint="Requirements that are not items" items={analysis.conditions} />
      <ListPanel title="Not said in the documents" hint="What a supplier would ask before quoting" items={analysis.missing} />
      {analysis.run_notes && analysis.run_notes.length > 0 && (
        <ListPanel title="Notes on this run" items={analysis.run_notes} />
      )}
      {(analysis.report_pdf_url || analysis.report_xlsx_url) && (
        <Panel className="p-5">
          <PanelHead title="Filed in the task folder" />
          <div className="mt-3 flex flex-wrap gap-3 text-[12.5px]">
            {analysis.report_pdf_url && (
              <a href={analysis.report_pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent-text hover:underline">
                <FileText className="size-3.5" /> Report PDF
              </a>
            )}
            {analysis.report_xlsx_url && (
              <a href={analysis.report_xlsx_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent-text hover:underline">
                <Download className="size-3.5" /> Excel workbook
              </a>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function ListPanel({ title, hint, items }: { title: string; hint?: string; items: string[] | null }) {
  return (
    <Panel className="p-5">
      <PanelHead title={title} hint={hint} />
      {items && items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">None.</p>
      )}
    </Panel>
  );
}
