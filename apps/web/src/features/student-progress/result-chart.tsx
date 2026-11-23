import { useId } from "react";

import { dayMonth } from "@/features/student-calendar/dates";

import {
  type DrillProgress,
  pointLabel,
} from "@/features/student-progress/selectors";
import type { DateOnly } from "@/features/types";

/*
 * The line chart in "[Student] My progress" (47V-0), drawn as plain SVG: grey guides,
 * an ink line, ink dots for verified results, the best one in orange, and a dashed
 * hollow dot for a result still waiting for review. Geometry follows the 310×140 design
 * (10px left inset, 20px right, values between y=32 and y=112). The SVG carries a text
 * description; the results list below it holds the same numbers.
 */

const TOP = 32;
const BOTTOM = 112;
const LEFT = 10;
const RIGHT_INSET = 20;
const GUIDE_FRACTIONS = [0.25, 0.5, 0.75] as const;

export function ResultChart({
  progress,
  label,
  today,
  width,
  height = 140,
  className,
}: {
  progress: DrillProgress;
  label: string;
  today: DateOnly;
  width: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const { points, best } = progress;
  const values = points.map((p) => p.result.made);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaleY = height / 140;
  const top = TOP * scaleY;
  const bottom = BOTTOM * scaleY;
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : LEFT + (index * (width - LEFT - RIGHT_INSET)) / (points.length - 1);
  const y = (value: number) =>
    max === min
      ? (top + bottom) / 2
      : bottom - ((value - min) / (max - min)) * (bottom - top);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.result.made)}`)
    .join(" ");
  const description = points
    .map(
      (p) =>
        `${dayMonth(p.record.recordedOn)}: ${p.result.made} of ${p.result.attempts}${p.record.status === "pending" ? " (waiting for review)" : ""}${p === best ? " (best)" : ""}`
    )
    .join("; ");

  return (
    <figure className={className}>
      <svg
        aria-labelledby={`${id}-title ${id}-desc`}
        className="block h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <title id={`${id}-title`}>{label} results over time</title>
        <desc id={`${id}-desc`}>{description}</desc>
        <path
          d={GUIDE_FRACTIONS.map((f) => `M0 ${height * f}H${width}`).join("")}
          fill="none"
          stroke="#E6E6E6"
        />
        {points.length > 1 ? (
          <path
            d={path}
            fill="none"
            stroke="#111111"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : null}
        {points.map((p, i) => {
          const cx = x(i);
          const cy = y(p.result.made);
          if (p === best) {
            return (
              <circle
                cx={cx}
                cy={cy}
                fill="#EB7724"
                key={p.record.id}
                r="8"
                stroke="#FFFFFF"
                strokeWidth="3"
              />
            );
          }
          if (p.record.status === "pending") {
            return (
              <circle
                cx={cx}
                cy={cy}
                fill="#FFFFFF"
                key={p.record.id}
                r="5"
                stroke="#111111"
                strokeDasharray="3 2"
                strokeWidth="2"
              />
            );
          }
          return (
            <circle cx={cx} cy={cy} fill="#111111" key={p.record.id} r="5" />
          );
        })}
      </svg>
      <figcaption
        aria-hidden="true"
        className="mt-[14px] flex justify-between text-[12px] text-muted leading-4"
      >
        {points.map((p) => (
          <span key={p.record.id}>
            {pointLabel(p.record.recordedOn, today)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
