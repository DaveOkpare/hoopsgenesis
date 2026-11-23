/*
 * Fixture seed data shared by every feature's api.ts until the real endpoints exist.
 * Names, numbers and dates match the Paper designs, so screens built on these look
 * like the artboards. "Today" in the designs is Monday 23 November 2026 (FIXTURE_NOW).
 *
 * Ids are readable strings here; the real API returns UUIDs. Don't depend on their format.
 * Only api.ts files should import this module.
 */
import type {
  Academy,
  AuditLogEntry,
  CalendarEvent,
  Fee,
  Invitation,
  Member,
  OutstandingFee,
  StudentRecord,
  Team,
  User,
} from "@/features/types";

/** The moment every design is drawn at: Mon 23 Nov 2026, 10:02 in Kigali. */
export const FIXTURE_NOW = new Date("2026-11-23T08:02:00Z");

const CREATED = "2026-03-01T08:00:00Z";

export const academies: Academy[] = [
  {
    id: "acad-kigali",
    name: "Hoops Genesis Kigali",
    shortName: "Kigali",
    slug: "hoops-genesis-kigali",
    logo: null,
    location: "KG 9 Ave, Kigali",
    timezone: "Africa/Kigali",
    defaultCurrency: "RWF",
    latitude: -1.9441,
    longitude: 30.0619,
    attendanceRadiusM: 150,
    createdAt: CREATED,
  },
  {
    id: "acad-bengaluru",
    name: "Hoops Genesis Bengaluru",
    shortName: "Bengaluru",
    slug: "hoops-genesis-bengaluru",
    logo: null,
    location: "Indiranagar, Bengaluru",
    timezone: "Asia/Kolkata",
    defaultCurrency: "INR",
    latitude: 12.9784,
    longitude: 77.6408,
    attendanceRadiusM: 150,
    createdAt: "2026-04-12T08:00:00Z",
  },
  {
    id: "acad-kampala",
    name: "Hoops Genesis Kampala",
    shortName: "Kampala",
    slug: "hoops-genesis-kampala",
    logo: null,
    location: "Lugogo, Kampala",
    timezone: "Africa/Kampala",
    defaultCurrency: "UGX",
    latitude: 0.3286,
    longitude: 32.6011,
    attendanceRadiusM: 150,
    createdAt: "2026-06-02T08:00:00Z",
  },
];

function user(
  id: string,
  name: string,
  email: string,
  extra?: Partial<User>
): User {
  return {
    id,
    name,
    email,
    image: null,
    platformRole: "user",
    phone: null,
    dateOfBirth: null,
    banned: false,
    createdAt: CREATED,
    ...extra,
  };
}

export const users: User[] = [
  user("user-innocent", "Innocent M.", "innocent@example.com", {
    platformRole: "admin",
  }),
  user("user-sharika", "Sharika D.", "sharika@example.com"),
  user("user-patrick", "Patrick Habimana", "patrick.h@example.com"),
  user("user-priya", "Priya N.", "priya.n@example.com"),
  user("user-grace-a", "Grace A.", "grace.a@example.com"),
  user("user-marie", "Marie Uwase", "marie.uwase@example.com"),
  user("user-aline", "Aline Uwase", "aline.u@example.com", {
    createdAt: "2026-09-04T08:00:00Z",
  }),
  user("user-jean", "Jean Mugisha", "jean.m@example.com", {
    createdAt: "2026-09-04T08:00:00Z",
  }),
  user("user-eric", "Eric Niyonzima", "eric.n@example.com", {
    createdAt: "2026-11-22T08:00:00Z",
  }),
  user("user-samuel-i", "Samuel Iradukunda", "samuel.i@example.com"),
  user("user-grace-i", "Grace Ishimwe", "grace.i@example.com", {
    createdAt: "2026-11-02T08:00:00Z",
  }),
  user("user-divine-i", "Divine Ingabire", "divine.i@example.com"),
  user("user-samuel-m", "Samuel Mugabo", "samuel.m@example.com"),
  user("user-olivia", "Olivia Uwimana", "olivia.u@example.com"),
  user("user-kevin", "Kevin Nshuti", "kevin.ns@example.com"),
  user("user-divine-n", "Divine Niyonsaba", "divine.n@example.com"),
  user("user-olivier", "Olivier Kamanzi", "olivier.k@example.com"),
  user("user-mercy", "Mercy Gatete", "mercy.g@example.com"),
  user("user-keza", "Keza Nyiraneza", "keza.n@example.com"),
  user("user-brian", "Brian Manzi", "brian.m@example.com"),
  user("user-ange", "Ange Kamikazi", "ange.k@example.com"),
];

export const teams: Team[] = [
  {
    id: "team-u12",
    academyId: "acad-kigali",
    name: "U12",
    ageGroup: "U12",
    createdAt: CREATED,
  },
  {
    id: "team-u14",
    academyId: "acad-kigali",
    name: "U14",
    ageGroup: "U14",
    createdAt: CREATED,
  },
  {
    id: "team-u16",
    academyId: "acad-kigali",
    name: "U16",
    ageGroup: "U16",
    createdAt: CREATED,
  },
  {
    id: "team-girls-u16",
    academyId: "acad-kigali",
    name: "Girls U16",
    ageGroup: "U16",
    createdAt: CREATED,
  },
];

function member(
  userId: string,
  roles: Member["roles"],
  teamIds: string[],
  createdAt: string,
  academyId = "acad-kigali"
): Member {
  const found = users.find((u) => u.id === userId);
  if (!found) {
    throw new Error(`Fixture user ${userId} is missing`);
  }
  const { id, name, email, image } = found;
  return {
    id: `member-${academyId}-${userId}`,
    academyId,
    userId,
    roles,
    user: { id, name, email, image },
    teamIds,
    createdAt,
  };
}

export const members: Member[] = [
  member(
    "user-sharika",
    ["admin", "coach"],
    ["team-u12", "team-u14", "team-u16"],
    "2026-03-03T08:00:00Z"
  ),
  member(
    "user-patrick",
    ["coach"],
    ["team-u14", "team-u16"],
    "2026-08-12T08:00:00Z"
  ),
  member("user-marie", ["coach"], ["team-girls-u16"], "2026-08-20T08:00:00Z"),
  member("user-aline", ["student"], ["team-u14"], "2026-09-04T08:00:00Z"),
  member("user-jean", ["student"], ["team-u14"], "2026-09-04T08:00:00Z"),
  member("user-eric", ["student"], [], "2026-11-22T08:00:00Z"),
  member("user-samuel-i", ["student"], ["team-u16"], "2026-08-01T08:00:00Z"),
  member(
    "user-grace-i",
    ["student"],
    ["team-girls-u16"],
    "2026-11-02T08:00:00Z"
  ),
  member("user-divine-i", ["student"], ["team-u12"], "2026-08-01T08:00:00Z"),
  member("user-samuel-m", ["student"], ["team-u16"], "2026-08-01T08:00:00Z"),
  member("user-olivia", ["student"], ["team-u12"], "2026-08-01T08:00:00Z"),
  member("user-kevin", ["student"], ["team-u14"], "2026-08-01T08:00:00Z"),
  member("user-divine-n", ["student"], ["team-u14"], "2026-08-01T08:00:00Z"),
  member("user-olivier", ["student"], ["team-u14"], "2026-08-01T08:00:00Z"),
  member("user-mercy", ["student"], ["team-u12"], "2026-08-01T08:00:00Z"),
  member("user-keza", ["student"], ["team-u12"], "2026-08-01T08:00:00Z"),
  member("user-brian", ["student"], ["team-u12"], "2026-08-01T08:00:00Z"),
  member("user-ange", ["student"], ["team-u12"], "2026-08-01T08:00:00Z"),
  member(
    "user-sharika",
    ["admin"],
    [],
    "2026-04-12T08:00:00Z",
    "acad-bengaluru"
  ),
  member("user-priya", ["admin"], [], "2026-04-12T08:00:00Z", "acad-bengaluru"),
  member("user-sharika", ["coach"], [], "2026-06-02T08:00:00Z", "acad-kampala"),
  member("user-grace-a", ["admin"], [], "2026-06-02T08:00:00Z", "acad-kampala"),
  member("user-marie", ["admin"], [], "2026-06-02T08:00:00Z", "acad-kampala"),
];

export const invitations: Invitation[] = [
  {
    id: "invite-kevin-n",
    academyId: "acad-kigali",
    email: "kevin.n@example.com",
    role: "student",
    teamId: "team-u16",
    status: "pending",
    inviterId: "user-sharika",
    expiresAt: "2026-11-23T10:14:00Z",
    createdAt: "2026-11-21T10:14:00Z",
  },
  {
    id: "invite-sarah-k",
    academyId: "acad-kigali",
    email: "sarah.k@example.com",
    role: "coach",
    teamId: "team-girls-u16",
    status: "expired",
    inviterId: "user-innocent",
    expiresAt: "2026-11-18T09:00:00Z",
    createdAt: "2026-11-16T09:00:00Z",
  },
  {
    id: "invite-aline",
    academyId: "acad-kigali",
    email: "aline.u@example.com",
    role: "student",
    teamId: "team-u14",
    status: "pending",
    inviterId: "user-sharika",
    expiresAt: "2026-11-25T08:14:00Z",
    createdAt: "2026-11-23T08:14:00Z",
  },
];

function event(
  id: string,
  title: string,
  teamId: string | null,
  startTime: string,
  endTime: string,
  location: string,
  collectAttendance = true,
  startDate = "2026-11-23"
): CalendarEvent {
  return {
    id,
    academyId: "acad-kigali",
    teamId,
    eventType: collectAttendance ? "training" : "league",
    title,
    description: null,
    location,
    startDate,
    endDate: null,
    startTime,
    endTime,
    excludedDates: [],
    collectAttendance,
    createdBy: "user-sharika",
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

export const events: CalendarEvent[] = [
  event(
    "event-u12-morning",
    "Morning skills",
    "team-u12",
    "07:00",
    "08:30",
    "Court 1"
  ),
  event(
    "event-u14-training",
    "Training",
    "team-u14",
    "16:00",
    "17:30",
    "Court 2"
  ),
  event(
    "event-girls-u16-football",
    "Football",
    "team-girls-u16",
    "17:00",
    "18:30",
    "Pitch"
  ),
  event(
    "event-u16-shooting",
    "Shooting clinic",
    "team-u16",
    "18:00",
    "19:30",
    "Court 1"
  ),
  event(
    "event-corporate-league",
    "Corporate league · Week 6",
    null,
    "19:00",
    "21:00",
    "Court 1",
    false
  ),
  event(
    "event-u14-training-wed",
    "Training",
    "team-u14",
    "16:00",
    "17:30",
    "Court 2",
    true,
    "2026-11-25"
  ),
  event(
    "event-u14-match",
    "Match vs. Kicukiro Ballers",
    "team-u14",
    "10:00",
    "12:00",
    "Amahoro Arena",
    false,
    "2026-11-28"
  ),
];

function fee(
  id: string,
  studentId: string,
  paidAt: string | null,
  paymentMethod: Fee["paymentMethod"],
  paymentReference: string | null,
  extra?: Partial<Fee>
): Fee {
  return {
    id,
    academyId: "acad-kigali",
    studentId,
    description: "Nov 2026 tuition",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    amount: "30000.00",
    currency: "RWF",
    dueDate: "2026-11-05",
    paidAt,
    paymentMethod,
    paymentReference,
    createdAt: paidAt ?? "2026-11-01T08:00:00Z",
    recordedBy: paymentMethod === "mobile_money" ? null : "user-sharika",
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    ...extra,
  };
}

export const fees: Fee[] = [
  fee(
    "fee-divine-i-nov",
    "user-divine-i",
    "2026-11-22T09:12:00Z",
    "mobile_money",
    "MP2611220184"
  ),
  fee(
    "fee-samuel-m-nov",
    "user-samuel-m",
    "2026-11-21T14:30:00Z",
    "cash",
    null
  ),
  fee(
    "fee-grace-i-nov",
    "user-grace-i",
    "2026-11-20T11:05:00Z",
    "mobile_money",
    "MP2611200977"
  ),
  fee(
    "fee-samuel-m-nov-dup",
    "user-samuel-m",
    "2026-11-20T15:00:00Z",
    "cash",
    null,
    {
      voidedAt: "2026-11-23T07:14:00Z",
      voidedBy: "user-sharika",
      voidReason:
        "Duplicate entry. The cash payment on 21 Nov is the real one.",
    }
  ),
  fee(
    "fee-olivia-nov",
    "user-olivia",
    "2026-11-18T10:00:00Z",
    "bank_transfer",
    "BK-44180"
  ),
  fee("fee-kevin-nov", "user-kevin", "2026-11-15T16:20:00Z", "cash", null),
  fee("fee-aline-oct", "user-aline", "2026-10-01T09:00:00Z", "cash", null, {
    description: "Oct 2026 tuition",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    dueDate: "2026-10-05",
  }),
  fee(
    "fee-aline-sep",
    "user-aline",
    "2026-09-03T09:00:00Z",
    "mobile_money",
    "MP2609030412",
    {
      description: "Sep 2026 tuition",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      dueDate: "2026-09-05",
    }
  ),
];

/** "Unpaid for November": 14 students, RWF 420,000 in the designs (first four shown). */
export const outstandingFees: OutstandingFee[] = [
  {
    studentId: "user-jean",
    teamId: "team-u14",
    amount: "30000.00",
    currency: "RWF",
    lastPaidAt: "2026-10-03T09:00:00Z",
    dueDate: "2026-11-05",
  },
  {
    studentId: "user-aline",
    teamId: "team-u14",
    amount: "30000.00",
    currency: "RWF",
    lastPaidAt: "2026-10-01T09:00:00Z",
    dueDate: "2026-11-05",
  },
  {
    studentId: "user-samuel-i",
    teamId: "team-u16",
    amount: "60000.00",
    currency: "RWF",
    lastPaidAt: "2026-09-06T09:00:00Z",
    dueDate: "2026-10-05",
  },
  {
    studentId: "user-grace-i",
    teamId: "team-girls-u16",
    amount: "30000.00",
    currency: "RWF",
    lastPaidAt: null,
    dueDate: "2026-11-05",
  },
];

export const studentRecords: StudentRecord[] = [
  {
    id: "record-aline-report",
    academyId: "acad-kigali",
    studentId: "user-aline",
    recordType: "academic",
    recordedBy: "user-aline",
    recordedOn: "2026-11-20",
    data: {
      kind: "report_card",
      school: "Kigali Parents School",
      term: "Term 3, 2026",
      averagePercent: 78,
      position: 6,
      classSize: 42,
      fileName: "report-card-term3.pdf",
    },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-20T15:10:00Z",
    reviewNote: null,
  },
  {
    id: "record-jean-report",
    academyId: "acad-kigali",
    studentId: "user-jean",
    recordType: "academic",
    recordedBy: "user-jean",
    recordedOn: "2026-11-21",
    data: {
      kind: "report_card",
      school: "Lycée de Kigali",
      term: "Term 3, 2026",
    },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-21T12:00:00Z",
    reviewNote: null,
  },
  {
    id: "record-jean-free-throws",
    academyId: "acad-kigali",
    studentId: "user-jean",
    recordType: "athletic",
    recordedBy: "user-patrick",
    recordedOn: "2026-11-22",
    data: { sport: "basketball", drill: "free_throws", made: 8, attempts: 10 },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-22T17:05:00Z",
    reviewNote: null,
  },
  {
    id: "record-samuel-m-free-throws",
    academyId: "acad-kigali",
    studentId: "user-samuel-m",
    recordType: "athletic",
    recordedBy: "user-patrick",
    recordedOn: "2026-11-22",
    data: { sport: "basketball", drill: "free_throws", made: 7, attempts: 10 },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-22T17:30:00Z",
    reviewNote: null,
  },
  {
    id: "record-samuel-i-three-pt",
    academyId: "acad-kigali",
    studentId: "user-samuel-i",
    recordType: "athletic",
    recordedBy: "user-marie",
    recordedOn: "2026-11-22",
    data: { sport: "basketball", drill: "three_point", made: 6, attempts: 10 },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-22T18:00:00Z",
    reviewNote: null,
  },
  {
    id: "record-grace-i-report",
    academyId: "acad-kigali",
    studentId: "user-grace-i",
    recordType: "academic",
    recordedBy: "user-grace-i",
    recordedOn: "2026-11-22",
    data: {
      kind: "report_card",
      school: "FAWE Girls School",
      term: "Term 3, 2026",
    },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-22T10:00:00Z",
    reviewNote: null,
  },
  {
    id: "record-grace-i-penalties",
    academyId: "acad-kigali",
    studentId: "user-grace-i",
    recordType: "athletic",
    recordedBy: "user-marie",
    recordedOn: "2026-11-23",
    data: { sport: "football", drill: "penalty_kicks", made: 4, attempts: 5 },
    schemaVersion: 1,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: "2026-11-23T07:40:00Z",
    reviewNote: null,
  },
];

export const auditLog: AuditLogEntry[] = [
  {
    id: "audit-1",
    academyId: "acad-kigali",
    actorId: "user-sharika",
    action: "fee.void",
    entityType: "fee",
    entityId: "fee-samuel-m-nov-dup",
    before: { amount: "30000.00 RWF", paid_at: "2026-11-20", voided_at: null },
    after: {
      amount: "30000.00 RWF",
      paid_at: "2026-11-20",
      voided_at: "2026-11-23 09:14",
    },
    reason: "Duplicate entry. The cash payment on 21 Nov is the real one.",
    createdAt: "2026-11-23T07:14:00Z",
  },
  {
    id: "audit-2",
    academyId: "acad-kigali",
    actorId: "user-patrick",
    action: "attendance.check_out",
    entityType: "attendance",
    entityId: "attendance-aline-u14-1122",
    before: { check_out_at: null },
    after: { check_out_at: "2026-11-22 18:42" },
    reason: null,
    createdAt: "2026-11-22T16:42:00Z",
  },
  {
    id: "audit-3",
    academyId: "acad-kigali",
    actorId: "user-patrick",
    action: "record.verify",
    entityType: "student_record",
    entityId: "record-jean-free-throws-old",
    before: { status: "pending" },
    after: { status: "verified" },
    reason: null,
    createdAt: "2026-11-22T15:05:00Z",
  },
  {
    id: "audit-4",
    academyId: "acad-kigali",
    actorId: "user-sharika",
    action: "team.member_move",
    entityType: "team",
    entityId: "team-u14",
    before: { team: "U12" },
    after: { team: "U14" },
    reason: null,
    createdAt: "2026-11-20T12:20:00Z",
  },
  {
    id: "audit-5",
    academyId: "acad-kigali",
    actorId: "user-sharika",
    action: "attendance.void",
    entityType: "attendance",
    entityId: "attendance-divine-i-u12-1119",
    before: { voided_at: null },
    after: { voided_at: "2026-11-19 19:02" },
    reason: "Marked present by mistake.",
    createdAt: "2026-11-19T17:02:00Z",
  },
  {
    id: "audit-6",
    academyId: "acad-kigali",
    actorId: "user-innocent",
    action: "academy.qr_regenerate",
    entityType: "organization",
    entityId: "acad-kigali",
    before: null,
    after: null,
    reason: null,
    createdAt: "2026-11-16T06:11:00Z",
  },
];

/** Simulated network latency for fixture calls, so loading states are visible. */
export function fixtureDelay(ms = 120): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
