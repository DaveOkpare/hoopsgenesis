-- CreateTable
CREATE TABLE "invitation_code" (
    "id" TEXT NOT NULL,
    "academy_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "team_id" TEXT,
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by" TEXT,
    "revoke_reason" TEXT,

    CONSTRAINT "invitation_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_code_redemption" (
    "id" TEXT NOT NULL,
    "code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redeemed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_code_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_code_code_uq" ON "invitation_code"("code");

-- CreateIndex
CREATE INDEX "invitation_code_academy_created_idx" ON "invitation_code"("academy_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invitation_code_created_by_idx" ON "invitation_code"("created_by");

-- CreateIndex
CREATE INDEX "invitation_code_redemption_user_idx" ON "invitation_code_redemption"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_code_redemption_code_user_uq" ON "invitation_code_redemption"("code_id", "user_id");

-- AddForeignKey
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_team_same_academy" FOREIGN KEY ("team_id", "academy_id") REFERENCES "team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_code_redemption" ADD CONSTRAINT "invitation_code_redemption_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "invitation_code"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_code_redemption" ADD CONSTRAINT "invitation_code_redemption_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written rules (Prisma does not track CHECK constraints).

-- Academy roles only. `admin` codes are created only by the platform owner
-- (app check); they are always single use and expire (below).
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_role_valid"
  CHECK ("role" IN ('admin', 'coach', 'student'));

-- Every code is limited: by a use limit, an expiry, or both.
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_has_limit"
  CHECK ("max_uses" IS NOT NULL OR "expires_at" IS NOT NULL);

ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_max_uses_positive"
  CHECK ("max_uses" IS NULL OR "max_uses" > 0);

-- The redeem UPDATE increments use_count only while it is below max_uses;
-- this makes overshooting impossible even for a buggy writer.
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_use_count_valid"
  CHECK ("use_count" >= 0 AND ("max_uses" IS NULL OR "use_count" <= "max_uses"));

ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_admin_single_use"
  CHECK ("role" <> 'admin' OR ("max_uses" = 1 AND "expires_at" IS NOT NULL));

-- revoked_at and revoked_by are set together; a reason (optional) only on a
-- revoked code.
ALTER TABLE "invitation_code" ADD CONSTRAINT "invitation_code_revoke_all_or_nothing"
  CHECK (("revoked_at" IS NULL) = ("revoked_by" IS NULL)
     AND ("revoke_reason" IS NULL OR "revoked_at" IS NOT NULL));
