/*
 * Fixtures only the fees screens need. Only features/fees/api.ts imports this file.
 * The shared fixtures (features/fixtures.ts) hold November's payments from the designs;
 * these add earlier payments and a few extra students, so the unpaid list adds up to the
 * "Unpaid 14" / "U14 · 6 unpaid" / "U16 · 4 unpaid" counts in the designs.
 */
import type { Fee, Member, User } from "@/features/types";

/**
 * The academy's usual monthly fee (pre-fills "Amount"). Not stored in the schema yet:
 * see "Default fee amount" in the open questions of User stories.md.
 */
export const DEFAULT_FEE = { amount: "30000.00", currency: "RWF" } as const;

/**
 * Collected this month across every payment, and the online/cash split, as drawn in the
 * Fees summary cards. The table only shows the latest page of payments, so these are
 * not recomputed from it; payments recorded or voided in the session adjust them.
 */
export const NOVEMBER_TOTALS = {
  collected: "1140000.00",
  paidStudentCount: 34,
  onlineShare: 0.62,
} as const;

function student(id: string, name: string, email: string): User {
  return {
    id,
    name,
    email,
    image: null,
    platformRole: "user",
    phone: null,
    dateOfBirth: null,
    banned: false,
    createdAt: "2026-08-01T08:00:00Z",
  };
}

export const extraStudents: User[] = [
  student("user-yvette", "Yvette Mukamana", "yvette.m@example.com"),
  student("user-didier", "Didier Nkurunziza", "didier.n@example.com"),
  student("user-fabrice", "Fabrice Mutabazi", "fabrice.m@example.com"),
  student("user-clarisse", "Clarisse Uwera", "clarisse.u@example.com"),
  student("user-moses", "Moses Byiringiro", "moses.b@example.com"),
];

function member(userId: string, teamId: string): Member {
  const found = extraStudents.find((u) => u.id === userId);
  if (!found) {
    throw new Error(`Fees fixture student ${userId} is missing`);
  }
  const { id, name, email, image } = found;
  return {
    id: `member-acad-kigali-${userId}`,
    academyId: "acad-kigali",
    userId,
    roles: ["student"],
    user: { id, name, email, image },
    teamIds: [teamId],
    createdAt: "2026-08-01T08:00:00Z",
  };
}

export const extraMembers: Member[] = [
  member("user-yvette", "team-u14"),
  member("user-didier", "team-u14"),
  member("user-fabrice", "team-u16"),
  member("user-clarisse", "team-u16"),
  member("user-moses", "team-u16"),
];

const MONTHS = {
  "2026-09": { start: "2026-09-01", end: "2026-09-30", label: "Sep 2026" },
  "2026-10": { start: "2026-10-01", end: "2026-10-31", label: "Oct 2026" },
} as const;

function pastFee(
  studentId: string,
  month: keyof typeof MONTHS,
  paidAt: string,
  paymentMethod: Fee["paymentMethod"],
  paymentReference: string | null = null
): Fee {
  const period = MONTHS[month];
  return {
    id: `fee-${studentId.replace("user-", "")}-${month}`,
    academyId: "acad-kigali",
    studentId,
    description: `${period.label} tuition`,
    periodStart: period.start,
    periodEnd: period.end,
    amount: DEFAULT_FEE.amount,
    currency: DEFAULT_FEE.currency,
    dueDate: `${month}-05`,
    paidAt,
    paymentMethod,
    paymentReference,
    createdAt: paidAt,
    recordedBy: paymentMethod === "mobile_money" ? null : "user-sharika",
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}

/**
 * October and September payments for the students who haven't paid November. Some
 * October fees were paid early, in late September.
 */
export const pastFees: Fee[] = [
  pastFee("user-jean", "2026-10", "2026-10-03T09:00:00Z", "cash"),
  pastFee(
    "user-samuel-i",
    "2026-09",
    "2026-09-06T09:00:00Z",
    "mobile_money",
    "MP2609060233"
  ),
  pastFee("user-divine-n", "2026-10", "2026-09-29T10:30:00Z", "cash"),
  pastFee(
    "user-olivier",
    "2026-10",
    "2026-09-30T11:00:00Z",
    "bank_transfer",
    "BK-43911"
  ),
  pastFee("user-mercy", "2026-10", "2026-10-06T08:40:00Z", "cash"),
  pastFee(
    "user-keza",
    "2026-10",
    "2026-10-06T09:10:00Z",
    "mobile_money",
    "MP2610060981"
  ),
  pastFee("user-brian", "2026-10", "2026-10-07T15:20:00Z", "cash"),
  pastFee(
    "user-ange",
    "2026-10",
    "2026-10-08T12:00:00Z",
    "mobile_money",
    "MP2610080114"
  ),
  pastFee("user-yvette", "2026-10", "2026-09-28T09:00:00Z", "cash"),
  pastFee("user-didier", "2026-10", "2026-09-27T16:00:00Z", "cash"),
  pastFee(
    "user-fabrice",
    "2026-10",
    "2026-10-05T10:00:00Z",
    "mobile_money",
    "MP2610050377"
  ),
  pastFee("user-clarisse", "2026-10", "2026-10-03T14:00:00Z", "cash"),
  pastFee(
    "user-moses",
    "2026-10",
    "2026-10-04T09:30:00Z",
    "bank_transfer",
    "BK-43870"
  ),
];
