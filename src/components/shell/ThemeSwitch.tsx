"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "Match system" },
];

/**
 * Three states, shown as three segments rather than a two-way toggle — because
 * "follow the system" is a real choice and a toggle cannot express it. The
 * segments carry no text at this size; the title and aria-label do.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-xl border border-line bg-panel p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={clsx(
              "grid size-6 place-items-center rounded transition",
              active
                ? "bg-accent text-[var(--c-accent-ink)]"
                : "text-ink-4 hover:bg-inset hover:text-ink-2",
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.1} />
          </button>
        );
      })}
    </div>
  );
}
