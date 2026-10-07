"use client";

import clsx from "clsx";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { MessagesSquare, Monitor, ShieldAlert, UserRound } from "lucide-react";
import { dateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { EmployeeHistoryOut, EmployeeMessageOut } from "@/lib/types";
import { Badge, PageHead, Panel } from "@/components/ui/primitives";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";
import { Markdown } from "@/components/assistant/Markdown";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * Everything said to and by one AI employee, person by person.
 *
 * The left column is everyone who has talked to it — in Teams or in the app —
 * most recently active first; picking one shows their conversations, and
 * picking a conversation shows it in full. Super admin only: these are other
 * people's chats, kept so what the employee says can be checked.
 */
export default function EmployeeHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const history = useSWR<EmployeeHistoryOut>(`/assistant/admin/employees/${id}/history`, {
    refreshInterval: 15000,
  });
  const [personId, setPersonId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);

  const people = history.data?.people ?? [];
  const person = people.find((p) => p.user_id === personId) ?? people[0] ?? null;
  const chat = person?.conversations.find((c) => c.id === chatId) ?? person?.conversations[0] ?? null;

  useEffect(() => setChatId(null), [personId]);

  const messages = useSWR<EmployeeMessageOut[]>(
    chat ? `/assistant/admin/employees/${id}/history/${chat.id}` : null,
    { refreshInterval: 15000 },
  );

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Chat history" />
        <Empty icon={ShieldAlert} title="Super admin only" body="Other people's chats with an AI employee are a super admin's to read." />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/assistant/employees">AI employees</Link>}
        title={history.data ? `${history.data.name} — chat history` : "Chat history"}
        count={people.length || undefined}
        lead="Everyone who has talked to this AI employee, in Teams and in the app."
      />
      <AssistantAdminNav />

      {history.error ? (
        <ErrorState error={history.error} onRetry={() => history.mutate()} />
      ) : !history.data ? (
        <PanelSkeleton lines={8} />
      ) : people.length === 0 ? (
        <Panel className="p-6">
          <Empty icon={MessagesSquare} title="Nobody has talked to them yet" body="Chats from Teams and from the Assistant screen appear here." />
        </Panel>
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_240px_minmax(0,1fr)]">
          {/* People */}
          <Panel className="overflow-hidden">
            <div className="micro border-b border-line px-4 py-2.5 text-ink-4">People</div>
            <ul className="max-h-[70vh] overflow-y-auto">
              {people.map((p) => (
                <li key={p.user_id}>
                  <button
                    type="button"
                    onClick={() => setPersonId(p.user_id)}
                    className={clsx(
                      "flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition",
                      person?.user_id === p.user_id ? "bg-accent-soft" : "hover:bg-panel-2",
                    )}
                  >
                    <UserRound className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-4">{p.email}</span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-3">
                        {p.messages} message(s) · {p.last_message_at ? dateTime(p.last_message_at) : "—"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Their conversations */}
          <Panel className="overflow-hidden">
            <div className="micro border-b border-line px-4 py-2.5 text-ink-4">Conversations</div>
            <ul className="max-h-[70vh] overflow-y-auto">
              {person?.conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setChatId(c.id)}
                    className={clsx(
                      "w-full px-4 py-2.5 text-left transition",
                      chat?.id === c.id ? "bg-accent-soft" : "hover:bg-panel-2",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Badge tone={c.channel === "teams" ? "info" : "neutral"} icon={c.channel === "teams" ? MessagesSquare : Monitor}>
                        {c.channel === "teams" ? "Teams" : "App"}
                      </Badge>
                      <span className="text-[11.5px] text-ink-4">{c.messages} msg</span>
                    </span>
                    <span className="mt-1 block text-[11.5px] text-ink-3">
                      {dateTime(c.last_message_at ?? c.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {/* The conversation */}
          <Panel className="flex min-h-[50vh] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="text-[13px] font-semibold text-ink">{person?.name}</span>
              {chat && (
                <span className="text-[11.5px] text-ink-4">
                  {chat.channel === "teams" ? "in Teams" : "in the app"} · started {dateTime(chat.created_at)}
                </span>
              )}
            </div>
            <div className="max-h-[70vh] flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.error ? (
                <ErrorState error={messages.error} onRetry={() => messages.mutate()} />
              ) : !messages.data ? (
                <PanelSkeleton lines={4} />
              ) : messages.data.length === 0 ? (
                <p className="text-[12.5px] text-ink-4">No messages in this conversation.</p>
              ) : (
                messages.data.map((m) => (
                  <div key={m.seq} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={clsx(
                        "max-w-[80%] rounded-[16px] px-3.5 py-2 text-[13px]",
                        m.role === "user" ? "rounded-br-[6px] bg-panel-2 text-ink-2" : "rounded-bl-[6px] bg-accent-soft text-ink",
                      )}
                    >
                      <div className="mb-0.5 text-[10.5px] text-ink-4">
                        {m.role === "user" ? person?.name : history.data?.name} · {dateTime(m.created_at)}
                      </div>
                      {m.role === "user" ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : <Markdown text={m.content} />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
