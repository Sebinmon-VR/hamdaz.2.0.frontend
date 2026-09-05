"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ClipboardList, Eye, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { HrCycleIn, HrCycleOut, HrMetaOut } from "@/lib/types";
import { Badge, Meter, PageHead, Panel, Stat } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { CycleStatusBadge } from "@/components/hr/badges";
import { TemplatePreview } from "@/components/hr/TemplatePreview";

export default function ReviewCyclesPage() {
  return (
    <HrOnly>
      <ReviewCycles />
    </HrOnly>
  );
}

/**
 * Review cycles.
 *
 * A cycle is created as a draft with nobody nominated, and both of those are
 * deliberate steps on the backend — it refuses to open a cycle that nobody has
 * been nominated in. So the progress bar on each row is nominations against
 * submissions rather than a percentage of anything: an empty cycle is visibly
 * empty rather than visibly 0% complete, which is a different problem.
 */
function ReviewCycles() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const cycles = useSWR<HrCycleOut[]>("/hr/review-cycles");
  const meta = useSWR<HrMetaOut>("/hr/meta", { revalidateOnFocus: false });

  const rows = cycles.data ?? [];
  const open = rows.filter((c) => c.status === "open");

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Performance"
        title="Review cycles"
        count={cycles.data ? `${rows.length}` : undefined}
        lead="Created empty. Nominating reviewers is a separate step, and opening one needs at least one nomination."
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
            New cycle
          </Button>
        }
      />

      {meta.data && meta.data.review_forms.templates.length === 0 && (
        <InlineNotice tone="danger">
          There is no active <strong>performance review</strong> form template, so a cycle has
          no questions to ask and cannot be created. A super admin can activate one under Form
          templates.
        </InlineNotice>
      )}

      {rows.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat value={num(rows.length)} label="cycles" />
          <Stat value={num(open.length)} label="open for writing" tone="positive" />
          <Stat
            value={num(open.reduce((sum, c) => sum + (c.nominated - c.submitted), 0))}
            label="reviews still outstanding"
            tone="warn"
          />
          <Stat
            value={num(rows.filter((c) => c.shared_with_subjects).length)}
            label="shared with the people reviewed"
          />
        </Panel>
      )}

      {cycles.error ? (
        <ErrorState error={cycles.error} onRetry={() => cycles.mutate()} />
      ) : cycles.isLoading && !cycles.data ? (
        <RowsSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <Empty
          icon={ClipboardList}
          title="No review cycles yet"
          body="A cycle is a round of reviews: who is being reviewed, who writes about them, and against which form."
          action={
            <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
              New cycle
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((cycle) => (
            <li key={cycle.id}>
              <Link href={`/hr/reviews/${cycle.id}`} className="block">
                <Panel className="p-5 transition hover:bg-panel-2">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{cycle.name}</p>
                      <p className="mt-1 text-[12.5px] text-ink-3">
                        {cycle.period_start && cycle.period_end
                          ? `Covers ${date(cycle.period_start)} – ${date(cycle.period_end)}`
                          : "No period set"}
                        {cycle.due_on ? ` · due ${date(cycle.due_on)}` : ""}
                      </p>
                      {cycle.description && (
                        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                          {cycle.description}
                        </p>
                      )}
                      <p className="mt-2 text-[11.5px] text-ink-4">
                        {cycle.opened_at
                          ? `Opened ${relative(cycle.opened_at)}`
                          : `Created ${relative(cycle.created_at)}`}
                        {cycle.created_by_name ? ` by ${cycle.created_by_name}` : ""}
                      </p>
                    </div>

                    <div className="w-full max-w-56 space-y-2 sm:w-56">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {cycle.shared_with_subjects && (
                          <Badge
                            tone="info"
                            icon={Eye}
                            title="Subjects may read submitted reviews of themselves. Drafts stay hidden regardless."
                          >
                            Shared
                          </Badge>
                        )}
                        <CycleStatusBadge status={cycle.status} />
                      </div>
                      <div className="flex items-baseline justify-end gap-2 text-[12px] text-ink-3">
                        <span className="tnum font-semibold text-ink">
                          {num(cycle.submitted)}/{num(cycle.nominated)}
                        </span>
                        <span>submitted</span>
                      </div>
                      <Meter value={cycle.submitted} max={cycle.nominated} height={6} />
                      <p className="text-right text-[11.5px] text-ink-4">
                        {num(cycle.subjects)} {cycle.subjects === 1 ? "person" : "people"} being
                        reviewed
                      </p>
                    </div>
                  </div>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateDialog
        open={creating}
        meta={meta.data}
        onClose={() => setCreating(false)}
        onCreated={(cycle) => {
          setCreating(false);
          cycles.mutate();
          // Nothing useful can be done with an empty cycle from this screen, so
          // the create hands straight over to the one place nominations happen.
          router.push(`/hr/reviews/${cycle.id}`);
        }}
      />
    </div>
  );
}

function CreateDialog({
  open,
  meta,
  onClose,
  onCreated,
}: {
  open: boolean;
  meta: HrMetaOut | undefined;
  onClose: () => void;
  onCreated: (cycle: HrCycleOut) => void;
}) {
  const [draft, setDraft] = useState<HrCycleIn>({ name: "" });

  const reviewForms = meta?.review_forms.templates ?? [];
  // What the Select is actually showing, which is the explicit choice when one
  // has been made and the backend's own fallback otherwise — not simply the
  // first row, which would describe a form the cycle would not be created with.
  const chosenForm =
    reviewForms.find((f) => f.id === (draft.template_id ?? meta?.review_forms.default_id)) ??
    null;

  const create = useAction(async () =>
    api.post<HrCycleOut>("/hr/review-cycles", {
      ...draft,
      name: draft.name.trim(),
      template_id: draft.template_id || meta?.review_forms.default_id || null,
      description: draft.description?.trim() || null,
      period_start: draft.period_start || null,
      period_end: draft.period_end || null,
      due_on: draft.due_on || null,
    }),
  );

  function set<K extends keyof HrCycleIn>(key: K, value: HrCycleIn[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New review cycle"
      description="Created as a draft with nobody nominated. Nothing is visible to reviewers until you open it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Plus}
            loading={create.pending}
            disabled={!draft.name.trim() || !reviewForms.length}
            onClick={async () => {
              const created = await create.run();
              if (created) {
                setDraft({ name: "" });
                onCreated(created);
              }
            }}
          >
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}

        {reviewForms.length === 0 ? (
          <InlineNotice tone="danger">
            No active performance review form exists, so there are no questions to ask.
          </InlineNotice>
        ) : (
          <>
            {/* A real choice, because the three shipped forms judge different
                jobs: a probation review is not a shortened annual one, and the
                managers' form weights developing people highest. Picking the
                wrong one is not recoverable once reviewers have written. */}
            <Field
              label="Review form"
              required
              hint="What every nominated reviewer fills in. Fixed for the life of the cycle."
            >
              <Select
                value={draft.template_id ?? meta?.review_forms.default_id ?? ""}
                onChange={(e) => set("template_id", e.target.value)}
              >
                {reviewForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name} · {form.field_count} questions
                    {form.is_default ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {chosenForm && (
              <div className="flex justify-end">
                <TemplatePreview
                  templateId={chosenForm.id}
                  label="Preview questions"
                  tags={chosenForm.tags}
                />
              </div>
            )}
            {chosenForm && (
              <p className="text-[12px] text-ink-4">
                {chosenForm.description ? `${chosenForm.description} ` : ""}
                {chosenForm.tags.length > 0
                  ? `Scored across ${chosenForm.tags.length} competencies: ${chosenForm.tags
                      .map(humanise)
                      .join(", ")}.`
                  : "Nothing on it is scored."}
              </p>
            )}
          </>
        )}

        <Field label="Name" required hint="What people will see when the review lands on them.">
          <Input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="2026 mid-year"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Period from" hint="What is being reviewed.">
            <Input
              type="date"
              value={draft.period_start ?? ""}
              onChange={(e) => set("period_start", e.target.value)}
            />
          </Field>
          <Field label="Period to">
            <Input
              type="date"
              value={draft.period_end ?? ""}
              onChange={(e) => set("period_end", e.target.value)}
            />
          </Field>
          <Field label="Due" hint="When reviewers should be done.">
            <Input
              type="date"
              value={draft.due_on ?? ""}
              onChange={(e) => set("due_on", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Description" hint="Reviewers see this above the questions.">
          <Textarea
            value={draft.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Covering the first half of the year. Be concrete — examples are worth more than adjectives."
          />
        </Field>

        <p className="text-[11.5px] leading-relaxed text-ink-4">
          Sharing results with the people reviewed is left off and set on the cycle&apos;s own
          screen, once you have read what came back.
        </p>
      </div>
    </Modal>
  );
}
