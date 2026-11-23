import { GET_THE_APP_HREF } from "@/components/app-shell/phone-nudge-card";

/*
 * Where landing links go. There are no public Academies/Courts/Leagues pages yet, so
 * nav items jump to the matching section of this page, and calls to action that need
 * the product (book, join, learn more) use the foundation's "Get the app" placeholder.
 */
export const SECTION_IDS = {
  partners: "partners",
  reasons: "reasons",
  cities: "cities",
  programs: "programs",
  about: "about",
} as const;

export const CTA_HREF = GET_THE_APP_HREF;

export const NAV_LINKS = [
  {
    label: "Academies",
    menuLabel: "Academies",
    href: `#${SECTION_IDS.programs}`,
  },
  { label: "Courts", menuLabel: "Courts", href: `#${SECTION_IDS.cities}` },
  {
    label: "Leagues & Events",
    menuLabel: "Leagues",
    href: `#${SECTION_IDS.reasons}`,
  },
  {
    label: "Community",
    menuLabel: "Community",
    href: `#${SECTION_IDS.partners}`,
  },
  { label: "About", menuLabel: "About", href: `#${SECTION_IDS.about}` },
] as const;

export const COUNTRIES = [
  { label: "India", dot: "bg-india" },
  { label: "Rwanda", dot: "bg-rwanda" },
  { label: "Uganda", dot: "bg-uganda" },
] as const;
