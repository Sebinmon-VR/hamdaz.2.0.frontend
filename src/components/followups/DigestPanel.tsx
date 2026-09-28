"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Download, FileSpreadsheet, Save, Send } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { FollowupDigestOut, FollowupSettingsOut } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Toggle } from "@/components/ui/controls";
import { InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { RecipientList } from "@/components/reports/RecipientList";

const ZONES = [
  { value: "Asia/Kolkata", label: "India time" },
  { value: "Asia/Dubai", label: "UAE time" },
];

/**
 * The end-of-day report, for a super admin.
 *
 * Once a day at the closing time the day's tasks — submitted and not — and
 * every reason asked for go to the CEO as one mail with a PDF and an Excel
 * file. Anybody still unanswered by then is marked "not responded". While it
 * is tried out it goes to the named addresses only; the CEO switch adds
 * whoever holds the CEO role.
 */
export function DigestPanel() {
  const { data, error, mutate } = useSWR<FollowupSettingsOut>("/followups/settings", {
    revalidateOnFocus: false,
  });

  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState("18:00");
  const [zone, setZone] = useState("Asia/Kolkata");
  const [to, setTo] = useState<string[]>([]);
  const [ceo, setCeo] = useState(false);
  const [pdf, setPdf] = useState(true);
  const [xlsx, setXlsx] = useState(true);
  const [sent, setSent] = useState<FollowupDigestOut | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.digest_enabled);
    setTime(data.digest_time);
    setZone(data.digest_timezone);
    setTo(data.digest_recipients);
    setCeo(data.digest_include_ceo);
    setPdf(data.digest_formats.includes("pdf"));
    setXlsx(data.digest_formats.includes("xlsx"));
  }, [data]);

  const save = useAction(async () => {
    const next = await api.patch<FollowupSettingsOut>("/followups/settings", {
      digest_enabled: enabled,
      digest_time: time,
      digest_timezone: zone,
      digest_recipients: to,
      digest_include_ceo: ceo,
      digest_formats: [...(pdf ? ["pdf"] : []), ...(xlsx ? ["xlsx"] : [])],
    });
    await mutate(next, { revalidate: false });
  });
  const send = useAction(async () => {
    setSent(await api.post<FollowupDigestOut>("/followups/digest/send"));
    await mutate();
  });
  const download = useAction(async (format: "pdf" | "xlsx") => {
    await api.download(
      `/followups/digest/file?format=${format}`,
      `end-of-day-report.${format}`,
    );
  });

  if (error) return null;
  if (!data) return <PanelSkeleton lines={5} />;

  const zoneLabel = ZONES.find((z) => z.value === data.digest_timezone)?.label ?? data.digest_timezone;

  return (
    <Panel className="p-5">
      <PanelHead
        title="End-of-day report"
        hint="One mail to the CEO with the day's tasks and reasons, as PDF and Excel. Super admin only."
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
            ? `Sent to ${sent.recipients.join(", ")}: ${sent.submitted} submitted, ${sent.not_submitted} not submitted, ${sent.lines} reasons asked. Nobody was marked "not responded" — that happens only at the closing time.`
            : (sent.error ?? "Not sent.")}
        </InlineNotice>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Send the report every day"
            hint={`At the closing time, anybody who has not given a reason is marked "not responded".`}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Closing time">
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
          <Field label="Send to" hint="Sebin while it is being tried out.">
            <RecipientList addresses={to} onChange={setTo} />
          </Field>
          <Toggle
            checked={ceo}
            onChange={setCeo}
            label="Also send to the CEO"
            hint="Whoever holds the CEO role — Jishad. Leave off until the trial is done."
          />
          <p className="text-[12px] text-ink-3">
            Goes to: <b>{data.digest_to.length ? data.digest_to.join(", ") : "nobody yet"}</b>
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button icon={Download} loading={download.pending} onClick={() => void download.run("pdf")}>
          Today&apos;s PDF
        </Button>
        <Button icon={FileSpreadsheet} loading={download.pending} onClick={() => void download.run("xlsx")}>
          Today&apos;s Excel
        </Button>
        <Button icon={Send} loading={send.pending} onClick={() => void send.run()}>
          Send today&apos;s report now
        </Button>
        <span className="ml-auto text-[11.5px] text-ink-4">
          {data.digest_last_sent_on
            ? `Last sent for ${data.digest_last_sent_on}. Next at ${data.digest_time} ${zoneLabel}.`
            : `First report at ${data.digest_time} ${zoneLabel}.`}
          {data.last_run_at ? ` Checked ${dateTime(data.last_run_at)}.` : ""}
        </span>
      </div>
    </Panel>
  );
}
