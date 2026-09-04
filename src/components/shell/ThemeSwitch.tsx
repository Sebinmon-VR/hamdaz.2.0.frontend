"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ModeChoice } from "@/lib/theme";

const OPTIONS: { value: ModeChoice; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "Match this device" },
];

/**
 * Light / dark / follow-the-system, as three segments.
 *
 * Three states rather than two, because "follow the system" is a real choice
 * and a two-way toggle cannot express it. This is the sign-in screen's copy of
 * the control; inside the app the full picker lives on Settings, where the
 * accent palette is chosen too.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour mode"
      className={clsx("inline-flex items-center gap-0.5 rounded-full bg-panel-2 p-1", className)}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setMode(value)}
            className={clsx(
              "grid size-8 place-items-center rounded-full transition",
              active
                ? "bg-accent text-accent-ink"
                : "text-ink-4 hover:bg-panel-3 hover:text-ink-2",
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.1} />
          </button>
        );
      })}
    </div>
  );
}
