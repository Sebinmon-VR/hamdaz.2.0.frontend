"use client";

import { type ReactNode, use, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Check,
  ClipboardList,
  ExternalLink,
  FileText,
  Handshake,
  MessageSquare,
  RotateCcw,
  Download,
  Save,
  Send,
  Trash2,
  X, ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, dateTime, decimal, decimalPercent, quotePreview, relative, isZero, costTotal, divideExact } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import {
  toDraft,
  toLineIn,
  type QuoteLineDraft,
  type QuoteIn,
  type QuoteLineOut,
  type QuoteRequestOut,
  type ReviewAction,
  type SupplierQuoteFailure,
  type TypedSupplierQuotesIn,
} from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { Button, Field, IconButton, Input, Select, Textarea } from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";
import {
  canEdit,
  QUOTE_STATUS,
  QuoteStatusBadge,
} from "@/components/quotes/QuoteRequestBits";
import { QuoteForm, draftOf, type QuoteFormDraft } from "@/components/quotes/QuoteForm";
import { Calculations } from "@/components/quotes/Calculations";
import { LineEditor } from "@/components/quotes/LineEditor";
import { SupplierComparison } from "@/components/quotes/SupplierComparison";
import { SupplierQuoteEditor } from "@/components/quotes/SupplierQuoteEditor";
import { SupplierDetailsForm } from "@/components/quotes/SupplierDetailsForm";
import { UploadBox } from "@/components/quotes/UploadBox";
import { FreightCard } from "@/components/quotes/FreightCard";
import { DeleteQuoteDialog } from "@/components/quotes/DeleteQuote";
import { History } from "@/components/quotes/History";
import { Discussion, QUOTE_ANCHOR, type CommentAnchor } from "@/components/quotes/Discussion";
import { CostingReport } from "@/components/quotes/CostingReport";
import { ReportParticulars } from "@/components/quotes/ReportParticulars";
import { PriceTerms } from "@/components/quotes/PriceTerms";
import { SummarySheet } from "@/components/quotes/sheet/SummarySheet";
import { ComplianceSheet } from "@/components/quotes/sheet/ComplianceSheet";
import { LandedCostSheet } from "@/components/quotes/sheet/LandedCostSheet";
import { CostingSheet } from "@/components/quotes/sheet/CostingSheet";
import { PortalSheet } from "@/components/quotes/sheet/PortalSheet";
import {
  bidDraftOf,
  bidLists,
  bidPatch,
  complianceRowIn,
  complianceRowOf,
  costRowIn,
  costRowOf,
  hasBidPack,
  portalRowIn,
  portalRowOf,
  type BidDraft,
  type ComplianceRow,
  type CostRow,
  type PortalRow,
} from "@/components/quotes/bid";

/**
 * One quote, at every stage of its life — and, when it is a tender, the whole
 * bid behind it.
 *
 * There is deliberately one screen rather than one per stage. A quote goes
 * draft → approval → back → negotiation → back again, and the person reading
 * it in round four needs the same things they needed in round one plus the
 * history of how it got here. Splitting that across a "raise" page, a
 * "compare" page and an "approve" page would mean the approver cannot see what
 * the comparison said and the requester cannot see what the approver did.
 *
 * **The sections are tabs, and the bid ones only appear on a bid.** A quote is
 * four fields and some lines when somebody rings up and asks for a price; a
 * tender is that plus an event number, a compliance matrix against forty
 * clauses, a landed-cost build-up and a list of portal cells. Showing all of it
 * to the first person would bury the four fields they actually need, so the bid
 * tabs appear once there is a bid pack — or once somebody says there is one.
 *
 * What changes between stages is which parts are open, and that is the
 * backend's answer, not this screen's: `may_edit`, `may_submit` /
 * `submit_reason`, `may_approve` / `approve_reason`. Nothing here re-derives a
 * permission from a status or a role. The reasons are shown next to the
 * disabled control they explain — the whole point of the field is that nobody
 * should have to press a button to discover why it will not work.
 *
 * No money is calculated anywhere in this file. Every total, margin, landed
 * cost, ladder rung and probability is the server's, rendered from the exact
 * decimal string it sent.
 */

/**
 * The workbook's own tabs, in the workbook's own order.
 *
 * `quote` and `discussion` are this system's rather than the workbook's — the
 * line items with their supplier comparison, and the approval conversation —
 * and they sit at either end so the five sheets in the middle read as the
 * workbook does.
 */
type Tab =
  | "quote"
  | "report"
  | "summary"
  | "compliance"
  | "landed"
  | "costing"
  | "portal"
  | "discussion";

export default function QuoteRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR<QuoteRequestOut>(
    `/quote-requests/${id}`,
    // A background revalidation while somebody is halfway through editing a
    // line would throw their work away, so this screen only refetches when it
    // has itself changed something.
    { revalidateOnFocus: false },
  );

  // Who could move this along. Worth having whenever it is waiting, and
  // worth a great deal when the email telling them did not go out.
  const approvers = useSWR<string[]>(
    data?.status === "pending_approval" ? `/quote-requests/${id}/approvers` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [form, setForm] = useState<QuoteFormDraft | null>(null);
  const [bid, setBid] = useState<BidDraft | null>(null);
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const [targetMargin, setTargetMargin] = useState<string | null>(null);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [rules, setRules] = useState<ComplianceRow[]>([]);
  const [portal, setPortal] = useState<PortalRow[]>([]);
  const [title, setTitle] = useState("");
  const [dirtyLines, setDirtyLines] = useState<Set<string>>(new Set());
  const [stamp, setStamp] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("quote");
  // What is folded away below the lines, and the warnings on the status line.
  const [showWarnings, setShowWarnings] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  // Null until somebody toggles it: open while no supplier is chosen, folded after.
  const [showAttachments, setShowAttachments] = useState<boolean | null>(null);
  // Turned on by hand for a quote that is becoming a tender before any of the
  // bid fields have been filled in. Never turned off: hiding a tab whose
  // section has something in it is how work disappears.
  const [asBid, setAsBid] = useState(false);
  const [deciding, setDeciding] = useState<ReviewAction | null>(null);
  const [negotiating, setNegotiating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [anchor, setAnchor] = useState<CommentAnchor>(QUOTE_ANCHOR);
  const [repriced, setRepriced] = useState<{ before: string; after: string } | null>(null);

  // The drafts are rebuilt whenever the server's copy moves — after a save, a
  // supplier choice, a decision. Comparing the stamp rather than the object
  // means an unchanged revalidation leaves work in progress alone.
  const current = data
    ? [
        data.updated_at,
        data.revision,
        data.status,
        data.items.map((i) => i.id).join(","),
        bidLists(data).costLines.map((c) => c.id).join(","),
        bidLists(data).compliance.map((c) => c.id).join(","),
        bidLists(data).submissionFields.map((f) => f.id).join(","),
      ].join("|")
    : null;
  if (data && current !== stamp) {
    setStamp(current);
    setForm(draftOf(data));
    setBid(bidDraftOf(data));
    setTitle(data.title);
    setLines(data.items.map(toDraft));
    setTargetMargin(data.target_markup_percent);
    const lists = bidLists(data);
    setCosts(lists.costLines.map((c) => costRowOf(c, data.items.map((i) => i.id))));
    setRules(lists.compliance.map(complianceRowOf));
    setPortal(lists.submissionFields.map(portalRowOf));
    setDirtyLines(new Set());
  }

  const save = useAction(async (body: unknown) =>
    api.patch<QuoteRequestOut>(`/quote-requests/${id}`, body),
  );
  const submit = useAction(async () =>
    api.post<QuoteRequestOut>(`/quote-requests/${id}/submit`),
  );
  // Returns an explicit `true` rather than the call's own result. A 204 gives
  // back undefined and so does a failed action, so the result alone cannot tell
  // the two apart — and navigating away on a delete that did not happen is the
  // one outcome worth ruling out here.
  // The five sheets as an .xlsx, built by the server from the same computation
  // the screen draws — so the workbook and the page cannot disagree.
  const exportBook = useAction(async () =>
    api.download(`/quote-requests/${id}/workbook`, "bid.xlsx"),
  );
  // The selling & costing report — the page the approvers are mailed — as a
  // PDF. Built by the server from the saved quote, never from the drafts here.
  const exportReport = useAction(async () =>
    api.download(`/quote-requests/${id}/report.pdf`, "costing-report.pdf"),
  );
  const remove = useAction(async () => {
    await api.del(`/quote-requests/${id}`);
    return true as const;
  });
  // Its own route, so it works on a quote that has gone up for approval —
  // where the ordinary save is refused. See the currency route.
  const setCurrency = useAction(async (value: string) =>
    api.patch<QuoteRequestOut>(`/quote-requests/${id}/currency`, { currency: value }),
  );
  const choose = useAction(async (supplier_quote_id: string, markup_percent: string) =>
    api.post<QuoteRequestOut>(`/quote-requests/${id}/select-supplier`, {
      supplier_quote_id,
      markup_percent,
    }),
  );
  // One supplier's offer off the comparison, document and all.
  const removeSupplier = useAction(async (supplierQuoteId: string) =>
    api.del<QuoteRequestOut>(`/quote-requests/${id}/supplier-quotes/${supplierQuoteId}`),
  );
  // One supplier's offer open for correcting, by its id.
  const [editingOffer, setEditingOffer] = useState<string | null>(null);
  /**
   * Saves a correction to one supplier's offer — from the dialog or from the
   * Summary sheet's cells. Only the offer's parts of the quote are taken from
   * the answer, so whatever else is being edited and not yet saved stays: the
   * drafts rebuild when the quote's own stamp moves, and this does not move it.
   */
  async function saveOffer(supplierId: string, body: QuoteIn) {
    const before = data?.supplier_name ?? null;
    const next = await api.put<QuoteRequestOut>(
      `/quote-requests/${id}/supplier-quotes/${supplierId}`,
      body,
    );
    await mutate(
      (was) =>
        was && {
          ...was,
          comparison: next.comparison,
          supplier_quotes: next.supplier_quotes,
          bid: next.bid,
          supplier_name: next.supplier_name,
        },
      { revalidate: false },
    );
    // The supplier details card names the offer too.
    void globalMutate(`/quote-requests/${id}/supplier-details`);
    // A corrected spelling the report's supplier name followed, followed in
    // the draft too — unless somebody has typed their own there.
    if (next.supplier_name !== before) {
      setBid((b) =>
        b && b.supplier_name === (before ?? "") ? { ...b, supplier_name: next.supplier_name ?? "" } : b,
      );
    }
    return next;
  }
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data || !form || !bid) return null;

  const editable = data.may_edit && canEdit(data.status);
  // The saved value: the picker writes through immediately rather than
  // waiting for a form save, so this is current the moment it changes.
  const currency = data.currency;
  const changeCurrency = async (value: string) => {
    const next = await setCurrency.run(value);
    if (!next) return;
    await mutate(next, { revalidate: false });
    // Every figure on the quote was converted server-side. Nothing typed here
    // is newer than that, so the drafts are rebuilt from the answer.
    setForm(draftOf(next));
    setBid(bidDraftOf(next));
    setLines(next.items.map(toDraft));
    setDirtyLines(new Set());
  };
  const spec = QUOTE_STATUS[data.status];
  const openComments = (data.comments ?? []).filter((c) => c.is_open);
  const isBid = asBid || hasBidPack(data);
  const lists = bidLists(data);
  const blocking = lists.compliance.filter((c) => c.is_blocking).length;
  // The lines a save sends, in order: what a cost row's line number refers to.
  const sentLines = lines.filter((line) => line.name.trim());
  const sentLineKeys = sentLines.map((line) => line.key);
  const savedLineKeys = data.items.map((item) => item.id);

  const unsaved =
    dirtyLines.size > 0 ||
    title !== data.title ||
    lines.length !== data.items.length ||
    lines.some((line, i) => line.id !== data.items[i]?.id) ||
    targetMargin !== data.target_markup_percent ||
    formChanged(form, draftOf(data)) ||
    bidChanged(bid, bidDraftOf(data)) ||
    listChanged(
      costs.map((c) => costRowIn(c, sentLineKeys)),
      lists.costLines.map((c) => costRowIn(costRowOf(c, savedLineKeys), savedLineKeys)),
    ) ||
    listChanged(
      rules.map(complianceRowIn),
      lists.compliance.map((c) => complianceRowIn(complianceRowOf(c))),
    ) ||
    listChanged(
      portal.map(portalRowIn),
      lists.submissionFields.map((f) => portalRowIn(portalRowOf(f))),
    );

  // This is deliberately a local calculation only. `persist` below remains
  // the sole path that sends a PATCH request, so a person can see the exact
  // Zoho-shaped result while typing without changing the saved quote.
  const livePreview = unsaved
    ? quotePreview(
        lines
          .filter((line) => line.name.trim())
          .map((line) => ({
            key: line.key,
            quantity: line.quantity,
            rate: line.rate,
            discount: line.discount,
            costRate: line.cost_rate,
          })),
        {
          discount: form.discount,
          shipping_charge: form.shipping_charge,
          adjustment: form.adjustment,
          tax_name: form.tax_name.trim() || null,
          tax_percentage: form.tax_percentage.trim() || null,
        },
      )
    : null;
  const displayedTotals = livePreview ?? data;
  const chosenSupplier =
    data.comparison?.suppliers?.find((s) => s.quote_id === data.selected_supplier_quote_id)
      ?.supplier_name ?? null;
  // What the lines cost us: live while editing, else from the saved lines.
  const goodsCost = livePreview?.cost_total ?? costTotal(data.items);
  // The landed factor a price is built on. The server sends it; a server
  // older than that field does not, and then it is the landed total over the
  // goods — the same ratio, from figures the server did send.
  const landedUplift =
    data.bid?.landed.uplift ??
    (data.bid && !isZero(goodsCost) ? divideExact(data.bid.landed.total, goodsCost, 8) : null);

  // Each saved line's landed cost, by line id: the server's lines come back in
  // the order of the saved items.
  const landedByLine = data.bid?.landed.lines
    ? Object.fromEntries(
        data.items.flatMap((item, i) => {
          const landed = data.bid?.landed.lines?.[i];
          return landed ? [[item.id, landed] as const] : [];
        }),
      )
    : null;

  function patchBody() {
    return {
      // PATCH replaces the quote wholesale, so everything that should survive
      // has to be in the body — including the fields this screen does not
      // edit. Sending a partial body is how lines and terms disappear.
      title: title.trim(),
      customer_name: form!.customer_name.trim(),
      customer_id: data!.customer_id,
      contact_person: nullable(form!.contact_person),
      reference: nullable(form!.reference),
      reference_number: nullable(form!.reference_number),
      quote_date: nullable(form!.quote_date),
      expiry_date: nullable(form!.expiry_date),
      currency: data!.currency,
      salesperson_name: nullable(form!.salesperson_name),
      place_of_supply: nullable(form!.place_of_supply),
      payment_terms: nullable(form!.payment_terms),
      delivery_terms: nullable(form!.delivery_terms),
      cf_bcd: nullable(form!.cf_bcd),
      cf_portal: nullable(form!.cf_portal),
      subject: nullable(form!.subject),
      notes: nullable(form!.notes),
      terms: nullable(form!.terms),
      discount: form!.discount.trim() || "0",
      shipping_charge: form!.shipping_charge.trim() || "0",
      adjustment: form!.adjustment.trim() || "0",
      tax_name: nullable(form!.tax_name),
      tax_percentage: form!.tax_percentage.trim() || null,
      multiple_supplier_quotes: form!.multiple_supplier_quotes === "Yes",
      items: lines.filter((line) => line.name.trim()).map(toLineIn),
      // The bid pack. Same rule as the lines: the lists are replaced whole, so
      // a row somebody started and abandoned is dropped rather than saved as a
      // blank, and every list goes every time.
      ...bidPatch(bid!),
      // After the spread on purpose: the bid draft carries the margin too (the
      // Summary sheet's cell), and the one typed in the header is the one that
      // was just edited. Listed before the spread it was overwritten — and the
      // build refused the duplicate key. The wire field keeps its old name;
      // the number is a margin, a share of the selling price.
      target_markup_percent: targetMargin?.trim() || null,
      cost_lines: costs
        .filter((row) => row.label.trim())
        .map((row) => costRowIn(row, sentLineKeys)),
      compliance: rules.filter((row) => row.requirement.trim()).map(complianceRowIn),
      submission_fields: portal.filter((row) => row.label.trim()).map(portalRowIn),
    };
  }

  async function persist() {
    const saved = await save.run(patchBody());
    if (saved) await mutate(saved, { revalidate: false });
    return saved;
  }

  // A quote can only be sent once what is on screen is what the server holds.
  const submitBlocked = unsaved
    ? "Save your changes first — the approver sees the saved version."
    : data.may_submit
      ? null
      : (data.submit_reason ?? "This quote cannot be sent yet.");

  // Named as the workbook names its tabs, so somebody who has used the
  // spreadsheet knows where they are before they read anything.
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "quote", label: "Quote & lines", count: data.items.length || undefined },
    // On every quote, not only a bid: the report is what goes to the
    // approver, and every quote goes to one — and the landed cost sheet is
    // where the freight, duty and charges behind its figures are typed.
    { value: "report", label: "Costing report" },
    { value: "landed", label: "Landed cost", count: lists.costLines.length || undefined },
    // On every quote too: it holds who the supplier is, and every approver
    // is deciding on an offer from somebody. A tender adds its bid summary.
    { value: "summary", label: "Summary" },
    ...(isBid
      ? ([
          {
            value: "compliance",
            label: "Compliance matrix",
            count: lists.compliance.length || undefined,
          },
          { value: "costing", label: "Costing sheet" },
          {
            value: "portal",
            label: "Portal fields",
            count: lists.submissionFields.length || undefined,
          },
        ] as const)
      : []),
    {
      value: "discussion",
      label: "Discussion",
      count: openComments.length || undefined,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={<Link href="/quote-requests">Quote requests</Link>}
        title={data.title}
        meta={data.rfp_number ?? data.reference ?? undefined}
        actions={
          <>
            {/* Save is an icon with a state: lit when there is something to
                save, quiet once it is saved. The decisions stay as words. */}
            {editable && (
              <IconButton
                icon={Save}
                label={save.pending ? "Saving…" : unsaved ? "Save changes" : "Saved"}
                tone={unsaved ? "solid" : "ghost"}
                disabled={!unsaved || save.pending}
                onClick={() => persist()}
              />
            )}

            {editable && (
              <span title={submitBlocked ?? undefined}>
                <Button
                  variant="accent"
                  icon={Send}
                  disabled={Boolean(submitBlocked)}
                  loading={submit.pending}
                  onClick={async () => {
                    const sent = await submit.run();
                    if (sent) await mutate(sent, { revalidate: false });
                  }}
                >
                  Send for approval
                </Button>
              </span>
            )}

            {data.may_approve && data.status === "pending_approval" && (
              <>
                <Button icon={RotateCcw} onClick={() => setDeciding("rework")}>
                  Send back
                </Button>
                <Button variant="danger" icon={X} onClick={() => setDeciding("reject")}>
                  Reject
                </Button>
                <Button variant="accent" icon={Check} onClick={() => setDeciding("approve")}>
                  Approve
                </Button>
              </>
            )}

            {/* Reopening an approved quote. Not a review action — it is the
                requester recording that the customer has come back. */}
            {data.status === "approved" && (
              <Button icon={Handshake} onClick={() => setNegotiating(true)}>
                Customer came back
              </Button>
            )}

            {/* The report as the approver receives it. Of the saved quote —
                the tooltip says so while there are edits it cannot see. The
                workbook is shown on a bid only: an ordinary estimate would
                export five sheets of blanks, which is worse than no button. */}
            <div className="flex items-center gap-1">
              <IconButton
                icon={FileText}
                label={
                  exportReport.pending
                    ? "Preparing the report PDF…"
                    : unsaved
                      ? "Report PDF — of the saved quote; save first to include your changes"
                      : "Report PDF"
                }
                disabled={exportReport.pending}
                onClick={() => exportReport.run()}
              />
              {isBid && (
                <IconButton
                  icon={Download}
                  label={exportBook.pending ? "Preparing the workbook…" : "Workbook"}
                  disabled={exportBook.pending}
                  onClick={() => exportBook.run()}
                />
              )}
              <IconButton
                icon={MessageSquare}
                label="Comment"
                onClick={() => setDeciding("comment")}
              />
              {/* Last, and deliberately far from Approve. Super admin only —
                  `may_delete` is the server's answer, not a role check done
                  here. */}
              {data.may_delete && (
                <IconButton
                  icon={Trash2}
                  label="Delete this quote"
                  tone="danger"
                  onClick={() => setDeleting(true)}
                />
              )}
            </div>
          </>
        }
      />

      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
      {exportBook.error && (
        <InlineNotice tone="danger">{exportBook.error}</InlineNotice>
      )}
      {exportReport.error && (
        <InlineNotice tone="danger">{exportReport.error}</InlineNotice>
      )}
      {submit.error && <InlineNotice tone="danger">{submit.error}</InlineNotice>}

      {/* Submitting and notifying are separate things on the backend, and the
          first can succeed while the second fails. When it does, this quote is
          sitting in a queue that nobody has been told about — which from the
          requester's side is indistinguishable from being ignored. So it is
          said outright, with the names of the people to go and tell. */}
      {data.status === "pending_approval" && data.notify_error && (
        <InlineNotice tone="danger">
          This quote is with the approvers, but the email never went out:{" "}
          <strong>{data.notify_error}</strong>{" "}
          {approvers.data && approvers.data.length > 0
            ? `Nobody has been told it is waiting — ${approvers.data.join(", ")} can approve it.`
            : "Nobody has been told it is waiting."}
        </InlineNotice>
      )}

      {/* What happened after an approver named a different supplier. The lines
          were rebuilt underneath them, so the new number is stated outright. */}
      {repriced && (
        <InlineNotice tone="info">
          Repriced from the supplier you named. The total moved from{" "}
          <strong className="tnum">{repriced.before}</strong> to{" "}
          <strong className="tnum">{repriced.after}</strong>, and the quote is now on pass{" "}
          {data.revision}.{" "}
          <button className="underline underline-offset-2" onClick={() => setRepriced(null)}>
            Dismiss
          </button>
        </InlineNotice>
      )}

      {/* What the bid pack wants somebody to know before this goes anywhere.
          Advisory by design — see `bidpack.warnings`. It takes no button away,
          because a system that refuses at four o'clock on the day of a deadline
          has not prevented a bad bid, it has prevented a bid. Behind a toggle
          on the status line, so it does not push the quote down the page. */}
      {data.bid && data.bid.warnings.length > 0 && showWarnings && (
        <InlineNotice tone="warn">
          <span className="block font-medium">Before this is submitted</span>
          <ul className="mt-1.5 space-y-1">
            {data.bid.warnings.map((warning) => (
              <li key={warning} className="leading-relaxed">
                {warning}
              </li>
            ))}
          </ul>
        </InlineNotice>
      )}

      {/* ── where it is, and the facts: one quiet strip ── */}
      <Panel className="space-y-3 px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <QuoteStatusBadge status={data.status} />
        <span className="text-[12.5px] text-ink-2">{spec.hint}</span>
        {data.revision > 1 && <Badge tone="neutral">Pass {data.revision}</Badge>}
        {unsaved && <Badge tone="warn">Unsaved changes</Badge>}
        {blocking > 0 && (
          <button type="button" onClick={() => setTab("compliance")} title="Compliance rows that are non-compliant, open or awaiting a clarification. Opens the matrix.">
            <Badge tone="danger">{blocking} to clear</Badge>
          </button>
        )}
        {data.bid && data.bid.warnings.length > 0 && (
          <button
            type="button"
            onClick={() => setShowWarnings((v) => !v)}
            aria-expanded={showWarnings}
            title="What the bid pack wants checked before this is sent."
          >
            <Badge tone="warn">
              {data.bid.warnings.length} to check {showWarnings ? "▴" : "▾"}
            </Badge>
          </button>
        )}
        {!isBid && <WinChance quote={data} />}
        <div className="flex-1" />
        {/* The reason lives beside the control it explains. */}
        {editable && submitBlocked && (
          <span className="text-[12px] text-ink-3">{submitBlocked}</span>
        )}
        {data.status === "pending_approval" && !data.may_approve && data.approve_reason && (
          <span className="text-[12px] text-ink-3">{data.approve_reason}</span>
        )}
        {data.status === "pending_approval" && !data.notify_error && (
          <span
            className="text-[12px] text-ink-4"
            title={
              data.approvers_notified_at
                ? dateTime(data.approvers_notified_at)
                : "Nothing has emailed the approvers about this yet."
            }
          >
            {data.approvers_notified_at
              ? `Approvers emailed ${relative(data.approvers_notified_at)}`
              : "Not emailed yet"}
            {approvers.data && approvers.data.length > 0
              ? ` · ${approvers.data.join(", ")}`
              : approvers.data
                ? " · nobody on this team can approve it"
                : ""}
          </span>
        )}
      </div>

      <Facts data={data} currency={currency} />
      </Panel>

      {/* ── the numbers: the four terms behind the price, with this quote's
          figures in them. Cost, selling price, gross profit, gross margin —
          the server's numbers, so they agree with the report below. A quote
          that is not a tender shows its chance of winning beside them. ── */}
      {data.bid && (
        <PriceTerms
          bid={data.bid}
          sellingPrice={displayedTotals.total_excl_tax}
          totalInclTax={displayedTotals.total}
          taxLabel={
            data.tax_percentage && !isZero(data.tax_percentage)
              ? `${data.tax_name || "tax"} ${decimal(data.tax_percentage, { min: 0 })}%`
              : "no tax"
          }
          targetMargin={targetMargin}
          currency={currency}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs proper: a segmented switch, the open section raised on its
            own tile, the count beside the name. The sections are pages of one
            document, and a switch says so better than a row of pills. */}
        <nav
          className="flex min-w-0 max-w-full gap-0.5 overflow-x-auto rounded-xl bg-panel-2 p-1"
          aria-label="Sections"
        >
          {tabs.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              aria-current={tab === option.value ? "page" : undefined}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] transition",
                tab === option.value
                  ? "bg-panel font-semibold text-ink shadow-sm"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {option.label}
              {option.count !== undefined && (
                <span className="tnum text-[11px] text-ink-4">{option.count}</span>
              )}
            </button>
          ))}
        </nav>
        {!isBid && editable && (
          <Button
            icon={ClipboardList}
            onClick={() => {
              setAsBid(true);
              setTab("summary");
            }}
          >
            This is a tender
          </Button>
        )}
      </div>

      {tab === "quote" && (
        <div className="space-y-3.5">
          {/* The lines, and beside them the one place a file is dropped:
              a supplier quotation by default, or any other document. */}
          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_480px]">
            <LineEditor
              lines={lines}
              currency={currency}
              fxRate={data.fx_rate}
              landedUplift={landedUplift}
              landedElements={data.bid?.landed.elements ?? null}
              landedLines={landedByLine}
              costTotal={goodsCost}
              landedTotal={data.bid?.landed.total ?? null}
              grossProfit={data.bid?.gross_margin ?? null}
              grossMarginPercent={data.bid?.gross_margin_percent ?? null}
              editable={editable}
              dirtyIds={dirtyLines}
              quote={displayedTotals}
              preview={livePreview}
              targetMargin={targetMargin}
              onChange={(next) => {
                setLines(next);
                setDirtyLines(dirtyAgainst(next, data.items));
              }}
              onTargetMarginChange={setTargetMargin}
              onComment={(line) => {
                setAnchor({
                  target_type: "item",
                  target_ref: line.id,
                  label: `the line “${line.name || "untitled"}”`,
                });
                // The thread is on the discussion tab; go there, or the click
                // looks like nothing happened.
                setTab("discussion");
              }}
            />

            {/* The upload card and the freight form share one column, and
                the column is as tall as the lines beside it — the height the
                upload card has always had. On wide screens it is laid over its
                cell rather than in it, so neither card can push the row taller:
                the freight form keeps its size and the upload card's list of
                filed documents scrolls in what is left. The minimum only
                matters when there are very few lines. */}
            <div className="relative xl:min-h-[640px]">
              <div className="flex flex-col gap-3.5 xl:absolute xl:inset-0">
            <UploadBox
              quote={data}
              editable={editable}
              currency={currency}
              className="min-h-0 xl:flex-1"
              // Not wrapped in useAction: the dialog owns the error, and the
              // server's own words about a refused line are what it shows.
              onTyped={async (body: TypedSupplierQuotesIn) => {
                const next = await api.post<QuoteRequestOut>(
                  `/quote-requests/${id}/supplier-quotes/typed`,
                  body,
                );
                await mutate(next, { revalidate: false });
              }}
              // Deliberately not wrapped in useAction: the per-file failures are
              // inside the ApiError's detail, and the panel is the thing that
              // knows how to read them. Catching here would lose the names.
              onSupplierUpload={async (files, offerCurrency) => {
                const body = new FormData();
                for (const file of files) body.append("files", file);
                if (offerCurrency) body.append("currency", offerCurrency);
                const result = await api.upload<
                  QuoteRequestOut & { failed?: SupplierQuoteFailure[] }
                >(`/quote-requests/${id}/supplier-quotes`, body);
                await mutate(result, { revalidate: false });
                return result.failed ?? null;
              }}
              onDocumentsChanged={(next) => mutate(next, { revalidate: false })}
            />
                {bid && (
                  <FreightCard
                    quote={data}
                    draft={bid}
                    editable={editable}
                    currency={currency}
                    onChange={(patch) => setBid({ ...bid, ...patch })}
                  />
                )}
              </div>
            </div>
          </div>

          {/* The comparison lives here, not on a page of its own: it exists so
              that somebody picks, and picking is what gives this quote lines.
              Open until a supplier is chosen; folded once one is. */}
          {data.comparison && (
            <Section
              title="Supplier comparison"
              summary={[
                `${data.comparison.suppliers.length} offer${data.comparison.suppliers.length === 1 ? "" : "s"}`,
                chosenSupplier ? `priced from ${chosenSupplier}` : "none chosen yet",
              ].join(" · ")}
              open={showAttachments ?? !data.selected_supplier_quote_id}
              onToggle={() =>
                setShowAttachments((v) => !(v ?? !data.selected_supplier_quote_id))
              }
            >
              <SupplierComparison
                    comparison={data.comparison}
                    currency={currency}
                    selectedId={data.selected_supplier_quote_id}
                    hasEdits={dirtyLines.size > 0}
                    canChoose={editable}
                    pending={choose.pending}
                    error={choose.error ?? removeSupplier.error}
                    onChoose={async (supplierId, markup) => {
                      const next = await choose.run(supplierId, markup);
                      if (next) await mutate(next, { revalidate: false });
                      return next;
                    }}
                    onRemove={async (supplierId) => {
                      const next = await removeSupplier.run(supplierId);
                      if (next) await mutate(next, { revalidate: false });
                      return next;
                    }}
                    onEdit={(data.supplier_quotes ?? []).length ? setEditingOffer : undefined}
                  />
            </Section>
          )}

          {/* The rest of the quote — its title, customer, dates, terms,
              adjustments and tax — folded away. Filled in once, read rarely. */}
          <Section
            title="Quote details & report particulars"
            summary={[
              data.customer_name,
              currency,
              data.expiry_date ? `valid until ${date(data.expiry_date)}` : null,
              data.payment_terms,
            ]
              .filter(Boolean)
              .join(" · ")}
            open={showDetails}
            onToggle={() => setShowDetails((v) => !v)}
          >
            <Panel className="space-y-4 p-4">
              <QuoteForm
                embedded
                title={title}
                onTitle={setTitle}
                draft={form}
                currency={currency}
                currencyEditable={data.may_set_currency}
                onCurrency={changeCurrency}
                editable={editable}
                onChange={(patch) => setForm({ ...form, ...patch })}
                commentCounts={fieldComments(data)}
                onComment={(fieldKey, label) =>
                  setAnchor({
                    target_type: "field",
                    target_ref: fieldKey,
                    label: `the ${label.toLowerCase()} field`,
                  })
                }
              />
              {bid && (
                <ReportParticulars
                  embedded
                  draft={bid}
                  editable={editable}
                  onChange={(patch) => setBid({ ...bid, ...patch })}
                />
              )}
            </Panel>
          </Section>

          {/* Every sum, written out. For checking a figure, not for reading
              every time. */}
          <Section
            title="How the figures are worked out"
            summary="Every step, from the server's own arithmetic"
            open={showWorking}
            onToggle={() => setShowWorking((v) => !v)}
          >
            <Calculations steps={data.calculation} />
          </Section>
        </div>
      )}

      {tab === "report" && (
        <CostingReport quote={data} unsaved={unsaved} />
      )}

      {tab === "summary" && isBid && (
        <SummarySheet
          quote={data}
          bid={data.bid}
          draft={bid}
          editable={editable}
          onChange={(patch) => setBid({ ...bid, ...patch })}
          currency={currency}
          currencyEditable={data.may_set_currency}
          onCurrency={changeCurrency}
          onOpenCompliance={() => setTab("compliance")}
          onEditOffer={
            editable &&
            (data.supplier_quotes ?? []).some((q) => q.id === data.selected_supplier_quote_id)
              ? () => setEditingOffer(data.selected_supplier_quote_id)
              : undefined
          }
          offer={(data.supplier_quotes ?? []).find((q) => q.id === data.selected_supplier_quote_id) ?? null}
          onSaveOffer={(body) => saveOffer(data.selected_supplier_quote_id!, body)}
        />
      )}
      {tab === "summary" && <SupplierDetailsForm quoteId={data.id} />}

      {/* One supplier's offer, opened from the comparison or the Summary sheet. */}
      <SupplierQuoteEditor
        row={(data.supplier_quotes ?? []).find((q) => q.id === editingOffer) ?? null}
        quoteCurrency={currency}
        onClose={() => setEditingOffer(null)}
        onSave={saveOffer}
      />

      {tab === "compliance" && (
        <ComplianceSheet rows={rules} editable={editable} onChange={setRules} />
      )}

      {/* The derived block comes from the same response as the lists, so a
          backend that has not caught up yet leaves these empty rather than
          wrong. Said out loud: a blank sheet reads as a bug, and this is not
          one — it is two halves of the system on different versions. */}
      {(tab === "landed" || tab === "costing") && !data.bid && (
        <InlineNotice tone="info">
          This sheet is worked out by the server, and this one has not sent it. That
          happens when the API is running an older build than this screen — the quote
          itself is fine, and the figures appear as soon as the two agree.
        </InlineNotice>
      )}

      {tab === "landed" && data.bid && (
        <LandedCostSheet
          bid={data.bid}
          draft={bid}
          rows={costs}
          lines={sentLines.map((line) => ({
            key: line.key,
            name: line.name,
            quantity: line.quantity,
          }))}
          currency={currency}
          editable={editable}
          onDraftChange={(patch) => setBid({ ...bid, ...patch })}
          onRowsChange={setCosts}
        />
      )}

      {tab === "costing" && data.bid && (
        <CostingSheet
          quote={data}
          bid={data.bid}
          draft={bid}
          editable={editable}
          onChange={(patch) => setBid({ ...bid, ...patch })}
          lines={lines}
          onLinesChange={(next) => {
            setLines(next);
            setDirtyLines(dirtyAgainst(next, data.items));
          }}
        />
      )}

      {tab === "portal" && (
        <PortalSheet rows={portal} editable={editable} onChange={setPortal} />
      )}

      {tab === "discussion" && (
        <div className="grid gap-3.5 xl:grid-cols-[1.65fr_1fr]">
          <div className="min-w-0">
            <Discussion
              quote={data}
              anchor={anchor}
              onAnchorChange={setAnchor}
              onChanged={() => mutate()}
            />
          </div>
          <div className="min-w-0">
            <History quote={data} />
          </div>
        </div>
      )}

      <DecideDialog
        action={deciding}
        quote={data}
        onClose={() => setDeciding(null)}
        onDone={async (next, before) => {
          setDeciding(null);
          if (next) {
            if (before && before !== next.total) {
              setRepriced({
                before: amount(before, next.currency),
                after: amount(next.total, next.currency),
              });
            }
            await mutate(next, { revalidate: false });
          } else {
            await mutate();
          }
        }}
      />

      <DeleteQuoteDialog
        open={deleting}
        quote={{
          reference: data.reference,
          rfp_number: data.rfp_number,
          title: data.title,
          revision: data.revision,
          itemCount: data.items.length,
          reviewCount: data.reviews.length,
        }}
        pending={remove.pending}
        error={remove.error}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          // Only on a confirmed success. Otherwise the dialog stays open with
          // the reason on it, rather than the screen navigating away from a
          // delete that did not happen.
          if (await remove.run()) router.push("/quote-requests");
        }}
      />

      <NegotiateDialog
        open={negotiating}
        quote={data}
        onClose={() => setNegotiating(false)}
        onDone={async (next) => {
          setNegotiating(false);
          await mutate(next, { revalidate: false });
        }}
      />
    </>
  );
}

/* ── the facts that hold on every tab ────────────────────────────────── */

/**
 * Who it is for and where it stands, repeated beside each editing tab.
 *
 * Repeated rather than fixed above the tabs because it is reference, not
 * navigation: somebody filling in a compliance row wants the customer and the
 * closing date in the corner of their eye, and somebody reading the discussion
 * does not. A quote's title is edited here for the same reason — it belongs
 * beside the customer rather than in a panel of its own.
 */
function Facts({ data, currency }: { data: QuoteRequestOut; currency: string }) {
  const facts: [string, string][] = [
    ["Customer", data.customer_name],
    ["Currency", currency],
    ...(data.cf_bcd ? ([["Bid closing", date(data.cf_bcd)]] as [string, string][]) : []),
    ...(data.expiry_date
      ? ([["Valid until", date(data.expiry_date)]] as [string, string][])
      : []),
    ...(data.rfp_number ? ([["RFP", data.rfp_number]] as [string, string][]) : []),
    ...(data.line_item_ref ? ([["Line", data.line_item_ref]] as [string, string][]) : []),
    ["Team", data.team_name ?? "—"],
    ["Raised by", data.created_by_name ?? "—"],
    ["Sent", data.submitted_at ? relative(data.submitted_at) : "not yet"],
    ["Decided", data.decided_at ? relative(data.decided_at) : "not yet"],
  ];
  return (
    <div className="flex flex-wrap items-end gap-x-7 gap-y-2 border-t border-line pt-3">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <span className="micro block text-ink-4">{label}</span>
          <span className="block truncate text-[12.5px] text-ink">{value}</span>
        </div>
      ))}
      {/* The quote's folder in the shared library, once something has been
          filed there, and the enquiry it came from. Their own access decides
          what they may open. */}
      {(data.drive_folder_url || data.source_task_url) && (
        <div className="ml-auto flex items-center gap-2">
          {data.drive_folder_url && (
            <a
              href={data.drive_folder_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-panel-2 px-2.5 py-1 text-[12px] text-ink-2 transition hover:text-ink"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.8} />
              Quote folder
            </a>
          )}
          {data.source_task_url && (
            <a
              href={data.source_task_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-panel-2 px-2.5 py-1 text-[12px] text-ink-2 transition hover:text-ink"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.8} />
              Enquiry
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A section that is folded by default: one bar with the title and a
 * summary of what is inside, the content beneath it when opened. The
 * content keeps its own panels, so nothing is boxed inside a box.
 */
function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl bg-panel px-5 py-3 text-left transition hover:bg-panel-2"
      >
        <ChevronDown
          className={clsx("size-4 shrink-0 text-ink-4 transition", open && "rotate-180")}
          strokeWidth={2}
        />
        <span className="text-[14px] font-semibold">{title}</span>
        {!open && summary && (
          <span className="min-w-0 truncate text-[12px] text-ink-4">{summary}</span>
        )}
      </button>
      {open && children}
    </>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

function formChanged(a: QuoteFormDraft, b: QuoteFormDraft): boolean {
  return (Object.keys(a) as (keyof QuoteFormDraft)[]).some((key) => a[key] !== b[key]);
}

function bidChanged(a: BidDraft, b: BidDraft): boolean {
  return (Object.keys(a) as (keyof BidDraft)[]).some((key) => a[key] !== b[key]);
}

/**
 * Whether one of the bid lists has moved since the server sent it.
 *
 * Compared as the bodies that would be sent rather than field by field, which
 * is both shorter and stricter: it catches a reorder, a removal and an added
 * row as readily as an edit, and it cannot drift out of step with the patch
 * body the way a hand-written comparison of eleven fields eventually does.
 *
 * The rows are already strings — nothing here has been through a number — so
 * serialising them is comparing exactly what would be sent.
 */
function listChanged(now: unknown[], before: unknown[]): boolean {
  return JSON.stringify(now) !== JSON.stringify(before);
}

/**
 * Which rows no longer match what the server sent.
 *
 * Compared field by field as strings, so a row typed back to its original
 * value stops counting as dirty and its server total becomes trustworthy
 * again — which is the point, since a dirty row hides its total.
 */
function dirtyAgainst(lines: QuoteLineDraft[], items: QuoteLineOut[]): Set<string> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const dirty = new Set<string>();
  for (const line of lines) {
    const was = line.id ? byId.get(line.id) : undefined;
    if (!was) {
      dirty.add(line.key);
      continue;
    }
    const moved =
      line.name !== was.name ||
      line.description !== was.description ||
      line.item_code !== was.item_code ||
      line.brand !== was.brand ||
      line.unit !== was.unit ||
      line.quantity !== was.quantity ||
      line.rate !== was.rate ||
      line.discount !== was.discount ||
      line.cost_rate !== was.cost_rate;
    if (moved) dirty.add(line.key);
  }
  return dirty;
}

/** Open comments per field, so a discussed field can say so. */
function fieldComments(quote: QuoteRequestOut): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const comment of quote.comments ?? []) {
    if (comment.target_type !== "field" || !comment.target_ref || !comment.is_open) continue;
    counts[comment.target_ref] = (counts[comment.target_ref] ?? 0) + 1;
  }
  return counts;
}

/**
 * The chance of winning, with what it was worked out from.
 *
 * Shown only when both exist. A bare percentage invites more confidence than
 * a handful of past bids can support, and the honest options are to show the
 * sample size beside it or to show nothing — not to show the number alone.
 */
function WinChance({ quote }: { quote: QuoteRequestOut }) {
  const basis = quote.win_basis ? describeBasis(quote.win_basis) : null;
  if (quote.win_probability === null || !basis) {
    return (
      <span
        className="text-[12px] text-ink-4"
        title={
          quote.win_probability !== null
            ? "An estimate exists but the backend did not say what it came from, so it is not shown."
            : "Not estimated yet."
        }
      >
        Chance of winning —
      </span>
    );
  }
  return (
    <span className="text-[12px] text-ink-3" title={basis.full}>
      Chance of winning{" "}
      <span className="tnum font-semibold text-ink-2">
        {decimalPercent(quote.win_probability, { places: 0 })}
      </span>{" "}
      <span className="text-ink-4">{basis.short}</span>
    </span>
  );
}

/**
 * `win_basis` is a free-form object — the backend decides what fed the number
 * and this screen should not pretend to know its shape. Counts are pulled out
 * for the label beside the percentage; everything is kept for the tooltip.
 */
function describeBasis(basis: Record<string, unknown>): { short: string; full: string } | null {
  const entries = Object.entries(basis).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;
  const count = entries.find(([k]) => /count|total|sample|n_|bids|quotes/i.test(k));
  return {
    short: count ? `of ${String(count[1])}` : `${entries.length} inputs`,
    full: `Based on ${entries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}`,
  };
}

/* ── deciding ────────────────────────────────────────────────────────── */

const DECIDE: Record<
  ReviewAction,
  { title: string; verb: string; body: string; needsNote: boolean }
> = {
  approve: {
    title: "Approve this quote",
    verb: "Approve",
    body: "It stops being editable and joins the queue waiting to be created in Zoho.",
    needsNote: false,
  },
  reject: {
    title: "Reject this quote",
    verb: "Reject",
    body: "It stops here. Say why — that note is all the requester will have to go on.",
    needsNote: true,
  },
  rework: {
    title: "Send this back",
    verb: "Send back",
    body: "The requester can edit it and send it again as the next pass. Say what needs changing.",
    needsNote: true,
  },
  comment: {
    title: "Leave a comment",
    verb: "Comment",
    body: "Decides nothing and leaves the quote exactly where it is.",
    needsNote: false,
  },
  negotiate: {
    title: "Reopen to negotiate",
    verb: "Reopen",
    body: "The quote becomes editable again at the next pass.",
    needsNote: true,
  },
};

function DecideDialog({
  action,
  quote,
  onClose,
  onDone,
}: {
  action: ReviewAction | null;
  quote: QuoteRequestOut;
  onClose: () => void;
  /** `before` is the total as it stood, for reporting a reprice afterwards. */
  onDone: (next: QuoteRequestOut | undefined, before: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const [supplier, setSupplier] = useState("");
  const [seen, setSeen] = useState<ReviewAction | null>(null);

  if (action !== seen) {
    setSeen(action);
    setNote("");
    setSupplier(quote.selected_supplier_quote_id ?? "");
  }

  const decide = useAction(async () =>
    api.post<QuoteRequestOut>(`/quote-requests/${quote.id}/reviews`, {
      action,
      note: note.trim() || null,
      selected_supplier_quote_id: supplier || null,
    }),
  );

  const spec = action ? DECIDE[action] : null;
  const suppliers = quote.comparison?.suppliers ?? [];
  const choices = suppliers.length > 1;
  const changing =
    action === "approve" &&
    Boolean(supplier) &&
    supplier !== quote.selected_supplier_quote_id;
  const chosen = suppliers.find((s) => s.quote_id === supplier);
  const noteMissing = Boolean(spec?.needsNote) && !note.trim();

  return (
    <Modal
      open={Boolean(action)}
      onClose={onClose}
      title={spec?.title ?? "Decide"}
      description={spec?.body}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={action === "reject" ? "danger" : "accent"}
            loading={decide.pending}
            disabled={noteMissing}
            onClick={async () => {
              const before = quote.total;
              const next = await decide.run();
              if (next) onDone(next, changing ? before : null);
            }}
          >
            {changing ? `Approve, priced from ${chosen?.supplier_name ?? "them"}` : spec?.verb}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {decide.error && <InlineNotice tone="danger">{decide.error}</InlineNotice>}

        {/* An approver naming a different supplier does not just record a
            preference — it rebuilds every line on the quote. Said plainly,
            before the button, because it cannot be undone from here. */}
        {changing && (
          <InlineNotice tone="warn">
            This approves the quote <strong>and reprices it</strong>. Every line is rebuilt
            from {chosen?.supplier_name ?? "the supplier you named"} at the margin already on
            the quote, the totals change, and the quote moves to pass {quote.revision + 1}.
            The numbers below will not be the numbers you approved.
          </InlineNotice>
        )}

        {action === "approve" && choices && (
          <Field
            label="Priced from"
            hint={
              quote.selected_supplier_quote_id
                ? "Leave it as it is to approve the quote as priced. Naming a different supplier reprices it."
                : "Several suppliers were compared. Naming one prices the quote from their offer."
            }
          >
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">
                {quote.selected_supplier_quote_id
                  ? "As priced"
                  : "Do not name a supplier"}
              </option>
              {suppliers.map((s) => (
                <option key={s.quote_id} value={s.quote_id}>
                  {s.supplier_name}
                  {s.quote_id === quote.selected_supplier_quote_id ? " — as priced now" : ""}
                  {s.missing_items?.length ? ` — ${s.missing_items.length} lines missing` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Note"
          required={spec?.needsNote}
          error={noteMissing && note !== "" ? "A note is required." : undefined}
          hint={
            spec?.needsNote
              ? "Required. The requester sees this and nothing else."
              : "Optional."
          }
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === "rework"
                ? "What needs changing before this can be approved?"
                : action === "reject"
                  ? "Why is this not going ahead?"
                  : undefined
            }
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ── negotiation ─────────────────────────────────────────────────────── */

function NegotiateDialog({
  open,
  quote,
  onClose,
  onDone,
}: {
  open: boolean;
  quote: QuoteRequestOut;
  onClose: () => void;
  onDone: (next: QuoteRequestOut) => void;
}) {
  const [note, setNote] = useState("");

  const go = useAction(async () =>
    api.post<QuoteRequestOut>(`/quote-requests/${quote.id}/negotiate`, { note: note.trim() }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="The customer came back"
      description="The quote reopens as editable at the next pass. This round is kept whole in the history, so what was agreed stays readable."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Handshake}
            loading={go.pending}
            disabled={!note.trim()}
            onClick={async () => {
              const next = await go.run();
              if (next) onDone(next);
            }}
          >
            Reopen at pass {quote.revision + 1}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {go.error && <InlineNotice tone="danger">{go.error}</InlineNotice>}
        <InlineNotice tone="info">
          Pass {quote.revision} stays in the history at{" "}
          <strong className="tnum">{amount(quote.total, quote.currency)}</strong>, and the
          approver reviewing the next one will see both side by side.
        </InlineNotice>
        <Field
          label="What are they asking for"
          required
          hint="This is what the next approver reads first, so be specific about the ask — a price, a lead time, a line they want dropped."
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="They want the switchgear line down by 8% and delivery inside six weeks."
          />
        </Field>
      </div>
    </Modal>
  );
}

