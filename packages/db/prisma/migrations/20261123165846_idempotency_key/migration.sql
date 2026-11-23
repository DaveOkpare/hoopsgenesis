-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_key_created_idx" ON "idempotency_key"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_key_scope_uq" ON "idempotency_key"("key", "scope");
