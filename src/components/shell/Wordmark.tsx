import Link from "next/link";
import clsx from "clsx";

/**
 * The mark, reduced to what makes the Hamdaz logo recognisable at this size:
 * pink bars stacked above and below a rule in the accent. The full lockup has
 * three bars each side of the word; at 28px two rows read as the same thing
 * and more turns to mud.
 *
 * Both colours are tokens, so it recolours with the palette rather than being
 * a fixed image.
 */
export function Wordmark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/dashboard"
      aria-label="Hamdaz, home"
      className={clsx("flex shrink-0 items-center gap-2.5", className)}
    >
      <span aria-hidden className="grid gap-[2.5px]">
        <Bars />
        <span className="block h-[2.5px] w-3.5 rounded-full bg-accent" />
        <Bars />
      </span>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-[-0.025em] lowercase">
          hamdaz
        </span>
      )}
    </Link>
  );
}

function Bars() {
  return (
    <span className="flex gap-[2.5px]">
      <span className="block h-[5px] w-[2.5px] rounded-full bg-second" />
      <span className="block h-[5px] w-[2.5px] rounded-full bg-second" />
      <span className="block h-[5px] w-[2.5px] rounded-full bg-second" />
    </span>
  );
}
