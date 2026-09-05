"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { Check, Users } from "lucide-react";
import type { MemberOut, TeamOut } from "@/lib/types";
import { Avatar } from "@/components/ui/primitives";
import { SearchInput, Select } from "@/components/ui/controls";
import { Empty, ErrorState, RowsSkeleton } from "@/components/ui/feedback";

/**
 * Choosing colleagues by their **Hamdaz** user id.
 *
 * This is more roundabout than it looks and the reason is worth recording. HR
 * needs a local `user_id` in three places — nominating a reviewer, naming a
 * review's subject, and saying which employee record a hired candidate became
 * — and there is no endpoint that lists local users. `/directory/users`, which
 * every other picker in this app uses, reads Entra and returns `object_id`,
 * which is not the same thing and is not accepted by any of those three
 * endpoints.
 *
 * What does return local ids is a team's membership. So people are picked one
 * team at a time. The cost is real: somebody who belongs to no team cannot be
 * found here at all. That is a gap in the backend rather than a choice made
 * here, and the empty state says so rather than leaving the reader to guess
 * why a colleague they can see in the directory is missing.
 *
 * Nobody who has never signed in appears either, which for once is correct —
 * a person with no local row cannot be a review subject or a hire link, and
 * the backend would refuse the id anyway.
 */
export function PeoplePicker({
  selected,
  onToggle,
  multiple = false,
  exclude,
  className,
}: {
  /** Local user ids currently chosen. */
  selected: string[];
  onToggle: (member: MemberOut) => void;
  multiple?: boolean;
  /** Ids to hide — a subject already nominated, or the person being reviewed. */
  exclude?: Set<string>;
  className?: string;
}) {
  const [slug, setSlug] = useState("");
  const [search, setSearch] = useState("");

  const teams = useSWR<TeamOut[]>("/teams", { revalidateOnFocus: false });
  // Not debounced: the filtering below is client-side over one team's members,
  // which is tens of rows, not the whole directory.
  const members = useSWR<MemberOut[]>(slug ? `/teams/${slug}/members` : null, {
    revalidateOnFocus: false,
  });

  const rows = (members.data ?? [])
    .filter((m) => !exclude?.has(m.user_id))
    .filter((m) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    });

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        <Select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="min-w-[180px] flex-1"
          aria-label="Team"
        >
          <option value="">Choose a team…</option>
          {(teams.data ?? [])
            .filter((t) => !t.archived_at)
            .map((team) => (
              <option key={team.id} value={team.slug}>
                {team.name}
              </option>
            ))}
        </Select>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by name or email"
          className="min-w-[180px] flex-1"
        />
      </div>

      {teams.error ? (
        <ErrorState error={teams.error} onRetry={() => teams.mutate()} />
      ) : !slug ? (
        <Empty
          icon={Users}
          title="Pick a team first"
          body="People are listed by team because that is the only place their Hamdaz user id is published. Anyone in no team at all cannot be chosen here."
        />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={() => members.mutate()} />
      ) : members.isLoading && !members.data ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          icon={Users}
          title={search ? "Nobody matches" : "Nobody left to pick"}
          body={
            search
              ? "No member of this team matches that."
              : "Everyone in this team has already been chosen."
          }
        />
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {rows.map((member) => {
            const on = selected.includes(member.user_id);
            return (
              <li key={member.user_id}>
                <button
                  type="button"
                  onClick={() => onToggle(member)}
                  aria-pressed={on}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-[13px] px-3 py-2 text-left transition",
                    on ? "bg-accent-soft" : "hover:bg-panel-2",
                  )}
                >
                  <Avatar name={member.display_name} seed={member.user_id} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {member.display_name}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-4">{member.email}</span>
                  </span>
                  {!member.is_active && (
                    <span className="shrink-0 text-[11px] text-ink-4">Deactivated</span>
                  )}
                  {on && <Check className="size-4 shrink-0 text-accent-text" strokeWidth={2.6} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {multiple && selected.length > 0 && (
        <p className="text-[11.5px] text-ink-4">
          {selected.length} chosen. Switching team keeps them.
        </p>
      )}
    </div>
  );
}
