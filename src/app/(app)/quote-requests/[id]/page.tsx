"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Check,
  ExternalLink,
  Handshake,
  MessageSquare,
  RotateCcw,
  Save,
  Send,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { amount, date, dateTime, decimalPercent, num, relative } from "@/lib/format";
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
import { Button, Field, Select, Textarea } from "@/components/ui/controls";
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
import { History } from "@/components/quotes/History";
import { Discussion, QUOTE_ANCHOR, type CommentAnchor } from "@/components/quotes/Discussion";

/**
 * One quote, at every stage of its life.
 *
 * There is deliberately one screen rather than one per stage. A quote goes
 * draft → approval → back → negotiation → back again, and the person reading
 * it in round four needs the same things they needed in round one plus the
 * history of how it got here. Splitting that across a "raise" page, a
 * "compare" page and an "approve" page would mean the approver cannot see what
 * the comparison said and the requester cannot see what the approver did.
 *
 * What changes between stages is which parts are open, and that is the
 * backend's answer, not this screen's: `may_edit`, `may_submit` /
 * `submit_reason`, `may_approve` / `approve_reason`. Nothing here re-derives a
 * permission from a status or a role. The reasons are shown next to the
 * disabled control they explain — the whole point of the field is that nobody
 * should have to press a button to discover why it will not work.
 *
 * No money is calculated anywhere in this file. Every total, margin and
 * probability is the server's, rendered from the exact decimal string it sent.
 */
export default function QuoteRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

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
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const [title, setTitle] = useState("");
  const [dirtyLines, setDirtyLines] = useState<Set<string>>(new Set());
  const [stamp, setStamp] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<ReviewAction | null>(null);
  const [negotiating, setNegotiating] = useState(false);
  const [anchor, setAnchor] = useState<CommentAnchor>(QUOTE_ANCHOR);
  const [repriced, setRepriced] = useState<{ before: string; after: string } | null>(null);

  // The drafts are rebuilt whenever the server's copy moves — after a save, a
  // supplier choice, a decision. Comparing the stamp rather than the object
  // means an unchanged revalidation leaves work in progress alone.
  const current = data
    ? `${data.updated_at}|${data.revision}|${data.status}|${data.items.map((i) => i.id).join(",")}`
    : null;
  if (data && current !== stamp) {
    setStamp(current);
    setForm(draftOf(data));
    setTitle(data.title);
    setLines(data.items.map(toDraft));
    setDirtyLines(new Set());
  }

  const save = useAction(async (body: unknown) =>
    api.patch<QuoteRequestOut>(`/quote-requests/${id}`, body),
  );
  const submit = useAction(async () =>
    api.post<QuoteRequestOut>(`/quote-requests/${id}/submit`),
  );
  const choose = useAction(async (supplier_quote_id: string, markup_percent: string) =>
    api.post<QuoteRequestOut>(`/quote-requests/${id}/select-supplier`, {
      supplier_quote_id,
      markup_percent,
    }),
  );
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data || !form) return null;

  const editable = data.may_edit && canEdit(data.status);
  const spec = QUOTE_STATUS[data.status];
  const openComments = (data.comments ?? []).filter((c) => c.is_open);

  const unsaved =
    dirtyLines.size > 0 ||
    title !== data.title ||
    lines.length !== data.items.length ||
    lines.some((line, i) => line.id !== data.items[i]?.id) ||
    formChanged(form, draftOf(data));

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

  return (
    <>
      <PageHead
        eyebrow={<Link href="/quote-requests">Quote requests</Link>}
        title={data.title}
        meta={data.reference ?? undefined}
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

            <Button icon={MessageSquare} onClick={() => setDeciding("comment")}>
              Comment
            </Button>
          </>
        }
      />

      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
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

      {/* ── where it is ── */}
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <QuoteStatusBadge status={data.status} />
        <span className="text-[13px] text-ink-2">{spec.hint}</span>
        {data.revision > 1 && (
          <Badge tone="neutral">Pass {data.revision}</Badge>
        )}
        {unsaved && <Badge tone="warn">Unsaved changes</Badge>}
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
        <StatBox label="Total" value={amount(data.total, data.currency)} />
        <StatBox label="Lines" value={num(data.items.length)} />
        <WinChance quote={data} />
        <StatBox
          label="Open comments"
          value={num(openComments.length)}
          tone={openComments.length > 0 ? "second" : undefined}
        />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0 space-y-3.5">
          <LineEditor
            lines={lines}
            currency={data.currency}
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

          {/* The comparison lives here, not on a page of its own: it exists so
              that somebody picks, and picking is what gives this quote lines. */}
          {data.comparison && (
            <SupplierComparison
              comparison={data.comparison}
              currency={data.currency}
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

          <Discussion
            quote={data}
            anchor={anchor}
            onAnchorChange={setAnchor}
            onChanged={() => mutate()}
          />
        </div>

        <div className="min-w-0 space-y-3.5">
          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              <Meta label="Customer">{data.customer_name}</Meta>
              <Meta label="Currency">{data.currency}</Meta>
              <Meta label="Bid closing">{data.cf_bcd ? date(data.cf_bcd) : "—"}</Meta>
              <Meta label="Valid until">
                {data.expiry_date ? date(data.expiry_date) : "—"}
              </Meta>
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
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-2xl border border-transparent bg-panel-2 px-4 py-2.5 text-[13px] outline-none transition focus:border-accent"
                placeholder="What this quote is for"
              />
            </Panel>
          )}

          <QuoteForm
            draft={form}
            currency={data.currency}
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

          <History quote={data} />
        </div>
      </div>

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

/* ── helpers ─────────────────────────────────────────────────────────── */

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

function formChanged(a: QuoteFormDraft, b: QuoteFormDraft): boolean {
  return (Object.keys(a) as (keyof QuoteFormDraft)[]).some((key) => a[key] !== b[key]);
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
