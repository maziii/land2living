/**
 * Creates a new tenant schema in PostgreSQL and applies all Prisma migrations.
 * Usage: npx tsx scripts/seed-tenant.ts --slug <council-slug>
 *
 * Requires DATABASE_URL to be set (copy .env.example → .env and run `npm run dev:up` first).
 * Slug must match [a-z][a-z0-9_]* (e.g. "ndebele", "royal_council").
 */
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, "..", "apps", "api");

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const slugIdx = args.indexOf("--slug");

if (slugIdx === -1 || args[slugIdx + 1] === undefined) {
  console.error("Usage: npx tsx scripts/seed-tenant.ts --slug <council-slug>");
  process.exit(1);
}

const slug = args[slugIdx + 1] as string;

if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
  console.error(
    `Invalid slug "${slug}". Must match [a-z][a-z0-9_]* (e.g. "ndebele").`,
  );
  process.exit(1);
}

const schemaName = `tenant_${slug}`;

// ── Database URL ──────────────────────────────────────────────────────────────

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example → .env and start services.");
  process.exit(1);
}

// ── Create schema ─────────────────────────────────────────────────────────────

console.log(`[seed-tenant] Creating schema "${schemaName}"...`);

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  console.log(`[seed-tenant] Schema "${schemaName}" ready.`);
} finally {
  await client.end();
}

// ── Run migrations ────────────────────────────────────────────────────────────

const tenantUrl = buildTenantUrl(databaseUrl, schemaName);
console.log(`[seed-tenant] Running migrations for "${schemaName}"...`);

execSync("npx prisma migrate deploy", {
  cwd: apiDir,
  env: { ...process.env, DATABASE_URL: tenantUrl },
  stdio: "inherit",
});

console.log(`[seed-tenant] Done. Tenant "${slug}" is ready.`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTenantUrl(base: string, schemaName: string): string {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schemaName},public`);
  return url.toString();
}
