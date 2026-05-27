import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TenantContext } from "../tenant-context.js";
import {
  disconnectAllClients,
  getPrismaClient,
  getPublicPrismaClient,
} from "../prisma-client.js";

const hasDatabase = Boolean(process.env["DATABASE_URL"]);

// Unique suffix so parallel test runs don't collide.
const suffix = Date.now().toString();
const slugA = `test_a_${suffix}`;
const slugB = `test_b_${suffix}`;
const ctxA = new TenantContext(slugA);
const ctxB = new TenantContext(slugB);

describe.skipIf(!hasDatabase)("tenant schema isolation", () => {
  // Initialised in beforeAll; only accessed after that point.
  let admin!: PrismaClient;

  beforeAll(async () => {
    admin = getPublicPrismaClient();

    // Create two isolated tenant schemas with a simple probe table each.
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${ctxA.schemaName}"`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${ctxB.schemaName}"`);

    const clientA = getPrismaClient(ctxA);
    const clientB = getPrismaClient(ctxB);

    await clientA.$executeRawUnsafe(`CREATE TABLE probe (value text NOT NULL)`);
    await clientA.$executeRawUnsafe(`INSERT INTO probe VALUES ('alpha_data')`);

    await clientB.$executeRawUnsafe(`CREATE TABLE probe (value text NOT NULL)`);
    await clientB.$executeRawUnsafe(`INSERT INTO probe VALUES ('beta_data')`);
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${ctxA.schemaName}" CASCADE`);
    await admin.$executeRawUnsafe(`DROP SCHEMA "${ctxB.schemaName}" CASCADE`);
    await admin.$disconnect();
    await disconnectAllClients();
  });

  it("tenant A sees only its own data via unqualified table name", async () => {
    const rows = await getPrismaClient(ctxA).$queryRaw<
      Array<{ value: string }>
    >`SELECT value FROM probe`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("alpha_data");
  });

  it("tenant B sees only its own data via unqualified table name", async () => {
    const rows = await getPrismaClient(ctxB).$queryRaw<
      Array<{ value: string }>
    >`SELECT value FROM probe`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("beta_data");
  });

  it("tenant A search_path contains only A schema and public", async () => {
    const rows = await getPrismaClient(ctxA).$queryRaw<
      Array<{ search_path: string }>
    >`SHOW search_path`;

    const path = rows[0]?.search_path ?? "";
    expect(path).toContain(ctxA.schemaName);
    expect(path).not.toContain(ctxB.schemaName);
  });

  it("tenant B search_path contains only B schema and public", async () => {
    const rows = await getPrismaClient(ctxB).$queryRaw<
      Array<{ search_path: string }>
    >`SHOW search_path`;

    const path = rows[0]?.search_path ?? "";
    expect(path).toContain(ctxB.schemaName);
    expect(path).not.toContain(ctxA.schemaName);
  });
});

// Runs without a database — validates the TenantContext business rules.
describe("TenantContext slug validation", () => {
  it("accepts valid slugs", () => {
    expect(() => new TenantContext("ndebele")).not.toThrow();
    expect(() => new TenantContext("valid_slug")).not.toThrow();
    expect(() => new TenantContext("royal_council")).not.toThrow();
    expect(() => new TenantContext("a1b2c3")).not.toThrow();
  });

  it("rejects invalid slugs", () => {
    expect(() => new TenantContext("")).toThrow();
    expect(() => new TenantContext("HasCapitals")).toThrow();
    expect(() => new TenantContext("has-hyphens")).toThrow();
    expect(() => new TenantContext("1starts_with_digit")).toThrow();
    expect(() => new TenantContext("has spaces")).toThrow();
  });

  it("derives schema name correctly", () => {
    const ctx = new TenantContext("ndebele");
    expect(ctx.schemaName).toBe("tenant_ndebele");
  });
});
