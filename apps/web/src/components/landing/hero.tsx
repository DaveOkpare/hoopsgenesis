import { cn } from "@hoops-genesis/ui/lib/utils";

import { ArrowIcon } from "./landing-icons";
import { LandingNav } from "./landing-nav";
import { CTA_HREF } from "./links";

/*
 * Paper "Hero": 8I-0 (1440), QD-0 (1024), L3-0 (768), FR-0 (390).
 * Breakpoints: base = 390 artboard, md = 768, lg = 1024, min-[90rem] = 1440 (rem so it sorts after lg).
 */

const heroButton =
  "inline-flex items-center gap-[10px] rounded-full px-[22px] py-[15px] font-sans font-semibold text-base leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink md:px-[26px] md:py-[17px] md:text-[17px] md:leading-[22px] lg:px-7 lg:py-[18px] lg:text-lg lg:leading-[22px]";

const bubbleRow =
  "absolute left-0 flex items-center gap-2 md:gap-[10px] lg:gap-3";
const bubbleDot =
  "size-[38px] shrink-0 rounded-full border-[3px] border-ink md:size-12 lg:size-[52px]";
const bubbleText =
  "rounded-[22px] px-4 py-[11px] font-sans text-base text-ink leading-5 md:rounded-[26px] md:px-[22px] md:py-[14px] md:text-[19px] md:leading-6 lg:rounded-[28px] lg:px-6 lg:py-4 lg:text-[17px] lg:leading-[22px] min-[90rem]:text-[20px] min-[90rem]:leading-6";

export function Hero({ defaultMenuOpen }: { defaultMenuOpen?: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-7 bg-ink px-3 pt-3 pb-14 md:gap-8 md:px-6 md:pt-4 md:pb-[72px] lg:gap-[72px] lg:px-12 lg:pt-6 lg:pb-24 min-[90rem]:gap-24 min-[90rem]:px-[120px] min-[90rem]:pt-8 min-[90rem]:pb-[120px]"
      id="top"
    >
      <LandingNav defaultMenuOpen={defaultMenuOpen} />
      <section
        aria-labelledby="hero-title"
        className="flex w-full flex-col items-center gap-7 md:gap-8 lg:flex-row lg:justify-between"
      >
        <div className="flex flex-col items-center gap-7 md:gap-8 lg:w-[460px] lg:shrink-0 lg:items-start min-[90rem]:w-[600px]">
          <div className="flex flex-col items-center gap-[14px] pt-5 md:gap-4 md:pt-8 lg:items-start lg:gap-8 lg:pt-0">
            <h1
              className="text-center font-display text-[64px] text-white uppercase leading-[90%] tracking-display md:text-[104px] md:leading-[88%] lg:text-left lg:text-[112px] min-[90rem]:text-[150px]"
              id="hero-title"
            >
              Game day <br className="max-lg:hidden" />
              is <br className="lg:hidden" />
              <span className="text-orange">every</span>{" "}
              <br className="max-lg:hidden" />
              day
            </h1>
            <p className="max-w-[320px] text-center font-sans text-[#D0D0D0] text-[17px] leading-[140%] md:max-w-[520px] md:text-[20px] lg:max-w-none lg:text-left lg:leading-[135%] lg:tracking-[-0.015em] min-[90rem]:text-xl">
              Basketball &amp; football academies, courts and leagues in India,
              Rwanda and Uganda.
            </p>
          </div>
          <div className="flex gap-2 md:gap-[10px] lg:gap-3 lg:pt-2">
            <a
              className={cn(
                heroButton,
                "bg-orange text-ink hover:bg-[#F08A3F]"
              )}
              href={CTA_HREF}
            >
              Join an academy
              <ArrowIcon className="hidden shrink-0 lg:inline-block" />
            </a>
            <a
              className={cn(
                heroButton,
                "border border-[#3A3A3A] text-white hover:border-[#5A5A5A]"
              )}
              href={CTA_HREF}
            >
              Book a court
            </a>
          </div>
        </div>
        <div className="relative mt-3 h-[440px] w-full max-w-[366px] shrink-0 md:mt-0 md:h-[640px] md:w-[620px] md:max-w-none lg:h-[540px] lg:w-[420px] min-[90rem]:h-[640px] min-[90rem]:w-[540px]">
          <div className="absolute inset-y-0 right-6 left-6 overflow-clip rounded-lg bg-[#222222] md:right-[60px] md:left-[60px] md:rounded-[32px] lg:right-0 lg:left-10">
            <img
              alt="A player shoots a jump shot during a Hoops Genesis training session"
              className="size-full object-cover"
              decoding="async"
              fetchPriority="high"
              height={900}
              src="/landing/hero.jpg"
              width={600}
            />
          </div>
          <div
            className={cn(
              bubbleRow,
              "top-[268px] md:top-[430px] lg:top-[330px] min-[90rem]:top-[380px]"
            )}
          >
            <span aria-hidden="true" className={cn(bubbleDot, "bg-rwanda")} />
            <p className={cn(bubbleText, "bg-[#ECECEA]")}>
              who’s playing saturday???
            </p>
          </div>
          <div
            className={cn(
              bubbleRow,
              "top-[330px] md:top-[510px] lg:top-[410px] min-[90rem]:top-[470px]"
            )}
          >
            <span aria-hidden="true" className={cn(bubbleDot, "bg-india")} />
            <p className={cn(bubbleText, "bg-white")}>
              all of us. 7am, court 2!!
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
