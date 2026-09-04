"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { api, withQuery } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { QuoteLineIn, QuoteRequestOut } from "@/lib/types";
import { PageHead, Panel, PanelHead, StatBox } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, InlineNotice } from "@/components/ui/feedback";
import { EnquiryPicker } from "@/components/quotes/EnquiryPicker";

/**
 * Raising a quote, which starts from the enquiry it is for.
 *
 * A quote exists against something somebody asked for, so the enquiry list is
 * the screen rather than a blank form. Picking a row carries the title,
 * customer and bid closing date across, and — the part a blank form can never
 * do — shows which enquiries have already been quoted, so nobody raises a
 * second one against the same bid by accident.
 *
 * The blank form is still here, behind a deliberate choice, because a quote
 * occasionally has no SharePoint row behind it. It is second rather than first
 * because it is the exception, and leading with it is what made this screen
 * look like the normal way in when it is not.
 *
 * The team is a query parameter rather than a field on the body, because it
 * decides who can approve the thing later; it is picked once here and cannot
 * be changed afterwards.
 */
export default function NewQuoteRequestPage() {
  const session = useSession();
  const router = useRouter();

  const teams = session.teams.map((t) => t.team).filter((t) => !t.archived_at);
  const [manual, setManual] = useState(false);
  const [team, setTeam] = useState(teams[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [expiry, setExpiry] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [several, setSeveral] = useState(false);
  const [lines, setLines] = useState<QuoteLineIn[]>([
    { name: "", quantity: 1, rate: 0 },
  ]);

  const create = useAction(async () =>
    api.post<QuoteRequestOut>(
      withQuery("/quote-requests", { team }),
      {
        title: title.trim(),
        customer_name: customer.trim(),
        contact_person: contact.trim() || null,
        currency,
        expiry_date: expiry || null,
        subject: subject.trim() || null,
        notes: notes.trim() || null,
        multiple_supplier_quotes: several,
        // A line with no name is a row somebody started and abandoned.
        items: lines.filter((line) => line.name.trim()),
      },
    ),
  );

  const priced = lines.filter((l) => l.name.trim());

  function setLine(index: number, patch: Partial<QuoteLineIn>) {
    setLines((was) => was.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  if (teams.length === 0) {
    return (
      <>
        <PageHead eyebrow={<Link href="/quote-requests">Quote requests</Link>} title="New quote" />
        <Empty
          title="You are not in a team"
          body="A quote belongs to a team, because that is what decides who can approve it. Ask an administrator to add you to one."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow={<Link href="/quote-requests">Quote requests</Link>}
        title={manual ? "New quote, from scratch" : "New quote"}
        lead={
          manual
            ? "Nothing in SharePoint behind this one. Saved as a draft."
            : "Pick the enquiry this quote is for."
        }
        actions={
          manual && (
            <>
              <Button onClick={() => setManual(false)}>Back to the enquiries</Button>
              <Button
                variant="accent"
                loading={create.pending}
                disabled={!title.trim() || !customer.trim() || !team}
                onClick={async () => {
                  const made = await create.run();
                  if (made) router.push(`/quote-requests/${made.id}`);
                }}
              >
                Create draft
              </Button>
            </>
          )
        }
      />

      {!manual && (
        <>
          <EnquiryPicker />

          <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-3">
              Nothing here for it? A quote can be raised without an enquiry behind it, but
              then nothing links it back to SharePoint — so use this only when there really
              is no row for the work.
            </p>
            <Button onClick={() => setManual(true)}>Start a blank quote</Button>
          </Panel>
        </>
      )}

      {manual && (
      <>
      {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <Panel className="p-5">
          <PanelHead title="What and for whom" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Switchgear for the ADNOC substation"
              />
            </Field>
            <Field label="Customer" required>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </Field>
            <Field label="Contact">
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label="Team" required hint="Decides who approves it. Cannot be changed later.">
              <Select value={team} onChange={(e) => setTeam(e.target.value)}>
                {teams.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {["AED", "USD", "EUR", "GBP", "INR", "SAR"].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Valid until">
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            <Toggle
              checked={several}
              onChange={setSeveral}
              label="Several suppliers will quote for this"
              hint="Their quotes get compared side by side, and approving means naming the one that won."
            />
          </div>
        </Panel>

        <div className="space-y-3.5">
          {/* Deliberately a count, not a total. The server prices a quote and
              this screen has not created one yet, so any figure here would be
              this form's arithmetic rather than the quote's — and the two
              disagreeing on the next screen is worse than not showing it. */}
          <StatBox
            label="Lines so far"
            value={priced.length}
            hint="Totals are the server's, and appear once the draft exists."
          />
          <Panel className="p-5">
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Lines can be left empty for now — a draft with none is fine, and supplier
              quotes attached later can fill them in.
            </p>
          </Panel>
        </div>
      </div>

      <Panel className="p-5">
        <PanelHead
          title="Lines"
          count={priced.length}
          action={
            <Button
              size="sm"
              icon={Plus}
              onClick={() => setLines((was) => [...was, { name: "", quantity: 1, rate: 0 }])}
            >
              Add line
            </Button>
          }
        />

        <div className="mt-4 space-y-2">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-[14px] bg-panel-2 p-3 sm:grid-cols-[1fr_90px_120px_120px_40px]"
            >
              <Input
                value={line.name}
                onChange={(e) => setLine(index, { name: e.target.value })}
                placeholder="What is being sold"
              />
              {/* Text with a decimal keypad, not type="number": a number input
                  round-trips through a float and quietly rewrites an exact
                  decimal the server is expecting. */}
              <Input
                value={String(line.quantity)}
                inputMode="decimal"
                onChange={(e) => setLine(index, { quantity: e.target.value })}
                placeholder="Qty"
              />
              <Input
                value={String(line.rate)}
                inputMode="decimal"
                onChange={(e) => setLine(index, { rate: e.target.value })}
                placeholder="Selling price"
              />
              <Input
                value={line.cost_rate === undefined || line.cost_rate === null ? "" : String(line.cost_rate)}
                inputMode="decimal"
                onChange={(e) => setLine(index, { cost_rate: e.target.value || null })}
                placeholder="Cost price"
              />
              <button
                onClick={() => setLines((was) => was.filter((_, i) => i !== index))}
                aria-label="Remove this line"
                disabled={lines.length === 1}
                className="grid size-10 place-items-center rounded-[13px] text-ink-4 transition hover:bg-danger-soft hover:text-danger disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11.5px] text-ink-4">
          Cost price is what the supplier charges us; selling price is what the customer
          pays. Fill in the cost and the quote screen shows the margin on every line —
          which is what an approver looks at first.
        </p>
      </Panel>
      </>
      )}
    </>
  );
}
