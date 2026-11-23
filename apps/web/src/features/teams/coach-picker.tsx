import { Checkbox } from "@hoops-genesis/ui/components/checkbox";
import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useState,
} from "react";
import { shortName } from "@/features/teams/format";
import type { CoachCandidate } from "@/features/teams/queries";
import type { Id } from "@/features/types";
import { initials } from "@/lib/format";

/** Ink initials circle used on coach chips (24px on web, 26px on phone). */
function CoachDot({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-[10px] text-white leading-3",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

function matches(candidate: CoachCandidate, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return (
    candidate.user.name.toLowerCase().includes(needle) ||
    candidate.user.email.toLowerCase().startsWith(needle)
  );
}

/**
 * Desktop coach picker (75J-0): chips for the chosen coaches and an "Add a coach…"
 * combobox that suggests academy coaches. Backspace on an empty input removes the last chip.
 */
export function CoachChipsInput({
  id,
  candidates,
  value,
  onChange,
  labelledBy,
}: {
  id: string;
  candidates: CoachCandidate[];
  value: Id[];
  onChange: (next: Id[]) => void;
  labelledBy: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = value
    .map((memberId) => candidates.find((c) => c.memberId === memberId))
    .filter((c): c is CoachCandidate => Boolean(c));
  const options = candidates.filter(
    (c) => !value.includes(c.memberId) && matches(c, query)
  );
  const isOpen = open && options.length > 0;
  const activeOption = options[Math.min(active, options.length - 1)];

  const add = useCallback(
    (memberId: Id) => {
      onChange([...value, memberId]);
      setQuery("");
      setActive(0);
    },
    [onChange, value]
  );
  const handleRemove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { memberId } = event.currentTarget.dataset;
      onChange(value.filter((v) => v !== memberId));
    },
    [onChange, value]
  );
  const handlePick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const { memberId } = event.currentTarget.dataset;
      if (memberId) {
        add(memberId);
      }
    },
    [add]
  );
  const keepFocus = useCallback(
    (event: MouseEvent) => event.preventDefault(),
    []
  );
  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActive(0);
    setOpen(true);
  }, []);
  const handleFocus = useCallback(() => setOpen(true), []);
  const handleBlur = useCallback(() => setOpen(false), []);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((i) =>
          options.length === 0
            ? 0
            : (i + step + options.length) % options.length
        );
        return;
      }
      if (event.key === "Enter" && isOpen && activeOption) {
        event.preventDefault();
        add(activeOption.memberId);
        return;
      }
      if (event.key === "Escape" && isOpen) {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key === "Backspace" && query === "" && value.length > 0) {
        onChange(value.slice(0, -1));
      }
    },
    [activeOption, add, isOpen, onChange, options.length, query, value]
  );

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-line p-[10px] transition-colors focus-within:border-ink">
        {chosen.map((coach) => (
          <span
            className="flex items-center gap-2 rounded-full bg-fog py-[5px] pr-[10px] pl-[5px] text-ink text-sm leading-[18px]"
            key={coach.memberId}
          >
            <CoachDot name={coach.user.name} />
            {shortName(coach.user.name)}
            <button
              aria-label={`Remove ${coach.user.name}`}
              className="-my-1 -mr-1 cursor-pointer rounded-full px-1 text-ink outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ink"
              data-member-id={coach.memberId}
              onClick={handleRemove}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-activedescendant={
            isOpen && activeOption
              ? `${listId}-${activeOption.memberId}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-labelledby={labelledBy}
          autoComplete="off"
          className="min-w-[120px] flex-1 bg-transparent px-1 py-[6px] text-ink text-sm leading-[18px] outline-none placeholder:text-[#B5B5B5]"
          id={id}
          onBlur={handleBlur}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Add a coach…"
          role="combobox"
          value={query}
        />
      </div>
      {isOpen ? (
        <div
          aria-labelledby={labelledBy}
          className="absolute inset-x-0 top-full z-10 mt-[6px] flex max-h-56 flex-col overflow-y-auto rounded-[14px] border border-line bg-white p-1 shadow-[0_12px_32px_#1111111f]"
          id={listId}
          role="listbox"
        >
          {options.map((option) => {
            const selected = option.memberId === activeOption?.memberId;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the combobox input (aria-activedescendant).
              <div
                aria-selected={selected}
                className={cn(
                  "flex cursor-pointer items-center gap-[10px] rounded-[10px] px-[10px] py-2",
                  selected ? "bg-fog" : null
                )}
                data-member-id={option.memberId}
                id={`${listId}-${option.memberId}`}
                key={option.memberId}
                onClick={handlePick}
                onMouseDown={keepFocus}
                role="option"
                tabIndex={-1}
              >
                <CoachDot
                  className="size-7 text-[11px]"
                  name={option.user.name}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-ink text-sm leading-[18px]">
                    {option.user.name}
                  </span>
                  <span className="truncate text-[12px] text-muted leading-4">
                    {option.user.email}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Phone coach field (7DB-0): the chosen coaches in one row with "Change", which opens a
 * checklist of the academy's coaches in place.
 */
export function CoachPickerPhone({
  candidates,
  value,
  onChange,
  labelledBy,
}: {
  candidates: CoachCandidate[];
  value: Id[];
  onChange: (next: Id[]) => void;
  labelledBy: string;
}) {
  const [editing, setEditing] = useState(false);
  const chosen = candidates.filter((c) => value.includes(c.memberId));
  const toggleEditing = useCallback(() => setEditing((v) => !v), []);
  const handleToggle = useCallback(
    (memberId: Id, checked: boolean) => {
      onChange(
        checked
          ? [...value, memberId]
          : value.filter((existing) => existing !== memberId)
      );
    },
    [onChange, value]
  );
  const [first] = chosen;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-[14px] py-3">
        <div className="flex min-w-0 items-center gap-2">
          {first ? (
            <CoachDot className="size-[26px]" name={first.user.name} />
          ) : null}
          <span
            className={cn(
              "truncate text-[15px] leading-5",
              first ? "text-ink" : "text-muted"
            )}
          >
            {chosen.length > 0
              ? chosen.map((c) => shortName(c.user.name)).join(", ")
              : "No coach yet"}
          </span>
        </div>
        <button
          aria-expanded={editing}
          className="shrink-0 cursor-pointer rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-2 outline-none [text-underline-position:from-font] focus-visible:ring-2 focus-visible:ring-ink"
          onClick={toggleEditing}
          type="button"
        >
          {editing ? "Done" : "Change"}
        </button>
      </div>
      {editing ? (
        <fieldset
          aria-labelledby={labelledBy}
          className="flex flex-col rounded-[14px] border border-line px-[14px]"
        >
          {candidates.map((candidate) => (
            <CoachOption
              candidate={candidate}
              checked={value.includes(candidate.memberId)}
              key={candidate.memberId}
              onToggle={handleToggle}
            />
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

function CoachOption({
  candidate,
  checked,
  onToggle,
}: {
  candidate: CoachCandidate;
  checked: boolean;
  onToggle: (memberId: Id, checked: boolean) => void;
}) {
  const handleChange = useCallback(
    (next: boolean) => onToggle(candidate.memberId, next),
    [candidate.memberId, onToggle]
  );
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox inside is the control.
    <label className="flex cursor-pointer items-center gap-3 border-line border-b py-3 last:border-b-0">
      <Checkbox checked={checked} onCheckedChange={handleChange} />
      <CoachDot className="size-[26px]" name={candidate.user.name} />
      <span className="text-[15px] text-ink leading-5">
        {candidate.user.name}
      </span>
    </label>
  );
}
