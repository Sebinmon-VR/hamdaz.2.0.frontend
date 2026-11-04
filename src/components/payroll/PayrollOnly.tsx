"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { Empty, InlineNotice } from "@/components/ui/feedback";

/**
 * Why there is no "add" or "start" button, said where the button would be.
 *
 * Reading payroll and changing it are different permissions — the Accounts
 * team and the CEO read without processing — so somebody who can see the list
 * is told why they cannot add to it, and where that is decided.
 */
export function NotProcessorNotice({ doing }: { doing: string }) {
  const { payroll } = useSession();
  if (payroll.can_process) return null;
  return (
    <InlineNotice tone="info">
      You can read payroll but not change it: only payroll processors and super admins can{" "}
      {doing}. A super admin names the processors on{" "}
      <Link className="font-semibold underline" href="/payroll/access">
        Payroll access
      </Link>
      .
    </InlineNotice>
  );
}

/**
 * The gate on every payroll screen.
 *
 * The backend is the boundary — every payroll route checks the same rules —
 * so this exists to say *why* before six requests come back 403. Payroll is
 * not a module a team is granted, so "ask for the module" would be the wrong
 * advice; the right one names the four ways in.
 */
export function PayrollOnly({ children }: { children: ReactNode }) {
  const { payroll } = useSession();
  if (!payroll.can_view) {
    return (
      <Empty
        icon={ShieldAlert}
        title="Payroll is restricted"
        body="Payroll is open to the Accounts team, the super admins, the CEO, and people a super admin has added to the payroll access list. If you need it, ask a super admin."
      />
    );
  }
  return <>{children}</>;
}
