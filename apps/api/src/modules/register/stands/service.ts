import { recordAuditEvent } from "../../../shared/audit/service.js";
import { AuditEventType } from "../../../shared/audit/types.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";

export async function listVillages(ctx: TenantContext): Promise<string[]> {
  return repo.listDistinctVillages(ctx);
}
import { getPresignedUrl } from "../../../shared/documents/s3.js";
import * as repo from "./repository.js";
import type { Stand, StandWithOccupants } from "./repository.js";
import type { CreateStandRequest, UpdateStandRequest, ListStandQuery } from "./schemas.js";
import type {
  StandResponse,
  StandDetailResponse,
  StandListResponse,
  OccupantSummary,
} from "./types.js";

const ENTITY_TYPE = "stand";

function parsePhotoKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((k): k is string => typeof k === "string");
  return [];
}

async function buildPhotoUrls(keys: string[]): Promise<string[]> {
  if (!keys.length || !process.env["S3_BUCKET"]) return [];
  return Promise.all(keys.map(k => getPresignedUrl(k, 3600))).catch(() => []);
}

async function toResponse(stand: Stand): Promise<StandResponse> {
  const photoS3Keys = parsePhotoKeys(stand.photoS3Keys);
  const photoUrls   = await buildPhotoUrls(photoS3Keys);
  return {
    id: stand.id,
    createdAt: stand.createdAt.toISOString(),
    updatedAt: stand.updatedAt.toISOString(),
    localReference: stand.localReference,
    gpsLatitude: Number(stand.gpsLatitude),
    gpsLongitude: Number(stand.gpsLongitude),
    boundaryGeojson: stand.boundaryGeojson,
    areaSquareMetres: stand.areaSquareMetres !== null ? Number(stand.areaSquareMetres) : null,
    addressDescription: stand.addressDescription,
    villageOrSection: stand.villageOrSection,
    standType:  stand.standType ?? null,
    photoS3Keys,
    photoUrls,
    priceZar: stand.priceZar !== null ? Number(stand.priceZar) : null,
    notes: stand.notes,
  };
}

async function toDetailResponse(stand: StandWithOccupants): Promise<StandDetailResponse> {
  const occupants: OccupantSummary[] = stand.occupancies.map((occ) => ({
    occupancyId: occ.id,
    residentId: occ.residentId,
    firstName: occ.resident.firstName,
    lastName: occ.resident.lastName,
    relationship: occ.relationship,
    startedAt: occ.createdAt.toISOString(),
    endedAt: occ.endedAt ? occ.endedAt.toISOString() : null,
    ptoId: occ.ptoId,
  }));

  return { ...(await toResponse(stand)), occupants };
}

export async function createStand(
  ctx: TenantContext,
  data: CreateStandRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<StandResponse> {
  const stand = await repo.createStand(ctx, {
    ...(data.localReference  !== undefined && { localReference:   data.localReference }),
    gpsLatitude:  data.gpsLatitude,
    gpsLongitude: data.gpsLongitude,
    ...(data.boundaryGeojson   !== undefined && { boundaryGeojson:   data.boundaryGeojson }),
    ...(data.areaSquareMetres  !== undefined && { areaSquareMetres:  data.areaSquareMetres }),
    addressDescription: data.addressDescription,
    villageOrSection:   data.villageOrSection,
    ...(data.standType   !== undefined && { standType:   data.standType }),
    ...(data.photoS3Keys !== undefined && { photoS3Keys: data.photoS3Keys }),
    ...(data.priceZar    !== undefined && { priceZar:    data.priceZar }),
    ...(data.notes       !== undefined && { notes:       data.notes }),
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   AuditEventType.RECORD_CREATED,
    entityType:  ENTITY_TYPE,
    entityId:    stand.id,
    ...(actor.ip        !== undefined && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent:  actor.userAgent }),
  });

  return await toResponse(stand);
}

export async function listStands(
  ctx: TenantContext,
  query: ListStandQuery,
  _actor: { userId: string; role: string },
): Promise<StandListResponse> {
  let bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined;
  if (query.bbox) {
    const [minLat, minLng, maxLat, maxLng] = query.bbox.split(",").map(Number) as [number, number, number, number];
    bbox = { minLat, minLng, maxLat, maxLng };
  }

  const { stands, total } = await repo.listStands(ctx, {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.villageOrSection !== undefined && { villageOrSection: query.villageOrSection }),
    ...(query.search !== undefined && { search: query.search }),
    ...(bbox !== undefined && { bbox }),
    ...(query.availableOnly   && { availableOnly: true }),
  });

  return {
    stands: await Promise.all(stands.map(toResponse)),
    total,
    page:     query.page,
    pageSize: query.pageSize,
  };
}

export async function getStand(
  ctx: TenantContext,
  id: string,
): Promise<StandDetailResponse | null> {
  const stand = await repo.findStandWithOccupants(ctx, id);
  if (!stand) return null;
  return toDetailResponse(stand);
}

export async function updateStand(
  ctx: TenantContext,
  id: string,
  data: UpdateStandRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<StandResponse | null> {
  const updated = await repo.updateStand(ctx, id, data);
  if (!updated) return null;

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.RECORD_UPDATED,
    entityType: ENTITY_TYPE,
    entityId: id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return await toResponse(updated);
}

export async function deleteStand(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<boolean> {
  const deleted = await repo.softDeleteStand(ctx, id);
  if (!deleted) return false;

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.RECORD_SOFT_DELETED,
    entityType: ENTITY_TYPE,
    entityId: id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return true;
}

