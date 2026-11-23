import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { Card } from "@hoops-genesis/ui/components/card";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, type LinkOptions, linkOptions } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { MobileAcademyBar } from "@/components/app-shell/academy-switcher";
import {
  type SetupSnapshot,
  type SetupStep,
  type SetupStepId,
  setupChecklistQueryOptions,
  useSkipSetupStep,
} from "@/features/setup/queries";
import type { Academy } from "@/features/types";
import { errorMessage } from "@/lib/api-client";

interface StepCopy {
  cta: string;
  description: string;
  estimate: string;
  link: LinkOptions;
  title: string;
}

/** Copy and the one call to action per step (story AO-1). */
const STEP_COPY: Record<SetupStepId, StepCopy> = {
  details: {
    title: "Confirm academy details and location",
    description:
      "Check the address, check-in radius, time zone and currency. Students can only check in inside the radius.",
    cta: "Confirm details",
    estimate: "~2 min",
    link: linkOptions({ to: "/admin/settings" }),
  },
  teams: {
    title: "Create your teams",
    description:
      "Teams decide which students each coach sees and who can check in to a session.",
    cta: "Create teams",
    estimate: "~3 min",
    link: linkOptions({ to: "/admin/teams" }),
  },
  coaches: {
    title: "Invite your coaches",
    description:
      "Coaches take attendance and look after their teams. Add them straight onto a team so they see the right students on day one.",
    cta: "Invite coaches",
    estimate: "~3 min",
    link: linkOptions({
      to: "/admin/members",
      search: { invite: 1, role: "coach" },
    }),
  },
  students: {
    title: "Invite your students",
    description:
      "Each student gets their own link. Put them on a team so they can check in from their first session.",
    cta: "Invite students",
    estimate: "~5 min",
    link: linkOptions({
      to: "/admin/members",
      search: { invite: 1, role: "student" },
    }),
  },
  qr: {
    title: "Print your check-in QR code",
    description:
      "Put the poster up where students arrive. They scan it with the app to check in.",
    cta: "Print QR code",
    estimate: "~2 min",
    link: linkOptions({ to: "/admin/qr" }),
  },
};

function CheckIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <path
        d="M3 7.2l2.6 2.6L11 4.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StepMarker({
  step,
  number,
  active,
}: {
  step: SetupStep;
  number: number;
  active: boolean;
}) {
  if (step.status === "done") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <CheckIcon />
      </span>
    );
  }
  if (active) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-orange font-bold text-[13px] text-orange-deep leading-4">
        {number}
      </span>
    );
  }
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-[#C8C8C8] border-[1.5px] font-semibold text-[13px] text-muted leading-4">
      {number}
    </span>
  );
}

function StepMeta({ step }: { step: SetupStep }) {
  const copy = STEP_COPY[step.id];
  const metaClass =
    "w-24 shrink-0 text-right text-muted text-sm leading-[18px]";
  if (step.status === "done" && step.id === "details") {
    return (
      <span className={metaClass}>
        <Link
          className="font-medium underline decoration-1 underline-offset-[3px] outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
          {...copy.link}
        >
          Edit
        </Link>
      </span>
    );
  }
  if (step.status === "done") {
    return <span className={metaClass}>{step.doneNote ?? "Done"}</span>;
  }
  return (
    <span className={metaClass}>
      {step.skipped ? "Skipped" : copy.estimate}
    </span>
  );
}

function ActiveStep({
  step,
  number,
  onSkip,
  skipping,
}: {
  step: SetupStep;
  number: number;
  onSkip: () => void;
  skipping: boolean;
}) {
  const copy = STEP_COPY[step.id];
  return (
    <li
      aria-current="step"
      className="flex gap-[14px] rounded-md bg-fog p-[18px] max-md:p-[14px]"
    >
      <StepMarker active number={number} step={step} />
      <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-base text-ink leading-5">
            {copy.title}
          </h3>
          <p className="text-[15px] text-muted leading-body">
            {copy.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className={cn(buttonVariants(), "px-[18px] py-[11px] text-sm")}
            {...copy.link}
          >
            {copy.cta}
          </Link>
          <Button
            className="px-[18px] py-[11px] text-muted text-sm hover:text-ink"
            disabled={skipping}
            onClick={onSkip}
            variant="ghost"
          >
            Skip for now
          </Button>
        </div>
      </div>
    </li>
  );
}

function ProgressSegments({
  steps,
  activeId,
}: {
  steps: SetupStep[];
  activeId: SetupStepId | null;
}) {
  return (
    <div aria-hidden="true" className="flex w-full gap-[6px]">
      {steps.map((step) => (
        <span
          className={cn(
            "h-[6px] flex-1 basis-0 rounded-full",
            step.status === "done" && "bg-ink",
            step.status !== "done" && step.id === activeId && "bg-orange",
            step.status !== "done" && step.id !== activeId && "bg-line"
          )}
          key={step.id}
        />
      ))}
    </div>
  );
}

function SetupChecklistCard({
  academy,
  snapshot,
}: {
  academy: Academy;
  snapshot: SetupSnapshot;
}) {
  const { data } = useQuery(setupChecklistQueryOptions(academy.id, snapshot));
  const skip = useSkipSetupStep();
  const active =
    data?.steps.find((s) => s.status === "todo" && !s.skipped) ?? null;
  const handleSkip = useCallback(() => {
    if (!active) {
      return;
    }
    skip.mutate(
      { academyId: academy.id, snapshot, stepId: active.id },
      {
        onSuccess: () =>
          toast.success(`Skipped “${STEP_COPY[active.id].title}” for now`),
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn’t skip that step. Try again.")
          ),
      }
    );
  }, [active, academy.id, snapshot, skip]);

  if (!data) {
    return (
      <Skeleton className="h-[503px] min-w-0 flex-[1.6_1_0%] rounded-[20px]" />
    );
  }
  const doneCount = data.steps.filter((s) => s.status === "done").length;
  return (
    <Card className="min-w-0 flex-[1.6_1_0%] p-7 max-md:p-5">
      <div className="flex flex-col gap-3 pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold text-ink text-lg leading-[22px]">
            Setup checklist
          </h2>
          <p className="font-semibold text-ink text-sm leading-[18px]">
            {doneCount} of {data.steps.length} done
          </p>
        </div>
        <ProgressSegments activeId={active?.id ?? null} steps={data.steps} />
      </div>
      <ol className="flex flex-col">
        {data.steps.map((step, index) => {
          const number = index + 1;
          if (step.id === active?.id) {
            return (
              <ActiveStep
                key={step.id}
                number={number}
                onSkip={handleSkip}
                skipping={skip.isPending}
                step={step}
              />
            );
          }
          const afterActive = data.steps[index - 1]?.id === active?.id;
          const done = step.status === "done";
          return (
            <li
              className={cn(
                "flex items-center gap-[14px] py-4 last:pb-0",
                !afterActive && "border-line border-t"
              )}
              key={step.id}
            >
              <StepMarker active={false} number={number} step={step} />
              {done ? (
                <span className="min-w-0 flex-1 font-medium text-base text-muted leading-5 line-through decoration-1">
                  <span className="sr-only">Done: </span>
                  {STEP_COPY[step.id].title}
                </span>
              ) : (
                <Link
                  className="min-w-0 flex-1 font-medium text-base text-ink leading-5 outline-none hover:underline focus-visible:underline"
                  {...STEP_COPY[step.id].link}
                >
                  {STEP_COPY[step.id].title}
                </Link>
              )}
              <StepMeta step={step} />
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Map placeholder from the design: streets, the check-in radius and the academy pin. */
function AcademyMap() {
  return (
    <div
      aria-hidden="true"
      className="relative h-[180px] shrink-0 overflow-clip rounded-[14px] bg-[#E4E7DF]"
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox="0 0 360 180"
      >
        <path
          d="M0 120 L360 70 M60 0 L130 180 M240 0 L210 180 M0 40 L360 150"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="10"
        />
        <path d="M0 90 L360 100" fill="none" stroke="#FFFFFF" strokeWidth="4" />
      </svg>
      <div className="absolute top-[35px] left-1/2 size-[110px] -translate-x-1/2 rounded-full border-2 border-rwanda bg-[#2BA3E129]" />
      <div className="absolute top-20 left-1/2 size-5 -translate-x-1/2 rounded-full border-4 border-white bg-ink" />
    </div>
  );
}

function AcademyCard({ academy }: { academy: Academy }) {
  const rows = [
    { label: "Address", value: academy.location ?? "Not set" },
    { label: "Check-in radius", value: `${academy.attendanceRadiusM} m` },
    { label: "Time zone", value: academy.timezone },
    { label: "Currency", value: academy.defaultCurrency },
  ];
  return (
    <Card className="min-w-0 flex-[1_1_0%] gap-[18px]" variant="fog">
      <h2 className="font-semibold text-ink text-lg leading-[22px]">
        Your academy
      </h2>
      <AcademyMap />
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            className="flex justify-between gap-4 border-line border-b py-[10px] last:border-b-0"
            key={row.label}
          >
            <dt className="text-muted text-sm leading-[18px]">{row.label}</dt>
            <dd className="text-right font-medium text-ink text-sm leading-[18px]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** "Let's get you ready" (1FH-0, story AO-1). Also the admin home until setup is done. */
export function SetupScreen({
  academy,
  snapshot,
}: {
  academy: Academy;
  snapshot: SetupSnapshot;
}) {
  const { data } = useQuery(setupChecklistQueryOptions(academy.id, snapshot));
  return (
    <>
      <MobileAcademyBar />
      <PageHeader>
        <PageHeading>
          <Eyebrow>Welcome to {academy.name}</Eyebrow>
          <PageTitle>Let’s get you ready</PageTitle>
        </PageHeading>
        {data?.complete ? (
          <PageActions className="max-md:hidden">
            <Link
              className={buttonVariants({ variant: "outline" })}
              to="/admin"
            >
              Go to dashboard
            </Link>
          </PageActions>
        ) : null}
      </PageHeader>
      <div className="flex items-start gap-4 max-lg:flex-col max-lg:items-stretch">
        <SetupChecklistCard academy={academy} snapshot={snapshot} />
        <AcademyCard academy={academy} />
      </div>
    </>
  );
}
