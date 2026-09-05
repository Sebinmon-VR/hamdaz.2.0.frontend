"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  Copy,
  Globe,
  Inbox,
  Link2,
  Lock,
  RefreshCw,
  Save,
  Send,
  UserCheck,
} from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date, dateTime, humanise, num, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  HrApplicationOut,
  HrEmploymentType,
  HrMetaOut,
  HrOpeningOut,
  HrOpeningUpdateIn,
  TeamOut,
} from "@/lib/types";
import { Badge, Meta, PageHead, Panel, PanelHead, Stat } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { OpeningStatusBadge, StageBadge } from "@/components/hr/badges";
import { ScorePill } from "@/components/hr/Score";
import { AnswerForm, AnswerSheet } from "@/components/hr/Answers";
import { TemplatePreview } from "@/components/hr/TemplatePreview";
import { DeleteRecord } from "@/components/hr/DeleteRecord";

export default function OpeningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <HrOnly>
      <Opening id={id} />
    </HrOnly>
  );
}

/**
 * One opening: what the job is, where its link points, and who has applied.
 *
 * The share link gets a panel of its own rather than a line in the details,
 * because it is the only thing on this screen that leaves the building. It
 * exists only once the opening is posted — a link to a draft goes nowhere —
 * and rotating it is destructive in a way the button has to say out loud.
 */
function Opening({ id }: { id: string }) {
  const router = useRouter();
  const opening = useSWR<HrOpeningOut>(`/hr/openings/${id}`);
  const applications = useSWR<HrApplicationOut[]>(
    withQuery("/hr/applications", { opening_id: id }),
  );

  const [rotating, setRotating] = useState(false);
  const [closing, setClosing] = useState(false);

  const act = useAction(async (path: string, query?: Record<string, boolean>) => {
    const next = await api.post<HrOpeningOut>(path, undefined, query);
    opening.mutate(next, { revalidate: false });
    return next;
  });

  if (opening.error) {
    return <ErrorState error={opening.error} onRetry={() => opening.mutate()} />;
  }
  if (!opening.data) return <PanelSkeleton lines={8} />;

  const data = opening.data;
  const rows = applications.data ?? [];

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Hiring"
        title={data.title}
        lead={[data.department, data.location, humanise(data.employment_type)]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OpeningStatusBadge status={data.status} />
            {data.status === "draft" && (
              <Button
                variant="accent"
                icon={Send}
                loading={act.pending}
                onClick={() => act.run(`/hr/openings/${id}/post`)}
              >
                Post it
              </Button>
            )}
            {data.status === "open" && (
              <Button icon={Lock} onClick={() => setClosing(true)}>
                Stop accepting
              </Button>
            )}
            <DeleteRecord
              path={`/hr/openings/${id}`}
              title="this job opening"
              confirmWord={data.title}
              destroys={
                <>
                  <p>The opening, and its share link stops resolving for anyone holding it.</p>
                  {data.application_count > 0 ? (
                    <p>
                      All <strong>{num(data.application_count)} applications</strong> sent to
                      it, and every CV those candidates uploaded.
                    </p>
                  ) : (
                    <p>Nobody has applied, so no candidate record goes with it.</p>
                  )}
                  {/* Worth stating outright: it is the question anybody pauses
                      on, and the backend has a test asserting exactly this. */}
                  <p className="text-ink-3">
                    An offer letter or contract already filed against somebody hired through
                    this opening is <strong>not</strong> touched — the link is severed, not
                    followed.
                  </p>
                </>
              }
              alternative={
                data.status === "open"
                  ? "Stopping acceptance closes the link and keeps every application. That is almost always what is wanted instead."
                  : undefined
              }
              onDeleted={() => router.push("/hr/openings")}
            />
          </div>
        }
      />

      {act.error && <InlineNotice tone="danger">{act.error}</InlineNotice>}

      <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
        <Stat value={num(data.application_count)} label="applications" />
        <Stat
          value={num(data.new_application_count)}
          label="nobody has looked at"
          tone="accent"
          delta={data.new_application_count > 0 ? "new" : undefined}
        />
        <Stat value={num(data.headcount)} label={data.headcount === 1 ? "position" : "positions"} />
        <Stat
          value={data.accepts_applications ? "Yes" : "No"}
          label="accepting applications"
          tone={data.accepts_applications ? "positive" : "neutral"}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ShareLink
            opening={data}
            onRotate={() => setRotating(true)}
            pending={act.pending}
          />

          <Panel className="p-5">
            <PanelHead
              title="Applications"
              count={rows.length}
              action={
                rows.length > 0 && (
                  <Link
                    href={withQuery("/hr/applications", { opening_id: id })}
                    className="text-[12px] text-ink-3 transition hover:text-ink"
                  >
                    Open the full list
                  </Link>
                )
              }
            />
            {applications.error ? (
              <ErrorState error={applications.error} onRetry={() => applications.mutate()} />
            ) : applications.isLoading && !applications.data ? (
              <RowsSkeleton rows={4} />
            ) : rows.length === 0 ? (
              <Empty
                icon={Inbox}
                title="Nobody has applied"
                className="mt-4"
                body={
                  data.status === "draft"
                    ? "This opening is still a draft, so there is no link for anybody to apply through."
                    : "Applications will appear here, highest scoring first."
                }
              />
            ) : (
              <ul className="mt-3 space-y-1.5">
                {rows.slice(0, 8).map((application) => (
                  <li key={application.id}>
                    <Link href={`/hr/applications/${application.id}`} className="block">
                      <Panel tone="inset" className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">
                            {application.candidate_name}
                          </span>
                          <span className="block truncate text-[11.5px] opacity-70">
                            {application.candidate_email} · {relative(application.submitted_at)}
                          </span>
                        </span>
                        <ScorePill percent={application.score_percent} />
                        <StageBadge stage={application.stage} />
                      </Panel>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <AdvertPanel
            opening={data}
            onSaved={(next) => opening.mutate(next, { revalidate: false })}
          />
          <EditPanel opening={data} onSaved={(next) => opening.mutate(next, { revalidate: false })} />
        </div>

        <Panel className="h-fit p-5">
          <PanelHead title="Details" />
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
            <Meta label="Reference">{data.reference ?? "—"}</Meta>
            <Meta label="Team">{data.team_name ?? "—"}</Meta>
            <Meta label="Salary range">{data.salary_range ?? "—"}</Meta>
            <Meta label="Closes on">{data.closes_on ? date(data.closes_on) : "—"}</Meta>
            <Meta label="Posted">{data.posted_at ? dateTime(data.posted_at) : "Not posted"}</Meta>
            <Meta label="Closed">{data.closed_at ? dateTime(data.closed_at) : "—"}</Meta>
            <Meta label="Created by">{data.created_by_name ?? "—"}</Meta>
            <Meta label="Created">{date(data.created_at)}</Meta>
            <Meta label="Application form" className="col-span-2">
              {/* The version matters: an application stores the version it was
                  filled in against, so a candidate's answers may not line up
                  with the form as it stands today. */}
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {data.template_name ?? "—"}{" "}
                  <span className="text-ink-4">v{data.template_version}</span>
                </span>
                <TemplatePreview templateId={data.template_id} label="Preview" />
              </span>
            </Meta>
          </dl>

          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
            {data.publicly_listed ? (
              <Badge tone="info" icon={Globe}>
                On the careers page
              </Badge>
            ) : (
              <Badge tone="neutral">Link only</Badge>
            )}
            {data.hosted_form ? (
              <Badge tone="neutral">Hosted form</Badge>
            ) : (
              <Badge
                tone="warn"
                title="No page is served for the link. Only the JSON form endpoint answers, for an organisation posting the questions on its own careers site."
              >
                JSON only
              </Badge>
            )}
          </div>
        </Panel>
      </div>

      <Modal
        open={rotating}
        onClose={() => setRotating(false)}
        title="Issue a new share link"
        description="The current link stops working immediately."
        footer={
          <>
            <Button onClick={() => setRotating(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon={RefreshCw}
              loading={act.pending}
              onClick={async () => {
                if (await act.run(`/hr/openings/${id}/rotate-link`)) setRotating(false);
              }}
            >
              Rotate the link
            </Button>
          </>
        }
      >
        <p className="pb-4 text-[13px] leading-relaxed text-ink-2">
          Everybody holding the old URL loses it — including any candidate part way through
          filling the form in, who will lose what they have typed. That is the point of the
          button, and it is worth being sure the link has actually leaked before pressing it.
        </p>
      </Modal>

      <CloseDialog
        open={closing}
        pending={act.pending}
        onClose={() => setClosing(false)}
        onConfirm={async (filled) => {
          if (await act.run(`/hr/openings/${id}/close`, { filled })) setClosing(false);
        }}
      />
    </div>
  );
}

/** The candidate-facing link, and the two forms of it the backend hands back. */
function ShareLink({
  opening,
  onRotate,
  pending,
}: {
  opening: HrOpeningOut;
  onRotate: () => void;
  pending: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, which: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // embedded browsers. The URL is on screen and selectable either way, so
      // failing silently here is better than an alert about a permission
      // nobody asked for.
    }
  }

  if (!opening.share_url) {
    return (
      <Panel className="p-5">
        <PanelHead title="Share link" />
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          A draft has no link. Post the opening and one appears here — built around an
          unguessable token rather than the opening&apos;s name, so the URL cannot be found by
          trying likely job titles.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <PanelHead
        title="Share link"
        hint="Send this to candidates. It carries no session and leads nowhere else."
        action={
          <Button size="sm" icon={RefreshCw} onClick={onRotate} loading={pending}>
            Rotate
          </Button>
        }
      />

      <div className="mt-4 space-y-2">
        <LinkRow
          icon={Link2}
          label="Application page"
          value={opening.share_url}
          copied={copied === "page"}
          onCopy={() => copy(opening.share_url!, "page")}
        />
        {opening.share_api_url && (
          <LinkRow
            icon={Globe}
            label="The same form as JSON"
            hint="For an organisation rendering the questions on its own careers site."
            value={opening.share_api_url}
            copied={copied === "api"}
            onCopy={() => copy(opening.share_api_url!, "api")}
          />
        )}
      </div>

      {!opening.accepts_applications && (
        <InlineNotice tone="warn" className="mt-4">
          The link resolves but will not take an application — the opening is closed, or past
          its closing date. A candidate opening it is told so rather than shown a form that
          will be refused.
        </InlineNotice>
      )}
    </Panel>
  );
}

function LinkRow({
  icon: Icon,
  label,
  hint,
  value,
  copied,
  onCopy,
}: {
  icon: typeof Link2;
  label: string;
  hint?: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[14px] bg-panel-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} />
        <span className="text-[11.5px] text-ink-3">{label}</span>
        {hint && <span className="hidden text-[11.5px] text-ink-4 sm:block">· {hint}</span>}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon={copied ? Check : Copy}
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-1 break-all font-mono text-[11.5px] text-ink-2">{value}</p>
    </div>
  );
}

function CloseDialog({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (filled: boolean) => void;
}) {
  const [filled, setFilled] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Stop accepting applications"
      description="The link keeps working; a candidate opening it is told the role has closed."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={filled ? UserCheck : Lock}
            loading={pending}
            onClick={() => onConfirm(filled)}
          >
            {filled ? "Close as filled" : "Close"}
          </Button>
        </>
      }
    >
      <div className="pb-4">
        <Toggle
          checked={filled}
          onChange={setFilled}
          label="Somebody was hired"
          hint="Records the opening as filled rather than merely closed. The difference is worth keeping: a role nobody was found for is a different story from one that was."
        />
      </div>
    </Modal>
  );
}

/**
 * Editing the opening.
 *
 * A PATCH, so only what changed is sent. The draft is seeded once from the
 * loaded opening and then left alone — re-seeding it on every revalidation
 * would throw away what somebody was in the middle of typing.
 */
/** Empty for this purpose: never answered, cleared, or an empty multi-select. */
function blank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * The advert, as a form rather than as columns.
 *
 * A super admin writes the job posting template, so what an advert asks for is
 * editable without a deploy — which is the point of the template existing, and
 * why this panel renders whatever that template says rather than a fixed set
 * of boxes.
 *
 * It also exists to stop a late failure. A posting template is assigned to
 * every opening automatically when one is active, and `POST /openings/{ref}/post`
 * validates `details` against it with required fields enforced. So an advert
 * left half-written does not fail when somebody writes it — it fails at the
 * moment they try to publish, which is the worst time to find out. The panel
 * therefore names what is still missing while the opening is still a draft.
 */
function AdvertPanel({
  opening,
  onSaved,
}: {
  opening: HrOpeningOut;
  onSaved: (next: HrOpeningOut) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

  const details = draft ?? opening.details ?? {};
  const missing = opening.posting_fields.filter((f) => f.required && blank(details[f.key]));

  const save = useAction(async () => {
    const next = await api.patch<HrOpeningOut>(`/hr/openings/${opening.id}`, { details });
    onSaved(next);
    setDraft(null);
    setOpen(false);
    return next;
  });

  // No posting template means the advert really is just the columns below, and
  // a panel insisting otherwise would be inventing a form that does not exist.
  if (!opening.posting_template_id || opening.posting_fields.length === 0) return null;

  return (
    <Panel className="p-5">
      <PanelHead
        title="The advert"
        hint={
          opening.posting_template_name
            ? `${opening.posting_template_name} v${opening.posting_template_version}`
            : undefined
        }
        action={
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Done" : "Edit"}
          </Button>
        }
      />

      {missing.length > 0 && (
        <InlineNotice tone="warn" className="mt-4">
          {missing.length === 1 ? "One question" : `${missing.length} questions`} still to
          answer before this can be posted: {missing.map((f) => f.label).join(", ")}.
        </InlineNotice>
      )}

      {save.error && (
        <InlineNotice tone="danger" className="mt-4">
          {save.error}
        </InlineNotice>
      )}

      {open ? (
        <div className="mt-5 space-y-5">
          <AnswerForm
            fields={opening.posting_fields}
            sections={opening.posting_sections}
            value={details}
            onChange={setDraft}
            disabled={save.pending}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setDraft(null);
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="accent" loading={save.pending} onClick={() => save.run()}>
              Save advert
            </Button>
          </div>
        </div>
      ) : (
        <AnswerSheet
          answers={opening.details ?? {}}
          fields={opening.posting_fields}
          sections={opening.posting_sections}
          className="mt-4"
        />
      )}
    </Panel>
  );
}

function EditPanel({
  opening,
  onSaved,
}: {
  opening: HrOpeningOut;
  onSaved: (next: HrOpeningOut) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HrOpeningUpdateIn | null>(null);
  // True when a posting form owns the advert, so the four mirrored keys are
  // edited there rather than here.
  const mirrored = Boolean(opening.posting_template_id) && opening.posting_fields.length > 0;
  const meta = useSWR<HrMetaOut>("/hr/meta", { revalidateOnFocus: false });
  const teams = useSWR<TeamOut[]>(open ? "/teams" : null, { revalidateOnFocus: false });

  const current: HrOpeningUpdateIn = draft ?? {
    title: opening.title,
    reference: opening.reference,
    department: opening.department,
    location: opening.location,
    employment_type: opening.employment_type,
    headcount: opening.headcount,
    salary_range: opening.salary_range,
    summary: opening.summary,
    description: opening.description,
    requirements: opening.requirements,
    closes_on: opening.closes_on,
    team_id: opening.team_id,
    publicly_listed: opening.publicly_listed,
    hosted_form: opening.hosted_form,
  };

  const save = useAction(async () => {
    const next = await api.patch<HrOpeningOut>(`/hr/openings/${opening.id}`, {
      ...current,
      reference: current.reference?.trim() || null,
      department: current.department?.trim() || null,
      location: current.location?.trim() || null,
      salary_range: current.salary_range?.trim() || null,
      summary: current.summary?.trim() || null,
      description: current.description?.trim() || null,
      requirements: current.requirements?.trim() || null,
      team_id: current.team_id || null,
      closes_on: current.closes_on || null,
    });
    onSaved(next);
    setDraft(null);
    setOpen(false);
    return next;
  });

  function set<K extends keyof HrOpeningUpdateIn>(key: K, value: HrOpeningUpdateIn[K]) {
    setDraft({ ...current, [key]: value });
  }

  return (
    <Panel className="p-5">
      <PanelHead
        title="The role, as candidates read it"
        action={
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Done" : "Edit"}
          </Button>
        }
      />

      {!open ? (
        <div className="mt-4 space-y-4">
          {(mirrored
            ? []
            : [
                ["Summary", opening.summary],
                ["Description", opening.description],
                ["Requirements", opening.requirements],
              ]
          ).map(([label, body]) => (
            <div key={label}>
              <p className="micro text-ink-4">{label}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                {body || "Not written yet."}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required>
              <Input value={current.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Reference" hint="Your own requisition number, if you use one.">
              <Input
                value={current.reference ?? ""}
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>
            <Field label="Department">
              <Input
                value={current.department ?? ""}
                onChange={(e) => set("department", e.target.value)}
              />
            </Field>
            <Field label="Location">
              <Input
                value={current.location ?? ""}
                onChange={(e) => set("location", e.target.value)}
              />
            </Field>
            <Field label="Employment type">
              <Select
                value={current.employment_type ?? "full_time"}
                onChange={(e) => set("employment_type", e.target.value as HrEmploymentType)}
              >
                {(meta.data?.employment_types ?? [opening.employment_type]).map((type) => (
                  <option key={type} value={type}>
                    {humanise(type)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Headcount">
              <Input
                type="number"
                min={1}
                max={999}
                value={current.headcount ?? 1}
                onChange={(e) => set("headcount", Number(e.target.value) || 1)}
              />
            </Field>
            <Field
              label="Salary range"
              hint={mirrored ? "Written on the advert form above." : "Shown to candidates verbatim."}
              className={mirrored ? "hidden" : undefined}
            >
              <Input
                value={current.salary_range ?? ""}
                onChange={(e) => set("salary_range", e.target.value)}
                placeholder="AED 18,000 – 24,000 a month"
              />
            </Field>
            <Field label="Closes on">
              <Input
                type="date"
                value={current.closes_on ?? ""}
                onChange={(e) => set("closes_on", e.target.value)}
              />
            </Field>
            <Field label="Team" className="sm:col-span-2">
              <Select
                value={current.team_id ?? ""}
                onChange={(e) => set("team_id", e.target.value)}
              >
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
          </div>

          {/* Only where the advert is not a form. These four are the keys the
              backend mirrors from `details` onto columns, so with a posting
              template in play there would be two inputs for one value — and
              the one edited here is the copy, not the original. The advert
              panel above owns them in that case. */}
          {mirrored ? (
            <InlineNotice tone="info">
              The summary, description and requirements are written on the advert form
              above, which is where candidates read them from.
            </InlineNotice>
          ) : (
            <>
              <Field label="Summary">
                <Textarea
                  value={current.summary ?? ""}
                  onChange={(e) => set("summary", e.target.value)}
                />
              </Field>
              <Field label="Description">
                <Textarea
                  className="min-h-40"
                  value={current.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <Field label="Requirements">
                <Textarea
                  value={current.requirements ?? ""}
                  onChange={(e) => set("requirements", e.target.value)}
                />
              </Field>
            </>
          )}

          <Toggle
            checked={current.publicly_listed ?? false}
            onChange={(next) => set("publicly_listed", next)}
            label="List on the public careers page"
            hint="Off means the opening is reachable only by its share link."
          />
          <Toggle
            checked={current.hosted_form ?? true}
            onChange={(next) => set("hosted_form", next)}
            label="Serve the application page"
            hint="Off leaves only the JSON form endpoint, for an organisation rendering the questions on its own careers site. Turning it off breaks the link above for anyone without such a site."
          />

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button
              onClick={() => {
                setDraft(null);
                setOpen(false);
              }}
            >
              Discard
            </Button>
            <Button
              variant="accent"
              icon={Save}
              loading={save.pending}
              disabled={!current.title?.trim()}
              onClick={() => save.run()}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
