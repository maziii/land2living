import { PrismaClient as PublicPrismaClient } from "@prisma/client";
import { PrismaClient as TenantPrismaClient } from "../../generated/tenant-client/index.js";
import type { TenantContext } from "./tenant-context.js";

// ── Tenant client cache ───────────────────────────────────────────────────────

// One TenantPrismaClient per slug — safe at pilot scale (handful of tenants).
const tenantClientCache = new Map<string, TenantPrismaClient>();

/**
 * Returns a Prisma client scoped to the tenant's schema.
 * Uses ?schema=tenant_<slug> which Prisma resolves to SET search_path.
 * Use this for all tenant-scoped data access (AuditEvent, Resident, Stand, …).
 */
export function getPrismaClient(ctx: TenantContext): TenantPrismaClient {
  const cached = tenantClientCache.get(ctx.slug);
  if (cached !== undefined) return cached;

  const client = new TenantPrismaClient({
    datasourceUrl: buildSearchPathUrl(ctx.schemaName),
  });

  tenantClientCache.set(ctx.slug, client);
  return client;
}

// ── Public client singleton ───────────────────────────────────────────────────

let _publicClient: PublicPrismaClient | undefined;

/**
 * Returns a Prisma client scoped to the `public` schema.
 * search_path = public
 * Use this for platform-level data: User, TenantMembership, RefreshToken.
 */
export function getPublicPrismaClient(): PublicPrismaClient {
  if (_publicClient !== undefined) return _publicClient;

  _publicClient = new PublicPrismaClient({
    datasourceUrl: buildSearchPathUrl("public"),
  });

  return _publicClient;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Disconnects all cached clients and clears the caches.
 * Call this in test teardown and on graceful shutdown.
 */
export async function disconnectAllClients(): Promise<void> {
  await Promise.all([...tenantClientCache.values()].map((c) => c.$disconnect()));
  tenantClientCache.clear();

  if (_publicClient !== undefined) {
    await _publicClient.$disconnect();
    _publicClient = undefined;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSearchPathUrl(searchPath: string): string {
  const base = process.env["DATABASE_URL"];
  if (!base) throw new Error("DATABASE_URL environment variable is not set");

  const url = new URL(base);
  url.searchParams.set("schema", searchPath);
  return url.toString();
}
