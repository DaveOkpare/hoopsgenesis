import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import type { ReactNode } from "react";

/*
 * Placeholder for a screen that hasn't been built yet. It names the Paper artboards the
 * screen must match. Replace the whole component body when you build the screen.
 */
export function RouteStub({
  eyebrow,
  title,
  web,
  phone,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Paper desktop artboard, e.g. "1I2-0 Members". */
  web?: string;
  /** Paper 390px artboard, e.g. "5TZ-0 Unpaid fees". */
  phone?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader>
        <PageHeading>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <PageTitle>{title}</PageTitle>
        </PageHeading>
      </PageHeader>
      {children}
      <StubNote phone={phone} web={web} />
    </>
  );
}

/** The "not built yet" box on its own, for stubs that already render a real header. */
export function StubNote({ web, phone }: { web?: string; phone?: string }) {
  return (
    <section
      aria-label="Screen not built yet"
      className="flex flex-col gap-1 rounded-[20px] border-[1.5px] border-stone border-dashed p-6 text-muted text-sm leading-[18px]"
    >
      <p className="font-semibold text-ink">Screen not built yet</p>
      <p>
        Paper web: {web ?? "none (phone design only)"} · Paper phone:{" "}
        {phone ?? "none (use the web design, stacked)"}
      </p>
    </section>
  );
}
