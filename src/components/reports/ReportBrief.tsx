"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquare, RefreshCw, Send, Sparkles, Wrench } from "lucide-react";
import clsx from "clsx";

import { api, ApiError } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useConversation } from "@/lib/assistant";
import { useSession } from "@/lib/session";
import type { AssistantMessageOut, BriefChatOut, BriefOut } from "@/lib/types";
import { Avatar, Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";
import { Markdown } from "@/components/assistant/Markdown";
import { ConfirmCard } from "@/components/assistant/ConfirmCard";

/**
 * The short version of a report, and a place to argue with it.
 *
 * A report is long because a record should be. A manager with nine of them to
 * get through on a Monday needs the short one first and the long one when the
 * short one worries them — so this sits above the report, not instead of it,
 * and the whole document is still right there underneath.
 *
 * **The box is the assistant, not an imitation of it.** Opening the chat asks
 * the API for a real conversation and everything after that goes through the
 * assistant's own endpoints, which is what puts these questions under the same
 * admission rules, tool policies, cost caps and audit log as any other chat.
 * A second, quieter way to ask a model things is exactly what nobody should
 * have to go looking for later.
 *
 * **It draws nothing when there is nothing to draw.** A report whose team has
 * the summariser switched off, or a draft, gets no empty panel promising a
 * feature that is not on — `state` says which of those it is and this returns
 * null for both, rather than leaving a manager wondering what is broken.
 */
export function ReportBrief({ reportId }: { reportId: string }) {
  const { user } = useSession();
  const {
    data: brief,
    error,
    isLoading,
    mutate,
  } = useSWR<BriefOut>(`/reports/${reportId}/brief`, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [conversationId, setConversationId] = useState<string | null>(null);

  const again = useAction(async () => {
    const fresh = await api.post<BriefOut>(`/reports/${reportId}/brief`);
    await mutate(fresh, { revalidate: false });
  });

  const open = useAction(async () => {
    const opened = await api.post<BriefChatOut>(`/reports/${reportId}/chat`);
    await mutate(opened.brief, { revalidate: false });
    setConversationId(opened.conversation_id);
  });

  // A brief that has not loaded yet is not worth a skeleton the height of the
  // panel it might not become: the report underneath is the thing being read,
  // and a box that appears late is better than a grey rectangle that sometimes
  // vanishes.
  if (isLoading || error || !brief) return null;
  if (brief.state === "disabled" || brief.state === "not_applicable") return null;

  const written = brief.state === "ready" || brief.state === "stale";

  return (
    <Panel className="p-5">
      <PanelHead
        title={
          <span className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-[8px] bg-accent text-accent-ink">
              <Sparkles className="size-3.5" strokeWidth={2.2} />
            </span>
            The short version
          </span>
        }
        hint={
          written && brief.generated_at
            ? `Written ${relative(brief.generated_at)}`
            : undefined
        }
        action={
          <div className="flex items-center gap-2">
            {brief.state === "stale" && (
              <Badge
                tone="warn"
                title="The report was edited after this was written, so it may describe an earlier version."
              >
                Out of date
              </Badge>
            )}
            {brief.revision > 1 && (
              <Badge tone="neutral" title={`Asked for ${brief.revision} times`}>
                v{brief.revision}
              </Badge>
            )}
            {written && brief.may_refresh && (
              <Button
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                loading={again.pending}
                onClick={() => void again.run()}
              >
                Again
              </Button>
            )}
          </div>
        }
      />

      {again.error && (
        <InlineNotice tone="danger" className="mt-3">
          {again.error}
        </InlineNotice>
      )}

      {/* Nobody has asked for one yet. Under "only when asked" this is the
          normal resting state, so it reads as an offer rather than a fault. */}
      {brief.state === "absent" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-ink-3">
            This report has not been summarised yet.
          </p>
          {brief.may_refresh && (
            <Button
              size="sm"
              variant="accent"
              icon={Sparkles}
              loading={again.pending}
              onClick={() => void again.run()}
            >
              Summarise it
            </Button>
          )}
        </div>
      )}

      {brief.state === "failed" && (
        <div className="mt-4 space-y-3">
          <InlineNotice tone="danger">
            {brief.error ?? "The summary could not be written."}
          </InlineNotice>
          {brief.may_refresh && (
            <Button
              size="sm"
              variant="outline"
              icon={RefreshCw}
              loading={again.pending}
              onClick={() => void again.run()}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {written && (
        <div className="mt-4 space-y-4">
          {brief.headline && (
            <p className="text-[14.5px] font-semibold leading-snug tracking-tight text-ink">
              {brief.headline}
            </p>
          )}
          {brief.body && (
            <div className="text-[13.5px] leading-relaxed text-ink-2">
              <Markdown text={brief.body} />
            </div>
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-4">
            {/* Said plainly, every time. A reader who cannot tell which
                sentences a person wrote and which a model did cannot use
                either of them properly. */}
            <span>Written by {brief.model ?? "the assistant"} from this report alone.</span>
            {brief.generated_at && <span title={dateTime(brief.generated_at)}>·</span>}
            <span>The report below is what was actually filed.</span>
          </p>

          {brief.may_chat && conversationId === null && (
            <div className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                icon={MessageSquare}
                loading={open.pending}
                onClick={() => void open.run()}
              >
                Ask about this report
              </Button>
              {open.error && <InlineNotice tone="danger">{open.error}</InlineNotice>}
            </div>
          )}

          {conversationId && <BriefChat conversationId={conversationId} me={user.display_name} />}
        </div>
      )}
    </Panel>
  );
}

/**
 * The conversation, once somebody has opened it.
 *
 * Every message is drawn, the seeded brief included — so the thread reads as
 * one exchange that began with the summary rather than as a chat bolted under
 * a card. The hook behind it is the assistant's own, so a parked write shows
 * the same confirmation card here as it does on the assistant screen; a box
 * that could start a write but not finish one would hang on the first.
 */
function BriefChat({ conversationId, me }: { conversationId: string; me: string }) {
  const chat = useConversation(conversationId);

  return (
    <div className="rounded-[16px] bg-panel-2 p-4">
      <div className="space-y-4">
        {chat.messages.map((message) => (
          <Line key={message.id} message={message} me={me} />
        ))}

        {chat.turn.phase === "waiting" && (
          <p className="flex items-center gap-2 text-[12px] text-ink-4">
            <Sparkles className="size-3 animate-pulse" strokeWidth={2.2} />
            Reading the report…
          </p>
        )}

        {chat.turn.pending && (
          <ConfirmCard
            actions={chat.turn.pending.actions}
            onRespond={(ok) => void chat.respond(ok)}
          />
        )}

        {chat.turn.error && (
          <InlineNotice tone="danger">{chat.turn.error}</InlineNotice>
        )}
      </div>

      <Ask
        busy={chat.busy}
        blocked={Boolean(chat.turn.pending)}
        onSend={chat.send}
      />
    </div>
  );
}

function Line({ message, me }: { message: AssistantMessageOut; me: string }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[80%] rounded-[16px] rounded-br-[6px] bg-panel px-3.5 py-2 text-[13px] leading-relaxed text-ink">
          {message.content}
        </div>
        <Avatar name={me} seed={me} className="size-6 rounded-[8px] text-[9px]" />
      </div>
    );
  }

  const used = message.tool_calls ?? [];
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[8px] bg-accent text-accent-ink">
        <Sparkles className="size-3" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-[13px] leading-relaxed text-ink-2">
          <Markdown text={message.content} />
        </div>
        {used.length > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-4">
            <Wrench className="size-3" strokeWidth={2} />
            {used.length === 1 ? "Looked one thing up" : `Looked ${used.length} things up`}
            {used.some((call) => call.ok === false) && (
              <Badge tone="danger">Something was refused</Badge>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function Ask({
  busy,
  blocked,
  onSend,
}: {
  busy: boolean;
  blocked: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  async function submit() {
    const body = text.trim();
    if (!body || busy || blocked) return;
    setText("");
    setFailed(null);
    try {
      await onSend(body);
    } catch (caught) {
      // The text goes back in the box. Losing what somebody typed because the
      // chat was busy is worse than the refusal that caused it.
      setText(body);
      setFailed(
        caught instanceof ApiError ? caught.message : "That could not be sent. Try again.",
      );
    }
  }

  return (
    <div className="mt-4">
      {failed && <p className="mb-2 text-[11.5px] text-danger">{failed}</p>}
      <div className="flex items-end gap-2 rounded-[14px] bg-panel px-3 py-1.5">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={1}
          disabled={blocked}
          placeholder={
            blocked
              ? "Answer the question above first"
              : "What is actually blocked here?"
          }
          className="max-h-32 min-h-[34px] flex-1 resize-none bg-transparent py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-4 disabled:opacity-60"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || blocked || !text.trim()}
          aria-label="Send"
          className={clsx(
            "mb-1 grid size-8 shrink-0 place-items-center rounded-full transition",
            "bg-accent text-accent-ink disabled:opacity-40",
          )}
        >
          <Send className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
