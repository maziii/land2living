-- Self-service resident registration: link a resident record to a platform user account.
-- Nullable because council-captured residents (foot soldier flow) have no user account.
ALTER TABLE "residents" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "residents_user_id_key" ON "residents"("user_id");
