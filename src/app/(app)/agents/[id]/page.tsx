"use client";

import { useParams } from "next/navigation";
import { Bot } from "lucide-react";
import { useAgents } from "@/lib/agents";
import { useSession } from "@/lib/session";
import { LinkButton } from "@/components/ui/controls";
import { Empty, ErrorState, PanelSkeleton } from "@/components/ui/feedback";
import { PageHead } from "@/components/ui/primitives";
import { AgentEditor } from "@/components/agents/AgentEditor";

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const { agents, loading, error } = useAgents(session.user.id);
  const agent = agents.find((a) => a.id === id);

  if (error) return <ErrorState error={error} />;
  if (loading) return <PanelSkeleton lines={6} />;
  if (!agent) {
    return (
      <div className="space-y-3.5">
        <PageHead eyebrow="AI agents" title="Agent not found" />
        <Empty
          icon={Bot}
          title="No agent here"
          body="It may have been deleted, or it belongs to someone else."
          action={<LinkButton href="/agents">Back to my agents</LinkButton>}
        />
      </div>
    );
  }

  // Keyed on the id so moving between agents starts the editor afresh.
  return <AgentEditor key={agent.id} initial={agent} isNew={false} />;
}
