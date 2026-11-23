import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  type ChangeEvent,
  type MouseEvent,
  type Ref,
  useCallback,
  useId,
  useState,
} from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import {
  type MemberCandidate,
  memberSearchQueryOptions,
  useAddTeamMember,
} from "@/features/team-detail/queries";
import type { Id, Team } from "@/features/types";
import { errorMessage } from "@/lib/api-client";
import { initials } from "@/lib/format";

function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-ink"
      height="14"
      viewBox="0 0 16 16"
      width="14"
    >
      <circle
        cx="7"
        cy="7"
        fill="none"
        r="5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M11 11l3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

const PRONOUN = {
  she: { object: "her", possessive: "Her" },
  he: { object: "him", possessive: "His" },
  they: { object: "them", possessive: "Their" },
} as const;

function CandidateRow({
  candidate,
  team,
  pending,
  onAdd,
}: {
  candidate: MemberCandidate;
  team: Pick<Team, "id" | "name">;
  pending: boolean;
  onAdd: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const other = candidate.currentTeam;
  const avatar = (
    <Avatar size={32} tone={other ? "white" : "fog"}>
      <AvatarFallback>{initials(candidate.user.name)}</AvatarFallback>
    </Avatar>
  );
  if (other) {
    const words = PRONOUN[candidate.pronoun];
    return (
      <li className="flex flex-col gap-[10px] rounded-md bg-orange-soft p-3">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <p className="truncate font-semibold text-[15px] text-ink leading-5">
              {candidate.user.name}
            </p>
            <p className="text-[13px] text-orange-deep leading-4">
              Already on {other.name}
            </p>
          </div>
          <Button
            className="border-ink px-4 py-2"
            data-moved-from={other.name}
            data-moved-from-id={other.id}
            data-name={candidate.user.name}
            data-user-id={candidate.user.id}
            disabled={pending}
            onClick={onAdd}
            size="sm"
            variant="outline"
          >
            Move here
          </Button>
        </div>
        <p className="text-[13px] text-ink-soft leading-[18px]">
          Moving takes {words.object} off {other.name}. {words.possessive} past
          attendance stays with {other.name}.
        </p>
      </li>
    );
  }
  let note = "No team yet";
  if (candidate.role === "coach") {
    note = "Coach";
  }
  return (
    <li className="flex items-center gap-3 py-2">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="truncate font-semibold text-[15px] text-ink leading-5">
          {candidate.user.name}
        </p>
        <p className="text-[13px] text-muted leading-4">{note}</p>
      </div>
      <Button
        className="px-4 py-2"
        data-name={candidate.user.name}
        data-user-id={candidate.user.id}
        disabled={pending}
        onClick={onAdd}
        size="sm"
      >
        Add{" "}
        <span className="sr-only">
          {candidate.user.name} to {team.name}
        </span>
      </Button>
    </li>
  );
}

/**
 * "Add a student to U14" (AO-3, CO-10): search academy members; a student on another
 * team shows a warning and "Move here" instead of "Add".
 */
export function AddMemberPanel({
  academyId,
  team,
  memberRole = "student",
  initialQuery = "",
  inputRef,
  className,
  title,
  headingLevel = "h2",
}: {
  academyId: Id;
  team: Pick<Team, "id" | "name">;
  memberRole?: "student" | "coach";
  initialQuery?: string;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  title?: string;
  headingLevel?: "h2" | "h3";
}) {
  const [query, setQuery] = useState(initialQuery);
  const inputId = useId();
  // A failed search shows under the box (keeping what was typed), not over the page.
  const search = useQuery({
    ...memberSearchQueryOptions(academyId, team.id, memberRole, query),
    throwOnError: false,
  });
  const add = useAddTeamMember(academyId);
  const { mutate, isPending } = add;
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  );
  const handleAdd = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { userId, name, movedFrom, movedFromId } =
        event.currentTarget.dataset;
      if (!userId) {
        return;
      }
      mutate(
        { teamId: team.id, userId, fromTeamId: movedFromId ?? null },
        {
          onSuccess: () =>
            toast.success(
              movedFrom
                ? `${name} moved from ${movedFrom} to ${team.name}`
                : `${name} added to ${team.name}`
            ),
          onError: (error) =>
            toast.error(errorMessage(error, "Couldn't add them. Try again.")),
        }
      );
    },
    [mutate, team]
  );

  const results = search.data ?? [];
  const hasQuery = query.trim().length > 0;
  const Heading = headingLevel;
  const heading = title ?? `Add a ${memberRole} to ${team.name}`;

  return (
    <section className={cn("flex flex-col gap-[14px]", className)}>
      <Heading className="font-semibold text-base text-ink leading-5">
        <label htmlFor={inputId}>{heading}</label>
      </Heading>
      <div
        className={cn(
          "flex items-center gap-2 rounded-[14px] border-2 px-[14px] py-[11px] transition-colors focus-within:border-ink",
          hasQuery ? "border-ink" : "border-line"
        )}
      >
        <SearchGlyph />
        <input
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink leading-5 outline-none placeholder:text-muted"
          id={inputId}
          onChange={handleQuery}
          placeholder="Name or email"
          ref={inputRef}
          type="search"
          value={query}
        />
      </div>
      {hasQuery && search.isError && !search.data ? (
        <ErrorState
          error={search.error}
          onRetry={search.refetch}
          what="matching members"
        />
      ) : null}
      {hasQuery && !search.isError ? (
        <ul aria-live="polite" className="flex flex-col gap-[14px]">
          {results.map((candidate) => (
            <CandidateRow
              candidate={candidate}
              key={candidate.user.id}
              onAdd={handleAdd}
              pending={isPending}
              team={team}
            />
          ))}
          {search.isFetched && results.length === 0 ? (
            <li className="text-[13px] text-muted leading-[18px]">
              No academy member matches “{query.trim()}”. New people are invited
              by the academy admin.
            </li>
          ) : null}
        </ul>
      ) : null}
      {hasQuery ? null : (
        <p className="text-[13px] text-muted leading-[18px]">
          Search academy members by name or email.
        </p>
      )}
    </section>
  );
}
