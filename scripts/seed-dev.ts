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
    { id: randomUUID(), firstName: "Precious", lastName: "Molefe",   gender: "F", phone: "+27713001008", idPrefix: "931210345608", lang: "tn",  status: "council_verified",  capturedBy: footSoldierUserId },
  ];

  const [demoResident, thabo, nomsa, sipho, , bongani, lindiwe, , precious] = residents;

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

  // Near Hammanskraal / Temba, North West — lat ≈ -25.37, lon ≈ 28.28
  const stands = [
    { id: randomUUID(), ref: "A-001", lat: "-25.3701", lon: "28.2801", area: "450",  addr: "Stand A-001, Boomplaats Section, Hammanskraal", village: "Boomplaats" },
    { id: randomUUID(), ref: "A-002", lat: "-25.3712", lon: "28.2815", area: "380",  addr: "Stand A-002, Boomplaats Section, Hammanskraal", village: "Boomplaats" },
    { id: randomUUID(), ref: "A-003", lat: "-25.3683", lon: "28.2754", area: "520",  addr: "Stand A-003, Extension 6, Temba",               village: "Extension 6" },
    { id: randomUUID(), ref: "B-001", lat: "-25.3748", lon: "28.2850", area: "410",  addr: "Stand B-001, Ikageng Section, Hammanskraal",    village: "Ikageng" },
    { id: randomUUID(), ref: "B-002", lat: "-25.3741", lon: "28.2842", area: "290",  addr: "Stand B-002, Ikageng Section, Hammanskraal",    village: "Ikageng" },
    { id: randomUUID(), ref: "C-001", lat: "-25.3802", lon: "28.2901", area: "600",  addr: "Stand C-001, New Extension, Temba",             village: "New Extension" },
  ];

  const [standA001, standA002, standA003, standB001, standB002] = stands;

  for (const s of stands) {
    await client.query(
      `INSERT INTO "${SCHEMA}".stands
         (id, local_reference, gps_latitude, gps_longitude, area_square_metres,
          address_description, village_or_section, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.ref, s.lat, s.lon, s.area, s.addr, s.village],
    );
  }
  console.log(`  ✓ ${stands.length} stands`);

  // ── 8. Land Applications ──────────────────────────────────────────────────

  console.log("→ Seeding land applications…");

  const today = new Date().toISOString().slice(0, 10);
  const appIds = {
    demo:    randomUUID(),
    nomsa:   randomUUID(),
    thabo:   randomUUID(),
    sipho:   randomUUID(),
    zanele:  randomUUID(),
    bongani: randomUUID(),
    precious: randomUUID(),
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

  console.log(`  ✓ 6 applications (1 submitted, 4 approved, 1 rejected)`);

  // ── 9. PTOs ───────────────────────────────────────────────────────────────

  console.log("→ Seeding PTOs…");

  const ptoIds = {
    thabo:   randomUUID(),
    sipho:   randomUUID(),
    bongani: randomUUID(),
    precious: randomUUID(),
  };

  type PtoSeed = { id: string; appId: string; residentId: string; standId: string; residentName: string; standAddr: string; standRef: string; allocDate: string };

  const ptoSeeds: PtoSeed[] = [
    { id: ptoIds.thabo!,    appId: appIds.thabo!,    residentId: thabo!.id,    standId: standA001!.id, residentName: "Thabo Mahlangu",    standAddr: standA001!.addr, standRef: standA001!.ref, allocDate: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.sipho!,    appId: appIds.sipho!,    residentId: sipho!.id,    standId: standA003!.id, residentName: "Sipho Nkosi",       standAddr: standA003!.addr, standRef: standA003!.ref, allocDate: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.bongani!,  appId: appIds.bongani!,  residentId: bongani!.id,  standId: standB002!.id, residentName: "Bongani Ndlovu",    standAddr: standB002!.addr, standRef: standB002!.ref, allocDate: new Date(Date.now() - 55 * 86400000).toISOString().slice(0, 10) },
    { id: ptoIds.precious!, appId: appIds.precious!, residentId: precious!.id, standId: standB001!.id, residentName: "Precious Molefe",   standAddr: standB001!.addr, standRef: standB001!.ref, allocDate: new Date(Date.now() - 25 * 86400000).toISOString().slice(0, 10) },
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
  console.log(`  ✓ 4 PTOs issued`);

  // ── 10. Stand Occupancies ─────────────────────────────────────────────────

  console.log("→ Seeding stand occupancies…");

  const occupancies = [
    { residentId: thabo!.id,    standId: standA001!.id, ptoId: ptoIds.thabo!    },
    { residentId: sipho!.id,    standId: standA003!.id, ptoId: ptoIds.sipho!    },
    { residentId: bongani!.id,  standId: standB002!.id, ptoId: ptoIds.bongani!  },
    { residentId: precious!.id, standId: standB001!.id, ptoId: ptoIds.precious! },
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
  console.log(`  ✓ 4 stand occupancies`);

  // ── 11. Resale Listings ───────────────────────────────────────────────────

  console.log("→ Seeding resale listings…");

  const listingIds = { bongani: randomUUID(), precious: randomUUID() };

  // Bongani — live listing for built property
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

  // Precious — draft listing for vacant stand
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

  // Resale offer from Lindiwe on Bongani's listing
  await client.query(
    `INSERT INTO "${SCHEMA}".resale_offers (id, listing_id, buyer_resident_id, offer_amount_zar, status)
     SELECT gen_random_uuid(), $1, $2, 175000, 'submitted'
     WHERE NOT EXISTS (
       SELECT 1 FROM "${SCHEMA}".resale_offers WHERE listing_id = $1 AND buyer_resident_id = $2
     )`,
    [listingIds.bongani, lindiwe!.id],
  );

  console.log(`  ✓ 2 resale listings, 1 offer`);

  // ── 12. Service Providers (public schema) ─────────────────────────────────

  console.log("→ Seeding service providers…");

  const providers = [
    {
      id: randomUUID(), businessName: "Ndebele Build & Repair",
      categories: ["building", "bricklaying", "fencing"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Ndebele Build & Repair CC", bankName: "FNB", accountNumber: "62123456789", branchCode: "250655" },
    },
    {
      id: randomUUID(), businessName: "Mabena Plumbing Services",
      categories: ["plumbing"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "T Mabena", bankName: "Standard Bank", accountNumber: "051234567", branchCode: "051001" },
    },
    {
      id: randomUUID(), businessName: "Royal Greens Landscaping",
      categories: ["gardening", "cleaning"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: null,
    },
    {
      id: randomUUID(), businessName: "Sithole Electrical Contractors",
      categories: ["electrical"],
      coverage: [TENANT_SLUG], status: "documents_submitted",
      bank: null,
    },
    {
      id: randomUUID(), businessName: "Clean Horizons Co-op",
      categories: ["cleaning", "security"],
      coverage: [TENANT_SLUG], status: "verified",
      bank: { accountHolder: "Clean Horizons Co-op", bankName: "Capitec", accountNumber: "1234512345", branchCode: "470010" },
    },
  ];

  for (const p of providers) {
    const bankEnc = p.bank ? JSON.stringify(encryptBankDetails(p.bank)) : null;
    await client.query(
      `INSERT INTO service_providers
         (id, business_name, primary_contact_user_id, categories, geographic_coverage,
          verification_status, bank_details_encrypted, created_by_user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.businessName, founderUserId, p.categories, p.coverage, p.status, bankEnc, founderUserId],
    );
  }
  console.log(`  ✓ ${providers.length} service providers`);

  // Grab IDs for bookings
  const [provNdebele, provMabena, provRoyalGreens] = providers;

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

  Seeded data
  ──────────────────────────────────────────────────────────
  Residents:         8  (Thabo, Nomsa, Sipho, Zanele, Bongani, Lindiwe, Johannes, Precious)
  Stands:            6  (A-001 to C-001, Hammanskraal / Temba area)
  Applications:      6  (1 submitted, 4 approved, 1 rejected)
  PTOs:              4  (Thabo, Sipho, Bongani, Precious)
  Stand occupancies: 4
  Resale listings:   2  (1 live, 1 draft) + 1 offer
  Service providers: 5  (building, plumbing, gardening, electrical, cleaning)
  Suppliers:         3  (MassBuild, Builders Express, Agri-Build)
  Service bookings:  3  (completed, quoted, quote_requested)

  Tenant slug: ${TENANT_SLUG}
`);
} finally {
  await client.end();
}
