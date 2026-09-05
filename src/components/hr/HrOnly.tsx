"use client";

import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { isHrViewer } from "@/lib/hr";
import { useSession } from "@/lib/session";
import { Empty } from "@/components/ui/feedback";

/**
 * The gate on the six HR-only screens.
 *
 * The backend is the real boundary — every one of those routers depends on
 * `HRUser` — so this exists to say *why* rather than to protect anything. It
 * matters because "HR" here is not a role anybody can find on their own
 * profile: it is membership of the team named in the leave settings, which is
 * a sentence somebody has to be told rather than a permission they can work
 * out from the roles screen.
 *
 * Rendered instead of the screen rather than around it, and deliberately
 * before the page body's `useSWR` calls: firing six HR reads for somebody who
 * is not HR would put six 403s in the console and answer nothing.
 */
export function HrOnly({ children }: { children: ReactNode }) {
  const session = useSession();

  if (!isHrViewer(session)) {
    return (
      <Empty
        icon={ShieldAlert}
        title="HR only"
        body="Hiring records, staff documents and review cycles are limited to the HR team — the team named in the leave rules, not an administrator role. If that should include you, an administrator can add you to that team."
      />
    );
  }
  return <>{children}</>;
}
