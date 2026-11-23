import { Prisma } from "@hoops-genesis/db/prisma";
import { describe, expect, it } from "vitest";

import {
  fromPlainDate,
  fromTimeOfDay,
  plainDateRange,
  toEventDates,
  toMoneyString,
  toNullableTimestamp,
  toPlainDate,
  toTimeOfDay,
  toTimestamp,
} from "./serialize";

describe("serializers", () => {
  it("writes money as a 2-decimal string without float rounding", () => {
    expect(toMoneyString(new Prisma.Decimal("15000"))).toBe("15000.00");
    expect(toMoneyString(new Prisma.Decimal("0.1").plus("0.2"))).toBe("0.30");
    expect(toMoneyString(new Prisma.Decimal("999999999999.99"))).toBe(
      "999999999999.99"
    );
  });

  it("round-trips plain dates and times of day", () => {
    expect(toPlainDate(fromPlainDate("2026-11-23"))).toBe("2026-11-23");
    expect(toTimeOfDay(fromTimeOfDay("08:30"))).toBe("08:30");
    expect(toTimeOfDay(fromTimeOfDay("08:30:15"))).toBe("08:30:15");
  });

  it("writes timestamps as ISO 8601 UTC", () => {
    const at = new Date("2026-11-23T08:30:00Z");
    expect(toTimestamp(at)).toBe("2026-11-23T08:30:00.000Z");
    expect(toNullableTimestamp(null)).toBeNull();
  });

  it("converts an event row's dates", () => {
    expect(
      toEventDates({
        startDate: fromPlainDate("2026-12-01"),
        endDate: null,
        excludedDates: [fromPlainDate("2026-12-02")],
      })
    ).toEqual({
      startDate: "2026-12-01",
      endDate: null,
      excludedDates: ["2026-12-02"],
    });
  });

  it("builds an inclusive date-column range", () => {
    expect(plainDateRange({ from: "2026-11-01" })).toEqual({
      gte: new Date("2026-11-01T00:00:00Z"),
    });
  });
});
