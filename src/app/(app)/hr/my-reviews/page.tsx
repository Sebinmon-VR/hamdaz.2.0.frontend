"use client";

import { useState } from "react";
import useSWR from "swr";
import { Ban, Check, Save, Star } from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { HrReviewOut } from "@/lib/types";
import { Avatar, Badge, PageHead, Panel, PanelHead, Stat } from "@/components/ui/primitives";
import { Button, Field, Textarea } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { AnswerForm } from "@/components/hr/Answers";
import { ScoreCard } from "@/components/hr/Score";
import { ReviewStatusBadge } from "@/components/hr/badges";

/**
 * The reviews this person has been asked to write.
 *
 * Open to anybody — the endpoint takes a bare session and answers only about
 * the caller — so there is no HR gate on this route, and there should not be:
 * being nominated to review a colleague is the one piece of HR work that lands
 * on somebody who is not in HR.
 *
 * Writing happens in place rather than on a route of its own, because the
 * backend's catalogue names no such route and inventing one would put a page
 * in the app that the permission model does not know about. The form arrives
 * from `GET /hr/reviews/{id}`, which is the only endpoint that sends the
 * questions along with the answers.
 */
export default function MyReviewsPage() {
  const session = useSession();
  const reviews = useSWR<HrReviewOut[]>("/hr/reviews/mine");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = reviews.data ?? [];
  const outstanding = rows.filter((r) => r.status === "pending" || r.status === "draft");
  const selfReviews = rows.filter((r) => r.subject_id === session.user.id);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Performance"
        title="Reviews to write"
        count={reviews.data ? `${rows.length}` : undefined}
        lead="What colleagues have been asked of you, across every cycle."
      />

      {rows.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat
            value={num(outstanding.length)}
            label="still to write"
            tone="warn"
            delta={outstanding.length > 0 ? "open" : undefined}
          />
          <Stat value={num(rows.filter((r) => r.status === "submitted").length)} label="submitted" />
          {selfReviews.length > 0 && (
            <Stat value={num(selfReviews.length)} label="about yourself" />
          )}
        </Panel>
      )}

      {reviews.error ? (
        <ErrorState error={reviews.error} onRetry={() => reviews.mutate()} />
      ) : reviews.isLoading && !reviews.data ? (
        <RowsSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Star}
          title="Nobody has asked you to review anybody"
          body="Reviews arrive when HR sets up a cycle and nominates you. There is nothing to do here until then."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                open={openId === review.id}
                onToggle={() => setOpenId((current) => (current === review.id ? null : review.id))}
                onChanged={() => reviews.mutate()}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  open,
  onToggle,
  onChanged,
}: {
  review: HrReviewOut;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const session = useSession();
  const isSelf = review.subject_id === session.user.id;
  const done = review.status === "submitted";

  return (
    <Panel tone={review.status === "pending" ? "highlight" : "panel"} className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={review.subject_name} seed={review.subject_id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">
            {isSelf ? "Yourself" : (review.subject_name ?? "Unknown")}
          </p>
          <p className="mt-0.5 truncate text-[12px] opacity-70">
            {review.cycle_name ?? "Unknown cycle"} · you are their {humanise(review.relation)}
            {review.due_on ? ` · due ${date(review.due_on)}` : ""}
          </p>
        </div>
        {isSelf && <Badge tone="second">Self review</Badge>}
        <ReviewStatusBadge status={review.status} />
        <Button size="sm" variant={review.status === "pending" ? "accent" : "outline"} onClick={onToggle}>
          {open ? "Close" : done ? "Read it back" : "Fill it in"}
        </Button>
      </div>

      {review.submitted_at && (
        <p className="mt-3 text-[11.5px] opacity-70">
          Submitted {relative(review.submitted_at)}.{" "}
          {review.status === "submitted"
            ? "It is frozen now — ask HR to hand it back if it needs changing."
            : ""}
        </p>
      )}

      {review.declined_reason && (
        <p className="mt-3 text-[12.5px] opacity-80">You declined: {review.declined_reason}</p>
      )}

      {open && <ReviewEditor review={review} onChanged={onChanged} />}
    </Panel>
  );
}

function ReviewEditor({ review, onChanged }: { review: HrReviewOut; onChanged: () => void }) {
  // The questions come only from the single-review endpoint, so this is a
  // second request even though the list already handed over the answers.
  const full = useSWR<HrReviewOut>(`/hr/reviews/${review.id}`, { revalidateOnFocus: false });

  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);

  const data = full.data;
  const current = answers ?? data?.answers ?? {};
  const currentComment = comment ?? data?.comment ?? "";
  const done = (data ?? review).status === "submitted";

  const save = useAction(async (submit: boolean) => {
    const next = await api.put<HrReviewOut>(`/hr/reviews/${review.id}`, {
      answers: current,
      comment: currentComment.trim() || null,
      submit,
    });
    full.mutate(next, { revalidate: false });
    setAnswers(null);
    setComment(null);
    onChanged();
    return next;
  });

  const decline = useAction(async (reason: string) => {
    const next = await api.post<HrReviewOut>(`/hr/reviews/${review.id}/decline`, {
      reason: reason.trim() || null,
    });
    full.mutate(next, { revalidate: false });
    onChanged();
    return next;
  });

  if (full.error) {
    return (
      <div className="mt-5 border-t border-current/10 pt-5">
        <ErrorState error={full.error} onRetry={() => full.mutate()} />
      </div>
    );
  }
  if (!data) return <PanelSkeleton className="mt-5" lines={6} />;

  return (
    <div className="mt-5 space-y-5 border-t border-current/10 pt-5">
      {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
      {decline.error && <InlineNotice tone="danger">{decline.error}</InlineNotice>}

      {/* A review can be nominated before its cycle opens and after it closes,
          and nothing in the payload says which — `ReviewOut` carries no cycle
          status. So there is no way to grey the buttons out honestly, and the
          backend's own sentence is shown instead when a save is refused. */}
      {done ? (
        <>
          {data.score && <ScoreCard score={data.score} />}
          {data.comment && (
            <div>
              <p className="micro mb-2 opacity-60">Your closing comment</p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{data.comment}</p>
            </div>
          )}
        </>
      ) : (
        <>
          {data.fields && data.fields.length > 0 ? (
            <AnswerForm
              fields={data.fields}
              sections={data.sections}
              value={current}
              onChange={setAnswers}
              disabled={save.pending}
            />
          ) : (
            <InlineNotice tone="warn">
              The form has no questions on it. That is a template problem rather than a
              mistake here — ask HR, or a super admin, to look at the performance review
              template before filling this in.
            </InlineNotice>
          )}

          <Field
            label="Anything else"
            hint="A closing comment, outside the questions. Not scored."
          >
            <Textarea
              value={currentComment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Worth saying that the second half of the year was on a project nobody had done before."
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={Save}
              loading={save.pending}
              onClick={() => save.run(false)}
              title="Saves what you have written. Nobody else can read a draft."
            >
              Save draft
            </Button>
            <Button variant="accent" icon={Check} onClick={() => setConfirming(true)}>
              Submit
            </Button>
            <Button
              variant="ghost"
              icon={Ban}
              className="ml-auto"
              onClick={() => setDeclining(true)}
            >
              Decline
            </Button>
          </div>
        </>
      )}

      <SubmitDialog
        open={confirming}
        subject={data.subject_name}
        pending={save.pending}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (await save.run(true)) setConfirming(false);
        }}
      />

      <DeclineDialog
        open={declining}
        subject={data.subject_name}
        pending={decline.pending}
        onClose={() => setDeclining(false)}
        onConfirm={async (reason) => {
          if (await decline.run(reason)) setDeclining(false);
        }}
      />
    </div>
  );
}

function SubmitDialog({
  open,
  subject,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  subject: string | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Submit your review of ${subject ?? "them"}?`}
      footer={
        <>
          <Button onClick={onClose}>Not yet</Button>
          <Button variant="accent" icon={Check} loading={pending} onClick={onConfirm}>
            Submit it
          </Button>
        </>
      }
    >
      <p className="pb-4 text-[13px] leading-relaxed text-ink-2">
        Submitting freezes the score and hands the review to HR. You cannot edit it afterwards
        — HR can give it back to you if something needs changing. If the cycle is shared with
        the people being reviewed, {subject ?? "they"} will be able to read this with your name
        on it.
      </p>
    </Modal>
  );
}

function DeclineDialog({
  open,
  subject,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  subject: string | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Decline to review ${subject ?? "them"}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Ban} loading={pending} onClick={() => onConfirm(reason)}>
            Decline
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          Says you are not the right person to write this. HR sees the reason and can nominate
          somebody else.
        </p>
        <Field label="Why" hint="Optional, but it saves HR guessing.">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="We have not worked together since January — Priya would know their work far better."
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
