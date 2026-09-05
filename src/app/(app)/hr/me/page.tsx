"use client";

import { useState } from "react";
import useSWR from "swr";
import { CalendarX, Download, FolderLock, Lock, Star } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { bytes, date, humanise, num, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { HrDocumentOut, HrPerformanceOut, HrReviewOut } from "@/lib/types";
import { Avatar, Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, PanelSkeleton, RowsSkeleton } from "@/components/ui/feedback";
import { AnswerSheet } from "@/components/hr/Answers";
import { PerformanceCard, ScoreCard, ScorePill } from "@/components/hr/Score";
import { ReviewStatusBadge } from "@/components/hr/badges";

/**
 * What HR holds about you, as far as you are allowed to see it.
 *
 * Open to every signed-in person; all three endpoints narrow themselves to the
 * caller. The screen's job is to be honest about the edges of that:
 *
 *   * the documents are the ones HR marked as yours to see. Others may exist
 *     and you would have no way of knowing, so the panel says so rather than
 *     implying the list is everything on file;
 *   * a review of you is visible as a *fact* long before it is readable. Who
 *     is writing about you is not a secret — knowing it is how you chase your
 *     own review — but what they wrote arrives only once HR shares the cycle
 *     and the reviewer has submitted;
 *   * your combined score is yours regardless of sharing, because an aggregate
 *     about yourself is a different thing from a colleague's words about you.
 */
export default function MyHrRecordPage() {
  const session = useSession();
  const documents = useSWR<HrDocumentOut[]>("/hr/me/documents");
  const performance = useSWR<HrPerformanceOut>("/hr/me/performance");
  const reviews = useSWR<HrReviewOut[]>("/hr/reviews/about-me");

  const [reading, setReading] = useState<HrReviewOut | null>(null);

  const files = documents.data ?? [];
  const rows = reviews.data ?? [];
  const readable = rows.filter((r) => r.answers !== null);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="You"
        title="My HR record"
        faces={<Avatar name={session.user.display_name} seed={session.user.id} size="sm" />}
        lead="Documents HR has shared with you, and where your reviews have got to."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead
              title="My documents"
              count={files.length}
              hint="The ones HR marked as yours to read."
            />

            {documents.error ? (
              <ErrorState error={documents.error} onRetry={() => documents.mutate()} />
            ) : documents.isLoading && !documents.data ? (
              <RowsSkeleton rows={3} />
            ) : files.length === 0 ? (
              <Empty
                icon={FolderLock}
                title="Nothing shared with you"
                className="mt-4"
                body="HR has not marked anything as yours to read. That is not the same as nothing being on file — ask HR if you are expecting a contract or a letter."
              />
            ) : (
              <ul className="mt-4 space-y-2">
                {files.map((document) => (
                  <li key={document.id}>
                    <Panel tone="inset" className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {document.title}
                        </span>
                        <span className="block truncate text-[11.5px] opacity-70">
                          {humanise(document.kind)} · {bytes(document.size_bytes)}
                          {document.issued_on ? ` · issued ${date(document.issued_on)}` : ""}
                        </span>
                        {document.note && (
                          <span className="mt-1.5 block text-[12.5px] leading-relaxed opacity-80">
                            {document.note}
                          </span>
                        )}
                      </span>
                      {document.expired ? (
                        <Badge tone="danger" icon={CalendarX}>
                          Expired {date(document.expires_on)}
                        </Badge>
                      ) : (
                        document.expires_on && (
                          <Badge tone="warn" icon={CalendarX}>
                            Expires {date(document.expires_on)}
                          </Badge>
                        )
                      )}
                      <a
                        href={apiUrl(`/hr/documents/${document.id}/download`)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[13px] border border-current/20 px-3.5 text-[12px] font-medium transition hover:border-current/40"
                      >
                        <Download className="size-3.5" strokeWidth={2.2} />
                        Download
                      </a>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-4">
              <Lock className="mt-0.5 size-3 shrink-0" />
              Your manager cannot see any of this. A manager who needs one of your documents
              has to ask HR, and that request being visible is deliberate.
            </p>
          </Panel>

          <Panel className="p-5">
            <PanelHead
              title="Reviews about me"
              count={rows.length}
              hint={
                rows.length > 0
                  ? `${readable.length} of ${rows.length} readable so far`
                  : undefined
              }
            />

            {reviews.error ? (
              <ErrorState error={reviews.error} onRetry={() => reviews.mutate()} />
            ) : reviews.isLoading && !reviews.data ? (
              <RowsSkeleton rows={3} />
            ) : rows.length === 0 ? (
              <Empty
                icon={Star}
                title="Nobody is reviewing you"
                className="mt-4"
                body="When HR runs a review cycle and nominates people to write about you, they appear here — by name, before anything they write is readable."
              />
            ) : (
              <>
                {readable.length < rows.length && (
                  <InlineNotice tone="info" className="mt-4">
                    {rows.length - readable.length} of these cannot be read yet. A review opens
                    to you only once it has been submitted <em>and</em> HR has shared the cycle
                    — the two together, so nobody watches an assessment of themselves being
                    written line by line.
                  </InlineNotice>
                )}
                <ul className="mt-4 space-y-1.5">
                  {rows.map((review) => (
                    <li key={review.id}>
                      <Panel tone="inset" className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <Avatar name={review.reviewer_name} seed={review.reviewer_id} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">
                            {review.reviewer_name ?? "Unknown"}
                            <span className="ml-2 text-[11.5px] font-normal opacity-70">
                              your {humanise(review.relation)}
                            </span>
                          </span>
                          <span className="block truncate text-[11.5px] opacity-70">
                            {review.cycle_name ?? "Unknown cycle"}
                            {review.submitted_at
                              ? ` · submitted ${relative(review.submitted_at)}`
                              : ""}
                          </span>
                        </span>
                        <ScorePill percent={review.score_percent} />
                        <ReviewStatusBadge status={review.status} />
                        {review.answers !== null ? (
                          <Button size="sm" onClick={() => setReading(review)}>
                            Read
                          </Button>
                        ) : (
                          <Badge tone="neutral" icon={Lock} title="Not submitted, or the cycle is not shared.">
                            Withheld
                          </Badge>
                        )}
                      </Panel>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        <Panel className="h-fit p-5">
          <PanelHead title="My performance" hint="Across every submitted review of you." />
          {performance.error ? (
            <ErrorState error={performance.error} onRetry={() => performance.mutate()} />
          ) : !performance.data ? (
            <PanelSkeleton className="mt-4" lines={4} />
          ) : performance.data.reviews === 0 ? (
            <Empty
              icon={Star}
              title="Nothing scored yet"
              className="mt-4"
              body="A number appears here once somebody submits a review of you."
            />
          ) : (
            <>
              <PerformanceCard className="mt-5" performance={performance.data} />
              <p className="mt-5 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-4">
                Combined from {num(performance.data.reviews)}{" "}
                {performance.data.reviews === 1 ? "review" : "reviews"} by points and maximums
                rather than by averaging percentages, so a reviewer who answered two questions
                does not count as much as one who answered twenty. It is visible to you whether
                or not the cycle has been shared.
              </p>
            </>
          )}
        </Panel>
      </div>

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        width="lg"
        title={`${reading?.reviewer_name ?? "A colleague"} on you`}
        description={
          reading
            ? `${reading.cycle_name ?? "Unknown cycle"} · your ${humanise(reading.relation)}`
            : undefined
        }
        footer={<Button onClick={() => setReading(null)}>Close</Button>}
      >
        {reading && (
          <div className="space-y-6 pb-4">
            {reading.score && <ScoreCard score={reading.score} />}
            {reading.comment && (
              <div>
                <p className="micro mb-2 text-ink-4">Closing comment</p>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                  {reading.comment}
                </p>
              </div>
            )}
            <div>
              <p className="micro mb-3 text-ink-4">Answers</p>
              {/* The list endpoint sends no fields, and `GET /hr/reviews/{id}`
                  only sends them to the reviewer or to HR — not to the subject.
                  So a person reading a review of themselves sees the answers
                  under the template's field keys rather than its questions.
                  That is a backend limitation, not an oversight here. */}
              <AnswerSheet answers={reading.answers ?? {}} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
