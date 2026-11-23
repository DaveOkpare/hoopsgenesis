import { cn } from "@hoops-genesis/ui/lib/utils";

import { CTA_HREF, SECTION_IDS } from "./links";

/*
 * Paper "Cities": 8I-0 (1440), QD-0 (1024), L3-0 (768), FR-0 (390).
 * Kigali is the active city: its row of tiles is wider than the viewport from 768 up
 * and overflows both edges, centred on the city name.
 */

const cityName =
  "font-medium font-sans text-[48px] text-ink leading-none tracking-[-0.035em] md:text-display-md md:leading-none lg:text-[88px] min-[90rem]:text-[104px]";

const tile =
  "shrink-0 overflow-clip rounded-sm border-[3px] border-rwanda md:size-[104px] md:rounded-[12px] md:border-4 lg:size-[120px] min-[90rem]:size-40";

function PhotoTile({ src, className }: { src: string; className?: string }) {
  return (
    <div className={cn(tile, "size-16", className)}>
      <img
        alt=""
        className="size-full object-cover"
        height={320}
        src={src}
        width={480}
      />
    </div>
  );
}

function CountryBadge({
  country,
  dot,
  className,
}: {
  country: string;
  dot: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-[6px] md:absolute md:top-1 md:gap-2 md:rounded-full md:bg-fog md:px-3 md:py-[6px] lg:top-2",
        className
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
      <span className="font-medium font-sans text-muted text-sm leading-[18px] md:text-ink">
        {country}
      </span>
    </span>
  );
}

function Kigali() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 px-[6px] md:gap-2 md:px-0">
      <h3 className={cityName}>Kigali</h3>
      <a
        className="font-sans text-[15px] text-muted leading-[18px] underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:underline md:text-lg md:leading-[22px] lg:text-[22px] lg:leading-7"
        href={CTA_HREF}
      >
        Explore Rwanda ↗
      </a>
    </div>
  );
}

export function Cities() {
  return (
    <section
      aria-labelledby="cities-title"
      className="flex flex-col items-center gap-10 overflow-clip bg-white py-[72px] md:gap-14 md:py-24 lg:gap-[72px] lg:py-28 min-[90rem]:py-[140px]"
      id={SECTION_IDS.cities}
    >
      <div className="flex flex-col items-center gap-2 px-5 text-center md:gap-3">
        <h2
          className="font-display text-[44px] text-ink uppercase leading-display md:text-[64px] md:tracking-display min-[90rem]:text-display-md"
          id="cities-title"
        >
          The best courts <br className="lg:hidden" />
          in your city
        </h2>
        <p className="font-sans text-base text-muted leading-[140%] md:text-[19px] md:leading-[135%] lg:text-[22px]">
          Find an academy near you and see <br className="md:hidden" />
          who’s training this week
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-7 md:gap-9">
        <div className="relative flex flex-col items-center gap-[6px]">
          <h3 className={cityName}>Bengaluru</h3>
          <CountryBadge
            className="md:right-[-84px] lg:right-[-92px] min-[90rem]:right-[-104px]"
            country="India"
            dot="bg-india"
          />
        </div>

        {/* Phone: four photos around the name. */}
        <div className="flex w-full items-center justify-center gap-[10px] md:hidden">
          <PhotoTile src="/landing/city-3.jpg" />
          <PhotoTile src="/landing/city-1.jpg" />
          <Kigali />
          <PhotoTile src="/landing/city-2.jpg" />
          <PhotoTile src="/landing/city-4.jpg" />
        </div>

        {/* 768 and up: three tiles each side, row wider than the viewport. */}
        <div className="flex w-[1040px] shrink-0 items-center justify-between max-md:hidden lg:w-[1240px] min-[90rem]:w-[1440px]">
          <div className="flex gap-[10px] lg:gap-3 min-[90rem]:gap-4">
            <PhotoTile src="/landing/city-1.jpg" />
            <div
              className={cn(tile, "flex items-center justify-center bg-ink")}
            >
              <span className="text-center font-display text-orange text-xl uppercase leading-[90%] lg:text-[28px] min-[90rem]:text-[34px]">
                3v3
                <br />
                Sat
              </span>
            </div>
            <PhotoTile src="/landing/city-2.jpg" />
          </div>
          <Kigali />
          <div className="flex gap-[10px] lg:gap-3 min-[90rem]:gap-4">
            <div className={cn(tile, "flex items-end bg-orange p-2 lg:p-3")}>
              <span className="font-display text-[20px] text-ink uppercase leading-[90%] lg:text-[22px] min-[90rem]:text-[28px]">
                U-14
                <br />
                Trials
              </span>
            </div>
            <PhotoTile src="/landing/city-3.jpg" />
            <PhotoTile src="/landing/city-4.jpg" />
          </div>
        </div>

        <div className="relative flex flex-col items-center gap-[6px]">
          <h3 className={cityName}>Kampala</h3>
          <CountryBadge
            className="md:right-[-96px] lg:right-[-106px] min-[90rem]:right-[-118px]"
            country="Uganda"
            dot="bg-uganda"
          />
        </div>
      </div>
    </section>
  );
}
