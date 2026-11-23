import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { Input } from "@hoops-genesis/ui/components/input";
import { FieldMessage, LabelHint } from "@hoops-genesis/ui/components/label";
import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useId,
  useState,
} from "react";
import { toast } from "sonner";

import { BellIcon } from "@/components/coach/coach-icons";
import {
  sessionErrorMessage,
  sessionLongLabel,
  weekdayPlural,
} from "@/features/sessions/model";
import { type Session, useCancelSession } from "@/features/sessions/queries";
import type { Id } from "@/features/types";

const REASONS = ["Rain", "Holiday", "Court not available", "Other"] as const;
type Reason = (typeof REASONS)[number];
type Scope = "day" | "series";

function ScopeOption({
  value,
  checked,
  title,
  description,
  name,
  onChange,
}: {
  value: Scope;
  checked: boolean;
  title: string;
  description: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border-line border-b px-4 py-[14px] last:rounded-b-[17px] last:border-b-0 has-focus-visible:bg-fog [legend+&]:rounded-t-[17px]">
      <input
        checked={checked}
        className="peer sr-only"
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span
        aria-hidden="true"
        className={cn(
          "size-5 shrink-0 rounded-full border-solid",
          checked
            ? "border-[6px] border-ink"
            : "border-[#B5B5B5] border-[1.5px]"
        )}
      />
      <span className="flex flex-col gap-[2px]">
        <span
          className={cn(
            "text-[15px] text-ink leading-5",
            checked ? "font-semibold" : "font-medium"
          )}
        >
          {title}
        </span>
        <span className="text-[13px] text-muted leading-4">{description}</span>
      </span>
    </label>
  );
}

/**
 * "Cancel this session?" (CO-6, 5KW-0). Bottom sheet on phones, dialog on the web.
 * Not possible once anyone has checked in. Students on the team are notified.
 */
export function CancelDialog({
  session,
  open,
  academyId,
  onClose,
  onCancelled,
}: {
  session: Session;
  open: boolean;
  academyId: Id;
  onClose: () => void;
  onCancelled: (scope: Scope) => void;
}) {
  const [scope, setScope] = useState<Scope>("day");
  const [reason, setReason] = useState<Reason>("Rain");
  const [otherReason, setOtherReason] = useState("");
  const [showError, setShowError] = useState(false);
  const cancel = useCancelSession(academyId);
  const { mutate, isPending } = cancel;
  const radioName = useId();
  const otherId = useId();

  const hasCheckIns = session.roster.some((e) => e.attendance);
  const series = session.seriesDates;
  const students = session.roster.length;
  const teamName = session.team?.name ?? "the team";
  const reasonText = reason === "Other" ? otherReason.trim() : reason;

  const handleScope = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setScope(event.target.value as Scope),
    []
  );
  const handleReason = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setReason(event.currentTarget.dataset.reason as Reason);
    setShowError(false);
  }, []);
  const handleOther = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setOtherReason(event.target.value),
    []
  );
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  const handleSubmit = useCallback(() => {
    if (!reasonText) {
      setShowError(true);
      return;
    }
    mutate(
      {
        eventId: session.event.id,
        sessionDate: session.sessionDate,
        reason: reasonText,
        scope,
      },
      {
        onSuccess: () => {
          toast.success(
            scope === "series" ? "Weekly series deleted." : "Session cancelled."
          );
          onCancelled(scope);
        },
        onError: (error) => toast.error(sessionErrorMessage(error)),
      }
    );
  }, [mutate, onCancelled, reasonText, scope, session]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader className="max-md:pt-5">
          <DialogTitle>Cancel this session?</DialogTitle>
          <DialogDescription className="leading-5">
            {sessionLongLabel(session)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-5 pt-5 max-md:pt-5">
          {hasCheckIns ? (
            <p className="rounded-[14px] bg-orange-soft px-[14px] py-3 text-orange-deep text-sm leading-[19px]">
              Someone has already checked in, so this session can't be
              cancelled.
            </p>
          ) : null}
          {series.length > 1 ? (
            <fieldset className="flex flex-col rounded-[18px] border border-line">
              <legend className="sr-only">What to cancel</legend>
              <ScopeOption
                checked={scope === "day"}
                description="Shows struck through on the calendar"
                name={radioName}
                onChange={handleScope}
                title="Just today"
                value="day"
              />
              <ScopeOption
                checked={scope === "series"}
                description={`Removes all ${series.length} remaining ${weekdayPlural(session.sessionDate)}`}
                name={radioName}
                onChange={handleScope}
                title="Delete the whole weekly series"
                value="series"
              />
            </fieldset>
          ) : null}
          <fieldset className="flex flex-col gap-[10px]">
            <legend className="mb-[10px] font-semibold text-ink text-sm leading-[18px]">
              Reason <LabelHint>(students see this)</LabelHint>
            </legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <FilterChip
                  className="px-[14px]"
                  data-reason={r}
                  key={r}
                  onClick={handleReason}
                  selected={reason === r}
                >
                  {r}
                </FilterChip>
              ))}
            </div>
            {reason === "Other" ? (
              <>
                <label className="sr-only" htmlFor={otherId}>
                  Reason students will see
                </label>
                <Input
                  aria-invalid={showError ? true : undefined}
                  id={otherId}
                  maxLength={120}
                  onChange={handleOther}
                  placeholder="e.g. Coach away at a tournament"
                  value={otherReason}
                />
                {showError ? (
                  <FieldMessage tone="error">
                    Tell students why the session is off.
                  </FieldMessage>
                ) : null}
              </>
            ) : null}
          </fieldset>
          <p className="flex items-center gap-[10px] rounded-[14px] bg-fog px-[14px] py-3 text-ink-soft text-sm leading-[19px]">
            <BellIcon className="shrink-0" />
            {students} students on {teamName} get a notification now.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Keep it
          </Button>
          <Button
            disabled={isPending || hasCheckIns}
            onClick={handleSubmit}
            variant="destructive"
          >
            {scope === "series" ? "Delete series" : "Cancel session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
