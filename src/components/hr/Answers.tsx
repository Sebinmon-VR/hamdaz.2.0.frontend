"use client";

import clsx from "clsx";
import { Fragment } from "react";
import { date as formatDate, humanise } from "@/lib/format";
import type { TemplateFieldOut, TemplateSectionOut } from "@/lib/types";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";

/**
 * Rendering a form template's answers, read-only and editable.
 *
 * Both halves live here because the read-only view has to agree with the form
 * about what a checkbox and a date look like, and two files drift. A candidate
 * reading "true" where they wrote "yes" is the sort of small wrongness that
 * makes people stop trusting the record.
 *
 * The awkward case throughout is that the *fields are not always available*.
 * `ApplicationOut` carries `answers` and a `template_version` but no template,
 * and `ReviewOut` carries the fields only from the single-review endpoint and
 * only for the reviewer or HR. So everything here takes `fields` as possibly
 * null and degrades to the raw answer keys rather than rendering nothing —
 * a humanised key beside its value is a worse label than the real one and a
 * far better outcome than an empty panel.
 */

/** A value as a person would read it. Never "[object Object]", never "true". */
function render(value: unknown, type?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((v) => render(v)).join(", ") : "—";
  if (type === "date" && typeof value === "string") return formatDate(value);
  if (typeof value === "object") {
    // A `table` answer, or something the template grew after this was written.
    // JSON is not a nice thing to show anybody, but it is the truth and it is
    // legible, which beats hiding an answer somebody actually gave.
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function AnswerSheet({
  answers,
  fields,
  sections,
  className,
}: {
  answers: Record<string, unknown>;
  /** Null when the caller could not obtain the template. Keys are used instead. */
  fields?: TemplateFieldOut[] | null;
  sections?: TemplateSectionOut[] | null;
  className?: string;
}) {
  // Without a template there is no order to respect and no labels to use, so
  // insertion order of the stored answers is as good as it gets.
  if (!fields || fields.length === 0) {
    const entries = Object.entries(answers);
    if (entries.length === 0) return <p className="text-[13px] text-ink-3">No answers.</p>;
    return (
      <dl className={clsx("grid gap-x-8 gap-y-4 sm:grid-cols-2", className)}>
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-[11.5px] text-ink-3">{humanise(key)}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
              {render(value)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const bySection = groupBySection(fields, sections);

  return (
    <div className={clsx("space-y-6", className)}>
      {bySection.map(({ section, items }) => (
        <div key={section?.key ?? "__loose"}>
          {section && (
            <p className="micro mb-3 text-ink-4">
              {section.name}
              {section.help && <span className="ml-2 normal-case text-ink-4">{section.help}</span>}
            </p>
          )}
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {items.map((field) => {
              const value = render(answers[field.key], field.type);
              const long = field.type === "textarea" || value.length > 90;
              return (
                <div key={field.key} className={clsx("min-w-0", long && "sm:col-span-2")}>
                  <dt className="text-[11.5px] text-ink-3">{field.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                    {value}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

/**
 * The editable form.
 *
 * `value` is the whole answers object and `onChange` hands back a whole new
 * one, because a review is saved as a document rather than field by field —
 * the backend's PUT replaces `answers` wholesale, and pretending otherwise
 * here would only invite a partial save that silently drops what the caller
 * did not include.
 */
export function AnswerForm({
  fields,
  sections,
  value,
  onChange,
  disabled,
  className,
}: {
  fields: TemplateFieldOut[];
  sections?: TemplateSectionOut[] | null;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  className?: string;
}) {
  const bySection = groupBySection(fields, sections);

  function set(key: string, next: unknown) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className={clsx("space-y-7", className)}>
      {bySection.map(({ section, items }) => (
        <div key={section?.key ?? "__loose"} className="space-y-4">
          {section && (
            <div>
              <p className="text-[13px] font-semibold text-ink">{section.name}</p>
              {section.help && (
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{section.help}</p>
              )}
            </div>
          )}
          {items.map((field) => (
            <Fragment key={field.key}>
              <FieldInput
                field={field}
                value={value[field.key]}
                onChange={(next) => set(field.key, next)}
                disabled={disabled}
              />
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: TemplateFieldOut;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  // `table` and `file` are real template field types that this form genuinely
  // cannot handle: the review endpoint takes JSON and has nowhere to put an
  // upload, and a repeating grid is a screen of its own. Saying so is better
  // than rendering a text box that stores something the template did not ask
  // for — and a performance form should not be using either.
  if (field.type === "table" || field.type === "file") {
    return (
      <InlineNotice tone="warn">
        <strong>{field.label}</strong> is a {field.type} field. This screen cannot fill that
        in — a review is saved as JSON with no upload alongside it. Ask a super admin to take
        the field off the performance review template.
      </InlineNotice>
    );
  }

  if (field.type === "checkbox") {
    return (
      <Toggle
        checked={value === true}
        onChange={onChange}
        label={field.label}
        hint={field.help ?? undefined}
        disabled={disabled}
      />
    );
  }

  const common = { disabled, required: field.required };

  if (field.type === "select") {
    return (
      <Field label={field.label} hint={field.help} required={field.required}>
        <Select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          {...common}
        >
          <option value="">Not answered</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field label={field.label} hint={field.help} required={field.required}>
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      </Field>
    );
  }

  const numeric = field.type === "number" || field.type === "currency" || field.type === "percent";

  return (
    <Field label={field.label} hint={field.help} required={field.required}>
      <Input
        type={field.type === "date" ? "date" : numeric ? "number" : "text"}
        // A number field sends a number, not the string the input holds: the
        // backend scores `number` and `percent` answers by their value, and a
        // string there scores nothing at all while looking perfectly filled in.
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (!numeric) return onChange(raw);
          onChange(raw === "" ? null : Number(raw));
        }}
        step={field.type === "number" ? "any" : undefined}
        {...common}
      />
    </Field>
  );
}

/**
 * Fields in their sections, in template order, with unsectioned fields first.
 *
 * A field naming a section the template does not define is kept rather than
 * dropped — the section list is presentation and the field is an answer, and
 * losing an answer to a stale section key would be a real loss.
 */
function groupBySection(
  fields: TemplateFieldOut[],
  sections?: TemplateSectionOut[] | null,
): { section: TemplateSectionOut | null; items: TemplateFieldOut[] }[] {
  const known = new Map((sections ?? []).map((s) => [s.key, s]));
  const groups: { section: TemplateSectionOut | null; items: TemplateFieldOut[] }[] = [];
  const index = new Map<string, number>();

  for (const field of fields) {
    const key = field.section ?? "";
    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push({
        section: field.section ? (known.get(field.section) ?? fallbackSection(field.section)) : null,
        items: [],
      });
    }
    groups[index.get(key)!].items.push(field);
  }
  return groups;
}

function fallbackSection(key: string): TemplateSectionOut {
  return { key, name: humanise(key), help: null };
}
