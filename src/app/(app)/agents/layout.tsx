"use client";

import type { ReactNode } from "react";
import { Bot } from "lucide-react";
import { AGENTS_ENABLED } from "@/lib/features";
import { LinkButton } from "@/components/ui/controls";
import { Empty } from "@/components/ui/feedback";

/** Every /agents page, while agents are paused: a note instead of the page. */
export default function AgentsLayout({ children }: { children: ReactNode }) {
  if (AGENTS_ENABLED) return children;
  return (
    <Empty
      icon={Bot}
      title="Agents are paused"
      body="Agents are being worked on and are switched off for now. Nothing runs, drafts or sends while they are paused."
      action={<LinkButton href="/dashboard">Back to the overview</LinkButton>}
    />
  );
}
