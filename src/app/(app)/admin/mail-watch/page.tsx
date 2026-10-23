"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/session";
import { PageHead } from "@/components/ui/primitives";
import { PillRail } from "@/components/ui/controls";
import { Empty } from "@/components/ui/feedback";
import { MailsPanel, SearchPanel, SettingsPanel, TrialPanel } from "@/components/mailwatch/MailWatchPanels";
import { TeamsPanel } from "@/components/mailwatch/TeamsPanel";
import { TestTasksPanel } from "@/components/mailwatch/TestTasksPanel";

/**
 * The mail watch, for a super admin: the CEO's mails in the watched mailbox,
 * each sorted as a new tender, negotiation, general or confidential. The
 * backend refuses all of it to anybody else as well.
 */
export default function MailWatchPage() {
  const session = useSession();
  const [tab, setTab] = useState<"mails" | "tasks" | "trial" | "search">("mails");
  const [refreshKey, setRefreshKey] = useState(0);

  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldCheck}
        title="Super admins only"
        body="The mail watch reads the CEO's mail, so it is kept to super admins."
      />
    );
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Mail watch"
        lead="The CEO's mails as they arrive, sorted for presales and checked against the Proposals list: new, already assigned, a stage change, or a repeat."
      />
      <SettingsPanel onRead={() => setRefreshKey((k) => k + 1)} />
      <TeamsPanel />
      <PillRail
        options={[
          { value: "mails", label: "Mails kept" },
          { value: "tasks", label: "Test tasks" },
          { value: "trial", label: "Trial on past mail" },
          { value: "search", label: "Search Proposals" },
        ]}
        value={tab}
        onChange={setTab}
        className="w-fit"
      />
      {tab === "mails" && <MailsPanel refreshKey={refreshKey} />}
      {tab === "tasks" && <TestTasksPanel />}
      {tab === "trial" && <TrialPanel />}
      {tab === "search" && <SearchPanel />}
    </div>
  );
}
