import {
  Ban,
  Check,
  Clock,
  FileWarning,
  Handshake,
  Lock,
  MessagesSquare,
  PenLine,
  Send,
  Sparkles,
  UserCheck,
  UserSearch,
  X,
} from "lucide-react";
import { humanise } from "@/lib/format";
import type {
  HrApplicationStage,
  HrCycleStatus,
  HrOpeningStatus,
  HrReviewStatus,
} from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/primitives";

/**
 * The four HR state machines, given one colour each wherever they appear.
 *
 * Each of these is a StrEnum on the backend, so unlike the leave badges the
 * argument is typed and an unrecognised value is a compile error rather than a
 * silent neutral pill. The lookups are still written as partial records with a
 * fallback, because the backend adding a stage should degrade to a grey badge
 * rather than crash a screen that has not been redeployed.
 */

const STAGES: Record<HrApplicationStage, { tone: Tone; icon: typeof Check; label?: string }> = {
  new: { tone: "accent", icon: Sparkles, label: "New" },
  shortlisted: { tone: "info", icon: UserSearch },
  interviewed: { tone: "info", icon: MessagesSquare, label: "Interviewed" },
  offered: { tone: "second", icon: Handshake },
  hired: { tone: "positive", icon: UserCheck },
  rejected: { tone: "danger", icon: X },
  // Not a failure and not a rejection. The distinction is the whole reason the
  // backend keeps the two stages apart, so the badge keeps them apart too.
  withdrawn: { tone: "neutral", icon: Ban, label: "Withdrew" },
};

export function StageBadge({ stage }: { stage: HrApplicationStage }) {
  const spec = STAGES[stage];
  return (
    <Badge tone={spec?.tone ?? "neutral"} icon={spec?.icon}>
      {spec?.label ?? humanise(stage)}
    </Badge>
  );
}

const OPENINGS: Record<HrOpeningStatus, { tone: Tone; icon: typeof Check; label?: string }> = {
  draft: { tone: "neutral", icon: PenLine, label: "Draft" },
  open: { tone: "positive", icon: Send, label: "Posted" },
  closed: { tone: "warn", icon: Lock, label: "Closed" },
  filled: { tone: "second", icon: UserCheck, label: "Filled" },
};

export function OpeningStatusBadge({ status }: { status: HrOpeningStatus }) {
  const spec = OPENINGS[status];
  return (
    <Badge
      tone={spec?.tone ?? "neutral"}
      icon={spec?.icon}
      title={
        status === "draft"
          ? "Not posted. There is no share link yet and no candidate can reach it."
          : undefined
      }
    >
      {spec?.label ?? humanise(status)}
    </Badge>
  );
}

const CYCLES: Record<HrCycleStatus, { tone: Tone; icon: typeof Check; label?: string }> = {
  draft: { tone: "neutral", icon: PenLine, label: "Draft" },
  open: { tone: "positive", icon: PenLine, label: "Open for writing" },
  closed: { tone: "warn", icon: Lock, label: "Closed" },
};

export function CycleStatusBadge({ status }: { status: HrCycleStatus }) {
  const spec = CYCLES[status];
  return (
    <Badge tone={spec?.tone ?? "neutral"} icon={spec?.icon}>
      {spec?.label ?? humanise(status)}
    </Badge>
  );
}

const REVIEWS: Record<HrReviewStatus, { tone: Tone; icon: typeof Check; label?: string }> = {
  pending: { tone: "warn", icon: Clock, label: "Not started" },
  draft: { tone: "info", icon: PenLine, label: "In progress" },
  submitted: { tone: "positive", icon: Check },
  declined: { tone: "neutral", icon: FileWarning },
};

export function ReviewStatusBadge({ status }: { status: HrReviewStatus }) {
  const spec = REVIEWS[status];
  return (
    <Badge tone={spec?.tone ?? "neutral"} icon={spec?.icon}>
      {spec?.label ?? humanise(status)}
    </Badge>
  );
}
