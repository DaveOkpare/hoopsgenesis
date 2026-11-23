/*
 * Fixtures only the owner console needs (Paper "[Owner] Academies console" and
 * "[Owner] Create academy"). Counts are the platform-wide numbers drawn in the designs,
 * which the shared fixture people list does not add up to. Only api.ts imports this.
 */
import type { Id, Timestamp } from "@/features/types";

export interface AcademyStatsFixture {
  academyId: Id;
  /** Name of the academy admin shown on the console row ("Admin Sharika D."). */
  adminName: string | null;
  admins: number;
  coaches: number;
  members: number;
  qrRegeneratedAt: Timestamp | null;
  qrRegeneratedBy: string | null;
  students: number;
  teams: number;
}

export const academyStats: AcademyStatsFixture[] = [
  {
    academyId: "acad-kigali",
    adminName: "Sharika D.",
    members: 48,
    admins: 2,
    coaches: 6,
    students: 40,
    teams: 4,
    qrRegeneratedAt: "2026-11-16T06:11:00Z",
    qrRegeneratedBy: "Innocent M.",
  },
  {
    academyId: "acad-bengaluru",
    adminName: "Priya N.",
    members: 126,
    admins: 3,
    coaches: 11,
    students: 112,
    teams: 8,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
  {
    academyId: "acad-kampala",
    adminName: "Grace A.",
    members: 31,
    admins: 2,
    coaches: 4,
    students: 25,
    teams: 3,
    qrRegeneratedAt: null,
    qrRegeneratedBy: null,
  },
];

export interface ActivityFixture {
  academyId: Id;
  action: string;
  createdAt: Timestamp;
  id: Id;
  /** Sentence as the console shows it ("Sharika voided a payment"). */
  summary: string;
}

export const academyActivity: ActivityFixture[] = [
  {
    id: "audit-1",
    academyId: "acad-kigali",
    action: "fee.void",
    summary: "Sharika voided a payment",
    createdAt: "2026-11-23T07:14:00Z",
  },
  {
    id: "audit-3",
    academyId: "acad-kigali",
    action: "record.verify",
    summary: "Patrick verified a free-throw result",
    createdAt: "2026-11-22T15:05:00Z",
  },
  {
    id: "audit-6",
    academyId: "acad-kigali",
    action: "academy.qr_regenerate",
    summary: "Innocent replaced the QR code",
    createdAt: "2026-11-16T06:11:00Z",
  },
  {
    id: "audit-b1",
    academyId: "acad-bengaluru",
    action: "fee.pay",
    summary: "Priya recorded a payment",
    createdAt: "2026-11-23T04:40:00Z",
  },
  {
    id: "audit-b2",
    academyId: "acad-bengaluru",
    action: "team.member_add",
    summary: "Priya added 3 students to U12",
    createdAt: "2026-11-21T09:30:00Z",
  },
  {
    id: "audit-k1",
    academyId: "acad-kampala",
    action: "record.verify",
    summary: "Grace verified a report card",
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
