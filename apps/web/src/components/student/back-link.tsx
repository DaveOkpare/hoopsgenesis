import { Link, type LinkProps } from "@tanstack/react-router";

import { ChevronLeftIcon } from "@/components/student/icons";

/*
 * Back control of the student's detail pages ("Fee detail" FK2-0, "Record detail"
 * G0D-0). Phones: a 40px round fog button. Tablet and desktop: a text link with the
 * page it returns to, as on the record screens.
 */
export function BackLink({ label, ...link }: LinkProps & { label: string }) {
  return (
    <>
      <Link
        {...link}
        aria-label={label}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fog text-ink outline-none hover:bg-stone/60 focus-visible:ring-2 focus-visible:ring-ink md:hidden"
      >
        <ChevronLeftIcon />
      </Link>
      <Link
        {...link}
        className="flex w-fit items-center gap-1 rounded-sm font-semibold text-ink text-sm leading-[18px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ink max-md:hidden"
      >
        <ChevronLeftIcon height={14} width={14} />
        {label}
      </Link>
    </>
  );
}
