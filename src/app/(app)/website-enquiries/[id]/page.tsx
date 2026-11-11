"use client";

import { use, useEffect, useState } from "react";
import useSWR from "swr";
import { Mail, MessageCircle, Phone, Save } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, humanise, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type {
  WebsiteEnquiryOut,
  WebsiteEnquiryStatus,
  WebsiteEnquiryUpdateIn,
  WebsitePersonOut,
} from "@/lib/types";
import { Avatar, Meta, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Select, Textarea } from "@/components/ui/controls";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { STATUSES, StatusBadge, cameFrom } from "@/components/website/badges";

export default function WebsiteEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Enquiry id={id} />;
}

/** A phone number as wa.me wants it: digits only, with the country code. */
function whatsapp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  // Too short to carry a country code, and wa.me would open a chat with nobody.
  return digits.length >= 9 ? `https://wa.me/${digits}` : null;
}

/**
 * One message from the website.
 *
 * The visitor has no account and no way back in, so this screen is sales
 * talking to itself: what they asked, how to reach them, where the visit came
 * from, and what has been done about it.
 */
function Enquiry({ id }: { id: string }) {
  const enquiry = useSWR<WebsiteEnquiryOut>(`/website-enquiries/${id}`);
  // Only the people who can open this page can be given it, and the backend
  // says who they are.
  const people = useSWR<WebsitePersonOut[]>("/website-enquiries/people", { revalidateOnFocus: false });

  if (enquiry.error) {
    return <ErrorState error={enquiry.error} onRetry={() => enquiry.mutate()} />;
  }
  if (!enquiry.data) return <PanelSkeleton lines={8} />;

  const data = enquiry.data;
  const wa = whatsapp(data.phone);
  const source = cameFrom(data.attribution, data.referrer);
  const tags = Object.entries(data.attribution);

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Sales · Website enquiry"
        title={data.name}
        lead={data.company ?? undefined}
        faces={<Avatar name={data.name} seed={data.id} size="sm" />}
        actions={<StatusBadge status={data.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead title="What they wrote" hint={`Received ${dateTime(data.created_at)}`} />
            {data.topics.length > 0 && (
              <p className="mt-4 text-[12.5px] text-ink-3">
                Interested in <span className="text-ink-2">{data.topics.join(", ")}</span>
              </p>
            )}
            <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{data.message}</p>
          </Panel>

          <Panel className="p-5">
            <PanelHead title="Where the visit came from" />
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Meta label="Came from">{source ?? "Direct, or not known"}</Meta>
              <Meta label="Sent from page">{data.page ?? "—"}</Meta>
              <Meta label="Landed on" className="sm:col-span-2">
                <span title={data.landing ?? undefined}>{data.landing ?? "—"}</span>
              </Meta>
              <Meta label="Referrer" className="sm:col-span-2">
                <span title={data.referrer ?? undefined}>{data.referrer ?? "—"}</span>
              </Meta>
              {tags.map(([key, value]) => (
                <Meta key={key} label={key === "gclid" ? "Google click id" : humanise(key)}>
                  <span title={value}>{value}</span>
                </Meta>
              ))}
            </dl>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHead title="Reach them" />
            <dl className="mt-4 space-y-3">
              <Meta label="Email">
                {data.email ? (
                  <a
                    href={`mailto:${data.email}?subject=${encodeURIComponent("Your enquiry to Hamdaz")}`}
                    className="inline-flex items-center gap-1.5 transition hover:text-accent-text"
                  >
                    <Mail className="size-3.5 shrink-0 text-ink-4" />
                    {data.email}
                  </a>
                ) : (
                  "—"
                )}
              </Meta>
              <Meta label="Phone">
                {data.phone ? (
                  <a
                    href={`tel:${data.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-1.5 transition hover:text-accent-text"
                  >
                    <Phone className="size-3.5 shrink-0 text-ink-4" />
                    {data.phone}
                  </a>
                ) : (
                  "—"
                )}
              </Meta>
              {wa && (
                <Meta label="WhatsApp">
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition hover:text-accent-text"
                  >
                    <MessageCircle className="size-3.5 shrink-0 text-ink-4" />
                    Open a chat
                  </a>
                </Meta>
              )}
            </dl>
          </Panel>

          <Handling
            enquiry={data}
            people={people.data ?? []}
            peopleFailed={Boolean(people.error)}
            onSaved={(next) => enquiry.mutate(next, { revalidate: false })}
          />
        </div>
      </div>
    </div>
  );
}

function Handling({
  enquiry,
  people,
  peopleFailed,
  onSaved,
}: {
  enquiry: WebsiteEnquiryOut;
  people: WebsitePersonOut[];
  peopleFailed: boolean;
  onSaved: (next: WebsiteEnquiryOut) => void;
}) {
  const [status, setStatus] = useState<WebsiteEnquiryStatus>(enquiry.status);
  const [assignee, setAssignee] = useState(enquiry.assigned_to?.id ?? "");
  const [notes, setNotes] = useState(enquiry.notes ?? "");

  // A save comes back as the new record; start from it rather than from what
  // was typed, so the form shows what the backend kept.
  useEffect(() => {
    setStatus(enquiry.status);
    setAssignee(enquiry.assigned_to?.id ?? "");
    setNotes(enquiry.notes ?? "");
  }, [enquiry]);

  const changes: WebsiteEnquiryUpdateIn = {};
  if (status !== enquiry.status) changes.status = status;
  if (assignee !== (enquiry.assigned_to?.id ?? "")) changes.assigned_to_id = assignee || null;
  if (notes.trim() !== (enquiry.notes ?? "")) changes.notes = notes.trim() || null;
  const dirty = Object.keys(changes).length > 0;

  const save = useAction(async () =>
    api.patch<WebsiteEnquiryOut>(`/website-enquiries/${enquiry.id}`, changes),
  );

  // The current assignee stays choosable even if they can no longer see the
  // module, so opening the screen never silently changes the select.
  const options =
    enquiry.assigned_to && !people.some((p) => p.id === enquiry.assigned_to!.id)
      ? [enquiry.assigned_to, ...people]
      : people;

  return (
    <Panel className="p-5">
      <PanelHead title="Taking it on" />
      <div className="mt-4 space-y-4">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as WebsiteEnquiryStatus)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Assigned to"
          hint={peopleFailed ? "The list of people could not be loaded." : undefined}
        >
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Nobody yet</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" hint="For sales's own record: calls made, what was offered, what is next.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
        </Field>
        {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}
        <Button
          variant="accent"
          icon={Save}
          loading={save.pending}
          disabled={!dirty}
          onClick={async () => {
            const next = await save.run();
            if (next) onSaved(next);
          }}
        >
          Save
        </Button>
        <p className="text-[11.5px] text-ink-4">
          {enquiry.handled_at
            ? `First taken on ${relative(enquiry.handled_at)}${
                enquiry.handled_by ? ` by ${enquiry.handled_by.name}` : ""
              }.`
            : "Nobody has moved it on from New yet."}
        </p>
      </div>
    </Panel>
  );
}
