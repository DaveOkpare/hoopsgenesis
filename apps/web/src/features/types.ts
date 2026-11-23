/*
 * Shared domain types. They mirror the JSON shapes in "API endpoints.md"
 * (camelCase keys, ISO strings for dates, money as a decimal string plus currency)
 * and the tables in "Academy platform database schema.md". When the real endpoints
 * land, these should match their responses so only each feature's api.ts changes.
 */

/** UUID string. */
export type Id = string;
/** ISO 8601 timestamp in UTC, e.g. "2026-11-23T08:30:00Z". */
export type Timestamp = string;
/** Plain date, "YYYY-MM-DD", in the academy's time zone. */
export type DateOnly = string;
/** Local time of day, "HH:mm". */
export type TimeOfDay = string;

/** Money as the API sends it: decimal string so JSON never rounds it. */
export interface Money {
  amount: string;
  currency: string;
}

/** Cursor-paginated list: `{ data, nextCursor }`. */
export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

/** Platform role on `user.role` (Better Auth admin plugin). "admin" = the owner. */
export type PlatformRole = "user" | "admin";

/** Role inside one academy (`member.role`; several roles are allowed). */
export type AcademyRole = "admin" | "coach" | "student";

/** The country is not stored; it is derived from the academy time zone for the dot colour. */
export type Country = "india" | "rwanda" | "uganda";

export interface UserSummary {
  email: string;
  id: Id;
  image: string | null;
  name: string;
}

export interface User extends UserSummary {
  banned: boolean;
  createdAt: Timestamp;
  dateOfBirth: DateOnly | null;
  phone: string | null;
  platformRole: PlatformRole;
}

/** `organization` + additionalFields. */
export interface Academy {
  attendanceRadiusM: number;
  createdAt: Timestamp;
  defaultCurrency: string;
  id: Id;
  latitude: number;
  location: string | null;
  logo: string | null;
  longitude: number;
  name: string;
  /** Short display name used on phones ("Kigali"). Not in the schema; derived from name. */
  shortName: string;
  slug: string;
  timezone: string;
}

export interface Team {
  academyId: Id;
  ageGroup: string | null;
  createdAt: Timestamp;
  id: Id;
  name: string;
}

/** `member` row with its user and team ids (from getFullOrganization / listTeamMembers). */
export interface Member {
  academyId: Id;
  createdAt: Timestamp;
  id: Id;
  roles: AcademyRole[];
  teamIds: Id[];
  user: UserSummary;
  userId: Id;
}

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "canceled"
  | "expired";

export interface Invitation {
  academyId: Id;
  createdAt: Timestamp;
  email: string;
  expiresAt: Timestamp;
  id: Id;
  inviterId: Id;
  role: AcademyRole;
  status: InvitationStatus;
  teamId: Id | null;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceRecord {
  academyId: Id;
  checkInAt: Timestamp | null;
  checkInDistanceM: number | null;
  checkOutAt: Timestamp | null;
  checkOutDistanceM: number | null;
  eventId: Id;
  id: Id;
  notes: string | null;
  recordedBy: Id;
  sessionDate: DateOnly;
  status: AttendanceStatus;
  studentId: Id;
  verifiedAt: Timestamp | null;
  verifiedBy: Id | null;
  voidedAt: Timestamp | null;
  voidedBy: Id | null;
  voidReason: string | null;
}

export type PaymentMethod = "cash" | "bank_transfer" | "mobile_money";

export interface Fee {
  academyId: Id;
  amount: string;
  createdAt: Timestamp;
  currency: string;
  description: string;
  dueDate: DateOnly;
  id: Id;
  paidAt: Timestamp | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  periodEnd: DateOnly;
  periodStart: DateOnly;
  recordedBy: Id | null;
  studentId: Id;
  voidedAt: Timestamp | null;
  voidedBy: Id | null;
  voidReason: string | null;
}

/** One row of GET /fees/outstanding. */
export interface OutstandingFee {
  amount: string;
  currency: string;
  dueDate: DateOnly;
  /** Last non-voided paid fee, if any. */
  lastPaidAt: Timestamp | null;
  studentId: Id;
  teamId: Id | null;
}

export interface CalendarEvent {
  academyId: Id;
  collectAttendance: boolean;
  createdAt: Timestamp;
  createdBy: Id;
  description: string | null;
  endDate: DateOnly | null;
  endTime: TimeOfDay | null;
  eventType: string;
  excludedDates: DateOnly[];
  id: Id;
  location: string | null;
  startDate: DateOnly;
  startTime: TimeOfDay | null;
  teamId: Id | null;
  title: string;
  updatedAt: Timestamp;
}

export type RecordType = "academic" | "athletic";
export type RecordStatus = "pending" | "verified" | "rejected";

export interface StudentRecord {
  academyId: Id;
  createdAt: Timestamp;
  /** Validated per recordType + schemaVersion. */
  data: Record<string, unknown>;
  /** Short-lived signed URL from GET /records/:id, never the raw key. */
  fileUrl: string | null;
  id: Id;
  recordedBy: Id;
  recordedOn: DateOnly;
  recordType: RecordType;
  reviewNote: string | null;
  schemaVersion: number;
  status: RecordStatus;
  studentId: Id;
  verifiedBy: Id | null;
}

export interface AuditLogEntry {
  academyId: Id | null;
  /** e.g. "fee.void", "attendance.check_out", "record.verify", "team.member_add". */
  action: string;
  actorId: Id | null;
  after: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  createdAt: Timestamp;
  entityId: Id;
  entityType: string;
  id: Id;
  reason: string | null;
}
