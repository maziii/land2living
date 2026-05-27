-- T-02.01: residents, stands, stand_occupancies
-- Enum-like fields use TEXT + CHECK constraints (not PostgreSQL enum types) so
-- each tenant schema gets its own copy without cross-schema type references.

CREATE TABLE "residents" (
    "id"                   TEXT NOT NULL,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,
    "deleted_at"           TIMESTAMP(3),
    -- SA ID number stored AES-256-GCM encrypted by the application layer.
    "id_number"            TEXT NOT NULL,
    "first_name"           TEXT NOT NULL,
    "last_name"            TEXT NOT NULL,
    "other_names"          TEXT,
    "date_of_birth"        DATE,
    "gender"               TEXT,
    "phone_number"         TEXT NOT NULL,
    "whatsapp_number"      TEXT,
    "language_preference"  TEXT NOT NULL,
    "consent_data_capture" BOOLEAN NOT NULL,
    "consent_marketing"    BOOLEAN NOT NULL DEFAULT false,
    "notes"                TEXT,
    "captured_by_user_id"  TEXT NOT NULL,
    "verification_status"  TEXT NOT NULL DEFAULT 'unverified',

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "residents_gender_check" CHECK (
        gender IS NULL OR gender IN ('M', 'F', 'X')
    ),
    CONSTRAINT "residents_language_check" CHECK (
        language_preference IN ('nde', 'nso', 'ts', 'tn', 'ss', 'af', 'en', 'zu', 'xh', 've', 'nr')
    ),
    CONSTRAINT "residents_verification_status_check" CHECK (
        verification_status IN ('unverified', 'identity_verified', 'council_verified')
    )
);

CREATE TABLE "stands" (
    "id"                  TEXT NOT NULL,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,
    "deleted_at"          TIMESTAMP(3),
    "local_reference"     TEXT,
    "gps_latitude"        DECIMAL(9,6) NOT NULL,
    "gps_longitude"       DECIMAL(9,6) NOT NULL,
    "boundary_geojson"    JSONB,
    "area_square_metres"  DECIMAL(12,2),
    "address_description" TEXT NOT NULL,
    "village_or_section"  TEXT NOT NULL,
    "notes"               TEXT,

    CONSTRAINT "stands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stand_occupancies" (
    "id"           TEXT NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at"     TIMESTAMP(3),
    "stand_id"     TEXT NOT NULL,
    "resident_id"  TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    -- pto_id is a nullable reference; FK constraint added in T-03.05 when pto table exists.
    "pto_id"       TEXT,

    CONSTRAINT "stand_occupancies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stand_occupancies_stand_id_fkey"
        FOREIGN KEY ("stand_id") REFERENCES "stands"("id"),
    CONSTRAINT "stand_occupancies_resident_id_fkey"
        FOREIGN KEY ("resident_id") REFERENCES "residents"("id"),
    CONSTRAINT "stand_occupancies_relationship_check" CHECK (
        relationship IN ('primary_occupant', 'household_member', 'historic_owner')
    )
);

-- residents
CREATE INDEX "residents_phone_number_idx"          ON "residents"("phone_number");
CREATE INDEX "residents_verification_status_idx"   ON "residents"("verification_status");
CREATE INDEX "residents_deleted_at_idx"            ON "residents"("deleted_at");

-- stands
CREATE INDEX "stands_village_or_section_idx"  ON "stands"("village_or_section");
CREATE INDEX "stands_gps_idx"                 ON "stands"("gps_latitude", "gps_longitude");
CREATE INDEX "stands_deleted_at_idx"          ON "stands"("deleted_at");

-- stand_occupancies
CREATE INDEX "stand_occupancies_stand_id_idx"    ON "stand_occupancies"("stand_id", "ended_at");
CREATE INDEX "stand_occupancies_resident_id_idx" ON "stand_occupancies"("resident_id");
