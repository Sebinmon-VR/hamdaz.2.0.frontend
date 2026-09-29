"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FlaskConical } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { FollowupOut, MyTasksOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Select } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

/* ── trying it on one of your own tasks ──────────────────────────────── */

/**
 * The test path. Picks one of the super admin's own tasks and asks about it
 * now, without waiting for a due date to pass. The task is only read from
 * SharePoint — nothing there is created or changed — and it must be the
 * caller's own, so a test can only ever mail the person running it.
 */
export function TryPanel() {
  const router = useRouter();
  const mine = useSWR<MyTasksOut>(withQuery("/proposals/my-tasks", { open_only: false, limit: 500 }), {
    revalidateOnFocus: false,
  });
  const [taskId, setTaskId] = useState("");
  const tasks = useMemo(
    () =>
      [...(mine.data?.tasks ?? [])].sort((a, b) =>
        Number(/test/i.test(b.title)) - Number(/test/i.test(a.title)),
      ),
    [mine.data],
  );

  // An old test task of the tester's own, chosen for them: the list puts
  // titles with "test" first, so this is "test 6" or its like.
  useEffect(() => {
    if (!taskId && tasks.length && /test/i.test(tasks[0].title)) setTaskId(tasks[0].id);
  }, [taskId, tasks]);

  const go = useAction(async () => {
    const made = await api.post<FollowupOut>("/followups/try", { task_id: taskId });
    router.push(`/followups/${made.id}`);
  });

  return (
    <Panel className="p-5">
      <PanelHead
        title="Try it on one of my tasks"
        hint="Asks you about the task now, without waiting for its due date. Nothing in SharePoint is changed."
      />
      {go.error && (
        <InlineNotice tone="danger" className="mt-3">
          {go.error}
        </InlineNotice>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Task" className="min-w-0 flex-1">
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">{mine.isLoading ? "Loading your tasks…" : "Choose one of your tasks"}</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.status ? ` — ${t.status}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="accent"
          icon={FlaskConical}
          loading={go.pending}
          disabled={!taskId}
          onClick={() => void go.run()}
        >
          Send Test
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-4">
        The email and the banner come to you. When you answer, the reason goes to the team&apos;s
        managers — or, while the testing address is set, to that address only.
      </p>
    </Panel>
  );
}
