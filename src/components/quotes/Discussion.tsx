"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { CommentTarget, QuoteCommentOut, QuoteRequestOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Textarea } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

/** What a comment is being written about, before it has been written. */
export interface CommentAnchor {
  target_type: CommentTarget;
  target_ref: string | null;
  /** How to describe the thing in the composer — "the line ‘Cable, 4mm’". */
  label: string;
}

export const QUOTE_ANCHOR: CommentAnchor = {
  target_type: "quote",
  target_ref: null,
  label: "this quote",
};

/**
 * The conversation about a quote.
 *
 * Every comment carries the revision it was written in, and old ones are
 * dimmed and labelled with it. That is the whole reason the field exists: on a
 * quote that has been round three times, a note about "the price on line four"
 * means nothing unless you know which pass it was written against, and a
 * reader who assumes it is current will act on a number that changed two
 * rounds ago.
 *
 * Resolving is available on any open comment regardless of who wrote it — the
 * point of the flag is whether the thing has been dealt with, not who agrees
 * that it has.
 */
export function Discussion({
  quote,
  anchor,
  onAnchorChange,
  onChanged,
}: {
  quote: QuoteRequestOut;
  /** Set when the reader clicked "comment on this" somewhere else on the page. */
  anchor: CommentAnchor;
  onAnchorChange: (anchor: CommentAnchor) => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [showDone, setShowDone] = useState(false);

  const add = useAction(async () =>
    api.post<QuoteCommentOut>(`/quote-requests/${quote.id}/comments`, {
      body: body.trim(),
      target_type: anchor.target_type,
      target_ref: anchor.target_ref,
    }),
  );
  const resolve = useAction(async (commentId: string) =>
    api.post(`/quote-requests/${quote.id}/comments/${commentId}/resolve`),
  );

  const comments = quote.comments ?? [];
  const open = comments.filter((c) => c.is_open);
  const done = comments.filter((c) => !c.is_open);

  return (
    <Panel className="p-5" id="discussion">
      <PanelHead
        title="Discussion"
        count={comments.length}
        hint={open.length > 0 ? `${open.length} still open` : "nothing outstanding"}
      />

      {(add.error || resolve.error) && (
        <InlineNotice tone="danger" className="mt-4">
          {add.error ?? resolve.error}
        </InlineNotice>
      )}

      <div className="mt-4">
        {anchor.target_type !== "quote" && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
            <Badge tone="accent">on {anchor.label}</Badge>
            <button
              onClick={() => onAnchorChange(QUOTE_ANCHOR)}
              className="text-ink-3 underline underline-offset-2 transition hover:text-ink"
            >
              comment on the whole quote instead
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              anchor.target_type === "quote"
                ? "Ask about a price, a term, anything on this quote."
                : `What about ${anchor.label}?`
            }
            className="min-h-[64px]"
          />
          <Button
            variant="accent"
            className="self-end"
            disabled={!body.trim()}
            loading={add.pending}
            onClick={async () => {
              if ((await add.run()) !== undefined) {
                setBody("");
                onAnchorChange(QUOTE_ANCHOR);
                onChanged();
              }
            }}
          >
            Post
          </Button>
        </div>
      </div>

      {comments.length === 0 ? (
        <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-3">
          Nobody has said anything about this quote yet.
        </p>
      ) : (
        <>
          <ul className="mt-5 space-y-2.5 border-t border-line pt-4">
            {open.map((comment) => (
              <Comment
                key={comment.id}
                comment={comment}
                revision={quote.revision}
                onResolve={async () => {
                  if ((await resolve.run(comment.id)) !== undefined) onChanged();
                }}
              />
            ))}
          </ul>

          {done.length > 0 && (
            <>
              <button
                onClick={() => setShowDone(!showDone)}
                className="mt-3 text-[11.5px] font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
              >
                {showDone ? "Hide" : "Show"} {done.length} dealt with
              </button>
              {showDone && (
                <ul className="mt-2.5 space-y-2.5">
                  {done.map((comment) => (
                    <Comment
                      key={comment.id}
                      comment={comment}
                      revision={quote.revision}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </Panel>
  );
}

const TARGET_LABEL: Record<CommentTarget, string> = {
  quote: "the quote",
  field: "a field",
  item: "a line",
  supplier_quote: "a supplier quote",
};

function Comment({
  comment,
  revision,
  onResolve,
}: {
  comment: QuoteCommentOut;
  revision: number;
  onResolve?: () => void;
}) {
  // Written in an earlier pass, so the thing it is about may well have moved.
  const stale = comment.revision < revision;

  return (
    <li
      className={clsx(
        "rounded-[14px] p-3",
        comment.is_open ? "bg-panel-2" : "bg-panel-2/50 opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold">{comment.author_name ?? "Somebody"}</span>
        {comment.target_type !== "quote" && (
          <Badge tone="neutral">on {TARGET_LABEL[comment.target_type]}</Badge>
        )}
        <span
          className={clsx("text-[11px]", stale ? "text-warn" : "text-ink-4")}
          title={
            stale
              ? `Written on pass ${comment.revision}. The quote is on pass ${revision} now, so what this refers to may have changed.`
              : undefined
          }
        >
          pass {comment.revision}
          {stale ? " — older round" : ""}
        </span>
        <span className="text-[11px] text-ink-4">{relative(comment.created_at)}</span>
        {comment.is_open
          ? onResolve && (
              <button
                onClick={onResolve}
                className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
              >
                <Check className="size-3" />
                Mark dealt with
              </button>
            )
          : (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-4">
                <Check className="size-3" />
                dealt with {comment.resolved_at ? relative(comment.resolved_at) : ""}
              </span>
            )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
        {comment.body}
      </p>
    </li>
  );
}

/** The small "talk about this" affordance used beside fields and lines. */
export function CommentOn({
  count,
  onClick,
  className,
}: {
  count?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title="Comment on this"
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-ink-4 transition hover:bg-panel-3 hover:text-ink",
        className,
      )}
    >
      <MessageSquare className="size-3" strokeWidth={1.8} />
      {count ? count : null}
    </button>
  );
}
