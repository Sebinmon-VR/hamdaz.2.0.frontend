"use client";

import { useState } from "react";
import useSWR from "swr";
import { Eye } from "lucide-react";
import { humanise } from "@/lib/format";
import type { TemplateOut } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";
import { InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";
import { AnswerForm } from "@/components/hr/Answers";

/**
 * What a form actually asks, before anybody commits to it.
 *
 * HR now chooses between several forms of a kind — a short application beside
 * a technical one, a probation review beside the annual one — and the choice
 * is not reversible in any useful sense: once candidates have applied or
 * reviewers have written, changing the form would orphan their answers. A
 * name and a question count are not enough to choose on.
 *
 * The preview is the real form, rendered disabled, rather than a list of field
 * labels. Anything less would be a description of the form rather than the
 * form, and the whole question being asked here is "what will this look like
 * to the person who has to fill it in".
 *
 * `/hr/meta` carries only each template's name, count and tags — the fields
 * live on the template itself — so this fetches the template, and only once
 * the viewer opens it. Nobody pays for a preview they did not ask for.
 */
export function TemplatePreview({
  templateId,
  label = "Preview form",
  tags,
}: {
  templateId: string | null | undefined;
  /** The trigger's wording, since the caller knows whose form it is. */
  label?: string;
  /**
   * The competencies this form scores, when the caller already knows them.
   *
   * Passed in rather than derived here: a tag lives inside a field's `scoring`
   * block, and which blocks count is the backend's rule — it skips any that no
   * longer validate. `/hr/meta` has already applied that rule, so re-deriving
   * it in the browser could only ever disagree with the scores people see.
   */
  tags?: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" icon={Eye} onClick={() => setOpen(true)} disabled={!templateId}>
        {label}
      </Button>
      <PreviewModal
        templateId={templateId}
        tags={tags}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function PreviewModal({
  templateId,
  tags,
  open,
  onClose,
}: {
  templateId: string | null | undefined;
  tags?: string[];
  open: boolean;
  onClose: () => void;
}) {
  // Null key until it is opened: SWR treats that as "do not fetch", which is
  // what keeps this free for everyone who never opens it.
  const { data, error, isLoading } = useSWR<TemplateOut>(
    open && templateId ? `/templates/${templateId}` : null,
    { revalidateOnFocus: false },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={data ? data.name : "Form preview"}
      description={
        data
          ? `${data.fields.length} questions · version ${data.version}`
          : "The questions this form asks."
      }
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {error ? (
        <InlineNotice tone="warn">This form could not be read.</InlineNotice>
      ) : isLoading || !data ? (
        <PanelSkeleton lines={8} />
      ) : (
        <div className="space-y-5 pb-4">
          {data.description && (
            <p className="text-[13px] leading-relaxed text-ink-3">{data.description}</p>
          )}

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="micro text-ink-4">Scores</span>
              {tags.map((tag) => (
                <Badge key={tag} tone="neutral">
                  {humanise(tag)}
                </Badge>
              ))}
            </div>
          )}

          {/* Disabled, and empty. This is a preview of the questions, not a
              draft answer — letting somebody type into it would invite them to
              believe they had filled the form in. */}
          <AnswerForm
            fields={data.fields}
            sections={data.sections}
            value={{}}
            onChange={() => {}}
            disabled
          />
        </div>
      )}
    </Modal>
  );
}
