/**
 * Navigation, built from what the viewer can actually reach.
 *
 * The backend's module catalogue already names every frontend route — that is
 * deliberate on its side, so one catalogue drives both the permission model
 * and the navigation. This file adds only an icon, an order, and the split
 * between the pill bar and the overflow menu behind the grid button.
 *
 * The pill bar holds the six places people work. Everything else — the
 * directory, the HR queue, administration, settings — lives in the menu,
 * because a pill row that wraps is a pill row that has stopped being one.
 */

import {
  Briefcase,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FilePen,
  FolderLock,
  GaugeCircle,
  IdCard,
  KeyRound,
  LayoutList,
  ListChecks,
  ReceiptText,
  Scale,
  Settings,
  Sliders,
  Sparkles,
  Star,
  Tag,
  Trophy,
  UserCheck,
  UserSearch,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { isHrViewer } from "@/lib/hr";
import type { Session } from "@/lib/session";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Matched as a prefix so child routes keep the parent selected. */
  match?: string;
  badge?: "hr" | "admin";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface Nav {
  /** The pill bar across the top. */
  primary: NavItem[];
  /** Grouped, behind the grid button. */
  more: NavGroup[];
}

export function buildNav(session: Session): Nav {
  const { can, roles, isHr } = session;

  const primary: NavItem[] = [
    { label: "Overview", href: "/dashboard", icon: GaugeCircle, match: "/dashboard" },
  ];
  if (can("quotes")) {
    primary.push({ label: "Quotes", href: "/quotes", icon: ReceiptText, match: "/quotes" });
  }
  if (can("proposals", "my_tasks")) {
    primary.push({
      label: "Proposals",
      href: "/proposals/my-tasks",
      icon: ListChecks,
      match: "/proposals",
    });
  }
  if (can("quote_requests")) {
    primary.push({
      label: "Quote requests",
      href: "/quote-requests",
      icon: FilePen,
      match: "/quote-requests",
    });
  }
  if (can("quote_comparison")) {
    primary.push({
      label: "Comparisons",
      href: "/comparisons",
      icon: Scale,
      match: "/comparisons",
    });
  }
  if (can("leave")) {
    primary.push({ label: "Leave", href: "/leave", icon: CalendarDays, match: "/leave" });
  }
  if (can("teams")) {
    primary.push({ label: "Teams", href: "/teams", icon: Users, match: "/teams" });
  }
  // The assistant's catalogue entry says in so many words that it is listed
  // "for navigation" and that who may use it is decided by its own access
  // rules, which a super admin sets — not by a team grant. So the link is shown
  // to everybody and the screen behind it asks `/assistant/status`, which
  // answers with a sentence saying why when the answer is no. Hiding it on a
  // grant would be gating it on the one thing the backend says does not gate it.
  primary.push({
    label: "Assistant",
    href: "/assistant",
    icon: Sparkles,
    match: "/assistant",
  });

  const more: NavGroup[] = [];

  const assignment: NavItem[] = [];
  if (can("assignment", "labels")) {
    assignment.push({ label: "Labels", href: "/assignment/labels", icon: Tag });
  }
  if (can("assignment", "policy")) {
    assignment.push({ label: "Assignment policy", href: "/assignment/policy", icon: Sliders });
  }
  // The analytics router has no module guard of its own — it is open to any
  // signed-in user, and the real gate is whether the team has a policy. Kept
  // beside the rest of the assignment work all the same, since that is the
  // only place it means anything.
  if (can("assignment")) {
    assignment.push({
      label: "User analytics",
      href: "/assignment/user-analytics",
      icon: Trophy,
      match: "/assignment/user-analytics",
    });
  }
  if (assignment.length) more.push({ label: "Work assignment", items: assignment });

  // Meetings has **no catalogue entry**, so there is no `can("meetings")` to
  // ask. That is not an oversight to work around: its endpoints take a bare
  // `CurrentUser` and read the caller's own mailbox, so like leave and quotes
  // it is open to everybody who is signed in. Listed unconditionally for that
  // reason — and worth a catalogue entry on the backend so this file does not
  // have to be the one place that knows.
  const people: NavItem[] = [
    {
      label: "Meetings",
      href: "/meetings",
      icon: CalendarRange,
      match: "/meetings",
    },
  ];
  if (can("directory")) {
    people.push({ label: "Directory", href: "/directory", icon: Building2, match: "/directory" });
  }
  if (can("leave")) {
    people.push({ label: "Who is off", href: "/leave/calendar", icon: CalendarRange });
    if (isHr) {
      people.push({
        label: "Leave requests",
        href: "/leave/requests",
        icon: ListChecks,
        badge: "hr",
      });
      people.push({
        label: "Leave rules",
        href: "/leave/settings",
        icon: CalendarDays,
        badge: "hr",
      });
    }
  }
  // The two HR pages that are not HR's. Both endpoints behind them take a
  // bare session and narrow themselves to the caller's own rows, so everybody
  // gets them — and everybody needs them, since being nominated to write a
  // review is the one HR task that lands on an ordinary colleague.
  if (can("hr", "my_reviews")) {
    people.push({
      label: "Reviews to write",
      href: "/hr/my-reviews",
      icon: Star,
      match: "/hr/my-reviews",
    });
  }
  if (can("hr", "my_record")) {
    people.push({ label: "My HR record", href: "/hr/me", icon: IdCard, match: "/hr/me" });
  }
  if (people.length) more.push({ label: "People", items: people });

  // HR proper: the personnel files, gated on membership of the HR team rather
  // than on a module grant, because that is what the backend checks. Kept as
  // its own group instead of folded into "People" — an offer letter and a
  // colleague's phone number do not belong under one heading, and the group
  // simply not existing is the clearest way to say the whole area is closed.
  //
  // `isHrViewer` rather than the bare `isHr` used above for leave: the HR
  // module also admits the super admin and the CEO, and a super admin who
  // could open every one of these screens but could not see them in the menu
  // would be a puzzle rather than a safeguard.
  if (isHrViewer(session)) {
    more.push({
      label: "HR",
      items: [
        { label: "Job openings", href: "/hr/openings", icon: Briefcase, match: "/hr/openings", badge: "hr" },
        {
          label: "Applications",
          href: "/hr/applications",
          icon: UserSearch,
          match: "/hr/applications",
          badge: "hr",
        },
        {
          label: "Staff documents",
          href: "/hr/people",
          icon: FolderLock,
          match: "/hr/people",
          badge: "hr",
        },
        {
          label: "Review cycles",
          href: "/hr/reviews",
          icon: ClipboardList,
          // Not a prefix on "/hr" — that would swallow "Reviews to write" and
          // "My HR record", which are not this entry and are not HR-only.
          match: "/hr/reviews",
          badge: "hr",
        },
      ],
    });
  }

  // Admin modules are never granted to a team — reaching them depends on a
  // global admin role, and the endpoints enforce that themselves. Hiding them
  // here only spares an admin-less person a guaranteed 403.
  const admin: NavItem[] = [];
  if (roles.is_admin) {
    admin.push({
      label: "Roles",
      href: "/admin/roles",
      // Not a prefix match: "Who holds what" is its own rail entry below and
      // both would light up at once if this swallowed the whole subtree.
      icon: ShieldCheck,
      badge: "admin",
    });
    // Granting somebody their first role is the common administrative task and
    // was two hops away behind the roles catalogue. It is a destination.
    admin.push({
      label: "Who holds what",
      href: "/admin/roles/assignments",
      icon: UserCheck,
      match: "/admin/roles/assignments",
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
    // Reading a template is open to any signed-in user, but only a super admin
    // creates or changes one — and reading it is only useful if you can.
    admin.push({
      label: "Form templates",
      href: "/admin/templates",
      icon: LayoutList,
      match: "/admin/templates",
      badge: "admin",
    });
    // The assistant's own administration. Two entries rather than the
    // catalogue's five: the other three are one click away through the strip
    // those screens share, and five near-identical rows would crowd out every
    // other thing an administrator does from the rail.
    //
    // Deliberately no `match` on the first. As a prefix it would swallow the
    // whole subtree and light both rows at once — the same mistake the roles
    // entries above already carry a note about.
    admin.push({
      label: "Assistant settings",
      href: "/admin/assistant",
      icon: Sparkles,
      badge: "admin",
    });
    admin.push({
      label: "Assistant usage",
      href: "/admin/assistant/analytics",
      icon: Trophy,
      match: "/admin/assistant/analytics",
      badge: "admin",
    });
  }
  if (admin.length) more.push({ label: "Administration", items: admin });

  more.push({
    label: "You",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, match: "/settings" },
      { label: "My profile", href: `/admin/users/${session.user.id}`, icon: Users },
    ],
  });

  return { primary, more };
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.match) return pathname === item.match || pathname.startsWith(`${item.match}/`);
  return pathname === item.href;
}

/**
 * A label for a route, for the tab strip.
 *
 * Dynamic segments are the interesting case: "/teams/presales" should read
 * "presales", not "Team detail", since the whole point of a tab is telling two
 * of them apart.
 */
const STATIC_LABELS: Record<string, string> = {
  "/dashboard": "Overview",
  "/teams": "Teams",
  "/directory": "Directory",
  "/leave": "My leave",
  "/leave/request": "Request leave",
  "/leave/calendar": "Who is off",
  "/meetings": "Meetings",
  "/leave/requests": "Leave requests",
  "/leave/settings": "Leave rules",
  "/proposals/my-tasks": "My proposals",
  "/quotes": "Quotes",
  "/quote-requests": "Quote requests",
  "/quote-requests/new": "New quote",
  "/quote-requests/queue": "Ready for Zoho",
  "/admin/templates": "Form templates",
  "/comparisons": "Comparisons",
  "/comparisons/new": "New comparison",
  "/admin/roles": "Roles",
  "/admin/roles/assignments": "Who holds what",
  "/admin/access": "Team access",
  "/assistant": "Assistant",
  "/admin/assistant": "Assistant settings",
  "/admin/assistant/permissions": "Assistant permissions",
  "/admin/assistant/access": "Assistant access",
  "/admin/assistant/runs": "Assistant runs",
  "/admin/assistant/analytics": "Assistant usage",
  "/settings": "Settings",
  "/assignment/labels": "Labels",
  "/assignment/policy": "Assignment policy",
  "/assignment/user-analytics": "User analytics",
  "/hr/openings": "Job openings",
  "/hr/applications": "Applications",
  "/hr/people": "Staff documents",
  "/hr/reviews": "Review cycles",
  "/hr/my-reviews": "Reviews to write",
  "/hr/me": "My HR record",
};

export function labelFor(pathname: string): string {
  const known = STATIC_LABELS[pathname];
  if (known) return known;

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "Hamdaz";

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
  if (parts[0] === "assignment" && parts[1] === "runs") return `Run ${short(parts[2])}`;
  // HR's four detail routes. Named by what the id points at rather than by the
  // section, because two open tabs of the same section are the normal case
  // here — comparing candidates is the whole job.
  if (parts[0] === "hr" && parts.length >= 3) {
    if (parts[1] === "openings") return `Opening ${short(parts[2])}`;
    if (parts[1] === "applications") return `Candidate ${short(parts[2])}`;
    if (parts[1] === "people") return `Person ${short(parts[2])}`;
    if (parts[1] === "reviews") return `Cycle ${short(parts[2])}`;
  }

  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

/** Enough of an identifier to tell two tabs apart, without filling the tab. */
function short(value: string | undefined): string {
  if (!value) return "";
  return value.length > 8 ? `${value.slice(0, 6)}…` : value;
}
