"use client";

import { Check, ShieldAlert, X } from "lucide-react";
import { humanise } from "@/lib/format";
import { moduleOf } from "@/lib/assistant";
import type { PendingActionOut } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { ArgumentList } from "@/components/assistant/ToolTrace";

/**
 * The one moment the assistant stops and asks.
 *
 * A write the policy says must be confirmed parks the whole turn: the run is
 * held as `awaiting_confirmation`, nothing has happened yet, and the loop picks
 * up from exactly this point once somebody answers. So this card is not a
 * courtesy dialog over an action already taken — it is the action, and until it
 * is answered the chat cannot go on.
 *
 * That is why it shows the arguments in full rather than the model's summary of
 * them. The sentence above the card is the assistant's account of what it is
 * about to do; the list is what will actually be sent, and where those two
 * disagree the list is the one that is true.
 *
 * **Declining is not an error.** The model is told the person said no and gets
 * to answer that, so both buttons continue the conversation and neither ends it.
 */
export function ConfirmCard({
  actions,
  onRespond,
  pending,
}: {
  actions: PendingActionOut[];
  onRespond: (approved: boolean) => void;
  pending?: boolean;
}) {
  const many = actions.length > 1;

  return (
    <div className="rise overflow-hidden rounded-[20px] bg-panel-2 ring-1 ring-warn/35">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
          <ShieldAlert className="size-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">
            {many ? `Approve ${actions.length} actions?` : "Approve this action?"}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Nothing has been changed yet. {many ? "These are" : "This is"} written to the
            system as you, through the same checks that apply when you do it yourself.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2 px-4">
        {actions.map((action) => (
          <li key={action.call_id} className="rounded-[13px] bg-panel p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {action.label}
              </p>
              <Badge tone="neutral">{humanise(moduleOf(action.tool_key))}</Badge>
              <Badge tone="warn">Write</Badge>
            </div>

            {/* The catalogue's own warning for this tool, where it has one —
                the backend writes these for the person deciding, not for the
                model, so it is shown as written. */}
            {action.warning && (
              <p className="mt-2.5 rounded-[9px] bg-warn-soft px-3 py-2 text-[11.5px] leading-relaxed text-warn">
                {action.warning}
              </p>
            )}

            <div className="mt-3">
              <p className="micro mb-1.5 text-ink-4">What will be sent</p>
              <ArgumentList args={action.arguments} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3.5 flex items-center justify-end gap-2 bg-panel px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          disabled={pending}
          onClick={() => onRespond(false)}
        >
          No, don&rsquo;t
        </Button>
        <Button
          size="sm"
          variant="accent"
          icon={Check}
          loading={pending}
          onClick={() => onRespond(true)}
        >
          {many ? "Go ahead with all" : "Go ahead"}
        </Button>
      </div>
    </div>
  );
}
