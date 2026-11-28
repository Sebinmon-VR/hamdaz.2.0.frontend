/* The organisation chart for the website's Our People page. Transcribed from
   app/hr/org_router.py. HR edits a draft here; Publish puts it on hamdaz.com. */

import { apiUrl } from "@/lib/api";

export type OrgPosition = "md" | "head" | "member";
/** Payroll's country codes. The website prints them as Abu Dhabi and Kerala. */
export type OrgOffice = "AE" | "IN";
export type OrgColour = "pink" | "blue";

export interface OrgTeam {
  id: string;
  name: string;
  short_name: string;
  /** The department a group is inside; null for a department. One level only. */
  parent_id: string | null;
  /** A department's office, shown as a label on the one chart; null for a group (it follows its department). */
  office: OrgOffice | null;
  /** A line under the name on the chart, e.g. "Technical reporting: Althaf Hussein". */
  note: string | null;
  sort_order: number;
}

export interface OrgTeamIn {
  name: string;
  short_name: string;
  parent_id: string | null;
  office: OrgOffice | null;
  note: string | null;
}

export interface OrgPerson {
  id: string;
  /** The member of staff, when this is one. */
  user_id: string | null;
  user_email: string | null;
  name: string;
  title: string;
  team_id: string | null;
  position: OrgPosition;
  sort_order: number;
  office: OrgOffice;
  colour: OrgColour;
  bio: string | null;
  skills: string[];
  linkedin_url: string | null;
  on_website: boolean;
  consent: boolean;
  consent_at: string | null;
  has_photo: boolean;
  /** Changes with every new photo: part of the photo URL, so a browser never shows an old one. */
  photo_version: number;
  photo_updated_at: string | null;
  updated_at: string;
}

export interface OrgPublished {
  version: number;
  published_at: string;
  published_by_name: string | null;
  people: number;
}

export interface OrgState {
  teams: OrgTeam[];
  people: OrgPerson[];
  published: OrgPublished | null;
  /** The draft differs from what is on the website. */
  changes: boolean;
  /** What stops Publish. */
  problems: string[];
  /** Worth knowing; Publish still works. */
  warnings: string[];
}

export interface OrgPersonIn {
  /** Only when adding: the member of staff this face is. */
  user_id?: string | null;
  name: string;
  title: string;
  team_id: string | null;
  position: OrgPosition;
  office: OrgOffice;
  colour: OrgColour;
  bio: string | null;
  skills: string[];
  linkedin_url: string | null;
  on_website: boolean;
  consent: boolean;
}

export interface OrgStaffProfile {
  person: OrgPerson | null;
  prefill: { name: string; title: string; office: OrgOffice };
}

export const ORG_KEY = "/hr/org";

export const POSITION_LABEL: Record<OrgPosition, string> = {
  md: "Head of the company (CEO)",
  head: "Head of the department or group",
  member: "Member",
};

export const OFFICE_LABEL: Record<OrgOffice, string> = { AE: "Abu Dhabi", IN: "Kerala" };
/** A department's office label on the chart. */
export const COUNTRY_LABEL: Record<OrgOffice, string> = { AE: "UAE", IN: "India" };

/** The website's two ring colours (assets/css/style.css on hamdaz.com). */
export const RING: Record<OrgColour, string> = { pink: "#e0559a", blue: "#2f7fd8" };

export const MAX_SKILLS = 3;
export const MAX_BIO = 600;

/** HR's copy of a photo. The version makes the URL change whenever the photo does. */
export function photoUrl(p: Pick<OrgPerson, "id" | "photo_version">, kind: "cutout" | "original"): string {
  return apiUrl(`/hr/org/people/${p.id}/photo/${kind}`, { v: p.photo_version });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** The form's starting values for a face. */
export function toInput(p: OrgPerson): OrgPersonIn {
  return {
    name: p.name,
    title: p.title,
    team_id: p.team_id,
    position: p.position,
    office: p.office,
    colour: p.colour,
    bio: p.bio,
    skills: p.skills,
    linkedin_url: p.linkedin_url,
    on_website: p.on_website,
    consent: p.consent,
  };
}

export interface Unit {
  team: OrgTeam;
  heads: OrgPerson[];
  members: OrgPerson[];
}
export interface Dept extends Unit {
  groups: Unit[];
}

/** The chart as HR sees it: the CEO, then each department with its heads, people and groups. */
export function chartOf(state: OrgState): { md: OrgPerson[]; depts: Dept[]; loose: OrgPerson[] } {
  const sorted = [...state.people].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const teams = [...state.teams].sort((a, b) => a.sort_order - b.sort_order);
  const unit = (team: OrgTeam): Unit => ({
    team,
    heads: sorted.filter((p) => p.position === "head" && p.team_id === team.id),
    members: sorted.filter((p) => p.position === "member" && p.team_id === team.id),
  });
  return {
    md: sorted.filter((p) => p.position === "md"),
    depts: teams
      .filter((t) => !t.parent_id)
      .map((t) => ({ ...unit(t), groups: teams.filter((g) => g.parent_id === t.id).map(unit) })),
    loose: sorted.filter((p) => p.position !== "md" && !p.team_id),
  };
}

/** "Business Operations › Technicians" for a group; the name for a department. */
export function teamLabel(team: OrgTeam, all: OrgTeam[]): string {
  const parent = team.parent_id ? all.find((t) => t.id === team.parent_id) : undefined;
  return parent ? `${parent.name} › ${team.name}` : team.name;
}

/** Teams in chart order, each department followed by its groups: for pickers. */
export function teamsInOrder(all: OrgTeam[]): OrgTeam[] {
  const sorted = [...all].sort((a, b) => a.sort_order - b.sort_order);
  return sorted
    .filter((t) => !t.parent_id)
    .flatMap((d) => [d, ...sorted.filter((g) => g.parent_id === d.id)]);
}
