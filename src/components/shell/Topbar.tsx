"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LogOut, Menu, ShieldCheck, UserRound, X } from "lucide-react";
import { signOut } from "@/lib/api";
import { humanise } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTabs } from "@/lib/tabs";
import { Avatar, Badge } from "@/components/ui/primitives";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { Wordmark } from "@/components/shell/Wordmark";

/**
 * The workspace bar: mark, a back step, the open tabs, and the viewer.
 *
 * The tab strip is the reference's central idea and the one that earns its
 * place here — an ERP is a job of holding two screens in mind at once.
 */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const router = useRouter();
  const { tabs, active, close } = useTabs();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
      <button
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-3 transition hover:text-ink lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      <div className="hidden shrink-0 items-center gap-3 lg:flex">
        <Wordmark />
        <span className="h-5 w-px bg-line" />
      </div>

      <button
        onClick={() => router.back()}
        aria-label="Back"
        title="Back"
        className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-3 transition hover:border-line-strong hover:text-ink"
      >
        <ArrowLeft className="size-4" strokeWidth={2} />
      </button>

      {/* The strip. Scrolls rather than wraps — the bar is a fixed height and
          a wrapping strip would push the whole app down. */}
      <nav aria-label="Open tabs" className="no-bar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const on = tab.href === active;
          const closable = tabs.length > 1 && tab.href !== "/dashboard";
          return (
            <span
              key={tab.href}
              className={clsx(
                "group inline-flex h-10 shrink-0 items-center rounded-full border transition",
                on
                  ? "border-transparent bg-panel text-ink shadow-[var(--shadow-panel)]"
                  : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
                closable ? "pl-4 pr-1.5" : "px-4",
              )}
            >
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className="max-w-[168px] truncate text-[12.5px] font-medium"
              >
                {tab.label}
              </Link>
              {closable && (
                <button
                  onClick={() => close(tab.href)}
                  aria-label={`Close ${tab.label}`}
                  className="ml-2 grid size-6 place-items-center rounded-full text-ink-4 transition hover:bg-panel-3 hover:text-ink"
                >
                  <X className="size-3" strokeWidth={2.6} />
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <ThemeSwitch className="hidden shrink-0 sm:inline-flex" />
      <UserMenu />
    </header>
  );
}

function UserMenu() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      // Even if the logout call failed, the safe thing is to leave the app —
      // the cookie may well be gone regardless.
      router.replace("/login");
    }
  }

  const { user, roles } = session;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className={clsx(
          "grid size-10 place-items-center rounded-full ring-2 transition",
          open ? "ring-accent" : "ring-transparent hover:ring-line-strong",
        )}
      >
        <Avatar name={user.display_name} seed={user.id} size="md" />
      </button>

      {open && (
        <div
          role="menu"
          className="rise absolute right-0 top-[calc(100%+8px)] w-72 overflow-hidden rounded-[20px] border border-line bg-float shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center gap-3 px-4 py-4">
            <Avatar name={user.display_name} seed={user.id} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-ink">{user.display_name}</p>
              <p className="truncate text-[11.5px] text-ink-3">{user.email}</p>
            </div>
          </div>

          {roles.role_keys.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-4">
              {roles.role_keys.map((key) => (
                <Badge
                  key={key}
                  tone={key === "super_admin" ? "highlight" : "neutral"}
                  icon={key === "super_admin" ? ShieldCheck : undefined}
                >
                  {humanise(key)}
                </Badge>
              ))}
            </div>
          )}

          <div className="border-t border-line p-1.5">
            <Link
              href={`/admin/users/${user.id}`}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px] text-ink-2 transition hover:bg-panel-2 hover:text-ink"
            >
              <UserRound className="size-4" />
              My profile
            </Link>
            <button
              onClick={handleSignOut}
              disabled={busy}
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-[13px] text-ink-2 transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            >
              <LogOut className="size-4" />
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>

          <div className="border-t border-line px-4 py-3 sm:hidden">
            <ThemeSwitch />
          </div>
        </div>
      )}
    </div>
  );
}
