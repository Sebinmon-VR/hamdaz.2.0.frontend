"use client";

/**
 * Reading workflows and their runs.
 *
 * Everything on `/workflows` is scoped by the backend to runs the viewer owns
 * or their team's — an admin sees everybody's — so nothing here passes a user
 * id and nothing here could. The admin routes are super admin only and refuse
 * with a sentence; the screens show that sentence rather than guessing at it.
 *
 * The one hook with a clock is `useRun`. A run that is running or waiting on
 * something outside changes without anybody on this side doing anything — a
 * supplier replies, a poll finds the quote approved — so the screen asks
 * again every fifteen seconds while that is true, and stops the moment the
 * run is waiting on the person reading it or has finished. Polling a run that
 * cannot move is a request that cannot tell you anything.
 */

import useSWR from "swr";
import {
  Bell,
  Bot,
  FileSearch,
  Hourglass,
  Mail,
  MailOpen,
  MessageCircleQuestion,
  Paperclip,
  ReceiptText,
  Route,
  Scale,
  ScanSearch,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { withQuery } from "@/lib/api";
import type {
  BlocksOut,
  WorkflowRunOut,
  WorkflowRunStatus,
  RunStepState,
  WorkflowRunSummaryOut,
  TaskRunsOut,
  WorkflowOut,
  WorkflowSettingsOut,
} from "@/lib/types";
import type { Tone } from "@/components/ui/primitives";

/* ── reading ─────────────────────────────────────────────────────────── */

/** The flows this person may start. */
export function useWorkflows() {
  return useSWR<WorkflowOut[]>("/workflows");
}

export interface RunsQuery {
  /** Only runs I own. Off means mine and my teams' — everybody's for an admin. */
  mine?: boolean;
  /** Only runs still going. */
  open?: boolean;
  /** A flow key. */
  workflow?: string;
  limit?: number;
}

export function useRuns(params: RunsQuery = {}) {
  return useSWR<WorkflowRunSummaryOut[]>(
    withQuery("/workflows/runs", {
      mine: params.mine || undefined,
      open: params.open || undefined,
      workflow: params.workflow || undefined,
      limit: params.limit ?? 200,
    }),
  );
}

/** True while the run can change without anybody on this screen acting. */
export function movesOnItsOwn(status: string | undefined): boolean {
  return status === "running" || status === "waiting_event";
}

export function useRun(id: string | null) {
  return useSWR<WorkflowRunOut>(id ? `/workflows/runs/${id}` : null, {
    // A function rather than a number, so the polling switches itself off
    // the moment the run stops on the person or finishes.
    refreshInterval: (latest) => (movesOnItsOwn(latest?.status) ? 15_000 : 0),
    // A revalidation halfway through somebody typing an answer would not
    // lose their typing — the answer form keeps its own state — but it would
    // be a request for nothing while the run is waiting on them anyway.
    revalidateOnFocus: false,
  });
}

/** What a task can run, and what is already running on it. */
export function useTaskRuns(taskId: string | null) {
  return useSWR<TaskRunsOut>(taskId ? `/workflows/for-task/${encodeURIComponent(taskId)}` : null);
}

/* ── administration ──────────────────────────────────────────────────── */

/** The blocks and the routes they may call. Code, so it never goes stale. */
export function useWorkflowBlocks() {
  return useSWR<BlocksOut>("/workflows/admin/blocks", {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
  });
}

export function useWorkflowSettings() {
  return useSWR<WorkflowSettingsOut>("/workflows/admin/settings", { revalidateOnFocus: false });
}

/** Every flow, archived ones included. */
export function useAdminFlows() {
  return useSWR<WorkflowOut[]>("/workflows/admin/flows");
}

export function useAdminFlow(key: string | null) {
  return useSWR<WorkflowOut>(key ? `/workflows/admin/flows/${encodeURIComponent(key)}` : null, {
    // The builder holds a draft; a background refetch replacing the base under
    // it is exactly what the draft's stamp is there to detect, and there is no
    // reason to trigger that by alt-tabbing.
    revalidateOnFocus: false,
  });
}

/* ── words and colours ───────────────────────────────────────────────── */

export const RUN_STATUS: Record<WorkflowRunStatus, { label: string; tone: Tone; hint: string }> = {
  running: {
    label: "Running",
    tone: "info",
    hint: "Working through its steps. Nothing is needed from you right now.",
  },
  waiting_user: {
    label: "Waiting on you",
    tone: "second",
    hint: "Stopped on a question only you can answer.",
  },
  waiting_event: {
    label: "Waiting on the world",
    tone: "warn",
    hint: "Stopped on something outside — a supplier's reply, an approval. It checks on its own.",
  },
  completed: { label: "Done", tone: "positive", hint: "Every step finished." },
  failed: {
    label: "Failed",
    tone: "danger",
    hint: "A step went wrong. It can be tried again from where it stopped.",
  },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "Stopped by a person." },
};

/** Tolerates a status this build has never heard of rather than crashing on it. */
export function runStatus(status: string) {
  return (
    RUN_STATUS[status as WorkflowRunStatus] ?? {
      label: status.replace(/_/g, " "),
      tone: "neutral" as Tone,
      hint: "",
    }
  );
}

export function isOpenRun(status: string): boolean {
  return status === "running" || status === "waiting_user" || status === "waiting_event";
}

export const STEP_STATE: Record<RunStepState, { label: string; tone: Tone }> = {
  pending: { label: "Not yet", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  waiting: { label: "Waiting", tone: "second" },
  done: { label: "Done", tone: "positive" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export function stepState(state: string) {
  return STEP_STATE[state as RunStepState] ?? { label: state, tone: "neutral" as Tone };
}

/** One icon per block kind, for the timeline and the builder. */
const STEP_ICON: Record<string, LucideIcon> = {
  documents: FileSearch,
  ask_user: MessageCircleQuestion,
  extract: ScanSearch,
  agent: Bot,
  email: Mail,
  wait_email: MailOpen,
  compare: Scale,
  endpoint: Route,
  wait_status: Hourglass,
  notify: Bell,
  zoho_create: ReceiptText,
  sharepoint_attach: Paperclip,
};

export function stepIcon(kind: string): LucideIcon {
  return STEP_ICON[kind] ?? Workflow;
}

export const MESSAGE_STATE: Record<string, { label: string; tone: Tone }> = {
  held: { label: "Held", tone: "warn" },
  sent: { label: "Sent", tone: "positive" },
  failed: { label: "Failed", tone: "danger" },
  received: { label: "Received", tone: "info" },
};

export const FILE_SOURCE: Record<string, { label: string; tone: Tone }> = {
  sharepoint: { label: "From the task", tone: "neutral" },
  upload: { label: "Uploaded", tone: "info" },
  email: { label: "From a reply", tone: "second" },
  zoho: { label: "From Zoho", tone: "positive" },
};

export const TRIGGER_LABEL: Record<string, string> = {
  manual: "Started by hand",
  task_assigned: "When a task is assigned",
};
