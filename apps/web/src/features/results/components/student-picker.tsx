import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { SearchInput } from "@hoops-genesis/ui/components/search-input";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useState,
} from "react";

import type { CoachStudent } from "@/features/results/queries";
import type { Id } from "@/features/types";
import { initials } from "@/lib/format";

/** "Change" student: sheet on phones, dialog on the web. */
export function StudentPicker({
  open,
  students,
  selectedId,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  students: CoachStudent[];
  selectedId?: Id;
  onOpenChange: (open: boolean) => void;
  onPick: (studentId: Id) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? students.filter((s) => s.name.toLowerCase().includes(needle))
    : students;
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  );
  const handlePick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.studentId;
      if (id) {
        onPick(id);
      }
    },
    [onPick]
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pick a student</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3 pb-8">
          <SearchInput
            aria-label="Search your students"
            onChange={handleQuery}
            placeholder="Search your students"
            value={query}
          />
          <ul className="flex max-h-[50dvh] flex-col overflow-y-auto">
            {shown.map((student) => (
              <li key={student.id}>
                <button
                  aria-current={student.id === selectedId ? "true" : undefined}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-2 py-[10px] text-left outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink aria-[current=true]:bg-fog"
                  data-student-id={student.id}
                  onClick={handlePick}
                  type="button"
                >
                  <Avatar size={36}>
                    <AvatarFallback>{initials(student.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-[15px] text-ink leading-5">
                      {student.name}
                    </span>
                    <span className="text-[13px] text-muted leading-4">
                      {student.teamName}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 ? (
              <li className="py-4 text-center text-muted text-sm">
                No student matches “{query.trim()}”.
              </li>
            ) : null}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
