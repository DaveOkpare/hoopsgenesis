import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { CloseIcon, MenuIcon } from "./landing-icons";
import { COUNTRIES, CTA_HREF, NAV_LINKS, SECTION_IDS } from "./links";

/* Paper 8I-0 / QD-0 / L3-0 / FR-0 nav pill, and K8-0 (menu open, below 1024px). */

const DESKTOP_QUERY = "(min-width: 1024px)";
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function LogoMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange font-display text-ink text-lg leading-[22px]"
    >
      HG
    </span>
  );
}

const pillButton =
  "inline-flex items-center justify-center rounded-full font-sans font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-[#E8E8E6]";

export function LandingNav({ defaultMenuOpen = false }) {
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const openMenu = useCallback(() => setMenuOpen(true), []);
  /* Dismissed (close button, Escape): focus goes back to the toggle. */
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    toggleRef.current?.focus();
  }, []);
  /* Followed a link: leave focus and scroll to the browser. */
  const leaveMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header className="w-full">
      <nav
        aria-label="Main"
        className="flex w-full items-center justify-between rounded-full bg-[#E8E8E6] py-2 pr-2 pl-[14px] md:py-[10px] md:pr-[10px] md:pl-5 lg:py-3 lg:pr-3 lg:pl-7"
      >
        <a
          aria-label="Hoops Genesis home"
          className="flex shrink-0 items-center gap-[10px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange min-[90rem]:w-[200px]"
          href="#top"
        >
          <LogoMark />
          <span className="hidden font-display text-[22px] text-ink uppercase leading-7 md:inline lg:text-lg lg:leading-[22px] lg:tracking-[0.01em] min-[90rem]:text-[22px] min-[90rem]:leading-7">
            Hoops Genesis
          </span>
        </a>
        <ul className="hidden gap-6 lg:flex min-[90rem]:gap-10">
          {NAV_LINKS.map((link) => (
            <li
              className={cn(
                link.label === "Community" && "hidden min-[90rem]:block"
              )}
              key={link.label}
            >
              <a
                className="font-medium font-sans text-[15px] text-ink leading-[18px] underline-offset-4 outline-none hover:underline focus-visible:underline min-[90rem]:text-[17px] min-[90rem]:leading-[22px]"
                href={link.href}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a
            className={cn(
              pillButton,
              "bg-ink px-[18px] py-3 text-[15px] text-white leading-[18px] hover:bg-ink-soft md:px-[22px] md:py-[14px] md:text-base md:leading-5 lg:px-[18px] lg:py-[13px] lg:text-[15px] lg:leading-[18px] min-[90rem]:px-7 min-[90rem]:py-4 min-[90rem]:text-[17px] min-[90rem]:leading-[22px]"
            )}
            href={CTA_HREF}
          >
            Book a court
          </a>
          <Link
            className={cn(
              pillButton,
              "hidden border border-line bg-white px-[18px] py-[13px] text-[15px] text-ink leading-[18px] hover:bg-fog lg:inline-flex min-[90rem]:px-7 min-[90rem]:py-4 min-[90rem]:text-[17px] min-[90rem]:leading-[22px]"
            )}
            to="/login"
          >
            Log in
          </Link>
          <button
            aria-controls={menuId}
            aria-expanded={menuOpen}
            aria-label="Open menu"
            className={cn(
              pillButton,
              "size-11 shrink-0 bg-white text-ink hover:bg-fog md:size-12 lg:hidden"
            )}
            onClick={openMenu}
            ref={toggleRef}
            type="button"
          >
            <MenuIcon />
          </button>
        </div>
      </nav>
      {menuOpen ? (
        <MobileMenu id={menuId} onClose={closeMenu} onNavigate={leaveMenu} />
      ) : null}
    </header>
  );
}

function useMenuBehaviour(
  panelRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) {
        return;
      }
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onDesktop);
    return () => {
      body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [panelRef, onClose]);
}

function MobileMenu({
  id,
  onClose,
  onNavigate,
}: {
  id: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useMenuBehaviour(panelRef, onClose);

  return (
    <div
      aria-label="Menu"
      aria-modal="true"
      className="fixed inset-0 z-50 flex bg-ink p-3 lg:hidden"
      id={id}
      ref={panelRef}
      role="dialog"
    >
      <div className="flex w-full flex-col justify-between overflow-y-auto rounded-[28px] bg-[#E8E8E6] px-2 pt-2 pb-7">
        <div className="flex flex-col gap-10">
          <div className="flex items-center justify-between pl-[6px]">
            <LogoMark />
            <button
              aria-label="Close menu"
              className={cn(pillButton, "size-11 bg-white text-ink")}
              data-autofocus
              onClick={onClose}
              type="button"
            >
              <CloseIcon />
            </button>
          </div>
          <ul className="flex flex-col gap-[6px] px-[14px]">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  className="font-display text-[52px] text-ink uppercase leading-[105%] outline-none hover:text-orange-deep focus-visible:text-orange-deep focus-visible:underline"
                  href={link.href}
                  onClick={onNavigate}
                >
                  {link.menuLabel}
                </a>
              </li>
            ))}
          </ul>
          <ul aria-label="Where we play" className="flex gap-2 px-[14px]">
            {COUNTRIES.map((country) => (
              <li key={country.label}>
                <a
                  className={cn(
                    pillButton,
                    "gap-2 bg-white px-[14px] py-2 font-medium text-[15px] text-ink leading-[18px]"
                  )}
                  href={`#${SECTION_IDS.cities}`}
                  onClick={onNavigate}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-2 shrink-0 rounded-full", country.dot)}
                  />
                  {country.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-[10px] px-[6px] pt-10">
          <a
            className={cn(
              pillButton,
              "bg-ink p-[18px] text-[17px] text-white leading-[22px]"
            )}
            href={CTA_HREF}
            onClick={onNavigate}
          >
            Book a court
          </a>
          <Link
            className={cn(
              pillButton,
              "bg-white p-[18px] text-[17px] text-ink leading-[22px]"
            )}
            to="/login"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
