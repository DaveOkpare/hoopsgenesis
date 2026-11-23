import { cn } from "@hoops-genesis/ui/lib/utils";

import type { PastResult } from "@/features/results/queries";
import { type ResultTemplate, resultScore } from "@/features/results/templates";
import { formatWeekdayDayMonth } from "@/features/sessions/time";

const SHOWN = 4;
const MAX_BAR = 50;
const MIN_BAR = 8;
const DECIMALS = 100;

/** " s" after seconds, " cm" after centimetres; nothing for counts. */
function unitSuffix(template: ResultTemplate): string {
  if (template.metric === "made" || !template.unit) {
    return "";
  }
  return template.unit === "seconds" || template.unit === "s"
    ? " s"
    : ` ${template.unit}`;
}

function bestIndex(results: PastResult[], template: ResultTemplate): number {
  let best = -1;
  results.forEach((r, i) => {
    const score = resultScore(r.data, template);
    const previous = results[best];
    const current =
      best === -1 || !previous ? null : resultScore(previous.data, template);
    if (
      current === null ||
      (template.better === "higher" ? score > current : score < current)
    ) {
      best = i;
    }
  });
  return best;
}

/** "Jean's recent free throws": last four results, the best starred, today's in orange. */
export function RecentResults({
  firstName,
  template,
  results,
  current,
}: {
  firstName: string;
  template: ResultTemplate;
  results: PastResult[];
  current: number | null;
}) {
  const recent = results.slice(-SHOWN);
  const star = bestIndex(recent, template);
  const scores = [
    ...recent.map((r) => resultScore(r.data, template)),
    current ?? 0,
  ];
  const ceiling = template.attempts ?? Math.max(...scores, 1);
  const height = (score: number) =>
    Math.max(MIN_BAR, Math.round((score / ceiling) * MAX_BAR));
  const unit = unitSuffix(template);
  return (
    <section className="flex flex-col gap-[10px] rounded-md bg-fog px-4 py-[14px]">
      <h2 className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
        {firstName}’s recent {template.lowerLabel}
      </h2>
      {recent.length === 0 && current === null ? (
        <p className="text-muted text-sm leading-[18px]">No results yet.</p>
      ) : (
        <ol className="flex h-[56px] items-end justify-between">
          {recent.map((result, index) => {
            const score = resultScore(result.data, template);
            const isBest = index === star;
            return (
              <li
                className="flex flex-col items-center gap-1"
                key={result.id}
                title={formatWeekdayDayMonth(result.recordedOn)}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-9 rounded-[6px]",
                    isBest ? "bg-[#9A9A9A]" : "bg-stone"
                  )}
                  style={{ height: height(score) }}
                />
                <span
                  className={cn(
                    "text-[12px] leading-4",
                    isBest ? "font-semibold text-ink" : "text-muted"
                  )}
                >
                  <span className="sr-only">
                    {formatWeekdayDayMonth(result.recordedOn)}:{" "}
                  </span>
                  {score}
                  {unit}
                  {isBest ? (
                    <>
                      {" "}
                      <span aria-hidden="true">★</span>
                      <span className="sr-only">(best)</span>
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
          {current === null ? null : (
            <li className="flex flex-col items-center gap-1">
              <span
                aria-hidden="true"
                className="w-9 rounded-[6px] bg-orange"
                style={{ height: height(current) }}
              />
              <span className="font-bold text-[12px] text-ink leading-4">
                <span className="sr-only">Today: </span>
                {current}
                {unit}
              </span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

/** "New best by 1" / "Equals the best" / "Best is 7", or null before any result. */
export function bestNote(
  results: PastResult[],
  template: ResultTemplate,
  current: number | null
): { text: string; tone: "success" | "muted" } | null {
  if (current === null || results.length === 0) {
    return null;
  }
  const scores = results.map((r) => resultScore(r.data, template));
  const best =
    template.better === "higher" ? Math.max(...scores) : Math.min(...scores);
  const raw = template.better === "higher" ? current - best : best - current;
  // Decimal scores (12.4 s) must not print float noise.
  const diff = Math.round(raw * DECIMALS) / DECIMALS;
  const unit = unitSuffix(template);
  if (diff > 0) {
    return { text: `New best by ${diff}${unit}`, tone: "success" };
  }
  if (diff === 0) {
    return { text: "Equals the best", tone: "muted" };
  }
  return { text: `Best is ${best}${unit}`, tone: "muted" };
}
