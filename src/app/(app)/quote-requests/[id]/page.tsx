"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  ClipboardList,
  ExternalLink,
  Handshake,
  MessageSquare,
  RotateCcw,
  Download,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, dateTime, decimal, decimalPercent, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import {
  toDraft,
  toLineIn,
  type QuoteLineDraft,
  type QuoteLineOut,
  type QuoteRequestOut,
  type ReviewAction,
  type SupplierQuoteFailure,
} from "@/lib/types";
import { Badge, Meta, PageHead, Panel, StatBox } from "@/components/ui/primitives";
import { Button, Field, Input, PillRail, Select, Textarea } from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";
import {
  canEdit,
  QUOTE_STATUS,
  QuoteStatusBadge,
} from "@/components/quotes/QuoteRequestBits";
import { QuoteForm, draftOf, type QuoteFormDraft } from "@/components/quotes/QuoteForm";
import { LineEditor } from "@/components/quotes/LineEditor";
import { SupplierComparison } from "@/components/quotes/SupplierComparison";
import { SupplierUpload } from "@/components/quotes/SupplierUpload";
import { Documents } from "@/components/quotes/Documents";
import { DeleteQuoteDialog } from "@/components/quotes/DeleteQuote";
import { History } from "@/components/quotes/History";
import { Discussion, QUOTE_ANCHOR, type CommentAnchor } from "@/components/quotes/Discussion";
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
 * cost, markup rung and probability is the server's, rendered from the exact
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
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [rules, setRules] = useState<ComplianceRow[]>([]);
  const [portal, setPortal] = useState<PortalRow[]>([]);
  const [title, setTitle] = useState("");
  const [dirtyLines, setDirtyLines] = useState<Set<string>>(new Set());
  const [stamp, setStamp] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("quote");
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
    const lists = bidLists(data);
    setCosts(lists.costLines.map(costRowOf));
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
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data || !form || !bid) return null;

  const editable = data.may_edit && canEdit(data.status);
  // The saved value: the picker writes through immediately rather than
  // waiting for a form save, so this is current the moment it changes.
  const currency = data.currency;
  const changeCurrency = async (value: string) => {
    const next = await setCurrency.run(value);
    if (next) await mutate(next, { revalidate: false });
  };
  const spec = QUOTE_STATUS[data.status];
  const openComments = (data.comments ?? []).filter((c) => c.is_open);
  const isBid = asBid || hasBidPack(data);
  const lists = bidLists(data);
  const blocking = lists.compliance.filter((c) => c.is_blocking).length;

  const unsaved =
    dirtyLines.size > 0 ||
    title !== data.title ||
    lines.length !== data.items.length ||
    lines.some((line, i) => line.id !== data.items[i]?.id) ||
    formChanged(form, draftOf(data)) ||
    bidChanged(bid, bidDraftOf(data)) ||
    listChanged(costs.map(costRowIn), lists.costLines.map((c) => costRowIn(costRowOf(c)))) ||
    listChanged(
      rules.map(complianceRowIn),
      lists.compliance.map((c) => complianceRowIn(complianceRowOf(c))),
    ) ||
    listChanged(
      portal.map(portalRowIn),
      lists.submissionFields.map((f) => portalRowIn(portalRowOf(f))),
    );

  function patchBody() {
    return {
      // PATCH replaces the quote wholesale, so everything that should survive
      // has to be in the body — including the fields this screen does not
      // edit. Sending a partial body is how lines and terms disappear.
      title: title.trim(),
      customer_name: form!.customer_name.trim(),
      customer_id: data!.customer_id,
      contact_person: nullable(form!.contact_person),
      reference: data!.reference,
      reference_number: nullable(form!.reference_number),
      quote_date: nullable(form!.quote_date),
      expiry_date: nullable(form!.expiry_date),
      currency: data!.currency,
      salesperson_name: data!.salesperson_name,
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
      multiple_supplier_quotes: data!.multiple_supplier_quotes,
      items: lines.filter((line) => line.name.trim()).map(toLineIn),
      // The bid pack. Same rule as the lines: the lists are replaced whole, so
      // a row somebody started and abandoned is dropped rather than saved as a
      // blank, and every list goes every time.
      ...bidPatch(bid!),
      cost_lines: costs.filter((row) => row.label.trim()).map(costRowIn),
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
    ...(isBid
      ? ([
          { value: "summary", label: "Summary" },
          {
            value: "compliance",
            label: "Compliance matrix",
            count: lists.compliance.length || undefined,
          },
          { value: "landed", label: "Landed cost" },
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
            {editable && (
              <Button
                icon={Save}
                variant={unsaved ? "solid" : undefined}
                disabled={!unsaved}
                loading={save.pending}
                onClick={() => persist()}
              >
                {unsaved ? "Save changes" : "Saved"}
              </Button>
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

            {/* Shown on a bid only. An ordinary estimate would export five
                sheets of blanks, which is worse than no button. */}
            {isBid && (
              <Button
                icon={Download}
                loading={exportBook.pending}
                onClick={() => exportBook.run()}
              >
                Export
              </Button>
            )}

            <Button icon={MessageSquare} onClick={() => setDeciding("comment")}>
              Comment
            </Button>

            {/* Last, and deliberately far from Approve. Super admin only —
                `may_delete` is the server's answer, not a role check done
                here. */}
            {data.may_delete && (
              <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
          </>
        }
      />

      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
      {exportBook.error && (
        <InlineNotice tone="danger">{exportBook.error}</InlineNotice>
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
          has not prevented a bad bid, it has prevented a bid. */}
      {data.bid && data.bid.warnings.length > 0 && (
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

      {/* ── where it is ── */}
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <QuoteStatusBadge status={data.status} />
        <span className="text-[13px] text-ink-2">{spec.hint}</span>
        {data.revision > 1 && <Badge tone="neutral">Pass {data.revision}</Badge>}
        {unsaved && <Badge tone="warn">Unsaved changes</Badge>}
        {blocking > 0 && (
          <Badge tone="danger" title="Compliance rows that are non-compliant, open or awaiting a clarification.">
            {blocking} to clear
          </Badge>
        )}
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
      </Panel>

      {/* ── the numbers ── */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Total" value={amount(data.total, currency)} />
        {isBid && data.bid ? (
          <StatBox
            label="Landed cost"
            value={amount(data.bid.landed.total, currency)}
            hint="What it costs to put the goods where the customer wants them. The build-up is on the costing tab."
          />
        ) : (
          <StatBox label="Lines" value={num(data.items.length)} />
        )}
        {isBid && data.bid ? (
          <StatBox
            label="Margin"
            value={
              data.bid.gross_margin_percent
                ? `${decimal(data.bid.gross_margin_percent, { min: 1 })}%`
                : "—"
            }
            hint={`${amount(data.bid.gross_margin, currency)} over the landed cost.`}
          />
        ) : (
          <WinChance quote={data} />
        )}
        <StatBox
          label="Open comments"
          value={num(openComments.length)}
          tone={openComments.length > 0 ? "second" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillRail options={tabs} value={tab} onChange={setTab} className="min-w-0 flex-1" />
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
        <div className="grid gap-3.5 xl:grid-cols-[1.65fr_1fr]">
          <div className="min-w-0 space-y-3.5">
            <LineEditor
              lines={lines}
              currency={currency}
              editable={editable}
              dirtyIds={dirtyLines}
              quote={data}
              onChange={(next) => {
                setLines(next);
                setDirtyLines(dirtyAgainst(next, data.items));
              }}
              onComment={(line) =>
                setAnchor({
                  target_type: "item",
                  target_ref: line.id,
                  label: `the line “${line.name || "untitled"}”`,
                })
              }
            />

            <SupplierUpload
              attached={data.comparison?.suppliers?.length ?? 0}
              editable={editable}
              // Deliberately not wrapped in useAction: the per-file failures are
              // inside the ApiError's detail, and the panel below is the thing
              // that knows how to read them. Catching here would lose the names.
              onUpload={async (files) => {
                const body = new FormData();
                for (const file of files) body.append("files", file);
                const result = await api.upload<
                  QuoteRequestOut & { failed?: SupplierQuoteFailure[] }
                >(`/quote-requests/${id}/supplier-quotes`, body);
                await mutate(result, { revalidate: false });
                return result.failed ?? null;
              }}
            />

            <Documents documents={data.documents ?? []} editable={editable} />

            {/* The comparison lives here, not on a page of its own: it exists so
                that somebody picks, and picking is what gives this quote lines. */}
            {data.comparison && (
              <SupplierComparison
                comparison={data.comparison}
                currency={currency}
                selectedId={data.selected_supplier_quote_id}
                hasEdits={dirtyLines.size > 0}
                canChoose={editable}
                pending={choose.pending}
                error={choose.error}
                onChoose={async (supplierId, markup) => {
                  const next = await choose.run(supplierId, markup);
                  if (next) await mutate(next, { revalidate: false });
                  return next;
                }}
              />
            )}
          </div>

          <div className="min-w-0 space-y-3.5">
            <Sidebar
              data={data}
              currency={currency}
              editable={editable}
              title={title}
              onTitle={setTitle}
            />

            <QuoteForm
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
          </div>
        </div>
      )}

      {tab === "summary" && (
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
        />
      )}

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
function Sidebar({
  data,
  currency,
  editable,
  title,
  onTitle,
}: {
  data: QuoteRequestOut;
  currency: string;
  editable: boolean;
  title: string;
  onTitle: (value: string) => void;
}) {
  return (
    <>
      <Panel className="p-5">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
          <Meta label="Customer">{data.customer_name}</Meta>
          <Meta label="Currency">{currency}</Meta>
          <Meta label="Bid closing">{data.cf_bcd ? date(data.cf_bcd) : "—"}</Meta>
          <Meta label="Valid until">
            {data.expiry_date ? date(data.expiry_date) : "—"}
          </Meta>
          {data.rfp_number && <Meta label="RFP">{data.rfp_number}</Meta>}
          {data.line_item_ref && <Meta label="Line">{data.line_item_ref}</Meta>}
          <Meta label="Team">{data.team_name ?? "—"}</Meta>
          <Meta label="Raised by">{data.created_by_name ?? "—"}</Meta>
          <Meta label="Sent">
            {data.submitted_at ? relative(data.submitted_at) : "not yet"}
          </Meta>
          <Meta label="Decided">
            {data.decided_at ? relative(data.decided_at) : "not yet"}
          </Meta>
        </dl>

        {/* Back to where the enquiry actually lives. SharePoint stays the
            system of record for the bid itself. */}
        {data.source_task_url && (
          <a
            href={data.source_task_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 border-t border-line pt-4 text-[12px] text-ink-3 transition hover:text-ink"
          >
            <ExternalLink className="size-3.5" strokeWidth={1.8} />
            Open the enquiry in SharePoint
          </a>
        )}
      </Panel>

      {editable && (
        <Panel className="p-5">
          <span className="mb-1.5 block text-[12px] text-ink-3">Title</span>
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            className="w-full rounded-2xl border border-transparent bg-panel-2 px-4 py-2.5 text-[13px] outline-none transition focus:border-accent"
            placeholder="What this quote is for"
          />
        </Panel>
      )}
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
      line.tax_name !== was.tax_name ||
      line.tax_percentage !== was.tax_percentage ||
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
      <StatBox
        label="Chance of winning"
        value="—"
        hint={
          quote.win_probability !== null
            ? "An estimate exists but the backend did not say what it came from, so it is not shown."
            : "Not estimated yet."
        }
      />
    );
  }
  return (
    <StatBox
      label="Chance of winning"
      value={
        <span className="flex items-baseline gap-2">
          {decimalPercent(quote.win_probability, { places: 0 })}
          <span className="text-[11px] font-normal text-ink-4">{basis.short}</span>
        </span>
      }
      hint={basis.full}
    />
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

