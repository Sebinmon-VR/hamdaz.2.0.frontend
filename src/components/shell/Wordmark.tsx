import Link from "next/link";

/**
 * The mark, reduced to what makes the Hamdaz logo recognisable at 28px: the
 * pink bars stacked above and below a blue rule. The full lockup has three
 * bars each side of the word; at this size two rows read as the same thing and
 * more would turn to mud.
 *
 * Both colours are brand tokens, so it recolours with the theme rather than
 * being a fixed image.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Hamdaz, home">
      <span className="grid size-8 shrink-0 place-items-center gap-[3px] rounded-[10px] bg-panel-3">
        <Bars />
        <span className="h-[2px] w-4 rounded-full bg-accent" />
        <Bars />
      </span>
      {!compact && (
        <span className="text-[14px] font-medium tracking-[-0.01em] text-ink">
          Hamdaz
          <span className="ml-1.5 align-super text-[9px] font-semibold tracking-normal text-ink-4">
            2.0
          </span>
        </span>
      )}
    </Link>
  );
}

function Bars() {
  return (
    <span aria-hidden className="flex gap-[2.5px]">
      <span className="h-[4px] w-[2.5px] rounded-full bg-highlight" />
      <span className="h-[4px] w-[2.5px] rounded-full bg-highlight" />
      <span className="h-[4px] w-[2.5px] rounded-full bg-highlight" />
    </span>
  );
}
