import { Link } from "@tanstack/react-router";

import { segmentedItem, segmentedTrack } from "@/components/student/segmented";

/**
 * Phone "Attendance | Results" switch at the top of the Progress tab (46Z-0, 47V-0).
 * On md and up the sidebar lists Attendance and Progress separately, so it is hidden.
 */
export function ProgressSwitch({
  current,
}: {
  current: "attendance" | "results";
}) {
  return (
    <nav
      aria-label="Progress"
      className={`${segmentedTrack("default")} md:hidden`}
    >
      <Link
        aria-current={current === "attendance" ? "page" : undefined}
        className={segmentedItem("default", current === "attendance")}
        to="/student/attendance"
      >
        Attendance
      </Link>
      <Link
        aria-current={current === "results" ? "page" : undefined}
        className={segmentedItem("default", current === "results")}
        to="/student/progress"
      >
        Results
      </Link>
    </nav>
  );
}
