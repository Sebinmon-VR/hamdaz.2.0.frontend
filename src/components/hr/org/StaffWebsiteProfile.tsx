"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Network, Pencil, UserPlus } from "lucide-react";
import { OFFICE_LABEL, ORG_KEY, POSITION_LABEL, photoUrl, teamLabel, type OrgStaffProfile, type OrgState } from "@/lib/org";
import { Badge } from "@/components/ui/primitives";
import { PanelSkeleton } from "@/components/ui/feedback";
import { DrawerSection } from "@/components/payroll/Drawer";
import { Btn, Note } from "@/components/payroll/ui";
import { Face } from "./Face";
import { PersonDrawer } from "./PersonDrawer";

/**
 * A member of staff's face on the website, inside their staff record: what the
 * Our People page shows about them, and the way to add or change it. The same
 * editor as the Organisation page, so the details live in one place.
 */
export function StaffWebsiteProfile({ userId }: { userId: string }) {
  const profile = useSWR<OrgStaffProfile>(`${ORG_KEY}/staff/${userId}`);
  const chart = useSWR<OrgState>(ORG_KEY);
  const [open, setOpen] = useState(false);
  const p = profile.data?.person ?? null;
  const team = p?.team_id ? chart.data?.teams.find((t) => t.id === p.team_id) : undefined;

  return (
    <DrawerSection
      title="Website profile"
      action={
        profile.data && (
          <Btn icon={p ? Pencil : UserPlus} onClick={() => setOpen(true)} disabled={!chart.data}>
            {p ? "Edit" : "Add to Our People"}
          </Btn>
        )
      }
    >
      {profile.error ? (
        <Note tone="danger">{profile.error.message}</Note>
      ) : !profile.data ? (
        <PanelSkeleton lines={2} />
      ) : !p ? (
        <p className="text-[13px] text-ink-3">
          Not on the website&rsquo;s Our People page. Add them to give them a photo, a title and a short bio there.
        </p>
      ) : (
        <div className="flex items-center gap-4 pt-6">
          <Face src={p.has_photo ? photoUrl(p, "cutout") : null} name={p.name} colour={p.colour} size={64} dim={!p.on_website} />
          <div className="min-w-0 space-y-1 text-[13px]">
            <p className="font-medium text-ink">{p.title || POSITION_LABEL[p.position]}</p>
            <p className="text-ink-3">
              {p.position === "md" ? "Head of the company" : team && chart.data ? teamLabel(team, chart.data.teams) : "No department yet"} · {OFFICE_LABEL[p.office]}
            </p>
            <p className="flex flex-wrap gap-1">
              {p.on_website ? <Badge tone="positive">On the website</Badge> : <Badge tone="neutral">Hidden</Badge>}
              {!p.has_photo && <Badge tone="warn">No photo</Badge>}
            </p>
          </div>
          <Link href="/hr/organisation" className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
            <Network className="size-3.5" /> Chart
          </Link>
        </div>
      )}

      {open && chart.data && profile.data && (
        <PersonDrawer
          person={p ?? undefined}
          fresh={p ? undefined : { user_id: userId, ...profile.data.prefill }}
          teams={[...chart.data.teams].sort((a, b) => a.sort_order - b.sort_order)}
          onClose={() => {
            setOpen(false);
            void profile.mutate();
          }}
          onSaved={() => {
            setOpen(false);
            void profile.mutate();
            void chart.mutate();
          }}
        />
      )}
    </DrawerSection>
  );
}
