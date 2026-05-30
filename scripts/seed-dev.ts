/**
 * Bootstraps the local dev environment in one step:
 *   1. Runs public schema Prisma migrations
 *   2. Creates the `tenant_ndebele` schema and runs tenant migrations
 *   3. Seeds one dev user per role
 *   4. Seeds realistic data across all modules (residents, stands, applications,
 *      PTOs, resale listings, service providers, suppliers, service bookings)
 *
 * Idempotent — safe to re-run. Existing rows are skipped or upserted.
 *
 * Usage:
 *   npm run dev:seed
 *
 * Prerequisites: DATABASE_URL set in .env and `npm run dev:up` running.
 */
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { randomUUID, generateKeyPairSync, sign as cryptoSign, createCipheriv, randomBytes } from "crypto";
import pg from "pg";
import argon2 from "argon2";
import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { encryptIdNumber } from "../apps/api/src/shared/crypto/id-encryption.js";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, "..", "apps", "api");

// Load .env from apps/api if vars aren't already in the environment.
try {
  const envFile = readFileSync(join(apiDir, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m?.[1] && m[2] !== undefined && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch { /* .env absent — rely on shell environment */ }

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example → .env first.");
  process.exit(1);
}

const TENANT_SLUG = "ndebele";
const SCHEMA = `tenant_${TENANT_SLUG}`;
const DEV_PASSWORD = "L2Ldev1234!";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Computes the Luhn check digit for a 12-char SA ID prefix. */
function saIdCheckDigit(prefix: string): string {
  let sum = 0;
  let doubleIt = false;
  for (let i = prefix.length - 1; i >= 0; i--) {
    let d = parseInt(prefix[i]!, 10);
    if (doubleIt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    doubleIt = !doubleIt;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Builds and encrypts a valid 13-digit SA ID from a 12-digit prefix. */
function saId(prefix: string): string {
  const full = prefix + saIdCheckDigit(prefix);
  return encryptIdNumber(full);
}

/**
 * Deterministic canonical JSON (sorted keys) for PTO signing —
 * mirrors the logic in apps/api/src/shared/documents/signing.ts.
 */
function sortKeys(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = sortKeys(obj[key]);
  return out;
}

/** Signs a PTO payload with the given Ed25519 private key. */
function signPayload(payload: Record<string, unknown>, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]): string {
  return cryptoSign(null, Buffer.from(JSON.stringify(sortKeys(payload))), privateKey).toString("base64url");
}

/** Encrypts bank details the same way as providers/service.ts. */
function encryptBankDetails(details: object): object {
  const key = Buffer.from(process.env["BANK_DETAILS_ENCRYPTION_KEY"] ?? "0".repeat(64), "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
  return { iv: iv.toString("hex"), data: encrypted.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

const DEV_USERS: { email: string; role: string; displayName: string }[] = [
  { email: "founder@ndebele.dev",   role: "founder",           displayName: "Founder"           },
  { email: "secretary@ndebele.dev", role: "council_secretary", displayName: "Council Secretary"  },
  { email: "member@ndebele.dev",    role: "council_member",    displayName: "Council Member"     },
  { email: "soldier@ndebele.dev",   role: "foot_soldier",      displayName: "Foot Soldier"       },
  { email: "officer@ndebele.dev",   role: "land_officer",      displayName: "Land Officer"       },
  { email: "resident@ndebele.dev",  role: "resident",          displayName: "Resident"           },
  { email: "provider@ndebele.dev",  role: "provider",          displayName: "Provider (Dev)"     },
];

// ── 1. Public schema migrations ───────────────────────────────────────────────

console.log("→ Running public schema migrations…");
execSync("npx prisma migrate deploy", {
  cwd: apiDir,
  env: { ...process.env, DATABASE_URL },
  stdio: "inherit",
});

// ── 2. Tenant schema setup ────────────────────────────────────────────────────

console.log(`→ Creating schema "${SCHEMA}"…`);
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);

  const tenantUrl = new URL(DATABASE_URL);
  tenantUrl.searchParams.set("schema", SCHEMA);
  const tenantDbUrl = tenantUrl.toString();

  console.log(`→ Syncing tenant schema for "${SCHEMA}"…`);
  execSync("npx prisma db push --schema prisma/tenant/schema.prisma --skip-generate --accept-data-loss", {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: tenantDbUrl },
    stdio: "inherit",
  });

  // ── 3. Dev users ──────────────────────────────────────────────────────────

  console.log("→ Seeding dev users…");
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
  const userIds: Record<string, string> = {};

  for (const u of DEV_USERS) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (id, email, password_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
       RETURNING id`,
      [u.email, passwordHash],
    );
    const userId = res.rows[0]?.id;
    if (!userId) throw new Error(`Failed to upsert user ${u.email}`);
    userIds[u.role] = userId;

    await client.query(`DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_slug = $2`, [userId, TENANT_SLUG]);
    await client.query(
      `INSERT INTO tenant_memberships (id, user_id, tenant_slug, role) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [userId, TENANT_SLUG, u.role],
    );
    console.log(`  ✓ ${u.displayName} (${u.email})`);
  }

  const founderUserId     = userIds["founder"]!;
  const secretaryUserId   = userIds["council_secretary"]!;
  const footSoldierUserId = userIds["foot_soldier"]!;
  const residentUserId    = userIds["resident"]!;
  const providerUserId    = userIds["provider"]!;

  // ── 3b. Jurisdiction master data (idempotent — ON CONFLICT DO NOTHING) ───────

  console.log("→ Seeding jurisdiction master data…");

  const PROVINCES = [
    { id: "GP",  name: "Gauteng",          code: "GP"  },
    { id: "KZN", name: "KwaZulu-Natal",    code: "KZN" },
    { id: "LP",  name: "Limpopo",          code: "LP"  },
    { id: "MP",  name: "Mpumalanga",       code: "MP"  },
    { id: "NW",  name: "North West",       code: "NW"  },
    { id: "FS",  name: "Free State",       code: "FS"  },
    { id: "NC",  name: "Northern Cape",    code: "NC"  },
    { id: "EC",  name: "Eastern Cape",     code: "EC"  },
    { id: "WC",  name: "Western Cape",     code: "WC"  },
  ];
  for (const p of PROVINCES) {
    await client.query(
      `INSERT INTO provinces (id, name, code) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.code],
    );
  }

  const AUTHORITIES: { id: string; name: string; type: string; province: string }[] = [
    // Mpumalanga — pilot tenant (KwaNdebele / Nkangala District)
    { id: "aut-ndebele", name: "Ndebele Royal Council (King Mabena)", type: "traditional_council", province: "MP" },
  ];
  for (const a of AUTHORITIES) {
    await client.query(
      `INSERT INTO land_authorities (id, name, authority_type, province_id, is_active, created_at)
       VALUES ($1,$2,$3,$4,true,NOW()) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.name, a.type, a.province],
    );
  }

  const VILLAGES: { authorityId: string; name: string }[] = [
    { authorityId: "aut-ndebele", name: "KwaMhlanga" },
    { authorityId: "aut-ndebele", name: "Siyabuswa" },
    { authorityId: "aut-ndebele", name: "Empuluzi" },
    { authorityId: "aut-ndebele", name: "Enkangala" },
    { authorityId: "aut-ndebele", name: "Tweefontein" },
    { authorityId: "aut-ndebele", name: "Mdutjane" },
    { authorityId: "aut-ndebele", name: "Nkangala" },
    { authorityId: "aut-ndebele", name: "KwaDela" },
    { authorityId: "aut-ndebele", name: "Verena" },
    { authorityId: "aut-ndebele", name: "Doornkop" },
  ];
  for (const v of VILLAGES) {
    await client.query(
      `INSERT INTO authority_villages (id, land_authority_id, name, is_active)
       VALUES (gen_random_uuid(),$1,$2,true)
       ON CONFLICT DO NOTHING`,
      [v.authorityId, v.name],
    );
  }
  console.log(`  ✓ ${PROVINCES.length} provinces, ${AUTHORITIES.length} authorities, ${VILLAGES.length} villages`);

  // ── 4. Clear existing seed data ───────────────────────────────────────────
  // Truncate in dependency order so foreign-key constraints are satisfied.

  console.log("→ Clearing existing seed data…");
  await client.query(`TRUNCATE
    "${SCHEMA}".application_documents,
    "${SCHEMA}".resale_offers,
    "${SCHEMA}".resale_listings,
    "${SCHEMA}".ptos,
    "${SCHEMA}".land_applications,
    "${SCHEMA}".stand_occupancies,
    "${SCHEMA}".audit_events,
    "${SCHEMA}".documents,
    "${SCHEMA}".stands,
    "${SCHEMA}".residents
    CASCADE`);
  await client.query(`TRUNCATE service_bookings, supplier_sales, supplier_quote_responses,
    supplier_quote_requests, suppliers, service_providers, platform_audit_events CASCADE`);

  // ── 5. MinIO bucket ───────────────────────────────────────────────────────

  console.log("→ Ensuring MinIO bucket 'l2l-documents' exists…");
  const s3 = new S3Client({
    endpoint: "http://localhost:9000",
    region: "af-south-1",
    credentials: { accessKeyId: "l2l_minio", secretAccessKey: "l2l_minio_dev" },
    forcePathStyle: true,
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: "l2l-documents" }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: "l2l-documents" }));
  }

  // ── 5. Ed25519 signing key for PTO seeds ──────────────────────────────────

  // Generate a fresh keypair for seeding. Not persisted in .env — PTOs seeded
  // here cannot be re-verified by the running API (which uses its own key).
  // This is intentional for dev: the data shape is what matters, not signature validity.
  const { privateKey: ptoPrivKey } = generateKeyPairSync("ed25519");

  // ── 6. Residents ──────────────────────────────────────────────────────────

  console.log("→ Seeding residents…");

  // SA ID prefixes: YYMMDD + GGGG (≥5000 = male) + C + A
  // Full 12-char prefix; check digit is appended by saId()
  const residents = [
    // Demo resident: id === userId so the resident portal works (userId IS the resident record ID)
    { id: residentUserId,  firstName: "Demo",     lastName: "Resident", gender: "M", phone: "+27713009001", idPrefix: "870612567208", lang: "nde", status: "council_verified",  capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Thabo",    lastName: "Mahlangu", gender: "M", phone: "+27713001001", idPrefix: "850315523408", lang: "nde", status: "council_verified",  capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Nomsa",    lastName: "Dlamini",  gender: "F", phone: "+27713001002", idPrefix: "900722145608", lang: "nde", status: "council_verified",  capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Sipho",    lastName: "Nkosi",    gender: "M", phone: "+27713001003", idPrefix: "781105789008", lang: "zu",  status: "council_verified",  capturedBy: secretaryUserId   },
    { id: randomUUID(), firstName: "Zanele",   lastName: "Mthembu",  gender: "F", phone: "+27713001004", idPrefix: "950214234508", lang: "nde", status: "unverified",        capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Bongani",  lastName: "Ndlovu",   gender: "M", phone: "+27713001005", idPrefix: "820930678908", lang: "nde", status: "council_verified",  capturedBy: secretaryUserId   },
    { id: randomUUID(), firstName: "Lindiwe",  lastName: "Sithole",  gender: "F", phone: "+27713001006", idPrefix: "880418012308", lang: "nde", status: "identity_verified", capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Johannes", lastName: "Mokoena",  gender: "M", phone: "+27713001007", idPrefix: "750601890108", lang: "nso", status: "unverified",        capturedBy: secretaryUserId   },
    { id: randomUUID(), firstName: "Precious",  lastName: "Molefe",   gender: "F", phone: "+27713001008", idPrefix: "931210345608", lang: "tn",  status: "council_verified",  capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Sibusiso",  lastName: "Zulu",     gender: "M", phone: "+27713001009", idPrefix: "881005789108", lang: "nde", status: "council_verified",  capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Ntombi",    lastName: "Khumalo",  gender: "F", phone: "+27713001010", idPrefix: "920315456208", lang: "nde", status: "council_verified",  capturedBy: footSoldierUserId },
    { id: randomUUID(), firstName: "Jabu",      lastName: "Ntuli",    gender: "M", phone: "+27713001011", idPrefix: "760820567308", lang: "zu",  status: "council_verified",  capturedBy: secretaryUserId   },
    { id: randomUUID(), firstName: "Moses",     lastName: "Chauke",   gender: "M", phone: "+27713001012", idPrefix: "840612890108", lang: "ts",  status: "council_verified",  capturedBy: secretaryUserId   },
    { id: randomUUID(), firstName: "Florence",  lastName: "Radebe",   gender: "F", phone: "+27713001013", idPrefix: "910225234508", lang: "nde", status: "council_verified",  capturedBy: footSoldierUserId },
  ];

  const [demoResident, thabo, nomsa, sipho, , bongani, lindiwe, , precious, sibusiso, ntombi, jabu, moses, florence] = residents;

  for (const r of residents) {
    await client.query(
      `INSERT INTO "${SCHEMA}".residents
         (id, id_number, first_name, last_name, gender, phone_number, language_preference,
          consent_data_capture, verification_status, captured_by_user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [r.id, saId(r.idPrefix), r.firstName, r.lastName, r.gender, r.phone, r.lang, r.status, r.capturedBy],
    );
  }
  console.log(`  ✓ ${residents.length} residents`);

  // ── 7. Stands ─────────────────────────────────────────────────────────────

  console.log("→ Seeding stands…");

  // Near Hammanskraal / Temba / KwaNdebele region
  const stands = [
    { id: randomUUID(), ref: "A-001", type: "residential", lat: "-25.3701", lon: "28.2801", area: "450",  addr: "Stand A-001, Boomplaats Section, Hammanskraal",     village: "Boomplaats"    },
    { id: randomUUID(), ref: "A-002", type: "residential", lat: "-25.3712", lon: "28.2815", area: "380",  addr: "Stand A-002, Boomplaats Section, Hammanskraal",     village: "Boomplaats"    },
    { id: randomUUID(), ref: "A-003", type: "residential", lat: "-25.3683", lon: "28.2754", area: "520",  addr: "Stand A-003, Extension 6, Temba",                   village: "Extension 6"   },
    { id: randomUUID(), ref: "B-001", type: "residential", lat: "-25.3748", lon: "28.2850", area: "410",  addr: "Stand B-001, Ikageng Section, Hammanskraal",        village: "Ikageng"       },
    { id: randomUUID(), ref: "B-002", type: "residential", lat: "-25.3741", lon: "28.2842", area: "290",  addr: "Stand B-002, Ikageng Section, Hammanskraal",        village: "Ikageng"       },
    { id: randomUUID(), ref: "C-001", type: "business",    lat: "-25.3802", lon: "28.2901", area: "600",  addr: "Stand C-001, New Extension, Temba",                 village: "New Extension" },
    { id: randomUUID(), ref: "D-001", type: "residential", lat: "-25.4701", lon: "28.6501", area: "350",  addr: "Stand D-001, Mhlanga Section, KwaMhlanga",          village: "KwaMhlanga"    },
    { id: randomUUID(), ref: "D-002", type: "residential", lat: "-25.4712", lon: "28.6515", area: "480",  addr: "Stand D-002, Mhlanga Section, KwaMhlanga",          village: "KwaMhlanga"    },
    { id: randomUUID(), ref: "E-001", type: "business",    lat: "-25.1401", lon: "29.1201", area: "820",  addr: "Stand E-001, Siyabuswa Business Park, Siyabuswa",   village: "Siyabuswa"     },
    { id: randomUUID(), ref: "E-002", type: "farming",     lat: "-25.5501", lon: "28.5201", area: "1500", addr: "Stand E-002, Doornkop Agricultural Area, Doornkop", village: "Doornkop"      },
    { id: randomUUID(), ref: "F-001", type: "residential", lat: "-25.3201", lon: "29.0101", area: "325",  addr: "Stand F-001, Enkangala Section, Enkangala",         village: "Enkangala"     },
    { id: randomUUID(), ref: "F-002", type: "community",   lat: "-25.5101", lon: "28.7901", area: "680",  addr: "Stand F-002, Tweefontein Extension, Tweefontein",   village: "Tweefontein"   },
  ];

  const [standA001, standA002, standA003, standB001, standB002, , standD001, standD002, standE001, standE002, standF001] = stands;

  for (const s of stands) {
    await client.query(
      `INSERT INTO "${SCHEMA}".stands
         (id, local_reference, gps_latitude, gps_longitude, area_square_metres,
          address_description, village_or_section, stand_type, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.ref, s.lat, s.lon, s.area, s.addr, s.village, s.type],
    );
  }
  console.log(`  ✓ ${stands.length} stands`);

  // ── 8. Land Applications ──────────────────────────────────────────────────

  console.log("→ Seeding land applications…");

  const today = new Date().toISOString().slice(0, 10);
  const appIds = {
    demo:     randomUUID(),
    nomsa:    randomUUID(),
    thabo:    randomUUID(),
    sipho:    randomUUID(),
    zanele:   randomUUID(),
    bongani:  randomUUID(),
    precious: randomUUID(),
    sibusiso: randomUUID(),
    ntombi:   randomUUID(),
    jabu:     randomUUID(),
    moses:    randomUUID(),
    florence: randomUUID(),
  };

  // Demo resident — under_review (so the portal shows an active application)
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, updated_at)
     VALUES ($1,$2,'new_stand','Boomplaats Section — near community water point',2,
       'I am a registered community member. I need a formal stand allocation to build a permanent home for my family.',
       'under_review',NOW() - INTERVAL '3 days',NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.demo, demoResident!.id],
  );

  // Nomsa — submitted, awaiting review
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        requested_size_square_metres, household_size, reason, status, updated_at)
     VALUES ($1,$2,'new_stand','Near Boomplaats Section — close to existing family plot',350,4,
       'My family has lived in this community for over 20 years. We need our own registered stand to build a permanent home for my children.',
       'submitted',NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.nomsa, nomsa!.id],
  );

  // Thabo — approved, Stand A-001 allocated
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'new_stand','Boomplaats Section — Stand A-001',3,
       'Long-term community resident. Require formal land allocation to secure housing for my family.',
       'approved',NOW() - INTERVAL '14 days',NOW() - INTERVAL '10 days',
       'Applicant meets all criteria. Stand A-001 allocated.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.thabo, thabo!.id, secretaryUserId, standA001!.id],
  );

  // Sipho — regularisation, approved, Stand A-003
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Extension 6, Temba — Stand A-003',5,
       'My family has occupied this stand for 12 years. We are applying to regularise our occupation and obtain a formal PTO.',
       'approved',NOW() - INTERVAL '20 days',NOW() - INTERVAL '15 days',
       'Long-standing occupation confirmed. Regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.sipho, sipho!.id, secretaryUserId, standA003!.id],
  );

  // Zanele — rejected
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, updated_at)
     VALUES ($1,$2,'new_stand','New Extension — unspecified area',2,
       'Looking for a stand to build a home.',
       'rejected',NOW() - INTERVAL '5 days',NOW() - INTERVAL '3 days',
       'Application incomplete — location preference too vague. Please resubmit with specific area reference.',
       $3,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.zanele, residents[3]!.id, secretaryUserId],
  );

  // Bongani — regularisation approved, Stand B-002
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Ikageng Section — Stand B-002',3,
       'Occupied Stand B-002 for 8 years. Applying to regularise and obtain PTO before listing for resale.',
       'approved',NOW() - INTERVAL '60 days',NOW() - INTERVAL '55 days',
       'Occupation verified. Regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.bongani, bongani!.id, secretaryUserId, standB002!.id],
  );

  // Precious — regularisation approved, Stand B-001
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Ikageng Section — Stand B-001',1,
       'Single occupant. Have occupied Stand B-001 for 5 years and wish to regularise.',
       'approved',NOW() - INTERVAL '30 days',NOW() - INTERVAL '25 days',
       'Approved — single occupant, stand uncontested.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.precious, precious!.id, secretaryUserId, standB001!.id],
  );

  // Sibusiso — regularisation approved, Stand D-001
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Mhlanga Section — Stand D-001, KwaMhlanga',2,
       'Long-standing occupant of Stand D-001. Applying to regularise before listing the stand for resale.',
       'approved',NOW() - INTERVAL '40 days',NOW() - INTERVAL '35 days',
       'Occupation confirmed by community headman. Regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.sibusiso, sibusiso!.id, secretaryUserId, standD001!.id],
  );

  // Ntombi — regularisation approved, Stand D-002
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Mhlanga Section — Stand D-002, KwaMhlanga',1,
       'Single occupant. Occupied Stand D-002 for 7 years. Need PTO to sell and relocate.',
       'approved',NOW() - INTERVAL '35 days',NOW() - INTERVAL '30 days',
       'Stand uncontested. Regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.ntombi, ntombi!.id, secretaryUserId, standD002!.id],
  );

  // Jabu — regularisation approved, Stand E-001 (business stand)
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Siyabuswa Business Park — Stand E-001',1,
       'Occupied this business stand for 10 years running a small spaza shop. Applying to regularise and list for sale.',
       'approved',NOW() - INTERVAL '50 days',NOW() - INTERVAL '45 days',
       'Business occupation verified. Stand E-001 regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.jabu, jabu!.id, secretaryUserId, standE001!.id],
  );

  // Moses — regularisation approved, Stand E-002 (farming stand)
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Doornkop Agricultural Area — Stand E-002',4,
       'Family has farmed Stand E-002 for over 15 years. Applying to regularise before transferring to younger family member.',
       'approved',NOW() - INTERVAL '45 days',NOW() - INTERVAL '40 days',
       'Agricultural occupation confirmed. Regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.moses, moses!.id, secretaryUserId, standE002!.id],
  );

  // Florence — regularisation approved, Stand F-001
  await client.query(
    `INSERT INTO "${SCHEMA}".land_applications
       (id, applicant_resident_id, application_type, requested_location_description,
        household_size, reason, status, reviewed_at, decided_at,
        decision_notes, decided_by_user_id, allocated_stand_id, updated_at)
     VALUES ($1,$2,'regularisation','Enkangala Section — Stand F-001',3,
       'Occupied Stand F-001 for 6 years. Applying to regularise and sell to fund building a larger home elsewhere.',
       'approved',NOW() - INTERVAL '28 days',NOW() - INTERVAL '22 days',
       'Occupation verified. Regularisation approved.',
       $3,$4,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [appIds.florence, florence!.id, secretaryUserId, standF001!.id],
  );

  console.log(`  ✓ 11 applications (1 submitted, 9 approved, 1 rejected)`);

  // ── 9. PTOs ───────────────────────────────────────────────────────────────

  console.log("→ Seeding PTOs…");

  const ptoIds = {
    thabo:    randomUUID(),
    sipho:    randomUUID(),
    bongani:  randomUUID(),
    precious: randomUUID(),
    sibusiso: randomUUID(),
    ntombi:   randomUUID(),
    jabu:     randomUUID(),
    moses:    randomUUID(),
    florence: randomUUID(),
  };

  type PtoSeed = { id: string; appId: string; residentId: string; standId: string; residentName: string; standAddr: string; standRef: string; allocDate: string };

  const ptoSeeds: PtoSeed[] = [
    { id: ptoIds.thabo!,    appId: appIds.thabo!,    residentId: thabo!.id,    standId: standA001!.id, residentName: "Thabo Mahlangu",   standAddr: standA001!.addr, standRef: standA001!.ref, allocDate: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.sipho!,    appId: appIds.sipho!,    residentId: sipho!.id,    standId: standA003!.id, residentName: "Sipho Nkosi",      standAddr: standA003!.addr, standRef: standA003!.ref, allocDate: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.bongani!,  appId: appIds.bongani!,  residentId: bongani!.id,  standId: standB002!.id, residentName: "Bongani Ndlovu",   standAddr: standB002!.addr, standRef: standB002!.ref, allocDate: new Date(Date.now() - 55 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.precious!, appId: appIds.precious!, residentId: precious!.id, standId: standB001!.id, residentName: "Precious Molefe",  standAddr: standB001!.addr, standRef: standB001!.ref, allocDate: new Date(Date.now() - 25 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.sibusiso!, appId: appIds.sibusiso!, residentId: sibusiso!.id, standId: standD001!.id, residentName: "Sibusiso Zulu",    standAddr: standD001!.addr, standRef: standD001!.ref, allocDate: new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.ntombi!,   appId: appIds.ntombi!,   residentId: ntombi!.id,   standId: standD002!.id, residentName: "Ntombi Khumalo",   standAddr: standD002!.addr, standRef: standD002!.ref, allocDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.jabu!,     appId: appIds.jabu!,     residentId: jabu!.id,     standId: standE001!.id, residentName: "Jabu Ntuli",       standAddr: standE001!.addr, standRef: standE001!.ref, allocDate: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.moses!,    appId: appIds.moses!,    residentId: moses!.id,    standId: standE002!.id, residentName: "Moses Chauke",     standAddr: standE002!.addr, standRef: standE002!.ref, allocDate: new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.florence!, appId: appIds.florence!, residentId: florence!.id, standId: standF001!.id, residentName: "Florence Radebe",  standAddr: standF001!.addr, standRef: standF001!.ref, allocDate: new Date(Date.now() - 22 * 86400000).toISOString().slice(0, 10) },
  ];

  for (const p of ptoSeeds) {
    const payload: Record<string, unknown> = {
      ptoVersion: "1",
      tenantSlug: TENANT_SLUG,
      applicationId: p.appId,
      residentId: p.residentId,
      residentName: p.residentName,
      standId: p.standId,
      standAddress: p.standAddr,
      standLocalRef: p.standRef,
      allocationDate: p.allocDate,
      issuedByUserId: secretaryUserId,
    };
    const sig = signPayload(payload, ptoPrivKey);

    await client.query(
      `INSERT INTO "${SCHEMA}".ptos
         (id, application_id, resident_id, stand_id, issued_by_user_id, signed_payload_json, signature_base64)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.appId, p.residentId, p.standId, secretaryUserId, JSON.stringify(payload), sig],
    );

    // Link PTO back to application
    await client.query(
      `UPDATE "${SCHEMA}".land_applications SET pto_id = $1 WHERE id = $2 AND pto_id IS NULL`,
      [p.id, p.appId],
    );
  }
  console.log(`  ✓ ${ptoSeeds.length} PTOs issued`);

  // ── 10. Stand Occupancies ─────────────────────────────────────────────────

  console.log("→ Seeding stand occupancies…");

  const occupancies = [
    { residentId: thabo!.id,    standId: standA001!.id, ptoId: ptoIds.thabo!    },
    { residentId: sipho!.id,    standId: standA003!.id, ptoId: ptoIds.sipho!    },
    { residentId: bongani!.id,  standId: standB002!.id, ptoId: ptoIds.bongani!  },
    { residentId: precious!.id, standId: standB001!.id, ptoId: ptoIds.precious! },
    { residentId: sibusiso!.id, standId: standD001!.id, ptoId: ptoIds.sibusiso! },
    { residentId: ntombi!.id,   standId: standD002!.id, ptoId: ptoIds.ntombi!   },
    { residentId: jabu!.id,     standId: standE001!.id, ptoId: ptoIds.jabu!     },
    { residentId: moses!.id,    standId: standE002!.id, ptoId: ptoIds.moses!    },
    { residentId: florence!.id, standId: standF001!.id, ptoId: ptoIds.florence! },
  ];

  for (const occ of occupancies) {
    await client.query(
      `INSERT INTO "${SCHEMA}".stand_occupancies (id, stand_id, resident_id, relationship, pto_id)
       SELECT gen_random_uuid(), $1, $2, 'primary_occupant', $3
       WHERE NOT EXISTS (
         SELECT 1 FROM "${SCHEMA}".stand_occupancies
         WHERE stand_id = $1 AND resident_id = $2 AND ended_at IS NULL
       )`,
      [occ.standId, occ.residentId, occ.ptoId],
    );
  }
  console.log(`  ✓ ${occupancies.length} stand occupancies`);

  // ── 11. Resale Listings ───────────────────────────────────────────────────

  console.log("→ Seeding resale listings…");

  const listingIds = {
    bongani:  randomUUID(),
    precious: randomUUID(),
    thabo:    randomUUID(),
    sipho:    randomUUID(),
    sibusiso: randomUUID(),
    ntombi:   randomUUID(),
    jabu:     randomUUID(),
    moses:    randomUUID(),
    florence: randomUUID(),
  };

  // Bongani — live listing, built property (Ikageng, 290m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'built_property',180000,
       'Well-maintained home on Stand B-002. 3-room brick structure, corrugated iron roof, outdoor tap, vegetable garden. Community borehole within 200m. Serious buyers only.',
       true,'live',NOW() + INTERVAL '60 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.bongani, bongani!.id, standB002!.id, ptoIds.bongani],
  );

  // Precious — draft listing, vacant stand
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'vacant_stand',85000,
       'Flat stand in Ikageng Section. Good access road, close to community tap. Suitable for residential build. Selling to relocate to Pretoria.',
       false,'draft',NOW() + INTERVAL '90 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.precious, precious!.id, standB001!.id, ptoIds.precious],
  );

  // Thabo — live listing, vacant stand (Boomplaats, 450m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'vacant_stand',125000,
       'Spacious 450m² stand in Boomplaats Section. Level ground, good sun, close to community water point and school. Ideal for a family home. Selling to upgrade to larger stand.',
       true,'live',NOW() + INTERVAL '75 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.thabo, thabo!.id, standA001!.id, ptoIds.thabo],
  );

  // Sipho — live listing, built property (Extension 6, 520m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'built_property',240000,
       'Established home on 520m² stand in Extension 6, Temba. 4 rooms including separate kitchen. Brick and mortar, plastered walls. Water connected. Large yard with shade trees. Family relocating to Johannesburg.',
       false,'live',NOW() + INTERVAL '90 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.sipho, sipho!.id, standA003!.id, ptoIds.sipho],
  );

  // Sibusiso — live listing, built property (KwaMhlanga, 350m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'built_property',155000,
       '2-room brick dwelling on Stand D-001 in Mhlanga Section, KwaMhlanga. Corrugated roof, cemented floor, indoor water connection. Neat yard, close to taxi route and shops. Ready to move in.',
       true,'live',NOW() + INTERVAL '60 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.sibusiso, sibusiso!.id, standD001!.id, ptoIds.sibusiso],
  );

  // Ntombi — live listing, vacant stand (KwaMhlanga, 480m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'vacant_stand',90000,
       'Clean 480m² stand in KwaMhlanga. Fenced on two sides. Walking distance to clinic and primary school. Water access point at road. Good for first-time builder.',
       true,'live',NOW() + INTERVAL '80 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.ntombi, ntombi!.id, standD002!.id, ptoIds.ntombi],
  );

  // Jabu — live listing, built property on business stand (Siyabuswa, 820m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'built_property',480000,
       'Prime business stand with existing structure in Siyabuswa Business Park. 820m², currently operating as a spaza and tuck shop. Main road frontage, high foot traffic. Seller retiring — turnkey opportunity for small business owner.',
       false,'live',NOW() + INTERVAL '90 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.jabu, jabu!.id, standE001!.id, ptoIds.jabu],
  );

  // Moses — live listing, vacant farming stand (Doornkop, 1500m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'vacant_stand',62000,
       '1,500m² farming stand in Doornkop Agricultural Area. Previously used for vegetable growing. Good soil, seasonal stream nearby. Suitable for subsistence or small commercial farming. Selling to relocate family.',
       true,'live',NOW() + INTERVAL '120 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.moses, moses!.id, standE002!.id, ptoIds.moses],
  );

  // Florence — live listing, vacant residential stand (Enkangala, 325m²)
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_listings
       (id, seller_resident_id, stand_id, pto_id, listing_type, asking_price_zar,
        description, negotiable, status, expires_at, commission_basis_points, updated_at)
     VALUES ($1,$2,$3,$4,'vacant_stand',78000,
       'Affordable 325m² stand in Enkangala Section. Quiet residential area, close to community hall and crèche. Level plot, suitable for a starter home. Motivated seller — price negotiable for quick sale.',
       true,'live',NOW() + INTERVAL '75 days',250,NOW())
     ON CONFLICT (id) DO NOTHING`,
    [listingIds.florence, florence!.id, standF001!.id, ptoIds.florence],
  );

  // Resale offer from Lindiwe on Bongani's listing
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_offers (id, listing_id, buyer_resident_id, offer_amount_zar, status)
     SELECT gen_random_uuid(), $1, $2, 175000, 'submitted'
     WHERE NOT EXISTS (
       SELECT 1 FROM "${SCHEMA}".resale_offers WHERE listing_id = $1 AND buyer_resident_id = $2
     )`,
    [listingIds.bongani, lindiwe!.id],
  );

  // Offer from Nomsa on Sibusiso's listing
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_offers (id, listing_id, buyer_resident_id, offer_amount_zar, status)
     SELECT gen_random_uuid(), $1, $2, 148000, 'submitted'
     WHERE NOT EXISTS (
       SELECT 1 FROM "${SCHEMA}".resale_offers WHERE listing_id = $1 AND buyer_resident_id = $2
     )`,
    [listingIds.sibusiso, nomsa!.id],
  );

  console.log(`  ✓ 9 resale listings (8 live, 1 draft), 2 offers`);

  // ── 12. Service Providers (public schema) ─────────────────────────────────
  // Fixed UUIDs so re-running the seed is idempotent (ON CONFLICT (id) DO NOTHING).
  // Covers all 11 service categories: building, bricklaying, fencing, plumbing,
  // electrical, repairs, gardening, cleaning, security, borehole, architecture.

  console.log("→ Seeding service providers…");

  const providers = [
    // ── building ───────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0001-4000-8000-000000000001",
      businessName: "Ndebele Build & Repair",
      cipc: "2018/123456/07", vat: null,
      categories: ["building", "bricklaying", "fencing"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Ndebele Build & Repair CC", bankName: "FNB", accountNumber: "62123456789", branchCode: "250655" },
    },
    {
      id: "a1b2c3d4-0002-4000-8000-000000000002",
      businessName: "Mopani Construction (Pty) Ltd",
      cipc: "2015/087432/23", vat: "4120198765",
      categories: ["building", "bricklaying"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Mopani Construction Pty Ltd", bankName: "Absa", accountNumber: "4082345678", branchCode: "632005" },
    },
    {
      id: "a1b2c3d4-0003-4000-8000-000000000003",
      businessName: "Thabo Constructions CC",
      cipc: "2020/234501/07", vat: null,
      categories: ["building"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: { accountHolder: "Thabo Constructions CC", bankName: "Capitec", accountNumber: "1038765432", branchCode: "470010" },
    },

    // ── bricklaying ────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0004-4000-8000-000000000004",
      businessName: "Dikgale Bricklaying & Plastering",
      cipc: "2019/056789/07", vat: null,
      categories: ["bricklaying", "repairs"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "J Dikgale", bankName: "Nedbank", accountNumber: "1023456789", branchCode: "198765" },
    },
    {
      id: "a1b2c3d4-0005-4000-8000-000000000005",
      businessName: "Solid Brick Solutions",
      cipc: "2021/301245/07", vat: null,
      categories: ["bricklaying"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: null,
    },

    // ── fencing ────────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0006-4000-8000-000000000006",
      businessName: "SecureFence & Gates SA",
      cipc: "2017/198234/23", vat: "4310276543",
      categories: ["fencing"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "SecureFence & Gates SA (Pty) Ltd", bankName: "Standard Bank", accountNumber: "0512345610", branchCode: "051001" },
    },
    {
      id: "a1b2c3d4-0007-4000-8000-000000000007",
      businessName: "Lekota Fencing Specialists",
      cipc: "2022/412098/07", vat: null,
      categories: ["fencing", "building"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: null,
    },

    // ── plumbing ───────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0008-4000-8000-000000000008",
      businessName: "Mabena Plumbing Services",
      cipc: "2016/074321/07", vat: null,
      categories: ["plumbing"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "T Mabena", bankName: "Standard Bank", accountNumber: "051234567", branchCode: "051001" },
    },
    {
      id: "a1b2c3d4-0009-4000-8000-000000000009",
      businessName: "Tshwane Water Works",
      cipc: "2014/321987/23", vat: "4891023456",
      categories: ["plumbing", "borehole"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Tshwane Water Works (Pty) Ltd", bankName: "FNB", accountNumber: "62098765432", branchCode: "250655" },
    },
    {
      id: "a1b2c3d4-0010-4000-8000-000000000010",
      businessName: "Mokoena Pipe & Drain",
      cipc: "2023/509876/07", vat: null,
      categories: ["plumbing", "repairs"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: { accountHolder: "S Mokoena", bankName: "Capitec", accountNumber: "1456789012", branchCode: "470010" },
    },

    // ── electrical ─────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0011-4000-8000-000000000011",
      businessName: "Sithole Electrical Contractors",
      cipc: "2019/187654/07", vat: null,
      categories: ["electrical"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Sithole Electrical CC", bankName: "Nedbank", accountNumber: "1034567890", branchCode: "198765" },
    },
    {
      id: "a1b2c3d4-0012-4000-8000-000000000012",
      businessName: "PowerLink Electrical (Pty) Ltd",
      cipc: "2016/243109/23", vat: "4230987654",
      categories: ["electrical"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "PowerLink Electrical Pty Ltd", bankName: "Absa", accountNumber: "4056789012", branchCode: "632005" },
    },
    {
      id: "a1b2c3d4-0013-4000-8000-000000000013",
      businessName: "Bright Spark Solar & Wiring",
      cipc: "2021/678432/07", vat: null,
      categories: ["electrical"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: null,
    },

    // ── repairs ────────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0014-4000-8000-000000000014",
      businessName: "Handy Hands General Repairs",
      cipc: "2020/390123/07", vat: null,
      categories: ["repairs"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Handy Hands CC", bankName: "Capitec", accountNumber: "1567890123", branchCode: "470010" },
    },
    {
      id: "a1b2c3d4-0015-4000-8000-000000000015",
      businessName: "Fix-It Fast Home Maintenance",
      cipc: "2022/501876/07", vat: null,
      categories: ["repairs", "plumbing", "electrical"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Fix-It Fast CC", bankName: "FNB", accountNumber: "62876543210", branchCode: "250655" },
    },

    // ── gardening ──────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0016-4000-8000-000000000016",
      businessName: "Royal Greens Landscaping",
      cipc: "2018/654321/07", vat: null,
      categories: ["gardening", "cleaning"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Royal Greens Landscaping CC", bankName: "Standard Bank", accountNumber: "0598765432", branchCode: "051001" },
    },
    {
      id: "a1b2c3d4-0017-4000-8000-000000000017",
      businessName: "Mabele Garden & Outdoor Services",
      cipc: "2021/765432/07", vat: null,
      categories: ["gardening"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: null,
    },

    // ── cleaning ───────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0018-4000-8000-000000000018",
      businessName: "Clean Horizons Co-op",
      cipc: "2017/432198/07", vat: null,
      categories: ["cleaning", "security"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Clean Horizons Co-op", bankName: "Capitec", accountNumber: "1234512345", branchCode: "470010" },
    },
    {
      id: "a1b2c3d4-0019-4000-8000-000000000019",
      businessName: "Spotless Domestic Services",
      cipc: "2020/876543/07", vat: null,
      categories: ["cleaning"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Spotless Domestic CC", bankName: "Nedbank", accountNumber: "1089012345", branchCode: "198765" },
    },

    // ── security ───────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0020-4000-8000-000000000020",
      businessName: "Kgosi Security Solutions",
      cipc: "2015/210987/23", vat: "4560123789",
      categories: ["security"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Kgosi Security Solutions (Pty) Ltd", bankName: "Absa", accountNumber: "4012345678", branchCode: "632005" },
    },
    {
      id: "a1b2c3d4-0021-4000-8000-000000000021",
      businessName: "Shield Guard Services CC",
      cipc: "2019/345678/07", vat: null,
      categories: ["security"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: null,
    },

    // ── borehole ───────────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0022-4000-8000-000000000022",
      businessName: "Deep Earth Borehole Drilling",
      cipc: "2013/098765/23", vat: "4780234561",
      categories: ["borehole"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Deep Earth Drilling (Pty) Ltd", bankName: "FNB", accountNumber: "62345678901", branchCode: "250655" },
    },
    {
      id: "a1b2c3d4-0023-4000-8000-000000000023",
      businessName: "Limpopo Water Solutions",
      cipc: "2016/567890/07", vat: null,
      categories: ["borehole", "plumbing"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Limpopo Water Solutions CC", bankName: "Standard Bank", accountNumber: "0534567890", branchCode: "051001" },
    },

    // ── architecture ──────────────────────────────────────────────────────
    {
      id: "a1b2c3d4-0024-4000-8000-000000000024",
      businessName: "Mabena & Associates Architects",
      cipc: "2012/456789/23", vat: "4190345672",
      categories: ["architecture"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Mabena & Associates (Pty) Ltd", bankName: "Nedbank", accountNumber: "1012345678", branchCode: "198765" },
    },
    {
      id: "a1b2c3d4-0025-4000-8000-000000000025",
      businessName: "Ubuntu Design Studio",
      cipc: "2018/789012/23", vat: "4350678912",
      categories: ["architecture", "building"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Ubuntu Design Studio (Pty) Ltd", bankName: "Absa", accountNumber: "4067890123", branchCode: "632005" },
    },
    {
      id: "a1b2c3d4-0026-4000-8000-000000000026",
      businessName: "Khaya Plans & Designs",
      cipc: "2021/890123/07", vat: null,
      categories: ["architecture"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: null,
    },
  ];

  for (const p of providers) {
    const bankEnc = p.bank ? JSON.stringify(encryptBankDetails(p.bank)) : null;
    await client.query(
      `INSERT INTO service_providers
         (id, business_name, cipc_number, vat_number, primary_contact_user_id, categories,
          geographic_coverage, verification_status, bank_details_encrypted, created_by_user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.businessName, p.cipc ?? null, p.vat ?? null, founderUserId, p.categories,
       p.coverage, p.status, bankEnc, founderUserId],
    );
  }
  // Link dev provider account to "Ndebele Build & Repair" so provider@ndebele.dev can log in
  await client.query(
    `UPDATE service_providers SET primary_contact_user_id = $1 WHERE id = 'a1b2c3d4-0001-4000-8000-000000000001'`,
    [providerUserId],
  );

  console.log(`  ✓ ${providers.length} service providers across all categories`);
  console.log(`  ✓ provider@ndebele.dev linked to "Ndebele Build & Repair"`);

  // Grab fixed IDs for bookings (same positions as before)
  const provNdebele   = providers[0]!;  // building
  const provMabena    = providers[7]!;  // plumbing
  const provRoyalGreens = providers[15]!; // gardening

  // ── 13. Suppliers (public schema) ─────────────────────────────────────────

  console.log("→ Seeding suppliers…");

  const suppliers = [
    {
      id: randomUUID(), businessName: "MassBuild Hammanskraal",
      category: "hardware_chain", mechanism: "email_template",
      coverage: [TENANT_SLUG],
      config: { emailTo: "quotes@massbuild-hammanskraal.co.za", templateId: "mb-quote-v1" },
      commissionBp: 200,
    },
    {
      id: randomUUID(), businessName: "Builders Express Temba",
      category: "regional_chain", mechanism: "manual",
      coverage: [TENANT_SLUG],
      config: { contactPerson: "Sipho Vilakazi", phone: "+27123456789" },
      commissionBp: 300,
    },
    {
      id: randomUUID(), businessName: "Agri-Build Direct",
      category: "local_store", mechanism: "whatsapp_template",
      coverage: [TENANT_SLUG],
      config: { whatsappNumber: "+27823456789", templateNamespace: "agri_build_quotes" },
      commissionBp: 350,
    },
  ];

  for (const s of suppliers) {
    await client.query(
      `INSERT INTO suppliers
         (id, business_name, category, integration_mechanism, geographic_coverage,
          integration_config, commission_rate_basis_points, verification_status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'verified',NOW())
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.businessName, s.category, s.mechanism, s.coverage, JSON.stringify(s.config), s.commissionBp],
    );
  }
  console.log(`  ✓ ${suppliers.length} suppliers`);

  // ── 14. Service Bookings (public schema) ──────────────────────────────────

  console.log("→ Seeding service bookings…");

  await client.query(
    `INSERT INTO service_bookings
       (id, tenant_slug, customer_resident_id, provider_id, category,
        description, quote_amount_zar, take_rate_basis_points, status,
        customer_rating, customer_confirmed_at, provider_confirmed_at, updated_at)
     SELECT gen_random_uuid(),$1,$2,$3,'gardening',
       'Monthly garden maintenance — mow lawn, trim hedges, remove weeds.',
       1500, 1100, 'completed', 5, NOW() - INTERVAL '45 days', NOW() - INTERVAL '44 days', NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM service_bookings WHERE tenant_slug = $1 AND customer_resident_id = $2 AND provider_id = $3
     )`,
    [TENANT_SLUG, nomsa!.id, provRoyalGreens!.id],
  );

  await client.query(
    `INSERT INTO service_bookings
       (id, tenant_slug, customer_resident_id, provider_id, category,
        description, quote_amount_zar, take_rate_basis_points, status, updated_at)
     SELECT gen_random_uuid(),$1,$2,$3,'plumbing',
       'Leaking outdoor tap and blocked drain inside dwelling. Urgent repair needed.',
       2800, 700, 'quoted', NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM service_bookings WHERE tenant_slug = $1 AND customer_resident_id = $2 AND provider_id = $3
     )`,
    [TENANT_SLUG, sipho!.id, provMabena!.id],
  );

  await client.query(
    `INSERT INTO service_bookings
       (id, tenant_slug, customer_resident_id, provider_id, category,
        description, status, updated_at)
     SELECT gen_random_uuid(),$1,$2,$3,'building',
       'Quote needed for a 2-room brick extension on existing structure. Approx 25m².',
       'quote_requested', NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM service_bookings WHERE tenant_slug = $1 AND customer_resident_id = $2 AND provider_id = $3
     )`,
    [TENANT_SLUG, thabo!.id, provNdebele!.id],
  );

  // Demo resident — quoted status so the portal shows the accept-quote flow
  await client.query(
    `INSERT INTO service_bookings
       (id, tenant_slug, customer_resident_id, provider_id, category,
        description, quote_amount_zar, take_rate_basis_points, status, updated_at)
     SELECT gen_random_uuid(),$1,$2,$3,'plumbing',
       'Leaking tap and cracked pipe near the water meter. Needs urgent repair.',
       1200, 700, 'quoted', NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM service_bookings WHERE tenant_slug = $1 AND customer_resident_id = $2 AND provider_id = $3
     )`,
    [TENANT_SLUG, demoResident!.id, provMabena!.id],
  );

  console.log(`  ✓ 4 service bookings`);

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log(`
✓ Dev environment ready!

  API:         http://localhost:3000
  Web council: http://localhost:3001 (tenant: ${TENANT_SLUG})
  Mobile PWA:  http://localhost:3002 (tenant: ${TENANT_SLUG})
  MailHog UI:  http://localhost:8025
  MinIO UI:    http://localhost:9001

  Dev login credentials (all use password: ${DEV_PASSWORD})
  ──────────────────────────────────────────────────────────
  founder@ndebele.dev   → founder           (full platform access)
  secretary@ndebele.dev → council_secretary (approve applications, issue PTOs)
  member@ndebele.dev    → council_member    (read-only council views)
  soldier@ndebele.dev   → foot_soldier      (register residents and stands)
  officer@ndebele.dev   → land_officer      (process land applications only)
  resident@ndebele.dev  → resident          (submit applications, view own data)
  provider@ndebele.dev  → provider          (Ndebele Build & Repair — web-provider portal)

  Seeded data
  ──────────────────────────────────────────────────────────
  Residents:         13 (Thabo, Nomsa, Sipho, Zanele, Bongani, Lindiwe, Johannes, Precious, Sibusiso, Ntombi, Jabu, Moses, Florence)
  Stands:            12 (A-001 to F-002, Hammanskraal / Temba / KwaNdebele — residential, business, farming, community types)
  Applications:      11 (1 submitted, 9 approved, 1 rejected)
  PTOs:              9  (Thabo, Sipho, Bongani, Precious, Sibusiso, Ntombi, Jabu, Moses, Florence)
  Stand occupancies: 9
  Resale listings:   9  (8 live, 1 draft) + 2 offers
  Service providers: 26 (all 11 categories: building, bricklaying, fencing, plumbing, electrical, repairs, gardening, cleaning, security, borehole, architecture)
  Suppliers:         3  (MassBuild, Builders Express, Agri-Build)
  Service bookings:  4  (completed, quoted, quote_requested, quoted)

  Tenant slug: ${TENANT_SLUG}
`);
} finally {
  await client.end();
}
