"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check, LogOut, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { signOutAndReturnToLogin } from "@/lib/api";
import { humanise } from "@/lib/format";
import { useSession } from "@/lib/session";
import { isHex, PALETTES, useTheme, type ModeChoice } from "@/lib/theme";
import {
  Avatar,
  Badge,
  Meta,
  PageHead,
  Panel,
  PanelHead,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/controls";

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
  const { palette, setPalette, mode, setMode, resolved, custom, setCustom } = useTheme();
  // Held so the button can show it is going. The navigation that follows is a
  // full page load, so this state is never reset — it does not need to be.
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <PageHead
        eyebrow="You"
        title="Settings"
      />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          {/* ── appearance ───────────────────────────────────────── */}
          {/* One panel, two lists. These were eight cards across two panels,
              each carrying a mock pill, a gradient bar and a sentence of
              blurb — a page and a half of chrome to change one colour. A
              preference someone sets once and forgets is a list, not a
              gallery: the swatch says what the option is, and the rest was
              explaining a choice that applies itself the moment it is
              clicked. */}
          <Panel className="p-5">
            <PanelHead
              title="Appearance"
              hint="Applies immediately, and is remembered on this browser"
            />

            <p className="mt-5 micro text-ink-4">Colour</p>
            <div className="mt-2 space-y-1">
              {PALETTES.map((entry) => (
                <OptionRow
                  key={entry.id}
                  selected={palette === entry.id}
                  onSelect={() => setPalette(entry.id)}
                  label={entry.name}
                  hint={entry.blurb}
                  leading={
                    <span className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
                      {/* The custom row previews the colours actually chosen,
                          not the placeholder in the catalogue — otherwise it
                          advertises a theme it will not apply. The inset ring
                          gives every swatch an edge, without which the mono
                          near-white disappears against a white panel. */}
                      {[
                        entry.id === "custom" ? custom.accent : entry.accent,
                        entry.id === "custom" ? custom.second : entry.second,
                      ].map((colour, i) => (
                        <span
                          key={i}
                          className="size-4 rounded-full ring-2 ring-panel"
                          style={{
                            background: colour,
                            boxShadow: "inset 0 0 0 1px rgb(128 128 128 / 0.4)",
                          }}
                        />
                      ))}
                    </span>
                  }
                />
              ))}
            </div>

            {palette === "custom" && (
              <div className="mt-3 space-y-3 rounded-[13px] bg-panel-2 p-3.5">
                <ColourField
                  label="Accent"
                  hint="Buttons, the selected tab, anything the app wants you to notice."
                  value={custom.accent}
                  onChange={(accent) => setCustom({ ...custom, accent })}
                />
                <ColourField
                  label="Second"
                  hint="The other end of every chart ramp, and what marks something urgent."
                  value={custom.second}
                  onChange={(second) => setCustom({ ...custom, second })}
                />
                {/* Neutrals are not offered. Each shipped palette tunes eleven
                    of them by hand against its accent; handing that over would
                    be a job nobody asked for and a hundred ways to make the
                    app unreadable. */}
                <p className="text-[11.5px] leading-relaxed text-ink-4">
                  Panels and text stay on a neutral grey, which works with any two
                  colours. Button text is picked for contrast rather than chosen.
                </p>
              </div>
            )}

            {session.roles.is_super_admin && (
              <>
                <p className="mt-6 micro text-ink-4">Background</p>
                <div className="mt-2 space-y-3 rounded-[13px] bg-panel-2 p-3.5">
                  <ColourField
                    label="App background"
                    hint="The ground every panel sits on. Applies to any colour theme."
                    value={custom.background}
                    onChange={(background) => setCustom({ ...custom, background })}
                    onClear={() => setCustom({ ...custom, background: "" })}
                  />
                  {/* Said plainly because the word "super admin" implies
                      otherwise. There is no user-preferences endpoint on the
                      backend — the theme docstring says so — so nothing here
                      can reach anybody else's browser. */}
                  <p className="text-[11.5px] leading-relaxed text-ink-4">
                    Stored on this browser only. Setting it does not change what
                    colleagues see — that would need somewhere on the server to keep it,
                    which does not exist yet.
                  </p>
                </div>
              </>
            )}

            <p className="mt-6 micro text-ink-4">
              Light or dark
              {mode === "system" ? ` · following this device, currently ${resolved}` : ""}
            </p>
            <div className="mt-2 space-y-1">
              {MODES.map((entry) => {
                const Icon = entry.icon;
                return (
                  <OptionRow
                    key={entry.id}
                    selected={mode === entry.id}
                    onSelect={() => setMode(entry.id)}
                    label={entry.label}
                    hint={entry.hint}
                    leading={
                      <Icon
                        className="size-4 shrink-0 text-ink-3"
                        strokeWidth={1.9}
                        aria-hidden
                      />
                    }
                  />
                );
              })}
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

            {/* Signing out lived only in the rail's account popover, which is
                a bare avatar at 62px and, until this was fixed, a popover that
                closed itself the moment it opened. A destination people can
                navigate to by name is worth having for the one action nobody
                should have to hunt for. */}
            <div className="mt-6 border-t border-line pt-5">
              <Button
                variant="danger"
                icon={LogOut}
                loading={leaving}
                onClick={() => {
                  setLeaving(true);
                  void signOutAndReturnToLogin();
                }}
              >
                Sign out
              </Button>
              <p className="mt-2.5 text-[11.5px] text-ink-4">
                Ends the session on this browser. Signing back in goes through
                Microsoft.
              </p>
            </div>
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
/* ── the rows ───────────────────────────────────────────────────────── */

const MODES: { id: ModeChoice; label: string; hint: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", hint: "Always light", icon: Sun },
  { id: "dark", label: "Dark", hint: "Always dark", icon: Moon },
  { id: "system", label: "System", hint: "Follow this device", icon: Monitor },
];


/**
 * One choice in a list.
 *
 * Both lists on this screen are the same shape — a mark, a name, a line of
 * explanation and a tick — so they are one component. What changes between
 * them is the mark: two swatches for a palette, an icon for a mode.
 */
function OptionRow({
  selected,
  onSelect,
  label,
  hint,
  leading,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  leading: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        "flex w-full items-center gap-3 rounded-[13px] px-3 py-2 text-left transition",
        selected ? "bg-panel-2 ring-1 ring-[var(--accent)]" : "hover:bg-panel-2",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        {hint && <span className="block truncate text-[11.5px] text-ink-4">{hint}</span>}
      </span>
      {selected && (
        <Check className="size-4 shrink-0 text-accent-text" strokeWidth={2.6} aria-hidden />
      )}
    </button>
  );
}

/**
 * A colour, picked or typed.
 *
 * Both: the swatch is the fast way and the hex box is the exact one, and a
 * brand colour arrives as a hex code rather than as a point in a gradient.
 * The text field is only committed when it parses, so half-typed input never
 * repaints the app mid-keystroke.
 */
function ColourField({
  label,
  hint,
  value,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
  onClear?: () => void;
}) {
  const [typed, setTyped] = useState(value);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="color"
        aria-label={label}
        value={isHex(value) ? value : "#7c6cff"}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange(e.target.value);
        }}
        className="size-9 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11.5px] text-ink-4">{hint}</span>
      </span>
      <input
        value={typed}
        placeholder={onClear ? "default" : "#7c6cff"}
        onChange={(e) => {
          setTyped(e.target.value);
          if (isHex(e.target.value)) onChange(e.target.value.trim());
        }}
        spellCheck={false}
        className="h-9 w-28 shrink-0 rounded-xl bg-panel px-3 text-[12px] tnum text-ink outline-none ring-1 ring-line focus:ring-accent"
      />
      {onClear && value !== "" && (
        <Button
          size="sm"
          onClick={() => {
            setTyped("");
            onClear();
          }}
        >
          Reset
        </Button>
      )}
    </div>
  );
}
