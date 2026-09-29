"use client";

import { useSession } from "@/lib/session";
import { PageHead } from "@/components/ui/primitives";
import { Empty } from "@/components/ui/feedback";
import { BcdPanel, ReaderPanel } from "@/components/ariba/AdminPanels";
import { ShieldCheck } from "lucide-react";

/**
 * The Ariba reader's controls, for a super admin: stop and start it, see what
 * it last did, lift a block after a failed sign-in, and the BCD corrections.
 * The backend refuses every action here to anybody else as well.
 */
export default function AribaAdminPage() {
  const session = useSession();
  if (!session.roles.is_super_admin) {
    return (
      <Empty
        icon={ShieldCheck}
        title="Super admins only"
        body="The Ariba reader's settings are kept to super admins."
      />
    );
  }
  return (
    <div className="space-y-4">
      <PageHead
        eyebrow="Administration"
        title="Ariba reader"
        lead="Stop or start reading the Ariba supplier portal, and see what it last did."
      />
      <ReaderPanel />
      <BcdPanel />
    </div>
  );
}
