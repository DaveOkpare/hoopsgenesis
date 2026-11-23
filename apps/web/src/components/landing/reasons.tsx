import { cn } from "@hoops-genesis/ui/lib/utils";
import type { CSSProperties } from "react";

import { SECTION_IDS } from "./links";

/*
 * Paper "Reasons To Play": a fanned diagonal of 240x365 cards (photos are pre-skewed
 * PNGs, posters are skewed SVGs). Card i sits at (x0 + dx*i, y0 + dy*i) on a stage the
 * size of the artboard section; positions are turned into percentages so the stage
 * scales with the viewport between artboard widths.
 *   390:  stage 390x660,   card 144, x -40 +52i,  y 400 -21i, cards 0-8
 *   768:  stage 768x940,   card 192, x -30 +66i,  y 600 -27i, cards 0-11
 *   1024: stage 1024x880,  card 173, x -30 +62i,  y 560 -25i, cards 0-15
 *   1440: stage 1440x1000, card 240, x -44 +92i,  y 564 -37i, cards 0-15
 */

interface PosterLine {
  fill: string;
  label?: boolean;
  size: number;
  text: string;
  x: number;
  y: number;
}

type ReasonCard =
  | { kind: "photo"; src: string }
  | { kind: "poster"; title: string; fill: string; lines: PosterLine[] };

const label = (text: string, y: number, fill: string): PosterLine => ({
  text,
  x: 18,
  y,
  size: 12,
  fill,
  label: true,
});
const display = (
  text: string,
  y: number,
  size: number,
  fill: string
): PosterLine => ({ text, x: 18, y, size, fill });

/* Index 0 is the front card (bottom left); 15 is the back card (top right). */
const CARDS: ReasonCard[] = [
  { kind: "photo", src: "/landing/reason-0.png" },
  {
    kind: "poster",
    title: "3v3 Saturday: pickup, all levels",
    fill: "#EB7724",
    lines: [
      display("3V3", 112, 104, "#111111"),
      display("SATURDAY", 172, 52, "#FFFFFF"),
      label("PICKUP · ALL LEVELS", 272, "#111111"),
    ],
  },
  { kind: "photo", src: "/landing/reason-2.png" },
  { kind: "photo", src: "/landing/reason-3.png" },
  {
    kind: "poster",
    title: "Kigali Camp: August, ages 8 to 16",
    fill: "#2BA3E1",
    lines: [
      label("AUGUST · AGES 8–16", 34, "#111111"),
      display("KIGALI", 214, 64, "#111111"),
      display("CAMP", 274, 64, "#FFFFFF"),
    ],
  },
  { kind: "photo", src: "/landing/reason-5.png" },
  { kind: "photo", src: "/landing/reason-6.png" },
  {
    kind: "poster",
    title: "U-14 Trials: Saturday, 7 AM, court 2",
    fill: "#111111",
    lines: [
      label("SAT · 7 AM · COURT 2", 34, "#A8A8A8"),
      display("U-14", 200, 84, "#EB7724"),
      display("TRIALS", 270, 64, "#FFFFFF"),
    ],
  },
  { kind: "photo", src: "/landing/reason-8.png" },
  {
    kind: "poster",
    title: "Kampala Open: weekend league, all ages",
    fill: "#23D27A",
    lines: [
      display("KAMPALA", 76, 62, "#111111"),
      display("OPEN", 134, 62, "#111111"),
      label("WEEKEND LEAGUE · ALL AGES", 272, "#111111"),
    ],
  },
  {
    kind: "poster",
    title: "Corporate Cup: Bengaluru, weekdays",
    fill: "#F5B900",
    lines: [
      label("BENGALURU · WEEKDAYS", 34, "#111111"),
      display("CORPORATE", 222, 56, "#111111"),
      display("CUP", 276, 56, "#111111"),
    ],
  },
  { kind: "photo", src: "/landing/reason-11.png" },
  { kind: "photo", src: "/landing/reason-12.png" },
  {
    kind: "poster",
    title: "Family Fun Day: bring the whole crew",
    fill: "#B8501A",
    lines: [
      display("FAMILY", 74, 60, "#FFFFFF"),
      display("FUN DAY", 130, 60, "#FFFFFF"),
      label("BRING THE WHOLE CREW", 272, "#FFE3CF"),
    ],
  },
  { kind: "photo", src: "/landing/reason-14.png" },
  {
    kind: "poster",
    title: "Football Fridays: every Friday, 6 PM",
    fill: "#111111",
    lines: [
      label("EVERY FRIDAY · 6 PM", 34, "#A8A8A8"),
      display("FOOTBALL", 222, 52, "#FFFFFF"),
      display("FRIDAYS", 272, 52, "#EB7724"),
    ],
  },
];

/* Phone shows the front 9 cards, tablet portrait the front 12. */
const PHONE_CARD_COUNT = 9;
const TABLET_CARD_COUNT = 12;

const cardPosition = (index: number): CSSProperties =>
  ({
    "--i": index,
    left: "calc((var(--x0) + var(--dx) * var(--i)) / var(--sw) * 100%)",
    top: "calc((var(--y0) + var(--dy) * var(--i)) / var(--sh) * 100%)",
    width: "calc(var(--cw) / var(--sw) * 100%)",
  }) as CSSProperties;

function Poster({ card }: { card: Extract<ReasonCard, { kind: "poster" }> }) {
  return (
    <svg
      aria-label={card.title}
      className="block h-auto w-full"
      role="img"
      viewBox="0 0 240 365"
    >
      <g transform="translate(4 5.4) skewY(14.8)">
        <rect fill={card.fill} height="293" rx="10" width="232" />
        {card.lines.map((line) => (
          <text
            className={line.label ? "font-sans font-semibold" : "font-display"}
            fill={line.fill}
            fontSize={line.size}
            key={line.text}
            letterSpacing={line.label ? 1 : undefined}
            x={line.x}
            y={line.y}
          >
            {line.text}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function Reasons() {
  /* Back cards first so the front card paints on top, as in Paper. */
  const backToFront = CARDS.map((card, index) => ({ card, index })).reverse();

  return (
    <section
      aria-labelledby="reasons-title"
      className="relative overflow-clip bg-[#F7F7F7]"
      id={SECTION_IDS.reasons}
    >
      <div className="relative mx-auto aspect-[390/660] w-full max-w-[560px] [--cw:144] [--dx:52] [--dy:-21] [--sh:660] [--sw:390] [--x0:-40] [--y0:400] md:aspect-[768/940] md:max-w-none lg:aspect-[1024/880] min-[90rem]:aspect-[1440/1000] min-[90rem]:max-w-[1680px] md:[--cw:192] md:[--dx:66] md:[--dy:-27] md:[--sh:940] md:[--sw:768] md:[--x0:-30] md:[--y0:600] lg:[--cw:173] lg:[--dx:62] lg:[--dy:-25] lg:[--sh:880] lg:[--sw:1024] lg:[--y0:560] min-[90rem]:[--cw:240] min-[90rem]:[--dx:92] min-[90rem]:[--dy:-37] min-[90rem]:[--sh:1000] min-[90rem]:[--sw:1440] min-[90rem]:[--x0:-44] min-[90rem]:[--y0:564]">
        {backToFront.map(({ card, index }) => (
          <div
            className={cn(
              "absolute",
              index >= PHONE_CARD_COUNT && "max-md:hidden",
              index >= TABLET_CARD_COUNT && "max-lg:hidden"
            )}
            key={card.kind === "photo" ? card.src : card.title}
            style={cardPosition(index)}
          >
            {card.kind === "photo" ? (
              <img
                alt=""
                className="block h-auto w-full"
                height={730}
                loading="lazy"
                src={card.src}
                width={480}
              />
            ) : (
              <Poster card={card} />
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-14 flex flex-col items-center gap-2 text-center md:top-24 md:right-auto md:left-12 md:items-start md:gap-3 md:text-left lg:gap-[14px] min-[90rem]:top-28 min-[90rem]:left-[120px]">
        <h2
          className="font-display text-[44px] text-ink uppercase leading-display md:text-[64px] lg:tracking-display min-[90rem]:text-display-md"
          id="reasons-title"
        >
          A million <br />
          reasons to play
        </h2>
        <p className="font-sans text-base text-muted leading-[140%] md:text-[19px] lg:text-[22px] lg:leading-[135%]">
          Camps, trials, leagues and Saturday pickup
        </p>
      </div>
    </section>
  );
}
