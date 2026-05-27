import type { StandOccupancy, Stand, Prisma } from "../../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../../shared/database/index.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";

export type { StandOccupancy, Stand };

export interface StandOccupancyWithStand extends StandOccupancy {
  stand: Stand;
}

function db(ctx: TenantContext) {
  return getPrismaClient(ctx);
}

export async function findOccupancyById(
  ctx: TenantContext,
  id: string,
): Promise<StandOccupancy | null> {
  return db(ctx).standOccupancy.findUnique({ where: { id } });
}

export async function countActivePrimaryOccupants(
  ctx: TenantContext,
  standId: string,
): Promise<number> {
  return db(ctx).standOccupancy.count({
    where: { standId, relationship: "primary_occupant", endedAt: null },
  });
}

export async function createOccupancy(
  ctx: TenantContext,
  data: { standId: string; residentId: string; relationship: string },
): Promise<StandOccupancy> {
  return db(ctx).standOccupancy.create({ data });
}

export async function updateOccupancy(
  ctx: TenantContext,
  id: string,
  data: { relationship?: string; endedAt?: Date },
): Promise<StandOccupancy | null> {
  const existing = await findOccupancyById(ctx, id);
  if (!existing) return null;

  const updateData: Prisma.StandOccupancyUpdateInput = {};
  if (data.relationship !== undefined) updateData.relationship = data.relationship;
  if (data.endedAt !== undefined) updateData.endedAt = data.endedAt;

  return db(ctx).standOccupancy.update({ where: { id }, data: updateData });
}

export async function listOccupanciesByStand(
  ctx: TenantContext,
  standId: string,
): Promise<StandOccupancy[]> {
  return db(ctx).standOccupancy.findMany({
    where: { standId },
    orderBy: [{ endedAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function listOccupanciesByResident(
  ctx: TenantContext,
  residentId: string,
): Promise<StandOccupancyWithStand[]> {
  return db(ctx).standOccupancy.findMany({
    where: { residentId },
    include: { stand: true },
    orderBy: [{ endedAt: "asc" }, { createdAt: "desc" }],
  });
}
