/**
 * The sidebar, built from what the viewer can actually reach.
 *
 * The backend's module catalogue already names every frontend route — that is
 * deliberate on its side, so one catalogue drives both the permission model
 * and the navigation. This file adds the two things a route table cannot
 * carry: an icon, and an order that reads like a working day rather than like
 * a database.
 */

import {
  Building2,
  CalendarDays,
  FileStack,
  GaugeCircle,
  KeyRound,
  ListChecks,
  ReceiptText,
  Scale,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Session } from "@/lib/session";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Matched as a prefix so child routes keep the parent highlighted. */
  match?: string;
  badge?: "hr" | "admin";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const MODULE_ICONS: Record<string, LucideIcon> = {
  dashboard: GaugeCircle,
  directory: Building2,
  teams: Users,
  leave: CalendarDays,
  proposals: ListChecks,
  quotes: ReceiptText,
  quote_comparison: Scale,
  roles: ShieldCheck,
  user_admin: KeyRound,
};

export function buildNav(session: Session): NavGroup[] {
  const { can, roles, isHr } = session;
  const groups: NavGroup[] = [];

  const work: NavItem[] = [
    { label: "Overview", href: "/dashboard", icon: GaugeCircle, match: "/dashboard" },
  ];
  if (can("proposals", "my_tasks")) {
    work.push({
      label: "My proposals",
      href: "/proposals/my-tasks",
      icon: ListChecks,
      match: "/proposals",
    });
  }
  if (can("quotes")) {
    work.push({ label: "Quotes", href: "/quotes", icon: ReceiptText, match: "/quotes" });
  }
  if (can("quote_comparison")) {
    work.push({
      label: "Comparisons",
      href: "/comparisons",
      icon: Scale,
      match: "/comparisons",
    });
  }
  groups.push({ label: "Work", items: work });

  const people: NavItem[] = [];
  if (can("teams")) {
    people.push({ label: "Teams", href: "/teams", icon: Users, match: "/teams" });
  }
  if (can("directory")) {
    people.push({
      label: "Directory",
      href: "/directory",
      icon: Building2,
      match: "/directory",
    });
  }
  if (can("leave")) {
    people.push({ label: "My leave", href: "/leave", icon: CalendarDays });
    people.push({ label: "Who is off", href: "/leave/calendar", icon: FileStack });
    if (isHr) {
      people.push({
        label: "Leave requests",
        href: "/leave/requests",
        icon: ListChecks,
        badge: "hr",
      });
    }
  }
  if (people.length) groups.push({ label: "People", items: people });

  // Admin modules are never granted to a team — reaching them depends on
  // holding a global admin role, and the endpoints enforce that themselves.
  // Hiding them here only spares an admin-less person a guaranteed 403.
  const admin: NavItem[] = [];
  if (roles.is_admin) {
    admin.push({
      label: "Roles",
      href: "/admin/roles",
      icon: ShieldCheck,
      match: "/admin/roles",
      badge: "admin",
    });
  }
  if (roles.is_super_admin) {
    admin.push({
      label: "Team access",
      href: "/admin/access",
      icon: KeyRound,
      match: "/admin/access",
      badge: "admin",
    });
  }
  if (isHr) {
    admin.push({ label: "Leave rules", href: "/leave/settings", icon: CalendarDays, badge: "hr" });
  }
  if (admin.length) groups.push({ label: "Administration", items: admin });

  return groups;
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.match) return pathname === item.match || pathname.startsWith(`${item.match}/`);
  return pathname === item.href;
}

/**
 * A label for a route, for the tab strip.
 *
 * Derived from the module catalogue's own page paths where it can be, because
 * that catalogue is the authority on what each route is called. Dynamic
 * segments are the interesting case: "/teams/presales" should read "presales",
 * not "Team detail", since the whole point of a tab is telling two of them
 * apart.
 */
const STATIC_LABELS: Record<string, string> = {
  "/dashboard": "Overview",
  "/teams": "Teams",
  "/directory": "Directory",
  "/leave": "My leave",
  "/leave/request": "Request leave",
  "/leave/calendar": "Who is off",
  "/leave/requests": "Leave requests",
  "/leave/settings": "Leave rules",
  "/proposals/my-tasks": "My proposals",
  "/quotes": "Quotes",
  "/comparisons": "Comparisons",
  "/comparisons/new": "New comparison",
  "/admin/roles": "Roles",
  "/admin/roles/assignments": "Assignments",
  "/admin/access": "Team access",
};

export function labelFor(pathname: string): string {
  const known = STATIC_LABELS[pathname];
  if (known) return known;

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "Hamdaz";

  // /teams/[slug]/members -> "presales · members"
  if (parts[0] === "teams" && parts.length >= 2) {
    const tail = parts[2];
    return tail ? `${parts[1]} · ${tail}` : parts[1];
  }
  // An id is not a name, but it is at least unique, and the screen behind it
  // replaces this the moment it knows better.
  if (parts[0] === "quotes") return `Quote ${short(parts[1])}`;
  if (parts[0] === "comparisons") return `Comparison ${short(parts[1])}`;
  if (parts[0] === "directory") return `Person ${short(parts[1])}`;
  if (parts[0] === "admin" && parts[1] === "users") return `User ${short(parts[2])}`;

  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

/** Enough of an identifier to tell two tabs apart, without filling the tab. */
function short(value: string | undefined): string {
  if (!value) return "";
  return value.length > 8 ? `${value.slice(0, 6)}…` : value;
}
