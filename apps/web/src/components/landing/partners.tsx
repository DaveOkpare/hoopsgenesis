import { cn } from "@hoops-genesis/ui/lib/utils";

import { SECTION_IDS } from "./links";

/*
 * Paper "Partners": 8I-0 (1440), QD-0 (1024), L3-0 (768), FR-0 (390).
 * Below 1024 the quote sits above a row (768) or 2x2 grid (390) of logos;
 * from 1024 the quote sits in the middle of one row of logos.
 */

const PARTNERS = [
  {
    name: "Bethany",
    src: "/landing/partner-bethany.svg",
    logo: "size-[88px] md:size-24 lg:size-[88px] min-[90rem]:size-[120px]",
    order: "lg:order-1",
  },
  {
    name: "Xiaomi",
    src: "/landing/partner-mi.svg",
    logo: "size-20 md:size-[84px] lg:size-[88px] min-[90rem]:size-[120px]",
    order: "lg:order-2",
  },
  {
    name: "Embassy REIT",
    src: "/landing/partner-embassy.svg",
    logo: "size-[92px] md:size-24 lg:size-[88px] min-[90rem]:size-[120px]",
    order: "lg:order-4",
  },
  {
    name: "FERWABA",
    src: "/landing/partner-ferwaba.svg",
    logo: "size-[150px] lg:size-[124px] min-[90rem]:size-[176px]",
    order: "lg:order-5",
  },
] as const;

export function Partners() {
  return (
    <section
      aria-labelledby="partners-title"
      className="flex flex-col items-center gap-7 bg-white px-5 py-16 md:gap-10 md:px-12 md:py-24 lg:gap-14 min-[90rem]:px-[120px] min-[90rem]:pt-28 min-[90rem]:pb-[120px]"
      id={SECTION_IDS.partners}
    >
      <div className="flex flex-col items-center gap-2 text-center md:gap-[10px] lg:gap-3">
        <h2
          className="font-display text-[44px] text-ink uppercase leading-display md:text-[64px] lg:tracking-display min-[90rem]:text-display-md"
          id="partners-title"
        >
          Proud partners
        </h2>
        <p className="font-sans text-base text-muted leading-[140%] md:text-[19px] lg:text-[22px] lg:leading-[135%]">
          Schools, federations and companies <br className="md:hidden" />
          who play with us
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-7 md:gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <figure className="flex w-full flex-col items-center gap-[18px] rounded-[20px] bg-fog px-6 py-7 md:w-[520px] md:gap-5 md:rounded-lg md:px-10 md:py-9 lg:order-3 lg:w-[340px] lg:shrink-0 lg:gap-6 lg:px-7 lg:py-8 min-[90rem]:w-[440px] min-[90rem]:px-9 min-[90rem]:py-10">
          <blockquote className="text-center font-sans text-[19px] text-ink leading-[135%] tracking-display md:text-[22px] md:tracking-[-0.015em] lg:text-[19px] min-[90rem]:text-xl">
            “Do not forget to lift up others on your way to greatness. For there
            is no greatness without compassion, love, joy and unity.”
          </blockquote>
          <figcaption className="flex items-center gap-[10px] lg:gap-3">
            <img
              alt=""
              className="size-9 shrink-0 rounded-full object-cover md:size-10 lg:size-11"
              height={158}
              loading="lazy"
              src="/landing/ceo.jpg"
              width={158}
            />
            <span className="flex flex-col">
              <span className="font-sans font-semibold text-[15px] text-ink leading-[18px] lg:text-base lg:leading-5">
                Innocent K.M
              </span>
              <span className="font-sans text-[13px] text-muted leading-4 lg:text-sm lg:leading-[18px]">
                CEO, Hoops Genesis
              </span>
            </span>
          </figcaption>
        </figure>
        <ul className="grid w-full grid-cols-2 md:flex md:items-center md:justify-between lg:contents">
          {PARTNERS.map((partner) => (
            <li
              className={cn(
                "flex h-[120px] min-w-0 items-center justify-center overflow-clip md:w-[150px] md:shrink-0 lg:h-[140px] lg:w-[124px] min-[90rem]:w-[180px]",
                partner.order
              )}
              key={partner.name}
            >
              <img
                alt={partner.name}
                className={cn("shrink-0 object-contain", partner.logo)}
                height={120}
                loading="lazy"
                src={partner.src}
                width={120}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
