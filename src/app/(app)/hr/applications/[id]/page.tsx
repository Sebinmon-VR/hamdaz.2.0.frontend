"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Download, Mail, MoveRight, NotebookPen, Paperclip, Phone, Save, UserCheck } from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { bytes, dateTime, humanise, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  HrApplicationOut,
  HrApplicationStage,
  HrMetaOut,
  HrOpeningOut,
  MemberOut,
  TemplateOut,
} from "@/lib/types";
import { Avatar, Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Select, Textarea, Toggle } from "@/components/ui/controls";
import {
  Empty,
  ErrorState,
  InlineNotice,
  Modal,
  PanelSkeleton,
} from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { AnswerSheet } from "@/components/hr/Answers";
import { PeoplePicker } from "@/components/hr/PeoplePicker";
import { ScoreCard } from "@/components/hr/Score";
import { StageBadge } from "@/components/hr/badges";
import { DeleteRecord } from "@/components/hr/DeleteRecord";

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <HrOnly>
      <Application id={id} />
    </HrOnly>
  );
}

/**
 * One candidate.
 *
 * There is no route back to the person from here — the candidate side of this
 * module is a public link with no session and no account — so everything on
 * this screen is HR talking to itself. That is why the internal notes sit in
 * the open rather than behind a disclosure: nobody else is ever going to read
 * them, and treating them as a secret within HR would only make them go
 * somewhere worse, like email.
 */
function Application({ id }: { id: string }) {
  const router = useRouter();
  const application = useSWR<HrApplicationOut>(`/hr/applications/${id}`);

  // Two hops to get the questions. `ApplicationOut` carries the answers and
  // the template *version* but not the template, so the labels come from the
  // opening's template id. Worth knowing: that resolves to the template as it
  // stands, which may be a later version than the one the candidate filled in
  // — hence the caveat rendered beside the answers when the two disagree.
  const openingId = application.data?.opening_id;
  const opening = useSWR<HrOpeningOut>(openingId ? `/hr/openings/${openingId}` : null, {
    revalidateOnFocus: false,
  });
  const template = useSWR<TemplateOut>(
    opening.data ? `/templates/${opening.data.template_id}` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [moving, setMoving] = useState(false);
  const [hiring, setHiring] = useState(false);

  if (application.error) {
    return <ErrorState error={application.error} onRetry={() => application.mutate()} />;
  }
  if (!application.data) return <PanelSkeleton lines={8} />;

  const data = application.data;
  const staleTemplate =
    Boolean(template.data) && template.data!.version !== data.template_version;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · Hiring"
        title={data.candidate_name}
        lead={data.opening_title ?? undefined}
        faces={<Avatar name={data.candidate_name} seed={data.id} size="sm" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={data.stage} />
            <Button icon={MoveRight} onClick={() => setMoving(true)}>
              Move stage
            </Button>
            {data.stage !== "hired" && (
              <Button variant="accent" icon={UserCheck} onClick={() => setHiring(true)}>
                Record as hired
              </Button>
            )}
            {/* The endpoint behind a candidate asking to be forgotten, which is
                why it takes their uploads rather than leaving orphaned CVs. */}
            <DeleteRecord
              path={`/hr/applications/${id}`}
              title={`${data.candidate_name}'s application`}
              destroys={
                <>
                  <p>
                    Everything {data.candidate_name} submitted — their answers, contact
                    details and internal notes.
                  </p>
                  <p>
                    {data.attachments.length > 0
                      ? `The ${data.attachments.length} file${
                          data.attachments.length === 1 ? "" : "s"
                        } they uploaded, including their CV.`
                      : "They uploaded no files."}
                  </p>
                  {data.stage === "hired" && (
                    <p className="text-ink-3">
                      They were recorded as hired. Their employee record and anything filed
                      against it — a contract, an offer letter — are <strong>not</strong>{" "}
                      touched.
                    </p>
                  )}
                </>
              }
              alternative="If this is a hiring decision rather than an erasure request, moving them to rejected keeps the record."
              onDeleted={() =>
                router.push(
                  data.opening_id ? `/hr/openings/${data.opening_id}` : "/hr/applications",
                )
              }
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead
              title="What they wrote"
              hint={`Form version ${data.template_version}`}
            />
            {staleTemplate && (
              <InlineNotice tone="warn" className="mt-4">
                These answers were given against version {data.template_version} of the form and
                the labels below come from version {template.data!.version}, which is what the
                template says today. A question renamed since then reads under its new name.
              </InlineNotice>
            )}
            {template.error && (
              <InlineNotice tone="warn" className="mt-4">
                The form template could not be loaded, so the answers below are labelled with
                their raw field keys rather than their questions.
              </InlineNotice>
            )}
            <AnswerSheet
              className="mt-5"
              answers={data.answers}
              fields={template.data?.fields ?? null}
              sections={template.data?.sections ?? null}
            />
          </Panel>

          <Panel className="p-5">
            <PanelHead title="Files" count={data.attachments.length} />
            {data.attachments.length === 0 ? (
              <Empty
                icon={Paperclip}
                title="Nothing attached"
                className="mt-4"
                body="This candidate uploaded no CV or certificates with their application."
              />
            ) : (
              <ul className="mt-4 space-y-2">
                {data.attachments.map((file) => (
                  <li key={file.id}>
                    <a
                      href={apiUrl(`/hr/applications/${data.id}/files/${file.id}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-[14px] bg-panel-2 px-4 py-3 transition hover:bg-panel-3"
                    >
                      <Paperclip className="size-4 shrink-0 text-ink-4" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {file.file_name}
                        </span>
                        <span className="block text-[11.5px] text-ink-4">
                          {bytes(file.size_bytes)}
                          {file.field_key ? ` · ${humanise(file.field_key)}` : ""}
                        </span>
                      </span>
                      <Download className="size-3.5 shrink-0 text-ink-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <NotesPanel
            application={data}
            onSaved={(next) => application.mutate(next, { revalidate: false })}
          />
        </div>

        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead title="Contact" />
            <dl className="mt-4 space-y-3">
              <Meta label="Email">
                <a
                  href={`mailto:${data.candidate_email}`}
                  className="inline-flex items-center gap-1.5 transition hover:text-accent-text"
                >
                  <Mail className="size-3.5 shrink-0 text-ink-4" />
                  {data.candidate_email}
                </a>
              </Meta>
              <Meta label="Phone">
                {data.candidate_phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0 text-ink-4" />
                    {data.candidate_phone}
                  </span>
                ) : (
                  "—"
                )}
              </Meta>
              <Meta label="Applied">{dateTime(data.submitted_at)}</Meta>
              {data.opening_title && (
                <Meta label="Opening">
                  <Link
                    href={`/hr/openings/${data.opening_id}`}
                    className="transition hover:text-accent-text"
                  >
                    {data.opening_title}
                  </Link>
                </Meta>
              )}
            </dl>
          </Panel>

          <Panel className="p-5">
            <PanelHead
              title="Score"
              hint="From the form's own scoring blocks, frozen at submission."
            />
            <ScoreCard className="mt-5" score={data.score} />
          </Panel>

          <Panel className="p-5">
            <PanelHead title="Where they got to" />
            <dl className="mt-4 space-y-3">
              <Meta label="Stage">
                <StageBadge stage={data.stage} />
              </Meta>
              {data.stage_note && <Meta label="Note on the last move">{data.stage_note}</Meta>}
              <Meta label="Last moved">
                {data.decided_at
                  ? `${relative(data.decided_at)}${
                      data.decided_by_name ? ` by ${data.decided_by_name}` : ""
                    }`
                  : "Never — still as submitted"}
              </Meta>
              {data.hired_user_id && (
                <Meta label="Employee record">
                  <Link
                    href={`/hr/people/${data.hired_user_id}`}
                    className="transition hover:text-accent-text"
                  >
                    Their staff file
                  </Link>
                </Meta>
              )}
            </dl>
          </Panel>
        </div>
      </div>

      <StageDialog
        application={data}
        open={moving}
        onClose={() => setMoving(false)}
        onDone={(next) => {
          application.mutate(next, { revalidate: false });
          setMoving(false);
        }}
      />

      <HireDialog
        application={data}
        open={hiring}
        onClose={() => setHiring(false)}
        onDone={(next) => {
          application.mutate(next, { revalidate: false });
          setHiring(false);
        }}
      />
    </div>
  );
}

function StageDialog({
  application,
  open,
  onClose,
  onDone,
}: {
  application: HrApplicationOut;
  open: boolean;
  onClose: () => void;
  onDone: (next: HrApplicationOut) => void;
}) {
  const [stage, setStage] = useState<HrApplicationStage>(application.stage);
  const [note, setNote] = useState("");
  const meta = useSWR<HrMetaOut>(open ? "/hr/meta" : null, { revalidateOnFocus: false });

  const move = useAction(async () =>
    api.post<HrApplicationOut>(`/hr/applications/${application.id}/stage`, {
      stage,
      note: note.trim() || null,
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move ${application.candidate_name}`}
      description="Nothing is sent to the candidate. There is no route back to them from this system."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={MoveRight}
            loading={move.pending}
            onClick={async () => {
              const next = await move.run();
              if (next) onDone(next);
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {move.error && <InlineNotice tone="danger">{move.error}</InlineNotice>}

        <Field label="Stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value as HrApplicationStage)}>
            {(meta.data?.application_stages ?? [application.stage]).map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </Field>

        {stage === "hired" && (
          <InlineNotice tone="warn">
            Moving straight to hired records the stage but not who they became. Use{" "}
            <strong>Record as hired</strong> instead to link them to an employee record.
          </InlineNotice>
        )}
        {stage === "withdrawn" && (
          <InlineNotice tone="info">
            Withdrawn means they pulled out. It is kept apart from rejected on purpose — the
            difference matters if the same person applies again.
          </InlineNotice>
        )}

        <Field label="Note" hint="For HR's own record. It replaces the note on the last move.">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Strong on site experience, thin on design."
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Linking a hired candidate to the employee they became.
 *
 * The user is not created here and cannot be: people arrive from Entra when
 * they first sign in, and the backend refuses an id that does not exist yet
 * with exactly that explanation. So this is a step HR takes on somebody's
 * first day rather than on the day the offer is accepted, and the dialog says
 * so rather than letting the refusal be the first anyone hears of it.
 */
function HireDialog({
  application,
  open,
  onClose,
  onDone,
}: {
  application: HrApplicationOut;
  open: boolean;
  onClose: () => void;
  onDone: (next: HrApplicationOut) => void;
}) {
  const [picked, setPicked] = useState<MemberOut | null>(null);
  const [closeOpening, setCloseOpening] = useState(false);

  const hire = useAction(async () =>
    api.post<HrApplicationOut>(`/hr/applications/${application.id}/hire`, {
      user_id: picked!.user_id,
      close_opening: closeOpening,
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={`Record ${application.candidate_name} as hired`}
      description="Links this application to the employee record the candidate became."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            icon={UserCheck}
            loading={hire.pending}
            disabled={!picked}
            onClick={async () => {
              const next = await hire.run();
              if (next) onDone(next);
            }}
          >
            {picked ? `Hired as ${picked.display_name}` : "Choose somebody"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {hire.error && <InlineNotice tone="danger">{hire.error}</InlineNotice>}

        <InlineNotice tone="info">
          The person has to have signed in to Hamdaz with their Microsoft account at least
          once before they appear here, and to have been added to a team. Until then there is
          no employee record to point at.
        </InlineNotice>

        <PeoplePicker
          selected={picked ? [picked.user_id] : []}
          onToggle={(member) =>
            setPicked((current) => (current?.user_id === member.user_id ? null : member))
          }
        />

        <Toggle
          checked={closeOpening}
          onChange={setCloseOpening}
          label="Close the opening as filled"
          hint="Stops it accepting further applications and records it as filled rather than merely closed."
        />
      </div>
    </Modal>
  );
}

/** HR's private notes on the candidate. A PATCH that replaces the whole field. */
function NotesPanel({
  application,
  onSaved,
}: {
  application: HrApplicationOut;
  onSaved: (next: HrApplicationOut) => void;
}) {
  const [notes, setNotes] = useState<string | null>(null);
  const current = notes ?? application.internal_notes ?? "";

  const save = useAction(async () => {
    const next = await api.patch<HrApplicationOut>(
      `/hr/applications/${application.id}/notes`,
      { internal_notes: current.trim() || null },
    );
    setNotes(null);
    onSaved(next);
    return next;
  });

  const dirty = current !== (application.internal_notes ?? "");

  return (
    <Panel className="p-5">
      <PanelHead
        title="HR notes"
        hint="Only HR sees these. The candidate has no account and no way in."
        action={
          <Button
            size="sm"
            variant="accent"
            icon={Save}
            disabled={!dirty}
            loading={save.pending}
            onClick={() => save.run()}
          >
            Save
          </Button>
        }
      />
      {save.error && <InlineNotice tone="danger" className="mt-3">{save.error}</InlineNotice>}
      <Field className="mt-4">
        <Textarea
          value={current}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Interviewed 4 March. Wants to relocate in June, which suits the project start."
        />
      </Field>
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
        <NotebookPen className="size-3" />
        Saved as one block — this replaces whatever was here before.
      </p>
    </Panel>
  );
}
