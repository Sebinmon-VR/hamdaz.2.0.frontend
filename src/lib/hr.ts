/**
 * Who counts as HR on this side of the wire.
 *
 * `session.isHr` alone is not the backend's answer. `app/hr/access.py` admits
 * three kinds of caller: anyone on the HR team — which is what `isHr` already
 * means, being membership of the team named in the leave settings — plus the
 * super admin and the CEO, on the stated grounds that both can already put
 * themselves on that team and pretending otherwise only makes the audit trail
 * worse.
 *
 * Note which role is *absent*: `manager`. It is in the backend's ADMIN_ROLES
 * and therefore in `roles.is_admin`, so using `is_admin` here would hand every
 * manager the personnel files — precisely the privilege creep the backend
 * module refuses by name. So the check is spelled out rather than folded into
 * the existing admin flag.
 *
 * This is a navigation and messaging aid, not a boundary. Every HR endpoint
 * re-derives the same answer server-side; getting this wrong shows somebody a
 * link that 403s, which is bad manners rather than a leak.
 */

import type { Session } from "@/lib/session";

/** The backend's `HR_ADMINS` — global roles that reach HR off the HR team. */
const HR_ADMIN_ROLES = ["super_admin", "ceo"];

export function isHrViewer(session: Session): boolean {
  if (session.isHr) return true;
  return session.roles.role_keys.some((key) => HR_ADMIN_ROLES.includes(key));
}
