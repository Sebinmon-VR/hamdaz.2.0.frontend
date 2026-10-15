"use client";

import clsx from "clsx";
import { Dices } from "lucide-react";
import {
  BLOB_ACCESSORIES,
  BLOB_BODIES,
  BLOB_COLOURS,
  BLOB_EYES,
  BLOB_LABEL,
  BLOB_MOUTHS,
  randomAvatar,
  type AvatarSpec,
} from "@/lib/agents";
import { Button } from "@/components/ui/controls";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

/**
 * Body, colour, eyes, mouth, something to wear. Every option is drawn as the
 * character it would make — with the other choices kept — so picking is
 * seeing. Thumbnails hold still: two dozen breathing blobs is a lot of motion
 * beside the one big preview that is meant to be watched.
 */
export function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarSpec;
  onChange: (next: AvatarSpec) => void;
}) {
  const set = (patch: Partial<AvatarSpec>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <Row label="Character">
        {BLOB_BODIES.map((body) => (
          <Choice key={body} on={value.body === body} onClick={() => set({ body })} label={BLOB_LABEL[body]}>
            <AgentAvatar spec={{ ...value, body }} size={60} mood="still" />
          </Choice>
        ))}
      </Row>

      <Row label="Colour">
        {BLOB_COLOURS.map((colour) => (
          <button
            key={colour.key}
            type="button"
            onClick={() => set({ colour: colour.key })}
            aria-label={colour.label}
            aria-pressed={value.colour === colour.key}
            title={colour.label}
            className={clsx(
              "grid size-10 place-items-center rounded-full transition",
              value.colour === colour.key ? "ring-2 ring-accent ring-offset-2 ring-offset-panel" : "hover:scale-110",
            )}
          >
            <span
              className="size-8 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 30%, oklch(${Math.min(1, colour.light + 0.12)} ${colour.chroma} ${colour.hue}), oklch(${colour.light - 0.14} ${colour.chroma} ${colour.hue}))`,
              }}
            />
          </button>
        ))}
      </Row>

      <Row label="Eyes">
        {BLOB_EYES.map((eyes) => (
          <Choice key={eyes} on={value.eyes === eyes} onClick={() => set({ eyes })} label={BLOB_LABEL[eyes]}>
            <AgentAvatar spec={{ ...value, eyes, accessory: "none" }} size={48} mood="still" />
          </Choice>
        ))}
      </Row>

      <Row label="Mouth">
        {BLOB_MOUTHS.map((mouth) => (
          <Choice key={mouth} on={value.mouth === mouth} onClick={() => set({ mouth })} label={BLOB_LABEL[mouth]}>
            <AgentAvatar spec={{ ...value, mouth }} size={48} mood="still" />
          </Choice>
        ))}
      </Row>

      <Row label="Wearing">
        {BLOB_ACCESSORIES.map((accessory) => (
          <Choice
            key={accessory}
            on={value.accessory === accessory}
            onClick={() => set({ accessory })}
            label={BLOB_LABEL[accessory]}
          >
            <AgentAvatar spec={{ ...value, accessory }} size={48} mood="still" />
          </Choice>
        ))}
      </Row>

      <Button size="sm" variant="ghost" icon={Dices} onClick={() => onChange(randomAvatar())}>
        Surprise me
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="micro mb-2 text-ink-4">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Choice({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={label}
      className={clsx(
        "flex flex-col items-center gap-1 rounded-[14px] px-1.5 pb-1.5 pt-2 transition",
        on ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-panel-2",
      )}
    >
      {children}
      <span className={clsx("text-[10.5px]", on ? "font-semibold text-accent-text" : "text-ink-4")}>{label}</span>
    </button>
  );
}
