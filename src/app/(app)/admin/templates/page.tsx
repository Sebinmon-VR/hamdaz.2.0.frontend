"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { LayoutList, Plus } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { humanise, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { TemplateOut, TemplateStatus, TemplateSummaryOut } from "@/lib/types";
import {
  Badge,
  PageHead,
  Panel,
  Row,
  RowHead,
  StatBox,
  type Tone,
} from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, Modal, RowsSkeleton } from "@/components/ui/feedback";

/**
 * The forms this ERP asks people to fill in, held as data rather than code.
 *
 * A template is a list of fields with types, grouped into sections, and a set
 * of grants deciding which teams and roles may use it. Changing what a form
 * asks for therefore does not need a deploy — which is the whole reason the
 * module exists.
 *
 * Only a super admin creates or changes one; who may *use* each is set per
 * template, and the backend answers that per caller with `may_use`.
 */
const STATUS: Record<TemplateStatus, { label: string; tone: Tone; hint: string }> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    hint: "Being written. Nobody can fill it in yet.",
  },
  active: {
    label: "In use",
    tone: "positive",
    hint: "Published. Whoever it is granted to can fill it in.",
  },
  archived: {
    label: "Retired",
    tone: "warn",
    hint: "Withdrawn. Existing entries keep working; nobody starts a new one.",
  },
};

export default function TemplatesPage() {
  const session = useSession();
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<TemplateSummaryOut[]>(
    withQuery("/templates", { include_archived: archived || undefined }),
  );
  // What the *reader* can fill in, which is not the same as what exists — a
  // super admin sees every template here and may be granted none of them.
  const usable = useSWR<TemplateSummaryOut[]>("/templates/usable", {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const rows = data ?? [];
  const mayEdit = session.roles.is_super_admin;

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Form templates"
        count={data ? num(rows.length) : undefined}
        actions={
          <>
            <Toggle checked={archived} onChange={setArchived} label="Show retired" />
            {mayEdit && (
              <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
                New template
              </Button>
            )}
          </>
        }
      />

      {!mayEdit && (
        <InlineNotice tone="info">
          You can read these. Creating or changing a template needs a super admin, because
          a template decides what every form in a module asks for.
        </InlineNotice>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="In use" value={num(rows.filter((t) => t.status === "active").length)} />
        <StatBox label="Draft" value={num(rows.filter((t) => t.status === "draft").length)} />
        <StatBox
          label="Never granted"
          value={num(rows.filter((t) => t.grant_count === 0).length)}
          tone={rows.some((t) => t.status === "active" && t.grant_count === 0) ? "second" : undefined}
        />
        <StatBox
          label="You can fill in"
          value={usable.data ? num(usable.data.length) : "—"}
          hint="Published templates granted to a team and role you hold."
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          icon={LayoutList}
          title="No templates yet"
          body="A template is what a form asks for — its fields, their types, and who may fill it in."
          action={
            mayEdit && (
              <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
                New template
              </Button>
            )
          }
        />
      ) : (
        <Panel className="overflow-hidden py-2">
          <RowHead>
            <span className="micro flex-1 text-ink-4">Template</span>
            <span className="micro w-28 text-ink-4">Kind</span>
            <span className="micro w-28 text-ink-4">Status</span>
            <span className="micro w-16 text-right text-ink-4">Fields</span>
            <span className="micro w-20 text-right text-ink-4">Granted</span>
          </RowHead>

          {rows.map((template) => (
            <Link key={template.id} href={`/admin/templates/${template.key}`} className="block">
              <Row className="cursor-pointer">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {template.name}
                  <span className="ml-2 font-mono text-[11px] font-normal text-ink-4">
                    {template.key}
                  </span>
                  {template.version > 1 && (
                    <span className="ml-2 text-[11px] text-ink-4">v{template.version}</span>
                  )}
                </span>
                <span className="w-28 shrink-0 truncate text-[12px] text-ink-3">
                  {humanise(template.kind)}
                </span>
                <span className="w-28 shrink-0" title={STATUS[template.status].hint}>
                  <Badge tone={STATUS[template.status].tone}>
                    {STATUS[template.status].label}
                  </Badge>
                </span>
                <span className="tnum w-16 shrink-0 text-right text-[12px] text-ink-2">
                  {template.field_count}
                </span>
                {/* A published template nobody can use is a common mistake and
                    an invisible one, so it is called out rather than counted. */}
                <span className="tnum w-20 shrink-0 text-right text-[12px]">
                  {template.grant_count === 0 && template.status === "active" ? (
                    <span className="text-second">nobody</span>
                  ) : (
                    <span className="text-ink-2">{template.grant_count}</span>
                  )}
                </span>
              </Row>
            </Link>
          ))}
        </Panel>
      )}

      <NewTemplate
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          mutate();
        }}
      />
    </>
  );
}

/* ── creating one ────────────────────────────────────────────────────── */

function NewTemplate({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("quote");
  const [description, setDescription] = useState("");

  const create = useAction(async () =>
    api.post<TemplateOut>("/templates", {
      key: key.trim(),
      name: name.trim(),
      kind,
      description: description.trim() || null,
      fields: [],
      sections: [],
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New template"
      description="Created empty and as a draft. Fields are added next, and nobody can use it until it is published."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={create.pending}
            disabled={!key.trim() || !name.trim()}
            onClick={async () => {
              if ((await create.run()) !== undefined) onCreated();
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}
        <Field label="Key" required hint="Lowercase, no spaces. What code refers to it by.">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="supplier_quote"
          />
        </Field>
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supplier quote"
          />
        </Field>
        <Field label="Kind" hint="Which part of the ERP this form belongs to.">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="quote">Quote</option>
            <option value="comparison">Comparison</option>
            <option value="leave">Leave</option>
            <option value="general">General</option>
          </Select>
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
