-- Schema v2 (revised schema document, Nov 2026).
--
-- attendance: one row per student per session of a calendar event; void and
--   verify columns. calendar_event: date + time columns instead of
--   starts_at / ends_at / all_day. fee: owed fees (due_date, nullable
--   paid_at) with void columns. student_record: review_note. audit_log: new,
--   append-only. organization: academy coordinates, QR radius and nonce.
--
-- Would fail on non-empty tables (production app tables are empty when this
-- is written): attendance.event_id / recorded_by, calendar_event.start_date,
-- fee.due_date and organization.latitude / longitude are added NOT NULL with
-- no default. organization.qrNonce is backfilled before it becomes NOT NULL.

-- Hand-written: the old CHECK names columns dropped below.
ALTER TABLE "calendar_event" DROP CONSTRAINT "calendar_event_ends_after_starts";

-- DropIndex
DROP INDEX "attendance_academy_student_day_uq";

-- DropIndex
DROP INDEX "calendar_event_academy_starts_idx";

-- DropIndex
DROP INDEX "calendar_event_team_starts_idx";

-- DropIndex
DROP INDEX "fee_student_period_uq";

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "check_in_distance_m" INTEGER,
ADD COLUMN     "check_out_distance_m" INTEGER,
ADD COLUMN     "event_id" TEXT NOT NULL,
ADD COLUMN     "recorded_by" TEXT NOT NULL,
ADD COLUMN     "verified_at" TIMESTAMPTZ,
ADD COLUMN     "verified_by" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ,
ADD COLUMN     "voided_by" TEXT;

-- AlterTable
ALTER TABLE "calendar_event" DROP COLUMN "all_day",
DROP COLUMN "ends_at",
DROP COLUMN "starts_at",
ADD COLUMN     "collect_attendance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "end_date" DATE,
ADD COLUMN     "end_time" TIME,
ADD COLUMN     "excluded_dates" DATE[] DEFAULT ARRAY[]::DATE[],
ADD COLUMN     "start_date" DATE NOT NULL,
ADD COLUMN     "start_time" TIME;

-- AlterTable
ALTER TABLE "fee" ADD COLUMN     "due_date" DATE NOT NULL,
ADD COLUMN     "recorded_by" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ,
ADD COLUMN     "voided_by" TEXT,
ALTER COLUMN "paid_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "attendanceRadiusM" INTEGER DEFAULT 150,
ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "qrNonce" TEXT;

-- Hand-written: give any existing academy a random QR nonce (two
-- gen_random_uuid() values, built in since PostgreSQL 13), then require it.
-- New academies get theirs from the Better Auth create hook.
UPDATE "organization"
SET "qrNonce" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "qrNonce" IS NULL;
ALTER TABLE "organization" ALTER COLUMN "qrNonce" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_record" ADD COLUMN     "review_note" TEXT;

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_academy_created_idx" ON "audit_log"("academy_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entity_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "attendance_event_session_idx" ON "attendance"("event_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_event_student_session_uq" ON "attendance"("event_id", "student_id", "session_date") WHERE (voided_at IS NULL);

-- CreateIndex
CREATE INDEX "calendar_event_academy_start_idx" ON "calendar_event"("academy_id", "start_date");

-- CreateIndex
CREATE INDEX "calendar_event_team_start_idx" ON "calendar_event"("team_id", "start_date") WHERE (team_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_id_academy_uq" ON "calendar_event"("id", "academy_id");

-- CreateIndex
CREATE INDEX "fee_unpaid_due_idx" ON "fee"("academy_id", "due_date") WHERE (paid_at IS NULL AND voided_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "fee_student_period_uq" ON "fee"("student_id", "academy_id", "period_start") WHERE (voided_at IS NULL);

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_same_academy" FOREIGN KEY ("event_id", "academy_id") REFERENCES "calendar_event"("id", "academy_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee" ADD CONSTRAINT "fee_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee" ADD CONSTRAINT "fee_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written: CHECK constraints and the audit_log trigger. Prisma's schema
-- language cannot express them, and Prisma Migrate does not track them, so
-- they never show as drift. Keep this block when regenerating this migration.
-- attendance_check_out_after_check_in, fee_amount_positive, fee_period_valid
-- and student_record_verified_by_matches_status come from the init migration
-- and are unchanged.
-- ---------------------------------------------------------------------------

-- Prisma creates scalar lists as nullable columns; the document wants NOT NULL.
ALTER TABLE "calendar_event" ALTER COLUMN "excluded_dates" SET NOT NULL;

-- The coach's checkmark: verified_at and verified_by are set together.
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_verified_together"
  CHECK (("verified_at" IS NULL) = ("verified_by" IS NULL));

-- voided_at, voided_by and void_reason are set together or not at all.
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_void_all_or_nothing"
  CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL)
     AND ("voided_at" IS NULL) = ("void_reason" IS NULL));

ALTER TABLE "fee" ADD CONSTRAINT "fee_void_all_or_nothing"
  CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL)
     AND ("voided_at" IS NULL) = ("void_reason" IS NULL));

-- A multi-day event ends on or after the day it starts.
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_end_date_valid"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- Both times set, or both NULL (all-day).
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_times_together"
  CHECK (("start_time" IS NULL) = ("end_time" IS NULL));

-- A session ends after it starts.
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_end_time_after_start"
  CHECK ("end_time" IS NULL OR "end_time" > "start_time");

-- Taking attendance needs a session window, so a start time.
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_attendance_needs_start_time"
  CHECK (NOT "collect_attendance" OR "start_time" IS NOT NULL);

-- audit_log is append-only. The schema document asks for REVOKE UPDATE,
-- DELETE from the app's role, but the app connects as the database owner, so
-- a trigger enforces it instead. It also fires for cascaded deletes and
-- SET NULL updates from foreign keys, and for TRUNCATE.
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_reject_change"();
