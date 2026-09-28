"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { AlarmClock } from "lucide-react";
import type { FollowupOut } from "@/lib/types";

/**
 * The reason is not optional, so the question does not go away.
 *
 * Shown above every screen for as long as the signed-in person has a
 * follow-up waiting on them, and gone the moment they answer it or mark it a
 * false positive. An email can be archived and a notification read; this is
 * what makes answering the only way to clear it.
 *
 * Hidden on the form itself, where it would only point at the page already open.
 */
export function OverdueBanner() {
  const pathname = usePathname();
  const { data } = useSWR<FollowupOut[]>("/followups/mine", {
    revalidateOnFocus: true,
    refreshInterval: 120_000,
    shouldRetryOnError: false,
  });
  const waiting = (data ?? []).filter((row) => row.may_answer);
  if (waiting.length === 0 || pathname.startsWith("/followups/")) return null;

  const first = waiting[0];
  return (
    <Link
      href={waiting.length === 1 ? `/followups/${first.id}` : "/followups"}
      className="flex items-center gap-3 rounded-[16px] bg-warn-soft px-4 py-2.5 text-[12.5px] text-warn transition hover:brightness-95"
    >
      <AlarmClock className="size-4 shrink-0" strokeWidth={2.2} />
      <span className="min-w-0 flex-1 truncate">
        {waiting.length === 1
          ? `“${first.task_title}” is past its due date and not submitted. Give the reason, or mark it a false positive if you have already updated it.`
          : `${waiting.length} of your tasks are past their due date and need a reason.`}
      </span>
      <span className="shrink-0 font-semibold">Submit Reason</span>
    </Link>
  );
}
