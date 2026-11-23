/*
 * Fixtures only the owner console needs (Paper "[Owner · Web] Academies console,
 * search and pages" ET2-0, "[Owner] Create academy", the phone and tablet owner
 * artboards). Counts are the platform-wide numbers drawn in the designs, which the
 * shared fixture people list does not add up to. Only api.mock.ts imports this.
 */
import type { Academy, Id, Timestamp } from "@/features/types";

export interface AcademyStatsFixture {
  academyId: Id;
  /** The academy admin named on the row ("Admin Sharika D."), null for "No admin yet". */
  admin: { userId: Id; name: string; email: string } | null;
  admins: number;
  coaches: number;
  qrRegeneratedAt: Timestamp | null;
  qrRegeneratedBy: string | null;
  students: number;
  teams: number;
}

/** The seven academies drawn on ET2-0, in the order drawn. */
export const academyStats: AcademyStatsFixture[] = [
  {
    academyId: "acad-kigali",
    admin: {
      userId: "user-sharika",
      name: "Sharika D.",
      email: "sharika@example.com",
    },
    admins: 1,
    coaches: 6,
    students: 64,
    teams: 4,
    qrRegeneratedAt: "2026-11-16T06:11:00Z",
    qrRegeneratedBy: "Innocent M.",
  },
  {
    academyId: "acad-bengaluru",
    admin: {
      userId: "user-priya",
      name: "Priya N.",
      email: "priya.n@example.com",
    },
    admins: 1,
    coaches: 9,
    students: 116,
    teams: 8,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
  {
    academyId: "acad-kampala",
    admin: {
      userId: "user-grace-a",
      name: "Grace A.",
      email: "grace.a@example.com",
    },
    admins: 1,
    coaches: 3,
    students: 27,
    teams: 3,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
  {
    academyId: "acad-huye",
    admin: null,
    admins: 0,
    coaches: 0,
    students: 0,
    teams: 0,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
  {
    academyId: "acad-mysuru",
    admin: {
      userId: "user-arjun",
      name: "Arjun K.",
      email: "arjun.k@example.com",
    },
    admins: 1,
    coaches: 4,
    students: 43,
    teams: 3,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
  {
    academyId: "acad-musanze",
    admin: {
      userId: "user-diane",
      name: "Diane M.",
      email: "diane.m@example.com",
    },
    admins: 1,
    coaches: 3,
    students: 35,
    teams: 3,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
  {
    academyId: "acad-gulu",
    admin: {
      userId: "user-peter",
      name: "Peter O.",
      email: "peter.o@example.com",
    },
    admins: 1,
    coaches: 2,
    students: 19,
    teams: 2,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
];

function academy(
  id: string,
  city: string,
  timezone: string,
  currency: string,
  createdAt: Timestamp
): Academy {
  const slug = `hoops-genesis-${city.toLowerCase()}`;
  return {
    id,
    name: `Hoops Genesis ${city}`,
    shortName: city,
    slug,
    logo: null,
    location: city,
    timezone,
    defaultCurrency: currency,
    latitude: 0,
    longitude: 0,
    attendanceRadiusM: 150,
    createdAt,
  };
}

/** Drawn academies that are not in the shared fixtures. */
export const extraAcademies: Academy[] = [
  academy("acad-huye", "Huye", "Africa/Kigali", "RWF", "2026-11-20T08:00:00Z"),
  academy(
    "acad-mysuru",
    "Mysuru",
    "Asia/Kolkata",
    "INR",
    "2026-07-01T08:00:00Z"
  ),
  academy(
    "acad-musanze",
    "Musanze",
    "Africa/Kigali",
    "RWF",
    "2026-07-15T08:00:00Z"
  ),
  academy("acad-gulu", "Gulu", "Africa/Kampala", "UGX", "2026-08-01T08:00:00Z"),
];

const FILLER_CITIES: [string, string, string][] = [
  ["Rubavu", "Africa/Kigali", "RWF"],
  ["Nyagatare", "Africa/Kigali", "RWF"],
  ["Rwamagana", "Africa/Kigali", "RWF"],
  ["Muhanga", "Africa/Kigali", "RWF"],
  ["Rusizi", "Africa/Kigali", "RWF"],
  ["Nyanza", "Africa/Kigali", "RWF"],
  ["Karongi", "Africa/Kigali", "RWF"],
  ["Kayonza", "Africa/Kigali", "RWF"],
  ["Gicumbi", "Africa/Kigali", "RWF"],
  ["Bugesera", "Africa/Kigali", "RWF"],
  ["Ngoma", "Africa/Kigali", "RWF"],
  ["Kamonyi", "Africa/Kigali", "RWF"],
  ["Rulindo", "Africa/Kigali", "RWF"],
  ["Gatsibo", "Africa/Kigali", "RWF"],
  ["Mumbai", "Asia/Kolkata", "INR"],
  ["Pune", "Asia/Kolkata", "INR"],
  ["Chennai", "Asia/Kolkata", "INR"],
  ["Hyderabad", "Asia/Kolkata", "INR"],
  ["Kochi", "Asia/Kolkata", "INR"],
  ["Mangaluru", "Asia/Kolkata", "INR"],
  ["Hubli", "Asia/Kolkata", "INR"],
  ["Goa", "Asia/Kolkata", "INR"],
  ["Jaipur", "Asia/Kolkata", "INR"],
  ["Delhi", "Asia/Kolkata", "INR"],
  ["Kolkata", "Asia/Kolkata", "INR"],
  ["Ahmedabad", "Asia/Kolkata", "INR"],
  ["Coimbatore", "Asia/Kolkata", "INR"],
  ["Madurai", "Asia/Kolkata", "INR"],
  ["Lucknow", "Asia/Kolkata", "INR"],
  ["Indore", "Asia/Kolkata", "INR"],
  ["Entebbe", "Africa/Kampala", "UGX"],
  ["Jinja", "Africa/Kampala", "UGX"],
  ["Mbarara", "Africa/Kampala", "UGX"],
  ["Mbale", "Africa/Kampala", "UGX"],
  ["Lira", "Africa/Kampala", "UGX"],
  ["Masaka", "Africa/Kampala", "UGX"],
  ["Fort Portal", "Africa/Kampala", "UGX"],
  ["Arua", "Africa/Kampala", "UGX"],
  ["Soroti", "Africa/Kampala", "UGX"],
  ["Kabale", "Africa/Kampala", "UGX"],
  ["Hoima", "Africa/Kampala", "UGX"],
  ["Tororo", "Africa/Kampala", "UGX"],
  ["Mukono", "Africa/Kampala", "UGX"],
  ["Wakiso", "Africa/Kampala", "UGX"],
  ["Kasese", "Africa/Kampala", "UGX"],
];

const ADMIN_NAMES = [
  "Eric K.",
  "Neha S.",
  "Joseph O.",
  "Claudine U.",
  "Ravi P.",
  "Annet N.",
];

/** The other 45 academies behind "52 academies" (only for paging in preview). */
export const fillerAcademies: {
  academy: Academy;
  stats: AcademyStatsFixture;
}[] = FILLER_CITIES.map(([city, timezone, currency], index) => {
  const id = `acad-${city.toLowerCase().replaceAll(" ", "-")}`;
  const day = String((index % 27) + 1).padStart(2, "0");
  const coaches = (index % 5) + 1;
  const students = 8 + ((index * 7) % 40);
  const adminName = ADMIN_NAMES[index % ADMIN_NAMES.length] ?? "Admin";
  return {
    academy: academy(id, city, timezone, currency, `2026-05-${day}T08:00:00Z`),
    stats: {
      academyId: id,
      admin: {
        userId: `user-admin-${id}`,
        name: adminName,
        email: `admin.${id}@example.com`,
      },
      admins: 1,
      coaches,
      students,
      teams: Math.max(1, Math.round(students / 15)),
      qrRegeneratedAt: null,
      qrRegeneratedBy: null,
    },
  };
});

export interface ActivityFixture {
  academyId: Id;
  action: string;
  createdAt: Timestamp;
  id: Id;
  /** Sentence as the console shows it ("Sharika D. voided a payment"). */
  summary: string;
}

export const academyActivity: ActivityFixture[] = [
  {
    id: "audit-1",
    academyId: "acad-kigali",
    action: "fee.void",
    summary: "Sharika D. voided a payment",
    createdAt: "2026-11-23T07:14:00Z",
  },
  {
    id: "audit-3",
    academyId: "acad-kigali",
    action: "record.verify",
    summary: "Coach Patrick verified a free-throw result",
    createdAt: "2026-11-22T15:05:00Z",
  },
  {
    id: "audit-6",
    academyId: "acad-kigali",
    action: "academy_qr.regenerate",
    summary: "Innocent M. replaced the QR code",
    createdAt: "2026-11-16T06:11:00Z",
  },
  {
    id: "audit-b1",
    academyId: "acad-bengaluru",
    action: "fee.create",
    summary: "Priya N. recorded a payment",
    createdAt: "2026-11-23T04:40:00Z",
  },
  {
    id: "audit-b2",
    academyId: "acad-bengaluru",
    action: "team.member_add",
    summary: "Priya N. added 3 students to U12",
    createdAt: "2026-11-21T09:30:00Z",
  },
  {
    id: "audit-k1",
    academyId: "acad-kampala",
    action: "record.verify",
    summary: "Grace A. verified a report card",
    createdAt: "2026-11-20T11:00:00Z",
  },
];

/** Places the address search knows about until a real geocoder is plugged in. */
export interface PlaceFixture {
  currency: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export const places: PlaceFixture[] = [
  {
    label: "Andheri Sports Complex, Mumbai",
    latitude: 19.1197,
    longitude: 72.8468,
    timezone: "Asia/Kolkata",
    currency: "INR",
  },
  {
    label: "Amahoro Stadium, Kigali",
    latitude: -1.9554,
    longitude: 30.1167,
    timezone: "Africa/Kigali",
    currency: "RWF",
  },
  {
    label: "Lugogo Indoor Stadium, Kampala",
    latitude: 0.3286,
    longitude: 32.6011,
    timezone: "Africa/Kampala",
    currency: "UGX",
  },
  {
    label: "Kasarani Gymnasium, Nairobi",
    latitude: -1.2219,
    longitude: 36.8915,
    timezone: "Africa/Nairobi",
    currency: "KES",
  },
  {
    label: "Kanteerava Indoor Stadium, Bengaluru",
    latitude: 12.9698,
    longitude: 77.5935,
    timezone: "Asia/Kolkata",
    currency: "INR",
  },
];
