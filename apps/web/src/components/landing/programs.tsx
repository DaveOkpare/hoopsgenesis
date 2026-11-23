import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";

import { BasketballIcon, FootballIcon } from "./landing-icons";
import { CTA_HREF, SECTION_IDS } from "./links";

/*
 * Paper "More Than Practice": 4 cards in a row at 1024/1440, 2x2 at 768, and on the
 * 390 artboard a tab switcher (Basketball, Football, Courts, Leagues) over one card.
 * Only the Basketball tab is drawn in Paper; the other tabs reuse the desktop cards
 * at the phone card size.
 */

type ProgramId = "basketball" | "football" | "courts" | "leagues";

interface Program {
  /** Caption before the link; `long` is dropped at 1024 only, as in QD-0. */
  caption: { short: string; long?: string };
  id: ProgramId;
  link?: string;
  tab: string;
}

const PROGRAMS: Program[] = [
  {
    id: "basketball",
    tab: "Basketball",
    caption: { short: "Basketball", long: " academy" },
    link: "Learn more",
  },
  {
    id: "football",
    tab: "Football",
    caption: { short: "Football", long: " academy" },
    link: "Learn more",
  },
  {
    id: "courts",
    tab: "Courts",
    caption: { short: "Courts", long: " by the hour" },
    link: "Book now",
  },
  { id: "leagues", tab: "Leagues", caption: { short: "Leagues & events" } },
];

const cardBase =
  "flex h-80 shrink-0 flex-col rounded-lg p-[22px] md:h-[260px] lg:h-[230px] lg:p-6 min-[90rem]:h-[300px]";
const cardTitle =
  "font-display text-[64px] uppercase leading-[90%] md:text-[52px] lg:text-2xl lg:leading-[90%] min-[90rem]:text-display-sm min-[90rem]:leading-[90%]";
const eyebrow =
  "font-sans font-semibold text-[13px] uppercase leading-4 tracking-[0.06em] lg:text-sm lg:leading-[18px]";
const cardIcon =
  "size-[72px] shrink-0 md:size-16 lg:size-[52px] min-[90rem]:size-[72px]";

function SportCard({
  className,
  title,
  titleClass,
  eyebrowClass,
  icon,
}: {
  className: string;
  title: string;
  titleClass: string;
  eyebrowClass: string;
  icon: ReactNode;
}) {
  return (
    <div className={cn(cardBase, "justify-end", className)}>
      <p className={cn(eyebrow, "mb-auto md:hidden", eyebrowClass)}>
        Weekday &amp; weekend sessions
      </p>
      <div className="flex items-end justify-between">
        <p className={cn(cardTitle, titleClass)}>{title}</p>
        {icon}
      </div>
    </div>
  );
}

function ProgramCard({ id }: { id: ProgramId }) {
  if (id === "basketball") {
    return (
      <SportCard
        className="bg-ink"
        eyebrowClass="text-[#A8A8A8]"
        icon={<BasketballIcon className={cardIcon} />}
        title="Hoops"
        titleClass="text-orange"
      />
    );
  }
  if (id === "football") {
    return (
      <SportCard
        className="bg-[#E9E9E6]"
        eyebrowClass="text-muted"
        icon={<FootballIcon className={cardIcon} />}
        title="Boots"
        titleClass="text-ink"
      />
    );
  }
  if (id === "courts") {
    return (
      <div className={cn(cardBase, "justify-between bg-orange")}>
        <p className={cn(eyebrow, "text-ink")}>From ₹590 / hour</p>
        <p className={cn(cardTitle, "text-ink")}>
          Book a<br />
          court
        </p>
      </div>
    );
  }
  return (
    <div className={cn(cardBase, "justify-between bg-white")}>
      <div className="flex justify-between">
        <p className="font-display text-[88px] text-ink leading-[90%] lg:text-[72px] min-[90rem]:text-[96px]">
          24
        </p>
        <p className={cn(eyebrow, "text-orange-deep")}>Teams</p>
      </div>
      <p className="font-display text-2xl text-ink uppercase leading-[95%] lg:text-[30px] min-[90rem]:text-2xl">
        Corporate
        <br />
        league
      </p>
    </div>
  );
}

function ProgramCaption({ program }: { program: Program }) {
  return (
    <p className="font-sans text-[17px] text-muted leading-[22px] md:text-lg md:leading-[22px] lg:text-[17px] lg:leading-[140%] min-[90rem]:text-[20px]">
      {program.caption.short}
      {program.caption.long ? (
        <span className="lg:max-[90rem]:hidden">{program.caption.long}</span>
      ) : null}
      {program.link ? (
        <>
          .{" "}
          <a
            className="text-ink underline decoration-1 underline-offset-[3px] outline-none hover:text-orange-deep focus-visible:text-orange-deep"
            href={CTA_HREF}
          >
            {program.link}
          </a>
        </>
      ) : null}
    </p>
  );
}

function ProgramTabs() {
  const [active, setActive] = useState<ProgramId>("basketball");
  const baseId = useId();
  const activeIndex = PROGRAMS.findIndex((program) => program.id === active);
  const activeProgram = PROGRAMS[activeIndex] ?? PROGRAMS[0];

  const select = useCallback(
    (index: number) => {
      const next = PROGRAMS.at(index % PROGRAMS.length);
      if (!next) {
        return;
      }
      setActive(next.id);
      document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
    },
    [baseId]
  );

  const onTabClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const next = PROGRAMS.find(
      (program) => program.id === event.currentTarget.dataset.program
    );
    if (next) {
      setActive(next.id);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keys: Record<string, number> = {
        ArrowRight: activeIndex + 1,
        ArrowLeft: activeIndex - 1 + PROGRAMS.length,
        Home: 0,
        End: PROGRAMS.length - 1,
      };
      const target = keys[event.key];
      if (target === undefined) {
        return;
      }
      event.preventDefault();
      select(target);
    },
    [activeIndex, select]
  );

  return (
    <div className="flex w-full flex-col gap-4 md:hidden">
      <div
        aria-label="Programs"
        className="flex w-full rounded-full bg-white p-1"
        onKeyDown={onKeyDown}
        role="tablist"
      >
        {PROGRAMS.map((program) => {
          const selected = program.id === active;
          return (
            <button
              aria-controls={`${baseId}-panel`}
              aria-selected={selected}
              className={cn(
                "flex grow basis-0 justify-center rounded-full py-[11px] font-sans font-semibold text-sm leading-[18px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange",
                selected ? "bg-ink text-white" : "text-muted hover:text-ink"
              )}
              data-program={program.id}
              id={`${baseId}-tab-${program.id}`}
              key={program.id}
              onClick={onTabClick}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {program.tab}
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`${baseId}-tab-${activeProgram.id}`}
        className="flex w-full flex-col gap-3"
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        <ProgramCard id={activeProgram.id} />
        <ProgramCaption program={activeProgram} />
      </div>
      <div aria-hidden="true" className="flex justify-center gap-[6px] pt-1">
        {PROGRAMS.map((program) => (
          <span
            className={cn(
              "h-[6px] shrink-0 rounded-full transition-all",
              program.id === active ? "w-5 bg-ink" : "w-[6px] bg-[#C8C8C8]"
            )}
            key={program.id}
          />
        ))}
      </div>
    </div>
  );
}

export function Programs() {
  return (
    <section
      aria-labelledby="programs-title"
      className="flex flex-col items-center gap-8 bg-fog px-5 py-[72px] md:items-stretch md:gap-12 md:px-12 md:py-24 lg:gap-16 min-[90rem]:p-[120px]"
      id={SECTION_IDS.programs}
    >
      <div className="flex flex-col items-center gap-2 text-center md:items-start md:gap-[10px] md:text-left lg:gap-3">
        <h2
          className="font-display text-[44px] text-ink uppercase leading-display md:text-[64px] lg:tracking-display min-[90rem]:text-display-md"
          id="programs-title"
        >
          More than <br className="md:hidden" />
          practice
        </h2>
        <p className="font-sans text-base text-muted leading-[140%] md:text-[19px] lg:text-[22px] lg:leading-[135%]">
          Everything you need to grow a team, <br className="md:hidden" />
          and a community
        </p>
      </div>
      <ProgramTabs />
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-9 max-md:hidden lg:grid-cols-4">
        {PROGRAMS.map((program) => (
          <li className="flex flex-col gap-[14px] lg:gap-4" key={program.id}>
            <ProgramCard id={program.id} />
            <ProgramCaption program={program} />
          </li>
        ))}
      </ul>
    </section>
  );
}
