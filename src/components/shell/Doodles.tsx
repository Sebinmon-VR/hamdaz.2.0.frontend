/**
 * Loose line art behind the top of every screen.
 *
 * Positioned absolutely inside the app frame at z-index -1. The frame sets
 * `isolation: isolate`, which puts this above the app's own background but
 * below everything in normal flow — so no panel needs a z-index of its own.
 *
 * Strokes are `currentColor`, inheriting the frame's ink, so the same drawing
 * inks itself white on dark and black on light. The mask in `.doodle` fades it
 * out before it reaches the working area, and `--doodle` carries a different
 * opacity per mode: white on near-black reads weaker than black on off-white,
 * so the same number would not look like the same amount of ink.
 */
export function Doodles() {
  return (
    <div
      aria-hidden="true"
      className="doodle pointer-events-none absolute inset-x-0 top-0 -z-[1] h-[660px]"
    >
      <svg
        viewBox="0 0 1408 660"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMin slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* a spiral unwinding out of the corner */}
        <path d="M118 92c-22-16-52-8-60 16-10 30 20 54 50 46 38-10 50-58 24-88C100 30 40 44 24 92" />
        <path d="M150 176c14-6 30-4 42 6" />

        {/* the run of wave you draw while on a call */}
        <path d="M292 62c16-20 32-20 48 0s32 20 48 0 32-20 48 0 32 20 48 0" />

        {/* four-point sparkles, two of them picking up the accent */}
        <path
          d="M214 40c2 10 5 13 15 15-10 2-13 5-15 15-2-10-5-13-15-15 10-2 13-5 15-15z"
          stroke="var(--accent)"
          strokeWidth="1.6"
        />
        <path d="M552 118c1.6 8 4 10 12 12-8 1.6-10 4-12 12-1.6-8-4-10-12-12 8-1.6 10-4 12-12z" />
        <path
          d="M1042 44c2 10 5 13 15 15-10 2-13 5-15 15-2-10-5-13-15-15 10-2 13-5 15-15z"
          stroke="var(--accent)"
          strokeWidth="1.6"
        />

        {/* the long sweep across the middle of the band */}
        <path d="M596 136C724 44 944 38 1084 120" strokeDasharray="7 11" />

        {/* arcs breaking the top-right corner */}
        <path d="M1408 210a168 168 0 0 0-172-176" />
        <path d="M1408 148a112 112 0 0 0-116-118" />
        <path d="M1408 86a54 54 0 0 0-58-58" />

        {/* a circle scribbled twice round, the way one actually gets drawn */}
        <path d="M1186 246c-26-4-44 12-42 30 2 20 26 32 46 24 22-8 30-34 16-50-15-17-45-14-56 6" />

        {/* an arrow with a curled tail */}
        <path d="M96 344c34-40 96-50 144-20" />
        <path d="M224 306l18 18-22 14" />

        {/* three bars, drawn rather than plotted */}
        <path d="M330 366V318M362 366v-74M394 366v-38M312 372h100" />

        {/* a loose pair of brackets holding nothing in particular */}
        <path d="M876 260c-14 6-14 62 0 68M986 260c14 6 14 62 0 68" />

        <path d="M1088 336l26-30 26 30 26-30 26 30 26-30 26 30" />

        {/* by here the mask has it nearly gone, so keep it quiet */}
        <path d="M108 470c56-18 118-16 172 6" strokeDasharray="5 10" />
        <path d="M470 452c18 16 34 16 50 0" />
        <path d="M700 500c-18-2-30 10-28 22 2 14 18 22 32 16 15-6 20-24 10-34" />
        <path d="M900 476l16 18 32-40" stroke="var(--accent)" />
        <path d="M1120 460c30-14 66-12 94 6" strokeDasharray="5 10" />
        <path d="M1246 540c2 10 5 13 15 15-10 2-13 5-15 15-2-10-5-13-15-15 10-2 13-5 15-15z" />
        <path d="M300 566c48-10 96-8 142 6" />
        <path d="M640 596c22-12 46-12 68 0" />
      </svg>
    </div>
  );
}
