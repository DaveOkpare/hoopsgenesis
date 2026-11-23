-- Who was really acting when an audited action was taken while impersonating
-- (session.impersonatedBy). Same delete rule as actor_id. Adding a nullable
-- column rewrites no rows, so the append-only trigger is not involved.

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "impersonated_by" TEXT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_impersonated_by_fkey" FOREIGN KEY ("impersonated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
