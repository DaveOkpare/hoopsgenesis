-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('present', 'absent', 'late', 'excused');

-- CreateEnum
CREATE TYPE "student_record_type" AS ENUM ('academic', 'athletic');

-- CreateEnum
CREATE TYPE "student_record_status" AS ENUM ('pending', 'verified', 'rejected');

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_date" DATE NOT NULL,
    "status" "attendance_status" NOT NULL,
    "check_in_at" TIMESTAMPTZ,
    "check_out_at" TIMESTAMPTZ,
    "notes" TEXT,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paid_at" TIMESTAMPTZ NOT NULL,
    "payment_method" TEXT,
    "payment_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_record" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "record_type" "student_record_type" NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "recorded_on" DATE NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "file_url" TEXT,
    "status" "student_record_status" NOT NULL DEFAULT 'pending',
    "verified_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "team_id" TEXT,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    "activeOrganizationId" TEXT,
    "activeTeamId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "location" TEXT,
    "timezone" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "ageGroup" TEXT,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipKey" TEXT,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "teamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "teamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_academy_date_idx" ON "attendance"("academy_id", "session_date");

-- CreateIndex
CREATE INDEX "attendance_student_idx" ON "attendance"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_academy_student_day_uq" ON "attendance"("academy_id", "student_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payment_ref_uq" ON "fee"("payment_reference");

-- CreateIndex
CREATE INDEX "fee_academy_period_idx" ON "fee"("academy_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "fee_student_period_uq" ON "fee"("student_id", "academy_id", "period_start");

-- CreateIndex
CREATE INDEX "student_record_history_idx" ON "student_record"("academy_id", "student_id", "record_type", "recorded_on" DESC);

-- CreateIndex
CREATE INDEX "student_record_pending_idx" ON "student_record"("academy_id", "created_at") WHERE (status = 'pending');

-- CreateIndex
CREATE INDEX "student_record_student_idx" ON "student_record"("student_id");

-- CreateIndex
CREATE INDEX "student_record_recorded_by_idx" ON "student_record"("recorded_by");

-- CreateIndex
CREATE INDEX "student_record_verified_by_idx" ON "student_record"("verified_by");

-- CreateIndex
CREATE INDEX "student_record_data_gin" ON "student_record" USING GIN ("data" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "calendar_event_academy_starts_idx" ON "calendar_event"("academy_id", "starts_at");

-- CreateIndex
CREATE INDEX "calendar_event_team_starts_idx" ON "calendar_event"("team_id", "starts_at") WHERE (team_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "calendar_event_created_by_idx" ON "calendar_event"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "team_organizationId_idx" ON "team"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "team_id_org_uq" ON "team"("id", "organizationId");

-- CreateIndex
CREATE INDEX "teamMember_teamId_idx" ON "teamMember"("teamId");

-- CreateIndex
CREATE INDEX "teamMember_userId_idx" ON "teamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teamMember_membershipKey_key" ON "teamMember"("membershipKey");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_team_user_uq" ON "teamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_org_user_uq" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_org_status_idx" ON "invitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee" ADD CONSTRAINT "fee_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee" ADD CONSTRAINT "fee_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_record" ADD CONSTRAINT "student_record_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_record" ADD CONSTRAINT "student_record_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_record" ADD CONSTRAINT "student_record_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_record" ADD CONSTRAINT "student_record_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_team_same_academy" FOREIGN KEY ("team_id", "academy_id") REFERENCES "team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamMember" ADD CONSTRAINT "teamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamMember" ADD CONSTRAINT "teamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written: CHECK constraints. Prisma's schema language cannot express
-- them, and Prisma Migrate does not track them, so they never show as drift.
-- Keep this block when regenerating this migration.
-- ---------------------------------------------------------------------------

-- A check-out needs a check-in, and comes after it.
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_check_out_after_check_in"
  CHECK ("check_out_at" IS NULL OR ("check_in_at" IS NOT NULL AND "check_out_at" >= "check_in_at"));

-- A payment is for a positive amount over a valid period.
ALTER TABLE "fee" ADD CONSTRAINT "fee_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "fee" ADD CONSTRAINT "fee_period_valid" CHECK ("period_end" >= "period_start");

-- verified_by is set exactly when the record has been reviewed.
ALTER TABLE "student_record" ADD CONSTRAINT "student_record_verified_by_matches_status"
  CHECK (("status" = 'pending') = ("verified_by" IS NULL));

-- An event ends after it starts.
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_ends_after_starts"
  CHECK ("ends_at" >= "starts_at");
