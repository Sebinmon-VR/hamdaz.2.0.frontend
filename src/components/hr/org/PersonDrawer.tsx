"use client";

import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import {
  MAX_BIO,
  MAX_SKILLS,
  OFFICE_LABEL,
  POSITION_LABEL,
  RING,
  photoUrl,
  teamLabel,
  teamsInOrder,
  toInput,
  type OrgColour,
  type OrgOffice,
  type OrgPerson,
  type OrgPersonIn,
  type OrgPosition,
  type OrgTeam,
} from "@/lib/org";
import { Toggle } from "@/components/ui/controls";
import { Drawer } from "@/components/payroll/Drawer";
import { AreaBox, Btn, Labeled, Note, SelectBox, TextBox } from "@/components/payroll/ui";
import { CutoutStudio } from "./CutoutStudio";
import { Face } from "./Face";

/** What a new face starts with: from a member of staff, or blank for someone who is not. */
export interface NewFace {
  user_id: string | null;
  name: string;
  title: string;
  office: OrgOffice;
  team_id?: string | null;
  position?: OrgPosition;
}

/**
 * One face on the chart: what the website says about them, and their photo.
 * Used from the Organisation page and from a member of staff's record.
 */
export function PersonDrawer({
  person,
  fresh,
  teams,
  onClose,
  onSaved,
}: {
  person?: OrgPerson;
  fresh?: NewFace;
  teams: OrgTeam[];
  onClose: () => void;
  onSaved: (person: OrgPerson | null) => void;
}) {
  const start: OrgPersonIn = person
    ? toInput(person)
    : {
        name: fresh?.name ?? "",
        title: fresh?.title ?? "",
        team_id: fresh?.team_id ?? null,
        position: fresh?.position ?? "member",
        office: fresh?.office ?? "AE",
        colour: "blue",
        bio: null,
        skills: [],
        linkedin_url: null,
        on_website: true,
        consent: false,
      };
  const [form, setForm] = useState<OrgPersonIn>(start);
  const [current, setCurrent] = useState<OrgPerson | undefined>(person);
  const [studio, setStudio] = useState(false);
  const set = <K extends keyof OrgPersonIn>(k: K, v: OrgPersonIn[K]) => setForm((f) => ({ ...f, [k]: v }));
  const skills = [...form.skills, "", "", ""].slice(0, MAX_SKILLS);

  const body = (): OrgPersonIn => ({
    ...form,
    name: form.name.trim(),
    title: form.title.trim(),
    team_id: form.position === "md" ? null : form.team_id,
    bio: form.bio?.trim() || null,
    skills: form.skills.map((s) => s.trim()).filter(Boolean),
    linkedin_url: form.linkedin_url?.trim() || null,
  });

  const save = useAction(async () => {
    const saved = current
      ? await api.put<OrgPerson>(`/hr/org/people/${current.id}`, body())
      : await api.post<OrgPerson>("/hr/org/people", { ...body(), user_id: fresh?.user_id ?? null });
    setCurrent(saved);
    return saved;
  });
  const remove = useAction(async () => {
    await api.del<void>(`/hr/org/people/${current?.id}`);
    return true;
  });
  const dropPhoto = useAction(async () => {
    const saved = await api.del<OrgPerson>(`/hr/org/people/${current?.id}/photo`);
    setCurrent(saved);
    return saved;
  });

  async function upload(original: File, cutout: Blob): Promise<boolean> {
    let target = current;
    if (!target) {
      // A new face: save the details first, so the photo has somebody to belong to.
      target = await save.run();
      if (!target) return false;
    }
    const data = new FormData();
    data.append("original", original, original.name || "photo.jpg");
    data.append("cutout", cutout, "cutout.webp");
    const saved = await api.upload<OrgPerson>(`/hr/org/people/${target.id}/photo`, data);
    setCurrent(saved);
    return true;
  }

  const canSave = form.name.trim().length > 0 && (form.position === "md" || form.team_id !== null);

  return (
    <>
      <Drawer
        open
        wide
        onClose={onClose}
        title={current ? current.name : fresh?.user_id ? `Add ${fresh.name} to the chart` : "Add someone to the chart"}
        subtitle={
          current?.user_email
            ? `Staff · ${current.user_email}`
            : fresh?.user_id
              ? "From their staff record"
              : current
                ? "Not on staff"
                : "Someone who is not on staff, such as a consultant"
        }
        footer={
          <>
            <Btn
              type="button"
              variant="accent"
              loading={save.pending}
              disabled={!canSave}
              onClick={async () => {
                const saved = await save.run();
                if (saved) onSaved(saved);
              }}
            >
              {current ? "Save" : "Add to the chart"}
            </Btn>
            <Btn type="button" onClick={() => onSaved(current ?? null)}>
              {current ? "Close" : "Cancel"}
            </Btn>
            {current && (
              <Btn
                type="button"
                variant="danger"
                icon={Trash2}
                className="ml-auto"
                loading={remove.pending}
                onClick={async () => {
                  if (!window.confirm(`Take ${current.name} off the chart? Their photo goes too.`)) return;
                  if (await remove.run()) onSaved(null);
                }}
              >
                Remove
              </Btn>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {/* the photo */}
          <div className="flex items-center gap-5 rounded-lg border border-line bg-[#f2f1ed] p-4 pt-9">
            <Face
              src={current?.has_photo ? photoUrl(current, "cutout") : null}
              name={form.name || "?"}
              colour={form.colour}
              size={92}
              gap="#f2f1ed"
            />
            {current?.has_photo && (
              <a href={photoUrl(current, "original")} target="_blank" rel="noreferrer" title="The original photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated API image */}
                <img src={photoUrl(current, "original")} alt="Original" className="h-24 w-auto rounded-md border border-line object-cover" />
              </a>
            )}
            <div className="ml-auto flex flex-col items-end gap-2">
              <Btn type="button" icon={Camera} onClick={() => setStudio(true)} disabled={!form.name.trim()}>
                {current?.has_photo ? "Change photo" : "Add photo"}
              </Btn>
              {current?.has_photo && (
                <button
                  type="button"
                  className="text-[12px] text-ink-4 hover:text-danger"
                  onClick={async () => {
                    if (window.confirm("Remove the photo and its cut-out?")) await dropPhoto.run();
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
          {!current && (
            <p className="-mt-2 text-[11.5px] text-ink-4">Adding a photo saves these details first.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Name on the website" required>
              <TextBox maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={!current} />
            </Labeled>
            <Labeled label="Title" hint="As the public should read it, e.g. Head of Projects.">
              <TextBox maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Labeled>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Position" required>
              <SelectBox value={form.position} onChange={(e) => set("position", e.target.value as OrgPosition)}>
                {(Object.keys(POSITION_LABEL) as OrgPosition[]).map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABEL[p]}
                  </option>
                ))}
              </SelectBox>
            </Labeled>
            {form.position !== "md" && (
              <Labeled label="Department or group" required>
                <SelectBox value={form.team_id ?? ""} onChange={(e) => set("team_id", e.target.value || null)}>
                  <option value="">Choose…</option>
                  {teamsInOrder(teams).map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamLabel(t, teams)}
                    </option>
                  ))}
                </SelectBox>
              </Labeled>
            )}
            <Labeled label="Office" required>
              <SelectBox value={form.office} onChange={(e) => set("office", e.target.value as OrgOffice)}>
                {(Object.keys(OFFICE_LABEL) as OrgOffice[]).map((o) => (
                  <option key={o} value={o}>
                    {OFFICE_LABEL[o]}
                  </option>
                ))}
              </SelectBox>
            </Labeled>
          </div>
          {teams.length === 0 && form.position !== "md" && (
            <Note tone="warn">There are no departments yet. Add them on the Organisation page first.</Note>
          )}

          <Labeled label="Ring colour" hint="The colour of their ring and their profile page.">
            <div className="flex gap-2">
              {(["pink", "blue"] as OrgColour[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("colour", c)}
                  aria-pressed={form.colour === c}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] capitalize aria-pressed:border-ink aria-pressed:text-ink border-line text-ink-3"
                >
                  <span className="size-3.5 rounded-full" style={{ background: RING[c] }} />
                  {c}
                </button>
              ))}
            </div>
          </Labeled>

          <Labeled label="Short bio" hint={`${(form.bio ?? "").length} / ${MAX_BIO} · one or two sentences about what they do.`}>
            <AreaBox maxLength={MAX_BIO} rows={3} value={form.bio ?? ""} onChange={(e) => set("bio", e.target.value)} />
          </Labeled>
          <Labeled label="Skills" hint="Up to three, shown as tags.">
            <div className="grid gap-2 sm:grid-cols-3">
              {skills.map((s, i) => (
                <TextBox
                  key={i}
                  maxLength={40}
                  value={s}
                  placeholder={["e.g. Data centres", "e.g. Azure", "e.g. ERP"][i]}
                  onChange={(e) => {
                    const next = [...skills];
                    next[i] = e.target.value;
                    set("skills", next.filter((x, j) => x.trim() || j < i));
                  }}
                />
              ))}
            </div>
          </Labeled>
          <Labeled label="LinkedIn" hint="Optional. A link to their LinkedIn profile.">
            <TextBox
              type="url"
              maxLength={300}
              placeholder="https://www.linkedin.com/in/…"
              value={form.linkedin_url ?? ""}
              onChange={(e) => set("linkedin_url", e.target.value)}
            />
          </Labeled>

          <div className="space-y-3 border-t border-line pt-3">
            <Toggle
              checked={form.on_website}
              onChange={(v) => set("on_website", v)}
              label="Show on the website"
              hint="On the Our People page, after the next Publish."
            />
          </div>

          {save.error && <Note tone="danger">{save.error}</Note>}
          {remove.error && <Note tone="danger">{remove.error}</Note>}
          {dropPhoto.error && <Note tone="danger">{dropPhoto.error}</Note>}
        </div>
      </Drawer>

      {studio && (
        <CutoutStudio
          name={form.name || "this person"}
          colour={form.colour}
          onClose={() => setStudio(false)}
          onSave={upload}
        />
      )}
    </>
  );
}
