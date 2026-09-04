"use client";

import clsx from "clsx";
import { Check, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { humanise } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PALETTES, useTheme, type ModeChoice, type PaletteId } from "@/lib/theme";
import {
  Avatar,
  Badge,
  Meta,
  PageHead,
  Panel,
  PanelHead,
} from "@/components/ui/primitives";

/**
 * Settings.
 *
 * The colour theme is the only thing on here that is genuinely a preference —
 * everything else about a person (their roles, their teams, what they can
 * reach) is decided by an administrator and shown here read-only, so nobody
 * goes looking for a switch that does not exist.
 *
 * The choice is stored per browser rather than on the account: the backend has
 * no user-preferences endpoint, and this is the kind of setting that genuinely
 * differs between someone's laptop and the shared machine in the workshop.
 */
export default function SettingsPage() {
  const session = useSession();
  const { palette, setPalette, mode, setMode, resolved } = useTheme();

  return (
    <>
      <PageHead
        eyebrow="You"
        title="Settings"
      />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          {/* ── colour theme ─────────────────────────────────────── */}
          <Panel className="p-6">
            <PanelHead
              title="Colour theme"
              hint="Applies immediately, and is remembered on this browser"
            />

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {PALETTES.map((entry) => (
                <PaletteCard
                  key={entry.id}
                  entry={entry}
                  selected={palette === entry.id}
                  onSelect={() => setPalette(entry.id)}
                />
              ))}
            </div>
          </Panel>

          {/* ── light / dark ─────────────────────────────────────── */}
          <Panel className="p-6">
            <PanelHead
              title="Light or dark"
              hint={
                mode === "system"
                  ? `Following this device — currently ${resolved}`
                  : undefined
              }
            />

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {MODES.map((entry) => (
                <ModeCard
                  key={entry.id}
                  entry={entry}
                  selected={mode === entry.id}
                  onSelect={() => setMode(entry.id)}
                />
              ))}
            </div>
          </Panel>
        </div>

        {/* ── who you are ────────────────────────────────────────── */}
        <div className="space-y-4">
          <Panel className="p-6">
            <PanelHead title="Your account" />
            <div className="mt-6 flex items-center gap-4">
              <Avatar name={session.user.display_name} seed={session.user.id} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">
                  {session.user.display_name}
                </p>
                <p className="truncate text-[12.5px] text-ink-3">{session.user.email}</p>
              </div>
            </div>

            <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5">
              <Meta label="Teams">{session.teams.length}</Meta>
              <Meta label="Modules">{session.modules.size}</Meta>
              <Meta label="Sign-in">Microsoft Entra</Meta>
              <Meta label="HR">{session.isHr ? "Yes" : "No"}</Meta>
            </dl>

            <div className="mt-7">
              <p className="mb-2.5 text-[11.5px] text-ink-3">Global roles</p>
              {session.roles.role_keys.length === 0 ? (
                <p className="text-[12.5px] text-ink-4">None held.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {session.roles.role_keys.map((key) => (
                    <Badge
                      key={key}
                      tone={key === "super_admin" ? "second" : "neutral"}
                      icon={key === "super_admin" ? ShieldCheck : undefined}
                    >
                      {humanise(key)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-6 text-[11.5px] text-ink-4">
              Changed by an administrator, not here.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ── palette card ────────────────────────────────────────────────────── */

/**
 * Each card previews its own palette rather than describing it: the swatches,
 * the filled pill and the ramp are drawn in that palette's real values, so the
 * choice is made by looking rather than by reading.
 */
function PaletteCard({
  entry,
  selected,
  onSelect,
}: {
  entry: (typeof PALETTES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        "group relative rounded-[16px] p-4 text-left transition",
        selected
          ? "bg-panel-2 ring-2 ring-[var(--accent)]"
          : "bg-panel-2 ring-1 ring-line hover:ring-line-strong",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="size-4 rounded-full"
          style={{ background: entry.accent }}
          aria-hidden
        />
        <span
          className="size-4 rounded-full"
          style={{ background: entry.second }}
          aria-hidden
        />
        <span className="text-[14px] font-semibold">{entry.name}</span>
        {selected && (
          <span
            className="ml-auto grid size-6 place-items-center rounded-full"
            style={{ background: entry.accent, color: onInk(entry.id) }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
      </div>

      {/* a slice of the real thing: a filled pill, a plain one, and the ramp */}
      <div className="mt-4 flex items-center gap-1.5">
        <span
          className="inline-flex h-7 items-center rounded-full px-3 text-[11px] font-bold"
          style={{ background: entry.accent, color: onInk(entry.id) }}
        >
          Quotes
        </span>
        <span className="inline-flex h-7 items-center rounded-full bg-panel-3 px-3 text-[11px] font-medium text-ink-3">
          Leave
        </span>
      </div>
      <div
        className="mt-3 h-2.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${entry.accent}, ${entry.second})` }}
        aria-hidden
      />

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">{entry.blurb}</p>
    </button>
  );
}

/** The dark ink each accent carries, mirroring globals.css. */
function onInk(id: PaletteId): string {
  return {
    electric: "#022733",
    magenta: "#2d0417",
    acid: "#151f02",
    ember: "#2b1701",
  }[id];
}

/* ── mode card ───────────────────────────────────────────────────────── */

const MODES: { id: ModeChoice; label: string; hint: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", hint: "Always light", icon: Sun },
  { id: "dark", label: "Dark", hint: "Always dark", icon: Moon },
  { id: "system", label: "System", hint: "Follow this device", icon: Monitor },
];

function ModeCard({
  entry,
  selected,
  onSelect,
}: {
  entry: (typeof MODES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        "flex items-center gap-3 rounded-[20px] p-4 text-left transition",
        selected
          ? "bg-panel-2 ring-2 ring-[var(--accent)]"
          : "bg-panel-2 ring-1 ring-line hover:ring-line-strong",
      )}
    >
      <span
        className={clsx(
          "grid size-10 shrink-0 place-items-center rounded-full transition",
          selected ? "bg-accent text-accent-ink" : "bg-panel-3 text-ink-3",
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{entry.label}</span>
        <span className="block text-[11.5px] text-ink-4">{entry.hint}</span>
      </span>
    </button>
  );
}
