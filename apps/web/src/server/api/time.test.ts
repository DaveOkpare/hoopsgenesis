import { describe, expect, it } from "vitest";

import {
  addDays,
  getCheckInWindow,
  haversineDistanceM,
  isSessionDate,
  isValidTimeZone,
  isWithinWindow,
  listSessionDates,
  localDateRangeToUtc,
  SESSION_WINDOW,
  todayInTimeZone,
  zonedDateTimeToUtc,
} from "./time";

describe("todayInTimeZone", () => {
  it("uses the academy's calendar date, not UTC's", () => {
    // 23:30 UTC on the 22nd is already the 23rd in Lagos (UTC+1).
    const now = new Date("2026-11-22T23:30:00Z");
    expect(todayInTimeZone("Africa/Lagos", now)).toBe("2026-11-23");
    expect(todayInTimeZone("UTC", now)).toBe("2026-11-22");
    expect(todayInTimeZone("America/New_York", now)).toBe("2026-11-22");
  });
});

describe("zonedDateTimeToUtc", () => {
  it("converts a Lagos local time (UTC+1, no DST)", () => {
    expect(
      zonedDateTimeToUtc("2026-11-23", "08:30", "Africa/Lagos").toISOString()
    ).toBe("2026-11-23T07:30:00.000Z");
  });

  it("handles seconds and UTC", () => {
    expect(
      zonedDateTimeToUtc("2026-01-01", "00:00:05", "UTC").toISOString()
    ).toBe("2026-01-01T00:00:05.000Z");
  });

  it("uses the right offset on each side of a DST change", () => {
    // New York: EDT (UTC-4) until 2026-11-01 02:00, then EST (UTC-5).
    expect(
      zonedDateTimeToUtc(
        "2026-10-31",
        "12:00",
        "America/New_York"
      ).toISOString()
    ).toBe("2026-10-31T16:00:00.000Z");
    expect(
      zonedDateTimeToUtc(
        "2026-11-02",
        "12:00",
        "America/New_York"
      ).toISOString()
    ).toBe("2026-11-02T17:00:00.000Z");
  });

  it("reads a skipped time with the pre-jump offset", () => {
    // 2026-03-08 02:30 does not exist in New York; it becomes 03:30 EDT.
    expect(
      zonedDateTimeToUtc(
        "2026-03-08",
        "02:30",
        "America/New_York"
      ).toISOString()
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves a repeated time to its first occurrence, east and west of UTC", () => {
    // New York 01:30 on 2026-11-01 happens in EDT, then again in EST.
    expect(
      zonedDateTimeToUtc(
        "2026-11-01",
        "01:30",
        "America/New_York"
      ).toISOString()
    ).toBe("2026-11-01T05:30:00.000Z");
    // Berlin 02:30 on 2026-10-25 happens in CEST, then again in CET.
    expect(
      zonedDateTimeToUtc("2026-10-25", "02:30", "Europe/Berlin").toISOString()
    ).toBe("2026-10-25T00:30:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(() => zonedDateTimeToUtc("2026-1-1", "08:00", "UTC")).toThrow(
      RangeError
    );
    expect(() => zonedDateTimeToUtc("2026-01-01", "8am", "UTC")).toThrow(
      RangeError
    );
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects others", () => {
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("sessions", () => {
  const camp = {
    startDate: "2026-12-01",
    endDate: "2026-12-05",
    excludedDates: ["2026-12-03"],
  };
  const sameDay = { startDate: "2026-12-10", endDate: null, excludedDates: [] };

  it("lists a multi-day event's sessions in a range, minus excluded dates", () => {
    expect(listSessionDates(camp, "2026-11-01", "2026-12-31")).toEqual([
      "2026-12-01",
      "2026-12-02",
      "2026-12-04",
      "2026-12-05",
    ]);
    expect(listSessionDates(camp, "2026-12-02", "2026-12-04")).toEqual([
      "2026-12-02",
      "2026-12-04",
    ]);
  });

  it("lists a same-day event once, or not at all outside the range", () => {
    expect(listSessionDates(sameDay, "2026-12-01", "2026-12-31")).toEqual([
      "2026-12-10",
    ]);
    expect(listSessionDates(sameDay, "2026-12-11", "2026-12-31")).toEqual([]);
  });

  it("tells whether a date is a session", () => {
    expect(isSessionDate(camp, "2026-12-01")).toBe(true);
    expect(isSessionDate(camp, "2026-12-03")).toBe(false);
    expect(isSessionDate(camp, "2026-12-06")).toBe(false);
    expect(isSessionDate(sameDay, "2026-12-10")).toBe(true);
    expect(isSessionDate(sameDay, "2026-12-11")).toBe(false);
  });

  it("refuses unbounded ranges", () => {
    const year = {
      startDate: "2026-01-01",
      endDate: "2028-01-01",
      excludedDates: [],
    };
    expect(() => listSessionDates(year, "2026-01-01", "2028-01-01")).toThrow(
      RangeError
    );
  });
});

describe("check-in window", () => {
  const window = getCheckInWindow({
    sessionDate: "2026-11-23",
    startTime: "16:00",
    endTime: "18:00",
    timeZone: "Africa/Lagos",
  });

  it("opens 30 minutes before start and closes 60 minutes after end", () => {
    expect(SESSION_WINDOW).toEqual({
      minutesBeforeStart: 30,
      minutesAfterEnd: 60,
    });
    expect(window.opensAt.toISOString()).toBe("2026-11-23T14:30:00.000Z");
    expect(window.closesAt.toISOString()).toBe("2026-11-23T18:00:00.000Z");
  });

  it("includes both ends", () => {
    expect(isWithinWindow(window, new Date("2026-11-23T14:29:59Z"))).toBe(
      false
    );
    expect(isWithinWindow(window, new Date("2026-11-23T14:30:00Z"))).toBe(true);
    expect(isWithinWindow(window, new Date("2026-11-23T18:00:00Z"))).toBe(true);
    expect(isWithinWindow(window, new Date("2026-11-23T18:00:01Z"))).toBe(
      false
    );
  });
});

describe("localDateRangeToUtc", () => {
  it("covers whole local days", () => {
    expect(
      localDateRangeToUtc(
        { from: "2026-11-01", to: "2026-11-30" },
        "Africa/Lagos"
      )
    ).toEqual({
      gte: new Date("2026-10-31T23:00:00Z"),
      lt: new Date("2026-11-30T23:00:00Z"),
    });
    expect(localDateRangeToUtc({}, "UTC")).toEqual({});
  });
});

describe("haversineDistanceM", () => {
  it("is zero for the same point", () => {
    const point = { latitude: 6.5244, longitude: 3.3792 };
    expect(haversineDistanceM(point, point)).toBe(0);
  });

  it("measures one degree of latitude as about 111.2 km", () => {
    const distance = haversineDistanceM(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 }
    );
    expect(distance).toBeGreaterThan(111_100);
    expect(distance).toBeLessThan(111_300);
  });

  it("measures a short distance in Lagos to within a metre", () => {
    // 0.001 degrees of latitude is about 111 m anywhere.
    const distance = haversineDistanceM(
      { latitude: 6.5244, longitude: 3.3792 },
      { latitude: 6.5254, longitude: 3.3792 }
    );
    expect(Math.round(distance)).toBe(111);
  });
});
