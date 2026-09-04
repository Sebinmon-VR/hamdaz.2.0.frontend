"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ArchiveRestore, GripVertical, Plus, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { humanise, num } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type {
  FieldType,
  TemplateFieldOut,
  TemplateOut,
  TemplateSectionOut,
} from "@/lib/types";
import { Badge, Meta, PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import {
  Button,
  ChipPicker,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/controls";
import { ErrorState, InlineNotice, Modal, PanelSkeleton } from "@/components/ui/feedback";

/**
 * One template: what it asks for, and who may fill it in.
 *
 * The two halves are edited separately because they fail separately. Fields go
 * through `PATCH /templates/{ref}` as a whole list — the backend replaces them
 * rather than diffing, so this screen keeps a local draft and sends all of it.
 * Grants go through their own `PUT`, which means a mistake in one cannot lose
 * the other.
 */
const FIELD_TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "text", label: "Text", hint: "One line" },
  { value: "textarea", label: "Long text", hint: "Several lines" },
  { value: "number", label: "Number", hint: "Any number" },
  { value: "currency", label: "Money", hint: "An amount" },
  { value: "percent", label: "Percentage", hint: "0 to 100" },
  { value: "date", label: "Date", hint: "A day" },
  { value: "checkbox", label: "Yes or no", hint: "A tick" },
  { value: "select", label: "Pick one", hint: "From a list you set" },
  { value: "table", label: "Table", hint: "Rows with columns" },
  { value: "file", label: "File", hint: "An upload" },
];

export default function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const router = useRouter();
  const [editing, setEditing] = useState<TemplateFieldOut | "new" | null>(null);

  const { data, error, isLoading, mutate } = useSWR<TemplateOut>(`/templates/${key}`);

  const publish = useAction(async () => api.post<TemplateOut>(`/templates/${key}/publish`));
  const archive = useAction(async (restore: boolean) =>
    api.post<TemplateOut>(`/templates/${key}/${restore ? "restore" : "archive"}`),
  );
  const remove = useAction(async () => api.del(`/templates/${key}`));
  const saveFields = useAction(async (fields: TemplateFieldOut[]) =>
    api.patch<TemplateOut>(`/templates/${key}`, { fields }),
  );

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading && !data) return <PanelSkeleton lines={10} />;
  if (!data) return null;

  const mayEdit = data.may_edit;
  const bySection = new Map<string | null, TemplateFieldOut[]>();
  for (const field of data.fields) {
    const list = bySection.get(field.section ?? null) ?? [];
    list.push(field);
    bySection.set(field.section ?? null, list);
  }

  async function replaceFields(next: TemplateFieldOut[]) {
    if ((await saveFields.run(next)) !== undefined) mutate();
  }

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/templates">Form templates</Link>}
        title={data.name}
        meta={`${data.key} · v${data.version}`}
        actions={
          mayEdit && (
            <>
              {data.status === "draft" && (
                <Button
                  variant="accent"
                  icon={Send}
                  loading={publish.pending}
                  onClick={async () => {
                    if ((await publish.run()) !== undefined) mutate();
                  }}
                >
                  Publish
                </Button>
              )}
              <Button
                icon={data.status === "archived" ? ArchiveRestore : Archive}
                loading={archive.pending}
                onClick={async () => {
                  if ((await archive.run(data.status === "archived")) !== undefined) mutate();
                }}
              >
                {data.status === "archived" ? "Bring back" : "Retire"}
              </Button>
            </>
          )
        }
      />

      {(publish.error || archive.error || saveFields.error || remove.error) && (
        <InlineNotice tone="danger">
          {publish.error ?? archive.error ?? saveFields.error ?? remove.error}
        </InlineNotice>
      )}

      {data.status === "active" && data.grants.length === 0 && (
        <InlineNotice tone="warn">
          This is published but granted to nobody, so no one can fill it in. Add a grant
          below.
        </InlineNotice>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatBox label="Fields" value={num(data.fields.length)} />
        <StatBox label="Sections" value={num(data.sections.length)} />
        <StatBox label="Granted to" value={num(data.grants.length)} />
        <StatBox label="Version" value={num(data.version)} />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="p-5">
          <PanelHead
            title="What it asks for"
            count={data.fields.length}
            action={
              mayEdit && (
                <Button size="sm" icon={Plus} onClick={() => setEditing("new")}>
                  Add field
                </Button>
              )
            }
          />

          {data.fields.length === 0 ? (
            <p className="mt-4 text-[13px] text-ink-3">
              No fields yet, so the form is empty. Add the first one.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {[...bySection.entries()].map(([sectionKey, fields]) => {
                const section = data.sections.find((s) => s.key === sectionKey);
                return (
                  <div key={sectionKey ?? "_"}>
                    {sectionKey && (
                      <p className="micro mb-2 text-ink-4">
                        {section?.name ?? humanise(sectionKey)}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {fields.map((field) => (
                        <FieldRow
                          key={field.key}
                          field={field}
                          mayEdit={mayEdit}
                          onEdit={() => setEditing(field)}
                          onRemove={() =>
                            replaceFields(data.fields.filter((f) => f.key !== field.key))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-3.5">
          <Panel className="p-5">
            <PanelHead title="About" />
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
              <Meta label="Kind">{humanise(data.kind)}</Meta>
              <Meta label="Status">{humanise(data.status)}</Meta>
              <Meta label="Made by">{data.created_by_name ?? "—"}</Meta>
              <Meta label="You can use it">{data.may_use ? "Yes" : "No"}</Meta>
            </dl>
            {!data.may_use && data.use_reason && (
              <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{data.use_reason}</p>
            )}
            {data.description && (
              <p className="mt-4 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-2">
                {data.description}
              </p>
            )}
          </Panel>

          <Grants template={data} mayEdit={mayEdit} onChanged={() => mutate()} />

          {mayEdit && data.status !== "active" && (
            <Panel className="p-5">
              <PanelHead title="Delete" />
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                Removes the template outright. Only possible while it has never been
                published — anything people have already filled in depends on it.
              </p>
              <Button
                variant="danger"
                icon={Trash2}
                className="mt-4"
                loading={remove.pending}
                onClick={async () => {
                  if ((await remove.run()) !== undefined) router.push("/admin/templates");
                }}
              >
                Delete this template
              </Button>
            </Panel>
          )}
        </div>
      </div>

      <FieldDialog
        target={editing}
        sections={data.sections}
        onClose={() => setEditing(null)}
        onSave={async (field) => {
          const others = data.fields.filter((f) => f.key !== field.key);
          await replaceFields(editing === "new" ? [...data.fields, field] : [...others, field]);
          setEditing(null);
        }}
      />
    </>
  );
}

/* ── one field ───────────────────────────────────────────────────────── */

function FieldRow({
  field,
  mayEdit,
  onEdit,
  onRemove,
}: {
  field: TemplateFieldOut;
  mayEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const type = FIELD_TYPES.find((t) => t.value === field.type);
  return (
    <div className="group flex items-center gap-3 rounded-[13px] bg-panel-2 px-3 py-2.5">
      <GripVertical className="size-3.5 shrink-0 text-ink-4" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">
          {field.label}
          {field.required && <span className="ml-1.5 text-second">*</span>}
        </span>
        <span className="block truncate font-mono text-[11px] text-ink-4">{field.key}</span>
      </span>
      <Badge tone="neutral">{type?.label ?? field.type}</Badge>
      {/* A field that maps to a real column fills something in; one that does
          not is only ever stored as an answer. Worth telling apart. */}
      {field.maps_to && (
        <span className="hidden font-mono text-[11px] text-ink-4 sm:block" title="Fills in this field on the real record">
          → {field.maps_to}
        </span>
      )}
      {mayEdit && (
        <span className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="h-7 rounded-lg px-2 text-[11.5px] font-medium text-ink-3 transition hover:bg-panel-3 hover:text-ink"
          >
            Edit
          </button>
          <button
            onClick={onRemove}
            aria-label={`Remove ${field.label}`}
            className="grid size-7 place-items-center rounded-lg text-ink-4 transition hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

/* ── editing a field ─────────────────────────────────────────────────── */

function FieldDialog({
  target,
  sections,
  onClose,
  onSave,
}: {
  target: TemplateFieldOut | "new" | null;
  sections: TemplateSectionOut[];
  onClose: () => void;
  onSave: (field: TemplateFieldOut) => Promise<void>;
}) {
  const existing = target !== "new" && target !== null ? target : null;
  const [seen, setSeen] = useState<string | null>(null);

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [section, setSection] = useState("");
  const [required, setRequired] = useState(false);
  const [help, setHelp] = useState("");
  const [options, setOptions] = useState("");
  const [mapsTo, setMapsTo] = useState("");
  const [saving, setSaving] = useState(false);

  const stamp = target === "new" ? "new" : (existing?.key ?? null);
  if (stamp !== seen) {
    setSeen(stamp);
    setKey(existing?.key ?? "");
    setLabel(existing?.label ?? "");
    setType(existing?.type ?? "text");
    setSection(existing?.section ?? "");
    setRequired(existing?.required ?? false);
    setHelp(existing?.help ?? "");
    setOptions((existing?.options ?? []).join("\n"));
    setMapsTo(existing?.maps_to ?? "");
  }

  const spec = FIELD_TYPES.find((t) => t.value === type);

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={existing ? `Edit ${existing.label}` : "Add a field"}
      description="Saving replaces the template's whole field list, so nothing else on it changes."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!key.trim() || !label.trim()}
            onClick={async () => {
              setSaving(true);
              await onSave({
                key: key.trim(),
                label: label.trim(),
                type,
                section: section || null,
                required,
                help: help.trim() || null,
                options:
                  type === "select"
                    ? options.split("\n").map((o) => o.trim()).filter(Boolean)
                    : null,
                default: existing?.default ?? null,
                maps_to: mapsTo.trim() || null,
                columns: existing?.columns ?? null,
              });
              setSaving(false);
            }}
          >
            Save field
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        <Field label="Label" required hint="What the person filling it in reads.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field
          label="Key"
          required
          hint={existing ? "Changing this makes it a different field." : "Lowercase, no spaces."}
        >
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
          />
        </Field>
        <Field label="Type" required hint={spec?.hint}>
          <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        {type === "select" && (
          <Field label="Choices" required hint="One per line.">
            <Textarea value={options} onChange={(e) => setOptions(e.target.value)} />
          </Field>
        )}
        {sections.length > 0 && (
          <Field label="Section" hint="Groups it on the form.">
            <Select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">No section</option>
              {sections.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Fills in"
          hint="The field on the real record this answer writes to. Leave empty and it is only stored as an answer."
        >
          <Input
            value={mapsTo}
            onChange={(e) => setMapsTo(e.target.value)}
            placeholder="customer_name"
          />
        </Field>
        <Field label="Help">
          <Input value={help} onChange={(e) => setHelp(e.target.value)} />
        </Field>
        <Toggle checked={required} onChange={setRequired} label="Must be filled in" />
      </div>
    </Modal>
  );
}

/* ── who may use it ──────────────────────────────────────────────────── */

/**
 * A grant is a team plus the roles within it. A null team means every team,
 * which is why it reads "Everyone" rather than being left blank — a blank in a
 * permission list looks like a bug even when it is the widest possible grant.
 */
function Grants({
  template,
  mayEdit,
  onChanged,
}: {
  template: TemplateOut;
  mayEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const teams = session.teams.map((t) => t.team);

  const [teamId, setTeamId] = useState("");
  const [roles, setRoles] = useState<string[]>([]);

  const save = useAction(async () =>
    api.put<TemplateOut>(`/templates/${template.key}/grants`, [
      ...template.grants.map((g) => ({
        team_id: g.team_id,
        allowed_roles: g.allowed_roles,
        note: g.note,
      })),
      { team_id: teamId || null, allowed_roles: roles, note: null },
    ]),
  );
  const drop = useAction(async (index: number) =>
    api.put<TemplateOut>(
      `/templates/${template.key}/grants`,
      template.grants
        .filter((_, i) => i !== index)
        .map((g) => ({ team_id: g.team_id, allowed_roles: g.allowed_roles, note: g.note })),
    ),
  );

  return (
    <Panel className="p-5">
      <PanelHead
        title="Who may use it"
        count={template.grants.length}
        action={
          mayEdit && (
            <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
              Grant
            </Button>
          )
        }
      />

      {(save.error || drop.error) && (
        <InlineNotice tone="danger" className="mt-3">
          {save.error ?? drop.error}
        </InlineNotice>
      )}

      {template.grants.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-3">Nobody, so nobody can fill it in.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {template.grants.map((grant, index) => (
            <li
              key={`${grant.team_id ?? "all"}-${index}`}
              className="group flex items-center gap-2.5 rounded-[13px] bg-panel-2 px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {grant.team_id === null ? "Everyone" : (grant.team_name ?? "A team")}
                </span>
                <span className="block truncate text-[11.5px] text-ink-4">
                  {grant.allowed_roles.length === 0
                    ? "any role"
                    : grant.allowed_roles.map(humanise).join(", ")}
                </span>
              </span>
              {mayEdit && (
                <button
                  onClick={async () => {
                    if ((await drop.run(index)) !== undefined) onChanged();
                  }}
                  aria-label="Remove this grant"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 opacity-0 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Grant this template"
        description="A team, and which roles inside it. Leave the roles empty to mean anyone on that team."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="accent"
              loading={save.pending}
              onClick={async () => {
                if ((await save.run()) !== undefined) {
                  setOpen(false);
                  setTeamId("");
                  setRoles([]);
                  onChanged();
                }
              }}
            >
              Grant
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-4">
          <Field label="Team" hint="Leave as Everyone to grant it across the organisation.">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Everyone</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Roles" hint="Empty means anyone on that team.">
            <ChipPicker
              selected={roles}
              onToggle={(role) =>
                setRoles((was) =>
                  was.includes(role) ? was.filter((r) => r !== role) : [...was, role],
                )
              }
              options={["manager", "lead", "member", "ceo"].map((r) => ({
                value: r,
                label: humanise(r),
              }))}
            />
          </Field>
        </div>
      </Modal>
    </Panel>
  );
}
