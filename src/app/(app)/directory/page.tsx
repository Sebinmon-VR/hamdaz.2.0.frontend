"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, Building2, Mail, Phone } from "lucide-react";
import { withQuery } from "@/lib/api";
import { num } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { OrgUserPage } from "@/lib/types";
import { Avatar, Badge, Panel, PageHead } from "@/components/ui/primitives";
import { Button, PillRail, SearchInput } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";

const PAGE = 48;

type Scope = "staff" | "everyone";

/**
 * Everyone in Entra.
 *
 * Paged rather than infinite: the backend returns a total, and knowing where
 * you are in a company directory is more useful than a list that never ends.
 */
export default function DirectoryPage() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("staff");
  const [offset, setOffset] = useState(0);
  const debounced = useDebounced(search, 350);

  // Any change of filter invalidates the position in the list.
  const key = withQuery("/directory/users", {
    search: debounced || undefined,
    include_guests: scope === "everyone",
    include_disabled: scope === "everyone",
    limit: PAGE,
    offset,
  });

  const { data, error, isLoading, mutate } = useSWR<OrgUserPage>(key);

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setOffset(0);
    };
  }

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="People"
        title="Directory"
        lead="Read live from Microsoft Entra, and read-only here."
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={change(setSearch)}
          placeholder="Search name, email or job title"
          className="w-full max-w-sm"
        />
        <PillRail
          value={scope}
          onChange={change<Scope>(setScope)}
          options={[
            { value: "staff", label: "Active staff" },
            { value: "everyone", label: "Include guests and disabled" },
          ]}
        />
        {data && (
          <span className="tnum ml-auto text-[12.5px] text-ink-3">
            {num(data.total)} people
          </span>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={8} />
      ) : !data || data.users.length === 0 ? (
        <Empty
          icon={Building2}
          title={search ? "Nobody matches that" : "The directory is empty"}
          body={
            search
              ? "Try part of a name, an email address, or a job title."
              : "Entra returned no users. That usually means the app registration lacks directory permissions."
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.users.map((person) => (
              <Panel key={person.object_id} className="p-3 transition hover:border-line-strong">
                <div className="flex items-start gap-3">
                  <Avatar name={person.display_name} seed={person.object_id} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/directory/${person.object_id}`}
                      className="block truncate text-[14.5px] font-medium"
                    >
                      {person.display_name}
                    </Link>
                    <p className="truncate text-[12px] text-ink-4">
                      {person.job_title ?? "No job title"}
                    </p>
                  </div>
                  <Link
                    href={`/directory/${person.object_id}`}
                    aria-label={`Open ${person.display_name}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-ink-3 transition hover:border-accent hover:text-ink"
                  >
                    <ArrowUpRight className="size-4" strokeWidth={2.2} />
                  </Link>
                </div>

                <div className="mt-3 space-y-1.5 text-[12.5px] text-ink-3">
                  {person.email && (
                    <p className="flex items-center gap-2">
                      <Mail className="size-3.5 shrink-0 text-ink-4" />
                      <span className="truncate">{person.email}</span>
                    </p>
                  )}
                  {person.mobile_phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="size-3.5 shrink-0 text-ink-4" />
                      {person.mobile_phone}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {person.department && <Badge tone="accent">{person.department}</Badge>}
                  {person.is_guest && <Badge tone="warn">Guest</Badge>}
                  {!person.account_enabled && <Badge tone="danger">Disabled</Badge>}
                </div>
              </Panel>
            ))}
          </div>

          {data.total > PAGE && (
            <div className="flex items-center justify-between gap-4">
              <Button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
              >
                Previous
              </Button>
              <span className="tnum text-[12.5px] text-ink-3">
                {offset + 1}–{Math.min(offset + data.count, data.total)} of {num(data.total)}
              </span>
              <Button
                disabled={offset + data.count >= data.total}
                onClick={() => setOffset(offset + PAGE)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
