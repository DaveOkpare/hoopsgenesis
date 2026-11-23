import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, type LinkProps } from "@tanstack/react-router";

import { ChevronLeftIcon } from "@/components/student/icons";

/*
 * Top of the record screens. Phones (44B-0, 5DZ-0): a round back button and a centred
 * title. Desktop: a back link over the page header.
 */
export function RecordHeader({
  back,
  backLabel,
  phoneTitle,
  eyebrow,
  title,
  phoneTitleClassName,
}: {
  back: LinkProps;
  backLabel: string;
  phoneTitle: string;
  eyebrow?: string;
  /** Desktop page title; omit when the page renders its own big title. */
  title?: string;
  phoneTitleClassName?: string;
}) {
  // The page's h1 on phones, unless the page shows its own big title.
  const PhoneTitle = title ? "h1" : "p";
  return (
    <>
      <div className="flex items-center justify-between md:hidden">
        <Link
          {...back}
          aria-label={backLabel}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fog text-ink outline-none hover:bg-stone/60 focus-visible:ring-2 focus-visible:ring-ink"
        >
          <ChevronLeftIcon />
        </Link>
        <PhoneTitle
          className={cn(
            "font-semibold text-base text-ink leading-5",
            phoneTitleClassName
          )}
        >
          {phoneTitle}
        </PhoneTitle>
        <span aria-hidden="true" className="size-9 shrink-0" />
      </div>
      <div className="flex flex-col gap-4 max-md:hidden">
        <Link
          {...back}
          className="flex w-fit items-center gap-1 rounded-sm font-semibold text-ink text-sm leading-[18px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ink"
        >
          <ChevronLeftIcon height={14} width={14} />
          {backLabel}
        </Link>
        {title ? (
          <PageHeader>
            <PageHeading>
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <PageTitle>{title}</PageTitle>
            </PageHeading>
          </PageHeader>
        ) : null}
      </div>
    </>
  );
}
