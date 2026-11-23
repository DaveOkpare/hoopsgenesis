import { ChevronDownIcon } from "./landing-icons";
import { CTA_HREF, SECTION_IDS } from "./links";

/*
 * Paper "Footer": link columns at 768 and up (beside the headline from 1024), an
 * accordion of the same groups on the 390 artboard.
 */

const FOOTER_GROUPS = [
  {
    title: "Play",
    accordionTitle: "Play",
    links: [
      { label: "Academies", href: `#${SECTION_IDS.programs}` },
      { label: "Courts", href: `#${SECTION_IDS.cities}` },
      { label: "Leagues", href: `#${SECTION_IDS.reasons}` },
    ],
  },
  {
    title: "Where",
    accordionTitle: "Where we play",
    links: [
      { label: "India", href: `#${SECTION_IDS.cities}` },
      { label: "Rwanda", href: `#${SECTION_IDS.cities}` },
      { label: "Uganda", href: `#${SECTION_IDS.cities}` },
    ],
  },
  {
    title: "Us",
    accordionTitle: "About us",
    links: [
      { label: "About", href: `#${SECTION_IDS.about}` },
      { label: "Partners", href: `#${SECTION_IDS.partners}` },
      { label: "Contact", href: CTA_HREF },
    ],
  },
] as const;

const footerLink =
  "font-sans text-lg text-white leading-[22px] underline-offset-4 outline-none hover:underline focus-visible:underline";

export function Footer() {
  return (
    <footer
      className="flex flex-col gap-9 bg-ink px-5 pt-14 pb-8 md:gap-12 md:px-12 md:pt-20 md:pb-10 lg:gap-14 lg:pt-24 lg:pb-12 min-[90rem]:px-[120px]"
      id={SECTION_IDS.about}
    >
      <img
        alt="Hoops Genesis Ventures"
        className="h-20 w-[104px] shrink-0 object-contain md:h-[92px] md:w-[120px] lg:h-[100px] lg:w-[130px]"
        height={461}
        src="/landing/hg-logo.png"
        width={600}
      />
      <div className="flex flex-col gap-9 md:gap-12 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <p className="font-display text-[72px] text-white uppercase leading-[88%] md:text-display-lg md:leading-[86%] lg:leading-[85%] lg:tracking-display min-[90rem]:text-[150px]">
          Fun, love
          <br />
          &amp; <span className="text-orange">sports</span>
        </p>

        {/* 768 and up: three columns. */}
        <nav
          aria-label="Footer"
          className="flex gap-[72px] max-md:hidden lg:gap-10 min-[90rem]:gap-16"
        >
          {FOOTER_GROUPS.map((group) => (
            <div
              className="flex w-[140px] shrink-0 flex-col gap-[14px] lg:w-auto"
              key={group.title}
            >
              <h2 className="font-medium font-sans text-[#8C8C8C] text-sm uppercase leading-[18px] tracking-label">
                {group.title}
              </h2>
              <ul className="flex flex-col gap-[14px]">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a className={footerLink} href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Phone: accordion. */}
        <nav aria-label="Footer" className="flex flex-col md:hidden">
          {FOOTER_GROUPS.map((group) => (
            <details
              className="group border-[#2E2E2E] border-t last:border-b"
              key={group.title}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between py-[18px] font-medium font-sans text-[17px] text-white leading-[22px] outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
                {group.accordionTitle}
                <ChevronDownIcon className="shrink-0 text-white transition-transform group-open:rotate-180" />
              </summary>
              <ul className="flex flex-col gap-[14px] pb-[18px]">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a className={footerLink} href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-[6px] font-sans text-[#8C8C8C] text-sm leading-[18px] md:flex-row md:justify-between md:gap-4 md:border-[#2E2E2E] md:border-t md:pt-6 md:text-[15px]">
        <p>© 2026 Hoops Genesis Ventures</p>
        <p>Aspire to inspire before we expire.</p>
      </div>
    </footer>
  );
}
