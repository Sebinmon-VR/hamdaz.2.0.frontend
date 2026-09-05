"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarX, FolderLock, Upload } from "lucide-react";
import { withQuery } from "@/lib/api";
import { date, num, relative } from "@/lib/format";
import type { HrDocumentOut } from "@/lib/types";
import { Avatar, Badge, PageHead, Panel, Stat } from "@/components/ui/primitives";
import { Button, PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { HrOnly } from "@/components/hr/HrOnly";
import { UploadDocumentDialog } from "@/components/hr/UploadDocumentDialog";

/** The expiry window. Strings because they are also the pill values. */
type Horizon = "all" | "30" | "90";

export default function StaffDocumentsPage() {
  return (
    <HrOnly>
      <StaffDocuments />
    </HrOnly>
  );
}

/**
 * The personnel files, by person.
 *
 * There is no endpoint that lists staff — only one that lists documents — so
 * this screen is built by grouping `/hr/documents` rather than by walking a
 * roster. The consequence is worth stating plainly on the screen: somebody
 * with no document filed does not appear at all, and their absence here means
 * "nothing on file", not "not an employee".
 *
 * The expiry window is the reason this screen is a list of people rather than
 * a list of files. A visa that lapsed last week is an emergency, and it is the
 * person it belongs to that HR has to act on.
 */
function StaffDocuments() {
  const [horizon, setHorizon] = useState<Horizon>("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const key = withQuery("/hr/documents", {
    expiring_within_days: horizon === "all" ? undefined : Number(horizon),
  });
  const documents = useSWR<HrDocumentOut[]>(key);

  const people = groupByPerson(documents.data ?? []).filter((person) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (person.name ?? "").toLowerCase().includes(q);
  });

  const expired = (documents.data ?? []).filter((d) => d.expired).length;
  const hidden = (documents.data ?? []).filter((d) => !d.visible_to_employee).length;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="HR · People"
        title="Staff documents"
        count={documents.data ? `${people.length} people` : undefined}
        lead="Contracts, offer letters, visas and the rest. Only HR reads these."
        actions={
          <Button variant="accent" icon={Upload} onClick={() => setUploading(true)}>
            File a document
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillRail
          value={horizon}
          onChange={setHorizon}
          options={[
            { value: "all", label: "Everything on file" },
            { value: "30", label: "Expiring in 30 days" },
            { value: "90", label: "Expiring in 90 days" },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Find a person"
          className="min-w-[200px] flex-1"
        />
      </div>

      {documents.data && documents.data.length > 0 && (
        <Panel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5">
          <Stat value={num(people.length)} label="people with something on file" />
          <Stat value={num(documents.data.length)} label="documents" />
          <Stat
            value={num(expired)}
            label="already expired"
            tone="danger"
            delta={expired > 0 ? "act" : undefined}
          />
          <Stat
            value={num(hidden)}
            label="not shared with the employee"
            tone="warn"
          />
        </Panel>
      )}

      {documents.error ? (
        <ErrorState error={documents.error} onRetry={() => documents.mutate()} />
      ) : documents.isLoading && !documents.data ? (
        <RowsSkeleton rows={6} />
      ) : people.length === 0 ? (
        <Empty
          icon={FolderLock}
          title={horizon === "all" ? "Nothing on file" : "Nothing expiring"}
          body={
            horizon === "all"
              ? "No document has been filed against anybody yet. Note that this list is built from documents, so a colleague with nothing on file simply does not appear here."
              : "No document expires inside that window. Documents with no expiry date at all are never counted here."
          }
          action={
            <Button variant="accent" icon={Upload} onClick={() => setUploading(true)}>
              File a document
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.userId}>
              <Link href={`/hr/people/${person.userId}`} className="block">
                <Panel className="flex flex-wrap items-center gap-4 p-4 transition hover:bg-panel-2">
                  <Avatar name={person.name} seed={person.userId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{person.name ?? "Unknown"}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-3">
                      {num(person.documents.length)}{" "}
                      {person.documents.length === 1 ? "document" : "documents"} · newest{" "}
                      {relative(person.newest)}
                    </p>
                  </div>
                  {person.expired > 0 && (
                    <Badge tone="danger" icon={CalendarX}>
                      {person.expired} expired
                    </Badge>
                  )}
                  {person.nextExpiry && person.expired === 0 && (
                    <Badge tone="warn" icon={CalendarX}>
                      Next expires {date(person.nextExpiry)}
                    </Badge>
                  )}
                  {person.hidden > 0 && (
                    <Badge
                      tone="neutral"
                      title="Filed but not shared — the person it is about cannot see that these exist."
                    >
                      {person.hidden} private
                    </Badge>
                  )}
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <UploadDocumentDialog
        open={uploading}
        onClose={() => setUploading(false)}
        onUploaded={() => {
          setUploading(false);
          documents.mutate();
        }}
      />
    </div>
  );
}

interface Person {
  userId: string;
  name: string | null;
  documents: HrDocumentOut[];
  expired: number;
  hidden: number;
  /** The soonest expiry still ahead, if any. */
  nextExpiry: string | null;
  newest: string;
}

/** Documents into people, most recently touched first. */
function groupByPerson(documents: HrDocumentOut[]): Person[] {
  const map = new Map<string, Person>();
  for (const document of documents) {
    const person = map.get(document.user_id) ?? {
      userId: document.user_id,
      name: document.user_name,
      documents: [],
      expired: 0,
      hidden: 0,
      nextExpiry: null,
      newest: document.created_at,
    };
    person.documents.push(document);
    if (document.expired) person.expired += 1;
    if (!document.visible_to_employee) person.hidden += 1;
    if (document.expires_on && !document.expired) {
      person.nextExpiry =
        person.nextExpiry && person.nextExpiry < document.expires_on
          ? person.nextExpiry
          : document.expires_on;
    }
    if (document.created_at > person.newest) person.newest = document.created_at;
    map.set(document.user_id, person);
  }
  return [...map.values()].sort((a, b) => {
    // Anybody with an expired document comes first, whatever the dates say —
    // that is the only row on this screen that is a task rather than a record.
    if ((a.expired > 0) !== (b.expired > 0)) return a.expired > 0 ? -1 : 1;
    return b.newest.localeCompare(a.newest);
  });
}
