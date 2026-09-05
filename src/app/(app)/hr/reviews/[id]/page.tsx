"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  Send,
  Star,
  Trash2,
  Undo2,
  UserPlus,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  HrCycleOut,
  HrMetaOut,
  HrNominateIn,
  HrReviewerRelation,
  HrReviewOut,
  MemberOut,
} from "@/lib/types";
import { Avatar, Badge, Meta, PageHead, Panel, PanelHead, Stat } from "@/components/ui/primitives";
import { Button, Field, Input, Select } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { AnswerSheet } from "@/components/hr/Answers";
import { PeoplePicker } from "@/components/hr/PeoplePicker";
import { DeleteRecord } from "@/components/hr/DeleteRecord";
import { ScoreCard, ScorePill } from "@/components/hr/Score";
import { CycleStatusBadge, ReviewStatusBadge } from "@/components/hr/badges";

export default function ReviewCyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <HrOnly>
      <ReviewCycle id={id} />
    </HrOnly>
  );
}

/**
 * One cycle: who is being reviewed, by whom, and what came back.
 *
 * Grouped by subject rather than listed flat. A cycle is read one person at a
 * time — "what did the four people asked about Sara say" — and a flat list of
 * forty rows sorted by nothing in particular answers that question only by
 * being scanned.
 *
 * HR can read every review here and can write none of them. That is the
 * backend's rule and it is worth understanding rather than working around: an
 * assessment attributed to somebody who did not write it is evidence about
 * nobody. What HR can do to a submitted review is hand it back.
 */
function ReviewCycle({ id }: { id: string }) {
  const cycle = useSWR<HrCycleOut>(`/hr/review-cycles/${id}`);
  const reviews = useSWR<HrReviewOut[]>(withQuery("/hr/reviews", { cycle_id: id }));

  const router = useRouter();
  const [nominating, setNominating] = useState(false);
  const [sharing, setSharing] = useState(false);

  const act = useAction(async (path: string, query?: Record<string, boolean>) => {
    const next = await api.post<HrCycleOut>(path, undefined, query);
    cycle.mutate(next, { revalidate: false });
    return next;
  });

  if (cycle.error) return <ErrorState error={cycle.error} onRetry={() => cycle.mutate()} />;
  if (!cycle.data) return <PanelSkeleton lines={7} />;

  const data = cycle.data;
  const rows = reviews.data ?? [];
  const subjects = groupBySubject(rows);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Performance"
        title={data.name}
        lead={
          data.period_start && data.period_end
            ? `Covering ${date(data.period_start)} – ${date(data.period_end)}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CycleStatusBadge status={data.status} />
            <Button icon={UserPlus} onClick={() => setNominating(true)}>
              Nominate
            </Button>
            {data.status === "draft" && (
              <Button
                variant="accent"
                icon={Send}
                loading={act.pending}
                disabled={data.nominated === 0}
                onClick={() => act.run(`/hr/review-cycles/${id}/open`)}
              >
                Open it
              </Button>
            )}
            {data.status === "open" && (
              <Button
                icon={Lock}
                loading={act.pending}
                onClick={() => act.run(`/hr/review-cycles/${id}/close`)}
              >
                Close it
              </Button>
            )}
            <DeleteRecord
              path={`/hr/review-cycles/${id}`}
              title="this review cycle"
              confirmWord={data.name}
              destroys={
                <>
                  <p>
                    The cycle and all {num(data.nominated)} reviews in it —{" "}
                    <strong>including the {num(data.submitted)} already submitted</strong>.
                  </p>
                  <p>
                    Every score computed from them goes too, so anybody appraised in this
                    cycle loses that evidence.
                  </p>
                </>
              }
              alternative={
                data.status === "closed"
                  ? "This cycle is already closed, so nobody can submit to it. Keeping it leaves the scores readable."
                  : "Closing the cycle stops anybody submitting and leaves the scores readable — that is almost always what is wanted."
              }
              onDeleted={() => router.push("/hr/reviews")}
            />
          </div>
        }
      />

      {act.error && <InlineNotice tone="danger">{act.error}</InlineNotice>}

      {data.status === "draft" && data.nominated === 0 && (
        <InlineNotice tone="warn">
          Nobody has been nominated, so this cycle cannot be opened. Reviewers see nothing at
          all until it is.
        </InlineNotice>
      )}

      <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
        <Stat value={num(data.subjects)} label="people being reviewed" />
        <Stat value={num(data.nominated)} label="reviews asked for" />
        <Stat
          value={num(data.submitted)}
          label="submitted"
          tone="positive"
          delta={data.nominated > 0 ? `${Math.round((100 * data.submitted) / data.nominated)}%` : undefined}
        />
        <Stat
          value={num(data.nominated - data.submitted)}
          label="still outstanding"
          tone="warn"
        />
        {data.due_on && (
          <div className="ml-auto text-[12.5px] text-ink-3">
            Due {date(data.due_on)} · {relative(data.due_on)}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {reviews.error ? (
            <ErrorState error={reviews.error} onRetry={() => reviews.mutate()} />
          ) : reviews.isLoading && !reviews.data ? (
            <RowsSkeleton rows={6} />
          ) : subjects.length === 0 ? (
            <Empty
              icon={Star}
              title="Nobody nominated yet"
              body="Choose who is being reviewed and who writes about them. A person reviewing themselves is allowed and is recorded as a self review."
              action={
                <Button variant="accent" icon={UserPlus} onClick={() => setNominating(true)}>
                  Nominate reviewers
                </Button>
              }
            />
          ) : (
            subjects.map((subject) => (
              <SubjectPanel
                key={subject.id}
                subject={subject}
                cycleOpen={data.status === "open"}
                onChanged={() => {
                  reviews.mutate();
                  cycle.mutate();
                }}
              />
            ))
          )}
        </div>

        <Panel className="h-fit p-5">
          <PanelHead title="The cycle" />
          <dl className="mt-4 space-y-3">
            <Meta label="Form">
              {data.template_name ?? "—"}{" "}
              <span className="text-ink-4">v{data.template_version}</span>
            </Meta>
            <Meta label="Period">
              {data.period_start && data.period_end
                ? `${date(data.period_start)} – ${date(data.period_end)}`
                : "Not set"}
            </Meta>
            <Meta label="Due">{data.due_on ? date(data.due_on) : "—"}</Meta>
            <Meta label="Opened">{data.opened_at ? date(data.opened_at) : "Not yet"}</Meta>
            <Meta label="Closed">{data.closed_at ? date(data.closed_at) : "—"}</Meta>
            <Meta label="Created by">{data.created_by_name ?? "—"}</Meta>
          </dl>

          {data.description && (
            <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-2">
              {data.description}
            </p>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-start gap-3">
              {data.shared_with_subjects ? (
                <Eye className="mt-0.5 size-4 shrink-0 text-info" />
              ) : (
                <EyeOff className="mt-0.5 size-4 shrink-0 text-ink-4" />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {data.shared_with_subjects ? "Shared with subjects" : "Not shared"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                  {data.shared_with_subjects
                    ? "Each person can read the submitted reviews written about them. Drafts stay hidden either way — sharing cannot expose work in progress."
                    : "Nobody can read a review of themselves yet. Their own combined score is visible to them regardless; that is an aggregate, not somebody's words."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="mt-3"
              icon={data.shared_with_subjects ? EyeOff : Eye}
              onClick={() => setSharing(true)}
            >
              {data.shared_with_subjects ? "Stop sharing" : "Share results"}
            </Button>
          </div>
        </Panel>
      </div>

      <NominateDialog
        open={nominating}
        cycle={data}
        existing={rows}
        onClose={() => setNominating(false)}
        onDone={() => {
          setNominating(false);
          reviews.mutate();
          cycle.mutate();
        }}
      />

      <Modal
        open={sharing}
        onClose={() => setSharing(false)}
        title={data.shared_with_subjects ? "Stop sharing results" : "Share results with subjects"}
        footer={
          <>
            <Button onClick={() => setSharing(false)}>Cancel</Button>
            <Button
              variant="accent"
              icon={data.shared_with_subjects ? EyeOff : Eye}
              loading={act.pending}
              onClick={async () => {
                const done = await act.run(`/hr/review-cycles/${id}/sharing`, {
                  shared: !data.shared_with_subjects,
                });
                if (done) setSharing(false);
              }}
            >
              {data.shared_with_subjects ? "Stop sharing" : "Share"}
            </Button>
          </>
        }
      >
        <p className="pb-4 text-[13px] leading-relaxed text-ink-2">
          {data.shared_with_subjects
            ? "Everyone reviewed in this cycle loses access to what was written about them. They keep their own combined score, which was never gated on sharing."
            : "Everyone reviewed in this cycle will be able to read the reviews written about them, with the reviewer's name attached. Only submitted reviews — a reviewer's draft stays private however this is set, so nobody watches an assessment of themselves appear line by line."}
        </p>
      </Modal>
    </div>
  );
}

interface Subject {
  id: string;
  name: string | null;
  reviews: HrReviewOut[];
}

function groupBySubject(reviews: HrReviewOut[]): Subject[] {
  const map = new Map<string, Subject>();
  for (const review of reviews) {
    const subject = map.get(review.subject_id) ?? {
      id: review.subject_id,
      name: review.subject_name,
      reviews: [],
    };
    subject.reviews.push(review);
    map.set(review.subject_id, subject);
  }
  return [...map.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

function SubjectPanel({
  subject,
  cycleOpen,
  onChanged,
}: {
  subject: Subject;
  cycleOpen: boolean;
  onChanged: () => void;
}) {
  const [reading, setReading] = useState<HrReviewOut | null>(null);
  const done = subject.reviews.filter((r) => r.status === "submitted").length;

  return (
    <Panel className="p-5">
      <PanelHead
        title={
          <span className="flex items-center gap-2.5">
            <Avatar name={subject.name} seed={subject.id} size="xs" />
            <Link href={`/hr/people/${subject.id}`} className="transition hover:text-accent-text">
              {subject.name ?? "Unknown"}
            </Link>
          </span>
        }
        count={`${done}/${subject.reviews.length}`}
        hint={done === subject.reviews.length ? "All in" : "Still waiting on somebody"}
      />

      <ul className="mt-4 space-y-1.5">
        {subject.reviews.map((review) => (
          <li key={review.id}>
            <ReviewRow
              review={review}
              cycleOpen={cycleOpen}
              onRead={() => setReading(review)}
              onChanged={onChanged}
            />
          </li>
        ))}
      </ul>

      <ReadDialog review={reading} onClose={() => setReading(null)} />
    </Panel>
  );
}

function ReviewRow({
  review,
  cycleOpen,
  onRead,
  onChanged,
}: {
  review: HrReviewOut;
  cycleOpen: boolean;
  onRead: () => void;
  onChanged: () => void;
}) {
  // POST, not DELETE. Withdrawing is un-asking somebody who has not started,
  // it destroys nothing, and it stays with HR. `DELETE /hr/reviews/{id}` is now
  // the super-admin purge that removes a written review — calling that here
  // would have turned "wrong person nominated" into evidence destruction.
  //
  // It answers 204, so `api.post` resolves to undefined — and `run` also
  // returns undefined when the call failed. Returning a value of our own is
  // what makes the two distinguishable at the call site.
  const withdraw = useAction(async () => {
    await api.post(`/hr/reviews/${review.id}/withdraw`);
    return true;
  });
  const reopen = useAction(async () => api.post<HrReviewOut>(`/hr/reviews/${review.id}/reopen`));

  return (
    <Panel tone="inset" className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {review.reviewer_name ?? "Unknown"}
          <span className="ml-2 text-[11.5px] font-normal opacity-70">
            {humanise(review.relation)}
          </span>
        </span>
        <span className="block truncate text-[11.5px] opacity-70">
          {review.submitted_at
            ? `Submitted ${relative(review.submitted_at)}`
            : review.due_on
              ? `Due ${date(review.due_on)}`
              : "Not started"}
          {review.declined_reason ? ` · declined: ${review.declined_reason}` : ""}
        </span>
      </span>

      <ScorePill percent={review.score_percent} />
      <ReviewStatusBadge status={review.status} />

      {review.status === "submitted" && (
        <>
          <Button size="sm" onClick={onRead}>
            Read
          </Button>
          <Button
            size="sm"
            icon={Undo2}
            loading={reopen.pending}
            title="Hands the review back to its author and clears the frozen score. Only useful while the cycle is open."
            onClick={async () => {
              if (await reopen.run()) onChanged();
            }}
          >
            Hand back
          </Button>
        </>
      )}

      {/* Only while nothing has been written. The backend refuses on `draft`
          as well as `submitted` — starting to write turns withdrawal into
          throwing somebody's work away, which is a different decision with a
          different owner. Offering the button anyway would just produce a
          refusal the person could have been spared. */}
      {(review.status === "pending" || review.status === "declined") && (
        <Button
          size="sm"
          icon={Undo2}
          loading={withdraw.pending}
          title="Un-asks this reviewer. Nothing is destroyed — they have written nothing."
          onClick={async () => {
            if (await withdraw.run()) onChanged();
          }}
        >
          Withdraw
        </Button>
      )}

      {/* Written or submitted, so it can only go by being destroyed. Renders
          for a super admin alone; HR sees nothing here. */}
      {(review.status === "draft" || review.status === "submitted") && (
        <DeleteRecord
          path={`/hr/reviews/${review.id}`}
          title={`${review.reviewer_name ?? "this"}'s review of ${review.subject_name ?? "them"}`}
          label="Delete"
          destroys={
            <>
              <p>This one review and everything written in it.</p>
              {review.status === "submitted" && (
                <p>
                  It has been <strong>submitted</strong>, so it counts towards{" "}
                  {review.subject_name ?? "the subject"}&rsquo;s score. Deleting it changes
                  that score.
                </p>
              )}
            </>
          }
          alternative={
            review.status === "submitted"
              ? "To let the reviewer change their answers instead, hand it back — that keeps the record."
              : undefined
          }
          onDeleted={onChanged}
        />
      )}

      {(withdraw.error || reopen.error) && (
        <p className="w-full text-[11.5px] text-danger">{withdraw.error ?? reopen.error}</p>
      )}
    </Panel>
  );
}

/**
 * Reading one submitted review.
 *
 * The list endpoint hands HR the answers already, so this does not re-fetch —
 * but it also hands over no `fields`, which only the single-review endpoint
 * does. So the answers render under their raw keys unless the same review is
 * opened through `GET /hr/reviews/{id}`; fetching that here is one request per
 * dialog open and buys the real question text, which is worth it.
 */
function ReadDialog({ review, onClose }: { review: HrReviewOut | null; onClose: () => void }) {
  const full = useSWR<HrReviewOut>(review ? `/hr/reviews/${review.id}` : null, {
    revalidateOnFocus: false,
  });
  const shown = full.data ?? review;

  return (
    <Modal
      open={Boolean(review)}
      onClose={onClose}
      width="lg"
      title={`${review?.reviewer_name ?? "Review"} on ${review?.subject_name ?? "them"}`}
      description={
        review
          ? `${humanise(review.relation)} · submitted ${relative(review.submitted_at)}`
          : undefined
      }
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {shown && (
        <div className="space-y-6 pb-4">
          {shown.score && <ScoreCard score={shown.score} />}

          {shown.comment && (
            <div>
              <p className="micro mb-2 text-ink-4">Closing comment</p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                {shown.comment}
              </p>
            </div>
          )}

          <div>
            <p className="micro mb-3 text-ink-4">Answers</p>
            <AnswerSheet
              answers={shown.answers ?? {}}
              fields={shown.fields}
              sections={shown.sections}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Nominating reviewers for one person at a time.
 *
 * One subject, several reviewers, one relation for the lot. That is a
 * simplification of what the API allows — every nomination carries its own
 * relation — and it is the right one here, because the relation is context
 * rather than a permission and choosing it per reviewer for forty people is
 * how a cycle takes an afternoon to set up. The exception handles itself: the
 * backend forces `self` when the two ids match, so putting somebody in their
 * own reviewer list as a "peer" still records a self review.
 *
 * The whole batch is sent as one request and the backend refuses it whole if
 * one nomination is bad, rather than leaving HR to work out which half of a
 * list of forty went in.
 */
function NominateDialog({
  open,
  cycle,
  existing,
  onClose,
  onDone,
}: {
  open: boolean;
  cycle: HrCycleOut;
  existing: HrReviewOut[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"subject" | "reviewers">("subject");
  const [subjects, setSubjects] = useState<MemberOut[]>([]);
  const [reviewers, setReviewers] = useState<MemberOut[]>([]);
  const [relation, setRelation] = useState<HrReviewerRelation>("peer");
  const [due, setDue] = useState(cycle.due_on ?? "");

  const meta = useSWR<HrMetaOut>(open ? "/hr/meta" : null, { revalidateOnFocus: false });

  // Every subject/reviewer pair that already exists. Keyed on the pair rather
  // than on the reviewer, because with several subjects in play "already asked"
  // is only true of the one they were asked about.
  const askedPairs = new Set(existing.map((r) => `${r.subject_id}|${r.reviewer_id}`));

  // The cross product, minus what exists. One reviewer covering four people is
  // four reviews, and that is what the backend stores — it has no notion of a
  // reviewer being attached to a group.
  const pairs: HrNominateIn[] = subjects.flatMap((subject) =>
    reviewers
      .filter((reviewer) => !askedPairs.has(`${subject.user_id}|${reviewer.user_id}`))
      .map((reviewer) => ({
        subject_id: subject.user_id,
        reviewer_id: reviewer.user_id,
        // The backend overrides this to `self` when the two ids match, which is
        // the one case a cross product produces without anybody choosing it.
        relation,
        due_on: due || null,
      })),
  );

  // The endpoint takes up to 500 in one request and is all-or-nothing, so this
  // is one call rather than a queue — a partial failure would leave HR working
  // out which half of forty went in, which is exactly what the backend refuses
  // to do. Over the cap it would 422, so it is caught before sending.
  const overCap = pairs.length > 500;

  const nominate = useAction(async () =>
    api.post<HrReviewOut[]>(`/hr/review-cycles/${cycle.id}/nominations`, {
      nominations: pairs,
    }),
  );

  function reset() {
    setStep("subject");
    setSubjects([]);
    setReviewers([]);
    setRelation("peer");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={
        step === "subject"
          ? "Who is being reviewed?"
          : subjects.length === 1
            ? `Who reviews ${subjects[0].display_name}?`
            : `Who reviews these ${subjects.length} people?`
      }
      description={
        step === "subject"
          ? "Choose everybody this cycle covers. Their reviewers come next."
          : "Everyone chosen here is asked about everyone above. Including somebody in both lists records their self review."
      }
      footer={
        step === "subject" ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="accent"
              disabled={subjects.length === 0}
              onClick={() => setStep("reviewers")}
            >
              Next{subjects.length > 1 ? ` · ${subjects.length} people` : ""}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep("subject")}>Back</Button>
            <Button
              variant="accent"
              icon={Check}
              loading={nominate.pending}
              disabled={pairs.length === 0 || overCap}
              onClick={async () => {
                if (await nominate.run()) {
                  reset();
                  onDone();
                }
              }}
            >
              Create {pairs.length || ""} {pairs.length === 1 ? "review" : "reviews"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 pb-4">
        {nominate.error && <InlineNotice tone="danger">{nominate.error}</InlineNotice>}

        {overCap && (
          <InlineNotice tone="danger">
            That is {pairs.length} reviews and the limit is 500 in one go. Nominate fewer
            people at a time.
          </InlineNotice>
        )}

        {step === "reviewers" && pairs.length > 0 && (
          <p className="text-[12px] text-ink-4">
            {subjects.length} × {reviewers.length} ={" "}
            <strong className="text-ink-3">{pairs.length}</strong> reviews
            {subjects.length * reviewers.length !== pairs.length
              ? ` (${subjects.length * reviewers.length - pairs.length} already asked for)`
              : ""}
            .
          </p>
        )}

        {cycle.status === "closed" && (
          <InlineNotice tone="warn">
            This cycle is closed. A nomination added now cannot be filled in — reopen the cycle
            first, or it will sit at &ldquo;not started&rdquo; for good.
          </InlineNotice>
        )}

        {step === "subject" ? (
          <PeoplePicker
            multiple
            selected={subjects.map((s) => s.user_id)}
            onToggle={(member) =>
              setSubjects((current) =>
                current.some((s) => s.user_id === member.user_id)
                  ? current.filter((s) => s.user_id !== member.user_id)
                  : [...current, member],
              )
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-panel-2 px-4 py-3">
              <Badge tone="accent">Being reviewed</Badge>
              {subjects.map((person) => (
                <span
                  key={person.user_id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2 py-1"
                >
                  <Avatar name={person.display_name} seed={person.user_id} size="xs" />
                  <span className="text-[12px]">{person.display_name}</span>
                </span>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="How they know them"
                hint="Recorded as context. It never decides what anyone may see."
              >
                <Select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value as HrReviewerRelation)}
                >
                  {(meta.data?.reviewer_relations ?? ["peer"])
                    // `self` is not offered: the backend sets it itself when the
                    // reviewer and the subject are the same person, and offering
                    // it here would let HR mislabel a colleague's review as one.
                    .filter((value) => value !== "self")
                    .map((value) => (
                      <option key={value} value={value}>
                        {humanise(value)}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Due" hint="Left blank, the reviewer sees no date of their own.">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>

            <PeoplePicker
              multiple
              selected={reviewers.map((r) => r.user_id)}
              onToggle={(member) =>
                setReviewers((current) =>
                  current.some((r) => r.user_id === member.user_id)
                    ? current.filter((r) => r.user_id !== member.user_id)
                    : [...current, member],
                )
              }
            />
          </>
        )}
      </div>
    </Modal>
  );
}
