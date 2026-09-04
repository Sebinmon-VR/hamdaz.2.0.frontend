"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, Crown, Plus, Users } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { date } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { TeamOut } from "@/lib/types";
import { Avatar, Badge, Panel, PageHead } from "@/components/ui/primitives";
import { Button, Field, Input, PillRail, SearchInput, Textarea } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";

type Scope = "active" | "all";

export default function TeamsPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [creating, setCreating] = useState(false);

  const key = withQuery("/teams", {
    search: search || undefined,
    include_archived: scope === "all",
  });
  const { data, error, isLoading, mutate } = useSWR<TeamOut[]>(key);

  const mine = useMemo(
    () => new Set(session.teams.map((t) => t.team.id)),
    [session.teams],
  );

  const teams = data ?? [];
  const archived = teams.filter((t) => t.archived_at).length;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="People"
        title="Teams"
        actions={
          session.roles.is_admin && (
            <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
              New team
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search teams"
          className="w-full max-w-xs"
        />
        <PillRail
          value={scope}
          onChange={setScope}
          options={[
            { value: "active", label: "Active" },
            { value: "all", label: "Including archived", count: archived || undefined },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : teams.length === 0 ? (
        <Empty
          icon={Users}
          title={search ? "No teams match that" : "No teams yet"}
          body={
            search
              ? "Try a shorter search, or include archived teams."
              : "Teams are how access is granted. An administrator can create the first one."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} isMine={mine.has(team.id)} />
          ))}
        </div>
      )}

      <CreateTeam
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          mutate();
        }}
      />
    </div>
  );
}

function TeamCard({ team, isMine }: { team: TeamOut; isMine: boolean }) {
  const archived = Boolean(team.archived_at);
  return (
    <Panel
      // A team the viewer is actually in is the one they came here to find.
      tone={isMine ? "highlight" : "panel"}
      className="group flex flex-col p-5 transition hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <Avatar name={team.name} seed={team.id} />
        <div className="min-w-0 flex-1">
          <Link href={`/teams/${team.slug}`} className="block">
            <h3 className="truncate text-[16px] font-semibold tracking-tight">{team.name}</h3>
            <p
              className={
                isMine
                  ? "truncate text-[12px] opacity-60"
                  : "truncate text-[12px] text-ink-4"
              }
            >
              /{team.slug}
            </p>
          </Link>
        </div>
        <Link
          href={`/teams/${team.slug}`}
          aria-label={`Open ${team.name}`}
          className={
            isMine
              ? "grid size-8 shrink-0 place-items-center rounded-full border border-second/15 transition hover:bg-second/10"
              : "grid size-8 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-ink-3 transition hover:border-accent hover:text-ink"
          }
        >
          <ArrowUpRight className="size-4" strokeWidth={2.2} />
        </Link>
      </div>

      <p
        className={
          isMine
            ? "mt-4 line-clamp-2 min-h-10 text-[13px] leading-relaxed opacity-75"
            : "mt-4 line-clamp-2 min-h-10 text-[13px] leading-relaxed text-ink-3"
        }
      >
        {team.description || "No description."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isMine ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-second/10 px-2.5 py-1 text-[11.5px] font-medium">
            <Crown className="size-3.5" strokeWidth={2.2} />
            You are in this team
          </span>
        ) : (
          <Badge icon={Users}>{team.member_count ?? 0} members</Badge>
        )}
        {archived && <Badge tone="warn">Archived {date(team.archived_at)}</Badge>}
      </div>
    </Panel>
  );
}

function CreateTeam({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const create = useAction(async () =>
    api.post("/teams", {
      name: name.trim(),
      // Left off entirely rather than sent empty: the backend derives a slug
      // from the name when it is absent, and an empty string is not absent.
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
    }),
  );

  async function submit() {
    const result = await create.run();
    if (result !== undefined) {
      setName("");
      setSlug("");
      setDescription("");
      onCreated();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New team"
      description="Give it a name. Members and module access are added afterwards."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={create.pending}
            disabled={!name.trim()}
            onClick={submit}
          >
            Create team
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Presales"
            autoFocus
          />
        </Field>
        <Field
          label="Slug"
          hint="Used in the URL. Derived from the name if you leave it blank."
        >
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="presales"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this team is responsible for."
          />
        </Field>
      </div>
    </Modal>
  );
}
