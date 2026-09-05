"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Briefcase, Globe, Plus, Sparkles } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  HrEmploymentType,
  HrMetaOut,
  HrOpeningIn,
  HrOpeningOut,
  HrOpeningStatus,
  HrOpeningSummaryOut,
  TemplateOut,
  TeamOut,
} from "@/lib/types";
import { Badge, PageHead, Panel, Stat } from "@/components/ui/primitives";
import { Button, Field, Input, PillRail, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { AnswerForm } from "@/components/hr/Answers";
import { TemplatePreview } from "@/components/hr/TemplatePreview";
import { OpeningStatusBadge } from "@/components/hr/badges";

type Filter = HrOpeningStatus | "all";

/**
 * Every job opening, in whatever state.
 *
 * Openings are created as drafts and posted as a second, deliberate step —
 * that is the backend's rule, and this screen makes it visible rather than
 * hiding it behind a "publish?" checkbox on the create form. A draft has no
 * share link at all, which is the honest consequence: there is nowhere for a
 * candidate to go until somebody decides the job is real.
 */
export default function OpeningsPage() {
  return (
    <HrOnly>
      <Openings />
    </HrOnly>
  );
}

function Openings() {
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);

  const key = withQuery("/hr/openings", { status: filter === "all" ? undefined : filter });
  const openings = useSWR<HrOpeningSummaryOut[]>(key);
  const meta = useSWR<HrMetaOut>("/hr/meta", { revalidateOnFocus: false });

  const rows = openings.data ?? [];
  const waiting = rows.reduce((sum, r) => sum + r.new_application_count, 0);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Hiring"
        title="Job openings"
        count={openings.data ? `${rows.length}` : undefined}
        lead="Created as drafts. Posting one is what makes its share link work."
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
            New opening
          </Button>
        }
      />

      {/* The one thing worth interrupting for. Without an active job
          application template there is no form to post an opening against, and
          the backend refuses the create — finding that out on the click is
          finding out too late. */}
      {meta.data && meta.data.application_forms.templates.length === 0 && (
        <InlineNotice tone="danger">
          There is no active <strong>job application</strong> form template, so an opening has
          nothing for candidates to fill in and cannot be created. A super admin can activate
          one under Form templates.
        </InlineNotice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Everything" },
            { value: "draft", label: "Drafts" },
            { value: "open", label: "Posted" },
            { value: "closed", label: "Closed" },
            { value: "filled", label: "Filled" },
          ]}
        />
      </div>

      {rows.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat value={num(rows.length)} label={filter === "all" ? "openings" : "in this filter"} />
          <Stat
            value={num(rows.reduce((sum, r) => sum + r.application_count, 0))}
            label="applications received"
          />
          <Stat
            value={num(waiting)}
            label="nobody has looked at yet"
            tone="accent"
            delta={waiting > 0 ? "new" : undefined}
          />
          <Stat
            value={num(rows.filter((r) => r.publicly_listed).length)}
            label="on the public careers list"
          />
        </Panel>
      )}

      {openings.error ? (
        <ErrorState error={openings.error} onRetry={() => openings.mutate()} />
      ) : openings.isLoading && !openings.data ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Briefcase}
          title={filter === "all" ? "No openings yet" : "Nothing in this filter"}
          body={
            filter === "all"
              ? "An opening carries the role, the form candidates fill in, and the link you send them."
              : "No opening is in this state at the moment."
          }
          action={
            filter === "all" && (
              <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
                New opening
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((opening) => (
            <li key={opening.id}>
              <Link href={`/hr/openings/${opening.id}`} className="block">
                <Panel className="p-5 transition hover:bg-panel-2">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{opening.title}</p>
                      <p className="mt-1 text-[12.5px] text-ink-3">
                        {[
                          opening.department,
                          opening.location,
                          humanise(opening.employment_type),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-[12px] text-ink-4">
                        {opening.posted_at
                          ? `Posted ${relative(opening.posted_at)}`
                          : "Not posted yet"}
                        {opening.closes_on ? ` · closes ${date(opening.closes_on)}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {opening.publicly_listed && (
                          <Badge
                            tone="info"
                            icon={Globe}
                            title="Appears on the organisation's public careers list, not only to whoever holds the link."
                          >
                            Listed
                          </Badge>
                        )}
                        <OpeningStatusBadge status={opening.status} />
                      </div>
                      <p className="tnum text-[12px] text-ink-3">
                        {num(opening.application_count)}{" "}
                        {opening.application_count === 1 ? "application" : "applications"}
                      </p>
                      {opening.new_application_count > 0 && (
                        <Badge tone="accent" icon={Sparkles}>
                          {opening.new_application_count} unread
                        </Badge>
                      )}
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
        onCreated={() => {
          setCreating(false);
          openings.mutate();
        }}
      />
    </div>
  );
}

/**
 * Creating one.
 *
 * Only the title is required — everything else has a backend default and can
 * be filled in on the opening's own screen. A create form that demands a
 * salary band before it will accept a job title is a create form people work
 * around by typing placeholders.
 */
function CreateDialog({
  open,
  meta,
  onClose,
  onCreated,
}: {
  open: boolean;
  meta: HrMetaOut | undefined;
  onClose: () => void;
  onCreated: (opening: HrOpeningOut) => void;
}) {
  const [draft, setDraft] = useState<HrOpeningIn>({ title: "", headcount: 1 });
  const teams = useSWR<TeamOut[]>(open ? "/teams" : null, { revalidateOnFocus: false });

  const applicationForms = meta?.application_forms.templates ?? [];
  const postingForms = meta?.posting_forms.templates ?? [];

  const applicationId = draft.template_id ?? meta?.application_forms.default_id ?? null;
  const postingId = draft.posting_template_id ?? meta?.posting_forms.default_id ?? null;
  // `/hr/meta` carries each form's name and question count but not its fields,
  // so the advert's questions come from the template itself.
  const postingTemplate = useSWR<TemplateOut>(
    open && postingId ? `/templates/${postingId}` : null,
    { revalidateOnFocus: false },
  );

  const create = useAction(async () =>
    api.post<HrOpeningOut>("/hr/openings", {
      ...draft,
      title: draft.title.trim(),
      // Empty strings are not nulls to Pydantic — a blank optional text field
      // would be stored as "" and then rendered as an empty line rather than
      // as absent. Stripped here rather than in the panels that read it.
      department: draft.department?.trim() || null,
      location: draft.location?.trim() || null,
      reference: draft.reference?.trim() || null,
      salary_range: draft.salary_range?.trim() || null,
      summary: draft.summary?.trim() || null,
      // Sent explicitly rather than left to the backend default, so the form
      // that was on screen is the form that gets used. `details` is not sent
      // at all: the advert is written on the opening's own screen, where the
      // posting form comes back on the record and needs no second request.
      template_id: applicationId,
      posting_template_id: postingId,
      details:
        draft.details && Object.keys(draft.details).length > 0 ? draft.details : undefined,
      team_id: draft.team_id || null,
      closes_on: draft.closes_on || null,
    }),
  );

  function set<K extends keyof HrOpeningIn>(key: K, value: HrOpeningIn[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="New opening"
      description="Saved as a draft. It accepts nobody and has no share link until you post it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={Plus}
            loading={create.pending}
            disabled={!draft.title.trim() || !applicationForms.length}
            onClick={async () => {
              const created = await create.run();
              if (created) {
                setDraft({ title: "", headcount: 1 });
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

        {applicationForms.length === 0 ? (
          <InlineNotice tone="danger">
            No active job application form exists, so there is nothing to post an opening
            against.
          </InlineNotice>
        ) : (
          <Field
            label="Application form"
            required
            hint="What candidates fill in on the share link. It cannot be changed once people have applied."
          >
            <Select
              value={draft.template_id ?? meta?.application_forms.default_id ?? ""}
              onChange={(e) => set("template_id", e.target.value)}
            >
              {applicationForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name} · {form.field_count} questions
                  {form.is_default ? " (default)" : ""}
                </option>
              ))}
            </Select>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[12px] text-ink-4">
                {applicationForms.find((f) => f.id === applicationId)?.description ?? ""}
              </p>
              <TemplatePreview
                templateId={applicationId}
                label="Preview questions"
                tags={applicationForms.find((f) => f.id === applicationId)?.tags}
              />
            </div>
          </Field>
        )}

        {postingForms.length > 1 && (
          <Field
            label="Advert form"
            hint="Which set of questions the advert below is written from."
          >
            <Select
              value={draft.posting_template_id ?? meta?.posting_forms.default_id ?? ""}
              onChange={(e) => set("posting_template_id", e.target.value)}
            >
              {postingForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                  {form.is_default ? " (default)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="border-t border-line pt-5">
          <p className="text-[13px] font-semibold text-ink">The role</p>
          {/* Worth saying plainly, because "why is this not on the template"
              is the obvious question. These are columns the system reasons
              about — the team is a foreign key, the employment type an enum
              the careers list filters on, the closing date what decides
              whether applications are still accepted. A template answer is a
              value in a JSON blob and can be none of those things. What the
              advert *says* is on the form below; what the system *does* is
              here. */}
          <p className="mt-0.5 text-[12px] text-ink-4">
            Facts the system acts on — filtering, closing dates, who the hire joins. Not part
            of the advert form.
          </p>
        </div>

        <Field label="Title" required>
          <Input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Senior mechanical engineer"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <Input
              value={draft.department ?? ""}
              onChange={(e) => set("department", e.target.value)}
              placeholder="Engineering"
            />
          </Field>
          <Field label="Location">
            <Input
              value={draft.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Dubai"
            />
          </Field>
          <Field label="Employment type">
            <Select
              value={draft.employment_type ?? "full_time"}
              onChange={(e) => set("employment_type", e.target.value as HrEmploymentType)}
            >
              {(meta?.employment_types ?? ["full_time"]).map((type) => (
                <option key={type} value={type}>
                  {humanise(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Headcount" hint="How many people this opening is for.">
            <Input
              type="number"
              min={1}
              max={999}
              value={draft.headcount ?? 1}
              onChange={(e) => set("headcount", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Team" hint="Optional. Which team the hire joins.">
            <Select value={draft.team_id ?? ""} onChange={(e) => set("team_id", e.target.value)}>
              <option value="">No team</option>
              {(teams.data ?? [])
                .filter((t) => !t.archived_at)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Closes on" hint="Applications stop being accepted after this date.">
            <Input
              type="date"
              value={draft.closes_on ?? ""}
              onChange={(e) => set("closes_on", e.target.value)}
            />
          </Field>
        </div>

        {/* The advert itself, asked exactly as the job posting template asks
            it. This is not decoration: the backend treats `details` as the
            source and mirrors summary, description, requirements and
            salary_range onto columns from it. A hand-written Summary box here
            wrote the mirror and left the source empty, so posting the opening
            then failed on questions nobody had been shown. */}
        {postingTemplate.data && (
          <div className="space-y-4 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">The advert</p>
                <p className="mt-0.5 text-[12px] text-ink-4">
                  From {postingTemplate.data.name}. Required questions are enforced when you
                  post it, not now — a draft may be incomplete.
                </p>
              </div>
              <TemplatePreview
                templateId={postingTemplate.data.id}
                label="Preview advert"
              />
            </div>
            <AnswerForm
              fields={postingTemplate.data.fields}
              sections={postingTemplate.data.sections}
              value={draft.details ?? {}}
              onChange={(next) => set("details", next)}
            />
          </div>
        )}

        <Toggle
          checked={draft.publicly_listed ?? false}
          onChange={(next) => set("publicly_listed", next)}
          label="List on the public careers page"
          hint="Off by default. Left off, the opening is reachable only by the share link — which is the right setting for a role you want to send to particular people."
        />
      </div>
    </Modal>
  );
}
