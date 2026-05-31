-- DropForeignKey
ALTER TABLE "mfa_recovery_codes" DROP CONSTRAINT "mfa_recovery_codes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_user_id_fkey";

-- CreateTable
CREATE TABLE "provinces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_authorities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authority_type" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "land_authorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authority_villages" (
    "id" TEXT NOT NULL,
    "land_authority_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "authority_villages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT,
    "actor_role" TEXT,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "tenant_slug" TEXT,
    "payload_json" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "platform_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "business_name" TEXT NOT NULL,
    "cipc_number" TEXT,
    "vat_number" TEXT,
    "primary_contact_user_id" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geographic_coverage" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verification_status" TEXT NOT NULL DEFAULT 'unverified',
    "bank_details_encrypted" JSONB,
    "created_by_user_id" TEXT NOT NULL,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "business_name" TEXT NOT NULL,
    "cipc_number" TEXT,
    "vat_number" TEXT,
    "primary_contact_user_id" TEXT,
    "category" TEXT NOT NULL,
    "geographic_coverage" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "integration_mechanism" TEXT NOT NULL,
    "integration_config" JSONB NOT NULL DEFAULT '{}',
    "commission_rate_basis_points" INTEGER NOT NULL DEFAULT 250,
    "commission_settlement_cadence" TEXT NOT NULL DEFAULT 'per_transaction',
    "verification_status" TEXT NOT NULL DEFAULT 'unverified',

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_bookings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "customer_resident_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requested_date" TIMESTAMP(3),
    "quote_amount_zar" INTEGER,
    "take_rate_basis_points" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'quote_requested',
    "escrow_payment_id" TEXT,
    "customer_rating" INTEGER,
    "provider_rating" INTEGER,
    "customer_confirmed_at" TIMESTAMP(3),
    "provider_confirmed_at" TIMESTAMP(3),
    "disputed_at" TIMESTAMP(3),
    "dispute_reason" TEXT,

    CONSTRAINT "service_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quote_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_slug" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "basket_json" JSONB NOT NULL,
    "dispatched_to_supplier_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "supplier_quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quote_responses" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "received_via" TEXT NOT NULL,
    "quote_amount_zar" INTEGER,
    "availability" TEXT,
    "lead_time_days" INTEGER,
    "raw_response_text" TEXT,
    "parsed_response_json" JSONB,

    CONSTRAINT "supplier_quote_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_sales" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" TEXT NOT NULL,
    "quote_request_id" TEXT,
    "tenant_slug" TEXT NOT NULL,
    "customer_resident_id" TEXT,
    "fulfilled_amount_zar" INTEGER NOT NULL,
    "commission_amount_zar" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_invoice',
    "invoiced_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "invoice_document_id" TEXT,

    CONSTRAINT "supplier_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DispatchedSuppliers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DispatchedSuppliers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "land_authorities_province_idx" ON "land_authorities"("province_id");

-- CreateIndex
CREATE INDEX "land_authorities_type_idx" ON "land_authorities"("authority_type");

-- CreateIndex
CREATE INDEX "authority_villages_authority_idx" ON "authority_villages"("land_authority_id");

-- CreateIndex
CREATE INDEX "platform_audit_event_type_idx" ON "platform_audit_events"("event_type");

-- CreateIndex
CREATE INDEX "platform_audit_entity_id_idx" ON "platform_audit_events"("entity_id");

-- CreateIndex
CREATE INDEX "service_providers_status_idx" ON "service_providers"("verification_status");

-- CreateIndex
CREATE INDEX "service_providers_user_idx" ON "service_providers"("primary_contact_user_id");

-- CreateIndex
CREATE INDEX "suppliers_category_idx" ON "suppliers"("category");

-- CreateIndex
CREATE INDEX "service_bookings_status_idx" ON "service_bookings"("status");

-- CreateIndex
CREATE INDEX "service_bookings_provider_idx" ON "service_bookings"("provider_id");

-- CreateIndex
CREATE INDEX "service_bookings_customer_idx" ON "service_bookings"("tenant_slug", "customer_resident_id");

-- CreateIndex
CREATE INDEX "supplier_quote_requests_tenant_idx" ON "supplier_quote_requests"("tenant_slug");

-- CreateIndex
CREATE INDEX "supplier_quote_requests_status_idx" ON "supplier_quote_requests"("status");

-- CreateIndex
CREATE INDEX "supplier_quote_responses_request_idx" ON "supplier_quote_responses"("request_id");

-- CreateIndex
CREATE INDEX "supplier_sales_supplier_status_idx" ON "supplier_sales"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "_DispatchedSuppliers_B_index" ON "_DispatchedSuppliers"("B");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_authorities" ADD CONSTRAINT "land_authorities_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_villages" ADD CONSTRAINT "authority_villages_land_authority_id_fkey" FOREIGN KEY ("land_authority_id") REFERENCES "land_authorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_responses" ADD CONSTRAINT "supplier_quote_responses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "supplier_quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_responses" ADD CONSTRAINT "supplier_quote_responses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_sales" ADD CONSTRAINT "supplier_sales_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DispatchedSuppliers" ADD CONSTRAINT "_DispatchedSuppliers_A_fkey" FOREIGN KEY ("A") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DispatchedSuppliers" ADD CONSTRAINT "_DispatchedSuppliers_B_fkey" FOREIGN KEY ("B") REFERENCES "supplier_quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
