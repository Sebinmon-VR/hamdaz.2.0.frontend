"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Download, FileSpreadsheet, Save, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { FollowupDigestOut, FollowupSettingsOut } from "@/lib/types";
import { Badge, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Toggle } from "@/components/ui/controls";
import { InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";

const ZONES = [
  { value: "Asia/Kolkata", label: "India time" },
  { value: "Asia/Dubai", label: "UAE time" },
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Period = "day" | "week";

/**
 * The daily and weekly reports, for a super admin.
 *
 * Each has its own on/off switch in plain sight. Both go at the closing time
 * to the same people, with the same PDF and Excel: the daily one covers the
 * day and marks anybody still unanswered as "not responded"; the weekly one
 * covers the seven days to the chosen weekday and adds a per-person summary.
 */
export function DigestPanel() {
  const { data, error, mutate } = useSWR<FollowupSettingsOut>("/followups/settings", {
    revalidateOnFocus: false,
  });

  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [weekday, setWeekday] = useState(4);
  const [time, setTime] = useState("18:00");
  const [zone, setZone] = useState("Asia/Kolkata");
  const [to, setTo] = useState<string[]>([]);
  const [ceo, setCeo] = useState(false);
  const [pdf, setPdf] = useState(true);
  const [xlsx, setXlsx] = useState(true);
  const [sent, setSent] = useState<FollowupDigestOut | null>(null);

  useEffect(() => {
    if (!data) return;
    setDaily(data.digest_enabled);
    setWeekly(data.weekly_enabled);
    setWeekday(data.weekly_day);
    setTime(data.digest_time);
    setZone(data.digest_timezone);
    setTo(data.digest_recipients);
    setCeo(data.digest_include_ceo);
    setPdf(data.digest_formats.includes("pdf"));
    setXlsx(data.digest_formats.includes("xlsx"));
  }, [data]);

  const save = useAction(async (patch?: Partial<FollowupSettingsOut>) => {
    const next = await api.patch<FollowupSettingsOut>(
      "/followups/settings",
      patch ?? {
        digest_enabled: daily,
        weekly_enabled: weekly,
        weekly_day: weekday,
        digest_time: time,
        digest_timezone: zone,
        digest_recipients: to,
        digest_include_ceo: ceo,
        digest_formats: [...(pdf ? ["pdf"] : []), ...(xlsx ? ["xlsx"] : [])],
      },
    );
    await mutate(next, { revalidate: false });
  });
  const send = useAction(async (period: Period) => {
    setSent(await api.post<FollowupDigestOut>(`/followups/digest/send?period=${period}`));
    await mutate();
  });
  const download = useAction(async (format: "pdf" | "xlsx", period: Period) => {
    await api.download(
      `/followups/digest/file?format=${format}&period=${period}`,
      `${period === "week" ? "weekly" : "end-of-day"}-report.${format}`,
    );
  });

  if (error) return null;
  if (!data) return <PanelSkeleton lines={5} />;

  const zoneLabel = ZONES.find((z) => z.value === data.digest_timezone)?.label ?? data.digest_timezone;

  /** The on/off switch, saved the moment it is flipped — no Save needed. */
  function flip(key: "digest_enabled" | "weekly_enabled", next: boolean) {
    if (key === "digest_enabled") setDaily(next);
    else setWeekly(next);
    void save.run({ [key]: next } as Partial<FollowupSettingsOut>);
  }

  return (
    <Panel className="p-5">
      <PanelHead
        title="Reports"
        hint="The day's and the week's tasks and reasons, as PDF and Excel. Super admin only."
        action={
          <Button
            variant="accent"
            icon={Save}
            loading={save.pending}
            disabled={!pdf && !xlsx}
            onClick={() => void save.run()}
          >
            Save
          </Button>
        }
      />
      {(save.error || send.error || download.error) && (
        <InlineNotice tone="danger" className="mt-3">
          {save.error ?? send.error ?? download.error}
        </InlineNotice>
      )}
      {data.digest_last_error && (
        <InlineNotice tone="warn" className="mt-3">
          The last report said: {data.digest_last_error}
        </InlineNotice>
      )}
      {sent && (
        <InlineNotice tone={sent.sent ? "positive" : "warn"} className="mt-3">
          {sent.sent
            ? `${sent.period === "week" ? "Weekly" : "Daily"} report sent to ${sent.recipients.join(", ")}: ${sent.submitted} submitted, ${sent.not_submitted} not submitted. A test send marks nobody as "not responded".`
            : (sent.error ?? "Not sent.")}
        </InlineNotice>
      )}

      {/* The two reports side by side, each with its switch where it is seen. */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <ReportCard
          title="End-of-day report"
          on={daily}
          onToggle={(next) => flip("digest_enabled", next)}
          when={`Every day at ${data.digest_time} ${zoneLabel}`}
          last={data.digest_last_sent_on}
          busy={download.pending || send.pending}
          onDownload={(format) => void download.run(format, "day")}
          onSend={() => void send.run("day")}
        />
        <ReportCard
          title="Weekly report"
          on={weekly}
          onToggle={(next) => flip("weekly_enabled", next)}
          when={`Every ${WEEKDAYS[data.weekly_day] ?? "Friday"} at ${data.digest_time} ${zoneLabel}, for the 7 days to then`}
          last={data.weekly_last_sent_on}
          busy={download.pending || send.pending}
          onDownload={(format) => void download.run(format, "week")}
          onSend={() => void send.run("week")}
        >
          <Field label="Sent on">
            <Select value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </ReportCard>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Closing time" hint="For both reports.">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <Select value={zone} onChange={(e) => setZone(e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="space-y-3">
            <Toggle checked={pdf} onChange={setPdf} label="Attach a PDF" />
            <Toggle checked={xlsx} onChange={setXlsx} label="Attach an Excel workbook" />
          </div>
        </div>
        <div className="space-y-4">
          <Field
            label="Send to"
            hint="Gets the reports, and every reason as it is given. Sebin while it is being tried out."
          >
            <RecipientList addresses={to} onChange={setTo} />
          </Field>
          <Toggle
            checked={ceo}
            onChange={setCeo}
            label="Also send to the CEO"
            hint="Whoever holds the CEO role — Jishad: the reports, and each reason with the managers and approvers. Leave off until the trial is done."
          />
          <p className="text-[12px] text-ink-3">
            Goes to: <b>{data.digest_to.length ? data.digest_to.join(", ") : "nobody yet"}</b>
          </p>
        </div>
      </div>
    </Panel>
  );
}

function ReportCard({
  title,
  on,
  onToggle,
  when,
  last,
  busy,
  onDownload,
  onSend,
  children,
}: {
  title: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  when: string;
  last: string | null;
  busy: boolean;
  onDownload: (format: "pdf" | "xlsx") => void;
  onSend: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-line p-4">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold">{title}</span>
        <Badge tone={on ? "positive" : "neutral"}>{on ? "On" : "Off"}</Badge>
        <div className="ml-auto">
          <Toggle checked={on} onChange={onToggle} label="" />
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">
        {on ? when : "Switched off — nothing is sent."}
        {last ? ` Last sent for ${last}.` : ""}
      </p>
      {children && <div className="mt-3">{children}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={Download} disabled={busy} onClick={() => onDownload("pdf")}>
          Download PDF
        </Button>
        <Button size="sm" icon={FileSpreadsheet} disabled={busy} onClick={() => onDownload("xlsx")}>
          Download Excel
        </Button>
        <Button size="sm" icon={Send} disabled={busy} onClick={onSend}>
          Send Test
        </Button>
      </div>
    </div>
  );
}
