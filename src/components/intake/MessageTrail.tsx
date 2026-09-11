"use client";

/**
 * One email, and every decision taken about it, in the order they were taken.
 *
 * This is the screen the whole intake is answerable through. A pipeline that
 * reads mail, decides what it is, looks for it in a list and then assigns work
 * to a real person is not something anybody should be asked to trust on the
 * strength of a status column — the useful question is never "what did it do",
 * it is "why did it do *that*", and only the trail answers it.
 *
 * So each stage shows the evidence it acted on rather than its conclusion
 * alone: the model's own words, the shortlist it chose from with every
 * candidate's score, the threshold each score was judged against, and — where
 * writing is switched off — the exact payload that would have been posted.
 * A wrong decision should be diagnosable from here without opening a log.
 *
 * The stages a message did not reach are drawn greyed rather than hidden. Where
 * it stopped is usually the answer.
 */

import clsx from "clsx";
import {
  Check,
  ExternalLink,
  Link2,
  Mail,
  Send,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { dateTime, humanise, relative } from "@/lib/format";
import type { IntakeMessageOut, IntakeSettingsOut } from "@/lib/types";
import { Avatar, Badge } from "@/components/ui/primitives";
import {
  ActionBadge,
  CATEGORY_LABELS,
  CategoryBadge,
  Confidence,
  IntakeStatusBadge,
} from "@/components/intake/IntakeBits";

export function MessageTrail({
  message,
  settings,
}: {
  message: IntakeMessageOut;
  settings?: IntakeSettingsOut;
}) {
  const classified = message.category !== null;
  const matched = message.matched_item_id !== null;
  const acted = message.action !== "none";
  const creating = message.category === "tender" || message.category === "proposal";

  return (
    <div className="space-y-3">
      {message.error && (
        <div className="rounded-[13px] bg-danger-soft px-3.5 py-3">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-danger">
            <TriangleAlert className="size-3.5" strokeWidth={2.2} />
            It went wrong here
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-danger">
            {message.error}
          </p>
        </div>
      )}

      {/* 1 ── what arrived */}
      <Stage icon={Mail} title="The email" done>
        <p className="text-[13px] font-medium text-ink">{message.subject || "(no subject)"}</p>
        <p className="mt-1 text-[11.5px] text-ink-4">
          {message.sender_name ? `${message.sender_name} · ` : ""}
          {message.sender_email ?? "unknown sender"}
          {message.received_at ? ` · ${dateTime(message.received_at)}` : ""}
        </p>
        {message.web_link && (
          <a
            href={message.web_link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-accent-text underline underline-offset-2"
          >
            <ExternalLink className="size-3" strokeWidth={2.2} />
            Open in Outlook
          </a>
        )}
      </Stage>

      {/* 2 ── what it was taken to be */}
      <Stage icon={Sparkles} title="What it worked out" done={classified}>
        {!classified ? (
          <p className="text-[11.5px] text-ink-4">It has not read this one yet.</p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge value={message.category} />
              {message.is_reopened && <Badge tone="warn">Reopened</Badge>}
              {!creating && message.category !== "general" && (
                <span className="text-[11px] text-ink-4">
                  about a job we already have, so it never creates a new task
                </span>
              )}
            </div>

            <Confidence
              value={message.confidence}
              threshold={settings?.classify_threshold}
              label="How sure it was"
            />

            {/* The model's own words. First thing to read when a decision
                looks wrong, and the reason this is stored at all. */}
            {message.reasoning && (
              <p className="whitespace-pre-wrap rounded-[11px] bg-panel px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
                {message.reasoning}
              </p>
            )}

            {Object.keys(message.extracted).length > 0 && (
              <Pairs record={message.extracted} title="Details it picked out" />
            )}
          </div>
        )}
      </Stage>

      {/* 3 ── whether it is something we already have */}
      <Stage icon={Link2} title="Do we already have this job" done={classified}>
        {!classified ? (
          <p className="text-[11.5px] text-ink-4">It has not looked yet.</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-[12.5px] text-ink-2">
              {matched ? (
                <>
                  Matched <span className="font-mono text-[11.5px]">{message.matched_item_id}</span>
                </>
              ) : (
                "No, nothing in the list matched. It counts as new work."
              )}
            </p>

            {message.match_confidence !== null && (
              <Confidence
                value={message.match_confidence}
                threshold={settings?.match_threshold}
                label="How close a match"
              />
            )}

            {message.match_reason && (
              <p className="text-[11.5px] leading-relaxed text-ink-3">{message.match_reason}</p>
            )}

            {/* The shortlist, scored. This is what separates "a close call" from
                "a wild guess", and neither is visible from the winner alone. */}
            {message.candidates.length > 0 && (
              <Candidates rows={message.candidates} chosen={message.matched_item_id} />
            )}
          </div>
        )}
      </Stage>

      {/* 4 ── what was done about it */}
      <Stage icon={UserCheck} title="What it did" done={acted || message.status === "ignored"}>
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <IntakeStatusBadge value={message.status} />
            <ActionBadge value={message.action} />
          </div>

          {message.status === "ignored" && (
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              Nothing, on purpose — the sender is not on the list, or it was a circular
              rather than real work. These are kept so you can see why nothing happened.
            </p>
          )}

          {message.assigned_name && (
            <div className="flex items-start gap-2.5 rounded-[11px] bg-panel px-3 py-2.5">
              <Avatar
                name={message.assigned_name}
                seed={message.assigned_user_id ?? message.assigned_name}
                size="xs"
              />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink">{message.assigned_name}</p>
                {message.assigned_reason && (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
                    {message.assigned_reason}
                  </p>
                )}
              </div>
            </div>
          )}

          {message.created_item_id && (
            <p className="text-[11.5px] text-positive">
              Created in SharePoint as{" "}
              <span className="font-mono">{message.created_item_id}</span>.
            </p>
          )}

          {/* With writing off this is the entire output — the decision complete
              and inspectable, with only the last step withheld. */}
          {message.would_create && !message.created_item_id && (
            <div>
              <p className="micro mb-1 text-ink-4">
                The task it would have created. Creating tasks is switched off.
              </p>
              <Pairs record={message.would_create} />
            </div>
          )}

          {/* The second write, and it is smaller than it looks and larger than
              it sounds: one column on a row that already exists — but a flow
              watching the list triggers on that column, so this is the moment
              something outside this system finds out. */}
          {message.would_update && (
            <div>
              <p className="micro mb-1 text-ink-4">
                {message.action === "marked_negotiation"
                  ? "Ticked on the task"
                  : "What it would have ticked. That setting is switched off."}
              </p>
              <Pairs record={flatten(message.would_update)} />
              {message.action === "marked_negotiation" && (
                <p className="mt-1 text-[11px] leading-relaxed text-ink-4">
                  Any flow watching that column runs when this happens. It is only ticked
                  once per task, so a long email thread does not set it off repeatedly.
                </p>
              )}
            </div>
          )}
        </div>
      </Stage>

      {/* 5 ── who was told */}
      <Stage
        icon={Send}
        title="Who was told"
        done={message.notified_user_ids.length > 0 || message.notified_teams}
        last
      >
        {message.notified_user_ids.length === 0 && !message.notified_teams ? (
          <p className="text-[11.5px] text-ink-4">Nobody. There was nothing to tell them.</p>
        ) : (
          <p className="text-[12px] text-ink-2">
            {message.notified_user_ids.length > 0 &&
              `${message.notified_user_ids.length} ${
                message.notified_user_ids.length === 1 ? "person" : "people"
              } in the app`}
            {message.notified_user_ids.length > 0 && message.notified_teams && " · "}
            {message.notified_teams && "posted to Teams"}
          </p>
        )}
        <p className="mt-2 text-[11px] text-ink-4">
          {message.processed_at ? `Handled ${relative(message.processed_at)}` : "Not handled yet"}
          {message.cost_usd ? ` · cost $${message.cost_usd.toFixed(4)}` : ""}
        </p>
      </Stage>
    </div>
  );
}

/* ── one stage of the pipeline ───────────────────────────────────────── */

function Stage({
  icon: Icon,
  title,
  done,
  last,
  children,
}: {
  icon: React.ElementType;
  title: string;
  done?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {/* The rail: a dot per stage and a line between them. A message that
          stopped early leaves the rest of the rail visibly unfilled, which is
          the fastest read of where it got to. */}
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={clsx(
            "grid size-7 place-items-center rounded-full",
            done ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-4",
          )}
        >
          {done ? (
            <Check className="size-3.5" strokeWidth={2.6} />
          ) : (
            <Icon className="size-3.5" strokeWidth={2} />
          )}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>

      <div className={clsx("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-ink-2">
          <Icon className="size-3.5 text-ink-4" strokeWidth={2} />
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

/* ── the shortlist ───────────────────────────────────────────────────── */

/**
 * Every row the matcher considered, with its score.
 *
 * Read down the list: a winner well clear of the rest was an easy call, a pack
 * of near-identical scores was not, and the second case is where a wrong match
 * comes from. The shape of each candidate is the backend's, so it is read
 * defensively — a field added there should not blank this panel.
 */
function Candidates({ rows, chosen }: { rows: unknown[]; chosen: string | null }) {
  const items = rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .slice(0, 8);
  if (items.length === 0) return null;

  return (
    <div>
      <p className="micro mb-1 text-ink-4">Others it compared against</p>
      <ul className="space-y-1">
        {items.map((row, index) => {
          const id = String(row.item_id ?? row.id ?? index);
          const score = Number(row.score ?? row.confidence ?? 0);
          const title = String(row.title ?? row.subject ?? id);
          const won = chosen !== null && String(row.item_id ?? row.id ?? "") === chosen;
          return (
            <li
              key={`${id}-${index}`}
              className={clsx(
                "flex items-center gap-2.5 rounded-[9px] px-2.5 py-1.5",
                won ? "bg-accent-soft" : "bg-panel",
              )}
            >
              <span
                className={clsx(
                  "min-w-0 flex-1 truncate text-[11.5px]",
                  won ? "text-accent-text" : "text-ink-3",
                )}
                title={title}
              >
                {title}
              </span>
              <span className="tnum shrink-0 text-[11px] font-semibold text-ink-2">
                {(Math.max(0, Math.min(1, score)) * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── a payload, as pairs ─────────────────────────────────────────────── */

function Pairs({ record, title }: { record: Record<string, unknown>; title?: string }) {
  const entries = Object.entries(record).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) return null;
  return (
    <div>
      {title && <p className="micro mb-1 text-ink-4">{title}</p>}
      <dl className="grid gap-x-4 gap-y-1 rounded-[11px] bg-panel px-3 py-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex min-w-0 gap-2.5 text-[11.5px]">
            <dt className="w-28 shrink-0 truncate text-ink-4">{humanise(key)}</dt>
            <dd className="min-w-0 flex-1 break-words text-ink-2">{show(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * `would_update` arrives as `{ item_id, fields: { … } }`.
 *
 * Flattened for display, because the nesting is an artefact of what SharePoint's
 * API wants rather than anything a reader cares about — they want to know which
 * row and what was set on it.
 */
function flatten(record: Record<string, unknown>): Record<string, unknown> {
  const fields = record.fields;
  if (!fields || typeof fields !== "object") return record;
  const { fields: _dropped, ...rest } = record;
  return { ...rest, ...(fields as Record<string, unknown>) };
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Exported for the log's one-line summary of a category. */
export function categoryLabel(value: string | null): string {
  if (!value) return "—";
  return CATEGORY_LABELS[value] ?? value;
}
