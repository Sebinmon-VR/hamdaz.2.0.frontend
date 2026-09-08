"use client";

/**
 * One of the team's own questions, drawn from its type alone.
 *
 * The backend says in so many words that a frontend renders a field from
 * `type` and nothing else, and this is the file that keeps that promise. The
 * types it does not draw — a repeating table, a file upload — fall back to a
 * text box rather than disappearing: an answer typed into the wrong control is
 * recoverable, a question that silently vanished from somebody's weekly report
 * is not, and it would be invisible to whoever set the template up.
 */

import type { ReportFieldOut } from "@/lib/types";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";

export function AnswerField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ReportFieldOut;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const text = value === null || value === undefined ? "" : String(value);

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

  return (
    <Field label={field.label} hint={field.help ?? undefined} required={field.required}>
      {field.type === "select" ? (
        <Select
          value={text}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea
          value={text}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-24"
        />
      ) : (
        <Input
          type={field.type === "date" ? "date" : "text"}
          inputMode={
            field.type === "number" || field.type === "currency" || field.type === "percent"
              ? "decimal"
              : undefined
          }
          value={text}
          disabled={disabled}
          placeholder={field.type === "table" || field.type === "file" ? "Type it here" : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
