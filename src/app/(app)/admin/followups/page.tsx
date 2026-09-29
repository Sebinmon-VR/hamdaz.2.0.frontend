"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/session";
import { PageHead } from "@/components/ui/primitives";
import { LinkButton, PillRail } from "@/components/ui/controls";
import { Empty } from "@/components/ui/feedback";
import { DigestPanel } from "@/components/followups/DigestPanel";
import { TryPanel } from "@/components/followups/TryPanel";
import {
  EmailSection,
  StatusSummary,
  TimingSection,
  WatchSection,
} from "@/components/followups/SettingsSections";

type Section = "watch" | "timing" | "emails" | "reports" | "try";

/**
 * The overdue follow-up's settings, apart from the list people answer on.
 *
 * What is on and where mail goes, at a glance; then one section at a time,
 * each saving only its own fields. Super admins only — the backend refuses
 * every change here to anybody else as well.
 */
export default function FollowupSettingsPage() {
  const session = useSession();
  const [section, setSection] = useState<Section>("watch");

  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldCheck}
        title="Super admins only"
        body="The overdue follow-up's settings are kept to super admins."
      />
    );
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Follow-up settings"
        lead="Who is asked about overdue tasks, when, and who hears the reasons."
        actions={<LinkButton href="/followups">Open overdue tasks</LinkButton>}
      />
      <StatusSummary />
      <PillRail<Section>
        value={section}
        onChange={setSection}
        options={[
          { value: "watch", label: "1 · Who is watched" },
          { value: "timing", label: "2 · When to ask" },
          { value: "emails", label: "3 · Emails & testing" },
          { value: "reports", label: "4 · Reports" },
          { value: "try", label: "Try it" },
        ]}
      />
      {section === "watch" && <WatchSection />}
      {section === "timing" && <TimingSection />}
      {section === "emails" && <EmailSection />}
      {section === "reports" && <DigestPanel />}
      {section === "try" && <TryPanel />}
    </div>
  );
}
