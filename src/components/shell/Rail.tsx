"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronsUpDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { signOutAndReturnToLogin } from "@/lib/api";
import { buildNav, isActive, type NavGroup } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { useUnread } from "@/lib/notifications";
import { Avatar } from "@/components/ui/primitives";

/**
 * Navigation, down the left edge, showing **everything** the viewer can reach.
 *
 * Two earlier mistakes are fixed here, and they had the same root. The first
 * version put six destinations on the rail and hid the other nine behind a
 * grid button — so most of the app cost two clicks to reach, and you had to
 * already know it was there. The second was a custom hover tooltip nested
 * inside a scroll container, which clipped it: the icons had no readable name
 * at all.
 *
 * Both go away by giving the labels room. The rail is 62px of icons at rest
 * and widens to 214px on hover or keyboard focus, overlaying the content
 * rather than pushing it — so reading a label costs no click and no layout
 * shift. Anyone who wants it open permanently can pin it, and that choice is
 * remembered. `title` stays on every link as the fallback the browser draws
 * itself, which nothing can clip.
 */
export function Rail() {
  const session = useSession();
  const pathname = usePathname();
  const nav = buildNav(session);
  const [pinned, setPinned] = useState(false);
  const [menu, setMenu] = useState(false);

  // Read after mount rather than during render: the server has no localStorage,
  // and a mismatch here would be a hydration error rather than a wrong width.
  useEffect(() => {
    setPinned(localStorage.getItem("hamdaz-rail") === "pinned");
  }, []);

  function togglePin() {
    setPinned((was) => {
      const next = !was;
      localStorage.setItem("hamdaz-rail", next ? "pinned" : "collapsed");
      return next;
    });
  }

  // The primary destinations are simply the first group; the split that used to
  // exist between "on the bar" and "in the menu" no longer buys anything.
  const groups: NavGroup[] = [{ label: "Work", items: nav.primary }, ...nav.more];

  return (
    // The placeholder reserves the collapsed width so the expanded rail can
    // overlay the content instead of reflowing every screen behind it.
    <div className={clsx("relative shrink-0", pinned ? "w-[214px]" : "w-[62px]")}>
      <aside
        // `data-pinned` also drives the label opacity, so an open menu shows
        // the labels too rather than a wide rail full of bare icons.
        data-pinned={pinned || menu || undefined}
        className={clsx(
          "lift group/rail absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden rounded-[22px] bg-panel",
          "transition-[width] duration-150 ease-out",
          pinned || menu ? "w-[214px]" : "w-[62px] hover:w-[214px] focus-within:w-[214px]",
        )}
      >
        <div className="flex h-[54px] shrink-0 items-center gap-2.5 pl-[13px] pr-2.5">
          <Link
            href="/dashboard"
            aria-label="Hamdaz"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-[18px] font-extrabold text-accent-ink transition hover:bg-accent-hover"
          >
            h
          </Link>
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 group-data-[pinned]/rail:opacity-100">
            hamdaz
          </span>
          <button
            onClick={togglePin}
            aria-pressed={pinned}
            title={pinned ? "Unpin the sidebar" : "Keep the sidebar open"}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-4 opacity-0 transition hover:bg-panel-2 hover:text-ink group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 group-data-[pinned]/rail:opacity-100"
          >
            {pinned ? (
              <PanelLeftClose className="size-4" strokeWidth={1.8} />
            ) : (
              <PanelLeftOpen className="size-4" strokeWidth={1.8} />
            )}
          </button>
        </div>

        <nav
          aria-label="Sections"
          className="no-bar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-[11px] pb-2"
        >
          {groups.map((group, index) => (
            <div key={group.label} className="contents">
              {index > 0 && (
                <>
                  <span className="mx-2 my-2 h-px shrink-0 bg-line group-hover/rail:hidden group-focus-within/rail:hidden group-data-[pinned]/rail:hidden" />
                  <span className="micro hidden shrink-0 px-2.5 pb-1.5 pt-4 text-ink-4 group-hover/rail:block group-focus-within/rail:block group-data-[pinned]/rail:block">
                    {group.label}
                  </span>
                </>
              )}
              {group.items.map((item) => (
                <RailLink key={item.href} item={item} on={isActive(pathname, item)} />
              ))}
            </div>
          ))}
        </nav>

        <div className="shrink-0 px-[11px] pb-3 pt-1">
          <span className="mx-2 mb-2 block h-px bg-line" />
          <AccountButton pinned={pinned || menu} onToggle={() => setMenu((v) => !v)} open={menu} />
        </div>
      </aside>

      {/* Outside the aside on purpose: the aside is `overflow-hidden` for its
          width transition, so anything wider than the current rail width would
          be clipped in it. This div is its parent and clips nothing. */}
      {menu && <AccountMenu onClose={() => setMenu(false)} />}
    </div>
  );
}

/* ── one destination ─────────────────────────────────────────────────── */

/**
 * The label is always in the DOM and simply has no room at 62px, so it fades
 * in with the rail rather than being mounted on hover — that keeps the row a
 * stable size and lets a screen reader read the name whatever the width.
 */
function RailLink({
  item,
  on,
}: {
  item: ReturnType<typeof buildNav>["primary"][number];
  on: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={on ? "page" : undefined}
      className={clsx(
        "relative flex h-10 shrink-0 items-center gap-3 rounded-[13px] pl-[9px] pr-2.5 transition",
        on ? "bg-accent text-accent-ink" : "text-ink-3 hover:bg-panel-2 hover:text-ink",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
      <span
        className={clsx(
          "min-w-0 flex-1 truncate text-[13px] opacity-0 transition-opacity",
          "group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 group-data-[pinned]/rail:opacity-100",
          on ? "font-semibold" : "font-medium",
        )}
      >
        {item.label}
      </span>
      {item.badge === "unread" ? (
        <UnreadCount on={on} />
      ) : (
        item.badge && (
          <span
            className={clsx(
              "micro shrink-0 opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 group-data-[pinned]/rail:opacity-100",
              on ? "text-accent-ink/70" : "text-ink-4",
            )}
          >
            {item.badge}
          </span>
        )
      )}
    </Link>
  );
}

/**
 * The number on the bell.
 *
 * The one thing in this rail that changes without anybody navigating, so it is
 * the one thing here that fetches. It stays visible at the collapsed width —
 * unlike the static badges, which fade with the labels — because a count nobody
 * can see until they hover is not a notification, it is a surprise. At 62px it
 * shrinks to a dot on the icon; expanded it becomes a number.
 *
 * Zero renders nothing at all rather than a "0": an empty bell should look like
 * an empty bell.
 */
function UnreadCount({ on }: { on: boolean }) {
  const { unread } = useUnread();
  if (unread === 0) return null;

  return (
    <>
      {/* Collapsed: a dot over the icon's corner, absolutely placed so it does
          not widen the row. */}
      <span
        aria-hidden
        className={clsx(
          "absolute left-[26px] top-[9px] size-2 rounded-full ring-2 ring-panel transition-opacity",
          "group-hover/rail:opacity-0 group-focus-within/rail:opacity-0 group-data-[pinned]/rail:opacity-0",
          on ? "bg-accent-ink" : "bg-accent",
        )}
      />
      <span
        className={clsx(
          "tnum shrink-0 rounded-full px-1.5 text-[10.5px] font-bold leading-[18px] opacity-0 transition-opacity",
          "group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 group-data-[pinned]/rail:opacity-100",
          on ? "bg-accent-ink/20 text-accent-ink" : "bg-accent text-accent-ink",
        )}
      >
        {unread > 99 ? "99+" : unread}
      </span>
    </>
  );
}

/* ── who you are ─────────────────────────────────────────────────────── */

/** The trigger, which lives in the rail. */
function AccountButton({
  pinned,
  open,
  onToggle,
}: {
  pinned: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const session = useSession();
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="menu"
      title={`${session.user.display_name} — account and sign out`}
      className={clsx(
        "flex h-10 w-full items-center gap-3 rounded-[13px] pl-[9px] pr-2.5 text-left transition",
        open ? "bg-panel-2" : "hover:bg-panel-2",
      )}
    >
      <Avatar
        name={session.user.display_name}
        seed={session.user.id}
        className="size-[18px] shrink-0 rounded-md text-[7px]"
      />
      <span
        className={clsx(
          "min-w-0 flex-1 opacity-0 transition-opacity",
          "group-hover/rail:opacity-100 group-focus-within/rail:opacity-100",
          pinned && "opacity-100",
        )}
      >
        <span className="block truncate text-[12.5px] font-semibold">
          {session.user.display_name}
        </span>
        <span className="block truncate text-[10.5px] text-ink-4">
          {session.roles.is_super_admin
            ? "Super admin"
            : session.roles.is_admin
              ? "Administrator"
              : "Member"}
        </span>
      </span>
      <ChevronsUpDown
        className={clsx(
          "size-3.5 shrink-0 text-ink-4 opacity-0 transition-opacity",
          "group-hover/rail:opacity-100 group-focus-within/rail:opacity-100",
          pinned && "opacity-100",
        )}
        strokeWidth={1.8}
        aria-hidden
      />
    </button>
  );
}

/** The popover, which lives outside it. */
function AccountMenu({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Closing on navigation is the point. The first run is not a navigation:
  // this component is mounted only while the menu is open, so an effect that
  // fires on mount closed it in the same tick it appeared — the menu could
  // never be seen, and sign-out was unreachable from the interface entirely.
  // Keeping `onClose` out of the deps was already deliberate; skipping the
  // mount run is the other half of the same guard.
  const navigated = useRef(false);
  useEffect(() => {
    if (!navigated.current) {
      navigated.current = true;
      return;
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    // Deferred a frame so the click that opened it does not close it again.
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", away);
      document.addEventListener("keydown", escape);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <div
      ref={box}
      className="rise absolute bottom-3 left-[218px] z-50 w-[208px] rounded-[16px] bg-panel p-1.5 shadow-[var(--shadow-float)] ring-1 ring-line"
    >
      <Link
        href={`/admin/users/${session.user.id}`}
        className="flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[12.5px] font-medium text-ink-2 transition hover:bg-panel-2 hover:text-ink"
      >
        <Avatar
          name={session.user.display_name}
          seed={session.user.id}
          className="size-5 rounded-md text-[7px]"
        />
        My profile
      </Link>
      <Link
        href="/settings"
        className="flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[12.5px] font-medium text-ink-2 transition hover:bg-panel-2 hover:text-ink"
      >
        <Settings className="size-4 text-ink-4" strokeWidth={1.8} />
        Settings
      </Link>
      <button
        onClick={() => void signOutAndReturnToLogin()}
        className="flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left text-[12.5px] font-medium text-ink-2 transition hover:bg-danger-soft hover:text-danger"
      >
        <LogOut className="size-4 text-ink-4" strokeWidth={1.8} />
        Sign out
      </button>
    </div>
  );
}
