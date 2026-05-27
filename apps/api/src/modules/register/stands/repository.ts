import type { Stand, StandOccupancy, Resident, Prisma } from "../../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../../shared/database/index.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";
import type { UpdateStandRequest } from "./schemas.js";

export type { Stand, StandOccupancy, Resident };

function db(ctx: TenantContext) {
  return getPrismaClient(ctx);
}

export interface CreateStandData {
  localReference?: string;
  gpsLatitude: number;
  gpsLongitude: number;
  boundaryGeojson?: Record<string, unknown>;
  areaSquareMetres?: number;
  addressDescription: string;
  villageOrSection: string;
  standType?: string;
  photoS3Keys?: string[];
  priceZar?: number;
  notes?: string;
}

export async function createStand(ctx: TenantContext, data: CreateStandData): Promise<Stand> {
  return db(ctx).stand.create({
    data: {
      ...(data.localReference !== undefined && { localReference: data.localReference }),
      gpsLatitude: data.gpsLatitude,
      gpsLongitude: data.gpsLongitude,
      ...(data.boundaryGeojson !== undefined && { boundaryGeojson: data.boundaryGeojson as Prisma.InputJsonValue }),
      ...(data.areaSquareMetres !== undefined && { areaSquareMetres: data.areaSquareMetres }),
      addressDescription: data.addressDescription,
      villageOrSection: data.villageOrSection,
      ...(data.standType !== undefined && { standType: data.standType }),
      ...(data.photoS3Keys !== undefined && { photoS3Keys: data.photoS3Keys as Prisma.InputJsonValue }),
      ...(data.priceZar    !== undefined && { priceZar:    data.priceZar }),
      ...(data.notes       !== undefined && { notes:       data.notes }),
    },
  });
}

export async function findStandById(ctx: TenantContext, id: string): Promise<Stand | null> {
  return db(ctx).stand.findFirst({ where: { id, deletedAt: null } });
}

export interface StandWithOccupants extends Stand {
  occupancies: (StandOccupancy & { resident: Resident })[];
}

export async function findStandWithOccupants(
  ctx: TenantContext,
  id: string,
): Promise<StandWithOccupants | null> {
  return db(ctx).stand.findFirst({
    where: { id, deletedAt: null },
    include: {
      occupancies: {
        include: { resident: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export interface ListStandsFilter {
  page: number;
  pageSize: number;
  villageOrSection?: string;
  search?: string;
  bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

export async function listStands(
  ctx: TenantContext,
  filters: ListStandsFilter,
): Promise<{ stands: Stand[]; total: number }> {
  const where: Prisma.StandWhereInput = { deletedAt: null };

  if (filters.villageOrSection) {
    where.villageOrSection = { equals: filters.villageOrSection, mode: "insensitive" };
  }

  if (filters.search) {
    where.OR = [
      { addressDescription: { contains: filters.search, mode: "insensitive" } },
      { villageOrSection: { contains: filters.search, mode: "insensitive" } },
      { localReference: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.bbox) {
    const { minLat, minLng, maxLat, maxLng } = filters.bbox;
    where.gpsLatitude = { gte: minLat, lte: maxLat };
    where.gpsLongitude = { gte: minLng, lte: maxLng };
  }

  const skip = (filters.page - 1) * filters.pageSize;
  const [stands, total] = await Promise.all([
    db(ctx).stand.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    db(ctx).stand.count({ where }),
  ]);

  return { stands, total };
}

export async function updateStand(
  ctx: TenantContext,
  id: string,
  data: UpdateStandRequest,
): Promise<Stand | null> {
  const existing = await findStandById(ctx, id);
  if (!existing) return null;

  const updateData: Prisma.StandUpdateInput = {};
  if (data.localReference !== undefined) updateData.localReference = data.localReference;
  if (data.gpsLatitude !== undefined) updateData.gpsLatitude = data.gpsLatitude;
  if (data.gpsLongitude !== undefined) updateData.gpsLongitude = data.gpsLongitude;
  if (data.boundaryGeojson !== undefined) updateData.boundaryGeojson = data.boundaryGeojson as Prisma.InputJsonValue;
  if (data.areaSquareMetres !== undefined) updateData.areaSquareMetres = data.areaSquareMetres;
  if (data.addressDescription !== undefined) updateData.addressDescription = data.addressDescription;
  if (data.villageOrSection !== undefined) updateData.villageOrSection = data.villageOrSection;
  if (data.standType !== undefined) updateData.standType = data.standType;
  if (data.photoS3Keys !== undefined) updateData.photoS3Keys = data.photoS3Keys as Prisma.InputJsonValue;
  if (data.priceZar    !== undefined) updateData.priceZar    = data.priceZar;
  if (data.notes       !== undefined) updateData.notes       = data.notes;

  return db(ctx).stand.update({ where: { id }, data: updateData });
}

export async function listDistinctVillages(ctx: TenantContext): Promise<string[]> {
  const rows = await db(ctx).stand.findMany({
    distinct: ["villageOrSection"],
    where:    { deletedAt: null },
    select:   { villageOrSection: true },
    orderBy:  { villageOrSection: "asc" },
  });
  return rows.map(r => r.villageOrSection);
}

export async function softDeleteStand(ctx: TenantContext, id: string): Promise<boolean> {
  const existing = await findStandById(ctx, id);
  if (!existing) return false;
  await db(ctx).stand.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}
