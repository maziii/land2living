-- CreateTable: documents
-- type uses a CHECK constraint rather than a PostgreSQL enum so that each
-- tenant schema gets its own copy without cross-schema type references.

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "signature" TEXT,
    "signed_by_tenant" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_type_check" CHECK (
        type IN ('pto', 'application', 'resale_listing', 'id_doc', 'other')
    )
);

-- CreateIndex
CREATE INDEX "documents_type_idx" ON "documents"("type");

-- CreateIndex
CREATE INDEX "documents_created_by_user_id_idx" ON "documents"("created_by_user_id");
