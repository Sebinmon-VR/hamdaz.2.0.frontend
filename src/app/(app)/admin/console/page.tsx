"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Activity,
  Bell,
  ChevronRight,
  Database,
  Inbox,
  ListOrdered,
  NotebookPen,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { dateTime, num, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ConsoleOut, ConsoleSectionOut } from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";

/**
 * What the back end is doing right now.
 *
 * The parts of this system that run **without anybody asking** — a mailbox
 * being watched, a copy of the Proposals list being kept current, a ranking
 * being recomputed, reports being mailed — have no natural place in the app,
 * because nobody navigates to them. They happen or they do not. This screen is
 * where that becomes visible, and it is the answer to "is it working" that does
 * not involve reading a log on a server.
 *
 * It is drawn from **one** endpoint, deliberately: the backend assembles every
 * section, its live figures and its `needs_attention` count in a single call,
 * so a screen cannot get half of it or make eleven requests to find out that
 * nothing is wrong.
 *
 * **Sections are rendered from what they say, not from what this file knows.**
 * The five that exist today each get a designed panel; anything the backend
 * adds later still appears, with its figures as plain pairs and its endpoints
 * listed. A new subsystem showing up unstyled is a much better failure than one
 * not showing up at all.
 */
export default function AdminConsolePage() {
  const session = useSession();
  const { data, error, mutate, isLoading } = useSWR<ConsoleOut>("/admin/console", {
    // Background work moves on its own, so this is the one admin screen where
    // coming back to the tab should show the current answer rather than the one
    // from when it was opened.
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  });

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="System" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="This shows how the background jobs are doing — the mailbox, the copy of the Proposals list, the queue. It is limited to super admins."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="System"
        lead="The jobs that run in the background on their own, and how each one is doing."
        meta={data ? `read ${relative(data.generated_at)}` : undefined}
        count={
          data && data.needs_attention > 0 ? `${num(data.needs_attention)} to check` : undefined
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <PanelSkeleton lines={10} />
      ) : (
        <>
          {data.needs_attention === 0 ? (
            <InlineNotice tone="positive">
              All running, nothing failing. Nothing needs you here.
            </InlineNotice>
          ) : (
            <InlineNotice tone="warn">
              {num(data.needs_attention)} {data.needs_attention === 1 ? "thing" : "things"}{" "}
              to check — an email that failed, a report that did not send, a copy that has
              never run. The red numbers below show where.
            </InlineNotice>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {data.sections.map((section) => (
              <Section key={section.key} section={section} />
            ))}
          </div>

          {isLoading && <p className="text-[11.5px] text-ink-4">Refreshing…</p>}
        </>
      )}
    </>
  );
}

/* ── one section ─────────────────────────────────────────────────────── */

const ICONS: Record<string, React.ElementType> = {
  intake: Inbox,
  mirror: Database,
  standing: ListOrdered,
  reports: NotebookPen,
  notifications: Bell,
};

/** Where the section is actually operated, when there is such a screen. */
const SCREENS: Record<string, { href: string; label: string }> = {
  intake: { href: "/admin/intake", label: "Open mail intake" },
  mirror: { href: "/admin/intake", label: "See the copy" },
  standing: { href: "/admin/intake", label: "See the queue" },
  reports: { href: "/admin/reports", label: "Report settings" },
  notifications: { href: "/notifications", label: "Open notifications" },
};

function Section({ section }: { section: ConsoleSectionOut }) {
  const [showEndpoints, setShowEndpoints] = useState(false);
  const Icon = ICONS[section.key] ?? Activity;
  const attention = Number(section.status.needs_attention ?? 0);
  const screen = SCREENS[section.key];

  return (
    <Panel className="flex flex-col p-5">
      <PanelHead
        title={
          <span className="inline-flex items-center gap-2">
            <Icon className="size-4 text-ink-4" strokeWidth={2} />
            {section.name}
          </span>
        }
        action={
          <span className="flex items-center gap-1.5">
            {attention > 0 && (
              <Badge tone="danger" icon={TriangleAlert}>
                {num(attention)}
              </Badge>
            )}
            <Badge tone={section.audience === "everyone" ? "neutral" : "accent"}>
              {section.audience === "super_admin"
                ? "Super admin"
                : section.audience === "admin"
                  ? "Admin"
                  : "Everyone"}
            </Badge>
          </span>
        }
      />

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-4">{section.description}</p>

      {/* The risk, before the figures. A caution below a wall of numbers is a
          caution somebody reads after doing the thing. */}
      {section.caution && (
        <InlineNotice tone="warn" className="mt-3">
          {section.caution}
        </InlineNotice>
      )}

      <div className="mt-4 flex-1">
        <Figures section={section} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {screen && (
          <LinkButton href={screen.href} size="sm" icon={ChevronRight}>
            {screen.label}
          </LinkButton>
        )}
        {section.endpoints.length > 0 && (
          <button
            onClick={() => setShowEndpoints((was) => !was)}
            className="text-[11.5px] text-ink-4 underline underline-offset-2 transition hover:text-ink-2"
          >
            {showEndpoints ? "Hide the addresses" : `${section.endpoints.length} web addresses behind this`}
          </button>
        )}
      </div>

      {/* What this section is actually made of. Worth having on the screen
          rather than in a document: when something behaves oddly, the next
          question is always which call it came from. */}
      {showEndpoints && (
        <ul className="mt-3 space-y-1">
          {section.endpoints.map((endpoint) => (
            <li
              key={`${endpoint.method} ${endpoint.path}`}
              className="flex items-baseline gap-2 rounded-[9px] bg-panel-2 px-2.5 py-1.5"
            >
              <span
                className={
                  "shrink-0 font-mono text-[10px] font-bold " +
                  (endpoint.writes ? "text-warn" : "text-ink-4")
                }
              >
                {endpoint.method}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-3">
                {endpoint.path}
              </span>
              <span className="hidden shrink-0 text-[10.5px] text-ink-4 sm:block">
                {endpoint.what}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── the figures ─────────────────────────────────────────────────────── */

/**
 * What a section currently says.
 *
 * Each of the five known sections is drawn deliberately, because the figure
 * that matters is different in each: for the intake it is whether it is writing
 * to SharePoint, for the mirror it is how stale the copy is, for the ranking it
 * is who is next. An unknown section falls back to pairs — see the note at the
 * top of the file about why that is the right failure.
 */
function Figures({ section }: { section: ConsoleSectionOut }) {
  const s = section.status;

  if (section.key === "intake") {
    const messages = (s.messages ?? {}) as Record<string, number>;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Tile
            label="Reading mail"
            value={s.enabled ? "On" : "Off"}
            tone={s.enabled ? undefined : "muted"}
            hint={String(s.mailbox || "No mailbox set yet")}
          />
          {/* The one setting that changes something outside this system, so it
              is a figure rather than a line of small print. */}
          <Tile
            label="Creates tasks"
            value={s.writes_to_sharepoint ? "Yes" : "No"}
            tone={s.writes_to_sharepoint ? "warn" : undefined}
            hint={
              s.writes_to_sharepoint
                ? "New jobs become real tasks in SharePoint with real names on them."
                : "It works everything out but does not create anything."
            }
          />
        </div>
        <MessageBar counts={messages} />
        <Lines
          rows={[
            ["People it will read", num(Number(s.senders ?? 0))],
            ["Last checked", s.last_poll_at ? relative(String(s.last_poll_at)) : "never"],
            [
              "Microsoft is notifying us",
              s.subscription_expires_at
                ? `until ${relative(String(s.subscription_expires_at))}`
                : "not set up",
            ],
          ]}
        />
        {typeof s.last_error === "string" && s.last_error && (
          <p className="text-[11.5px] leading-relaxed text-danger">{s.last_error}</p>
        )}
      </div>
    );
  }

  if (section.key === "mirror") {
    const coverage = Number(s.embedding_coverage ?? 0);
    const since = s.seconds_since_sync as number | null;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Jobs copied" value={num(Number(s.rows ?? 0))} />
          <Tile
            label="Searchable"
            value={`${Math.round(coverage * 100)}%`}
            tone={coverage < 1 ? "warn" : undefined}
            hint={
              coverage < 1
                ? "Used to work out which job an email is about. Below 100% usually means the OpenAI key is missing."
                : undefined
            }
          />
        </div>
        <Lines
          rows={[
            [
              "Last sync",
              s.last_sync_at
                ? `${relative(String(s.last_sync_at))} · ${num(Number(s.last_duration_ms ?? 0))} ms`
                : "never",
            ],
            ["Changed since last time", num(Number(s.rows_changed_last ?? 0))],
            ["Re-processed last time", num(Number(s.rows_embedded_last ?? 0))],
          ]}
        />
        {since !== null && since !== undefined && since > 3600 && (
          <p className="text-[11.5px] text-warn">
            Not copied for {Math.round(since / 3600)} hours, so it is working from an old
            version of the list.
          </p>
        )}
        {typeof s.last_error === "string" && s.last_error && (
          <p className="text-[11.5px] leading-relaxed text-danger">{s.last_error}</p>
        )}
      </div>
    );
  }

  if (section.key === "standing") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Tile
            label="Next up"
            value={String(s.next_up ?? "—")}
            hint="The next new job would go to this person."
          />
          <Tile label="People in the queue" value={num(Number(s.ranked ?? 0))} />
        </div>
        <Lines
          rows={[
            ["Being skipped", num(Number(s.excluded ?? 0))],
            [
              "Computed",
              s.computed_at ? relative(String(s.computed_at)) : "never",
            ],
          ]}
        />
      </div>
    );
  }

  if (section.key === "reports") {
    const failed = Number(s.failed_deliveries_7_days ?? 0);
    const cadences = (s.cadences_emailed ?? []) as string[];
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Tile
            label="Filed this week"
            value={num(Number(s.submitted_last_7_days ?? 0))}
          />
          <Tile
            label="Failed to send"
            value={num(failed)}
            tone={failed > 0 ? "danger" : undefined}
            hint="The report was still filed. It just did not reach the person by email."
          />
        </div>
        <Lines
          rows={[
            ["Emailed when filed", s.email_on_submit ? "Yes" : "No"],
            ["Which ones are emailed", cadences.length ? cadences.join(", ") : "none"],
            ["Teams set up", num(Number(s.schedules ?? 0))],
            ["Unfinished drafts", num(Number(s.drafts_open ?? 0))],
          ]}
        />
      </div>
    );
  }

  if (section.key === "notifications") {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="Unread, yours" value={num(Number(s.mine_unread ?? 0))} />
        <Tile
          label="Sent in total"
          value={num(Number(s.raised_total ?? 0))}
          hint="To everybody. Nobody can read anybody else's."
        />
      </div>
    );
  }

  // A section this build has never heard of. Shown rather than skipped.
  const pairs = Object.entries(s).filter(([key]) => key !== "needs_attention");
  return <Lines rows={pairs.map(([key, value]) => [key, plain(value)])} />;
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "danger" | "muted";
}) {
  return (
    <StatBox
      label={label}
      value={
        <span
          className={
            tone === "danger"
              ? "text-danger"
              : tone === "warn"
                ? "text-second"
                : tone === "muted"
                  ? "text-ink-4"
                  : undefined
          }
        >
          {value}
        </span>
      }
      hint={hint}
      className="bg-panel-2"
    />
  );
}

function Lines({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2.5 text-[11.5px]">
          <dt className="min-w-0 flex-1 truncate text-ink-4">{label}</dt>
          <dd className="shrink-0 truncate text-ink-2" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every message the intake has seen, by what became of it.
 *
 * One bar rather than six numbers because these are parts of a whole, and the
 * proportion is the thing worth seeing: mostly-ignored is healthy for a shared
 * mailbox, mostly-failed is not, and both look identical as a column of
 * figures.
 */
function MessageBar({ counts }: { counts: Record<string, number> }) {
  const order: { key: string; label: string; fill: string }[] = [
    { key: "actioned", label: "Done", fill: "var(--positive)" },
    { key: "simulated", label: "Not written", fill: "var(--info)" },
    { key: "classified", label: "Read", fill: "var(--accent)" },
    { key: "received", label: "Waiting", fill: "var(--panel-3)" },
    { key: "ignored", label: "Ignored", fill: "var(--panel-3)" },
    { key: "failed", label: "Failed", fill: "var(--danger)" },
  ];
  const total = order.reduce((sum, part) => sum + (counts[part.key] ?? 0), 0);
  if (total === 0) {
    return <p className="text-[11.5px] text-ink-4">No email has come in yet.</p>;
  }

  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {order
          .filter((part) => (counts[part.key] ?? 0) > 0)
          .map((part) => (
            <span
              key={part.key}
              title={`${part.label}: ${counts[part.key]}`}
              className="rounded-full"
              style={{
                width: `${((counts[part.key] ?? 0) / total) * 100}%`,
                background: part.fill,
              }}
            />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {order
          .filter((part) => (counts[part.key] ?? 0) > 0)
          .map((part) => (
            <li key={part.key} className="flex items-center gap-1.5 text-[11px] text-ink-4">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: part.fill }}
              />
              {part.label}
              <span className="tnum text-ink-2">{counts[part.key]}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function plain(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  // An ISO timestamp is unreadable and a relative one is what anybody wants.
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? dateTime(text) : text;
}
