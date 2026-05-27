/**
 * Applies pending Prisma migrations to every existing tenant schema.
 * Usage: npx tsx scripts/migrate-tenants.ts
 *
 * Uses prisma/schema.tenant.prisma (added in T-02.01 when the first tenant
 * entities are defined). Safe to run before that file exists — exits cleanly.
 *
 * Public schema migrations (users, memberships, etc.) are managed separately:
 *   npm run db:migrate:public   (runs from apps/api/)
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, "..", "apps", "api");
const tenantSchemaFile = join(apiDir, "prisma", "schema.tenant.prisma");

// ── Guard: tenant schema file must exist ──────────────────────────────────────

if (!existsSync(tenantSchemaFile)) {
  console.log(
    "[migrate-tenants] prisma/schema.tenant.prisma not found — no tenant migrations to apply.",
  );
  console.log("[migrate-tenants] This file will be created in T-02.01 (WP-02).");
  process.exit(0);
}

// ── Database URL ──────────────────────────────────────────────────────────────

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example → .env and start services.");
  process.exit(1);
}

// ── Discover tenant schemas ───────────────────────────────────────────────────

const client = new Client({ connectionString: databaseUrl });
await client.connect();

let tenantSchemas: string[];
try {
  const result = await client.query<{ schema_name: string }>(
    `SELECT schema_name
     FROM information_schema.schemata
     WHERE schema_name LIKE 'tenant_%'
     ORDER BY schema_name`,
  );
  tenantSchemas = result.rows.map((r) => r.schema_name);
} finally {
  await client.end();
}

if (tenantSchemas.length === 0) {
  console.log("[migrate-tenants] No tenant schemas found. Nothing to migrate.");
  process.exit(0);
}

console.log(
  `[migrate-tenants] Found ${tenantSchemas.length} tenant schema(s): ${tenantSchemas.join(", ")}`,
);

// ── Migrate each tenant ───────────────────────────────────────────────────────

let failed = 0;

for (const schemaName of tenantSchemas) {
  console.log(`[migrate-tenants] Migrating "${schemaName}"...`);
  const tenantUrl = buildTenantUrl(databaseUrl, schemaName);

  try {
    execSync(`npx prisma migrate deploy --schema prisma/schema.tenant.prisma`, {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: tenantUrl },
      stdio: "inherit",
    });
    console.log(`[migrate-tenants] "${schemaName}" ✓`);
  } catch {
    console.error(`[migrate-tenants] "${schemaName}" FAILED`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`[migrate-tenants] ${failed} schema(s) failed. Check output above.`);
  process.exit(1);
}

console.log("[migrate-tenants] All schemas migrated successfully.");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTenantUrl(base: string, schemaName: string): string {
  const url = new URL(base);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}
