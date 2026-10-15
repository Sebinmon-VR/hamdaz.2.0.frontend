"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TEMPLATES, blankAgent, stepsFromTemplate, type Agent } from "@/lib/agents";
import { PanelSkeleton } from "@/components/ui/feedback";
import { AgentEditor } from "@/components/agents/AgentEditor";

export default function NewAgentPage() {
  return (
    // useSearchParams needs a Suspense boundary above it or the whole route
    // drops out of static rendering at build time.
    <Suspense fallback={<PanelSkeleton lines={6} />}>
      <NewAgent />
    </Suspense>
  );
}

function NewAgent() {
  const params = useSearchParams();
  // Made once: the avatar is random, and a re-render must not re-roll it.
  const [initial] = useState<Agent>(() => {
    const agent = blankAgent();
    const template = TEMPLATES.find((t) => t.key === params.get("template"));
    if (!template) return agent;
    return { ...agent, role: template.role, instructions: template.instructions, steps: stepsFromTemplate(template) };
  });
  return <AgentEditor initial={initial} isNew />;
}
