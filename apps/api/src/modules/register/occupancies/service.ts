import { recordAuditEvent } from "../../../shared/audit/service.js";
import { AuditEventType } from "../../../shared/audit/types.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";
import * as repo from "./repository.js";
import type { StandOccupancy, StandOccupancyWithStand } from "./repository.js";
import * as standRepo from "../stands/repository.js";
import * as residentRepo from "../residents/repository.js";
import type { CreateOccupancyRequest, UpdateOccupancyRequest } from "./schemas.js";
import type { OccupancyResponse, OccupancyWithStandResponse } from "./types.js";

const ENTITY_TYPE = "stand_occupancy";

export class OccupancyError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "OccupancyError";
  }
}

function toResponse(occ: StandOccupancy): OccupancyResponse {
  return {
    id: occ.id,
    createdAt: occ.createdAt.toISOString(),
    endedAt: occ.endedAt ? occ.endedAt.toISOString() : null,
    standId: occ.standId,
    residentId: occ.residentId,
    relationship: occ.relationship,
    ptoId: occ.ptoId,
  };
}

function toResponseWithStand(occ: StandOccupancyWithStand): OccupancyWithStandResponse {
  return {
    ...toResponse(occ),
    stand: {
      id: occ.stand.id,
      addressDescription: occ.stand.addressDescription,
      villageOrSection: occ.stand.villageOrSection,
      localReference: occ.stand.localReference,
    },
  };
}

export async function addOccupant(
  ctx: TenantContext,
  standId: string,
  data: CreateOccupancyRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<OccupancyResponse> {
  const stand = await standRepo.findStandById(ctx, standId);
  if (!stand) throw new OccupancyError("Stand not found", 404);

  const resident = await residentRepo.findResidentById(ctx, data.residentId);
  if (!resident) throw new OccupancyError("Resident not found", 404);

  if (data.relationship === "primary_occupant") {
    const existing = await repo.countActivePrimaryOccupants(ctx, standId);
    if (existing > 0) {
      throw new OccupancyError(
        "Stand already has an active primary occupant. End the current occupancy first.",
        409,
      );
    }
  }

  const occupancy = await repo.createOccupancy(ctx, {
    standId,
    residentId: data.residentId,
    relationship: data.relationship,
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.RECORD_CREATED,
    entityType: ENTITY_TYPE,
    entityId: occupancy.id,
    payloadJson: { standId, residentId: data.residentId, relationship: data.relationship },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(occupancy);
}

export async function updateOccupancy(
  ctx: TenantContext,
  id: string,
  data: UpdateOccupancyRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<OccupancyResponse | null> {
  const updated = await repo.updateOccupancy(ctx, id, {
    ...(data.relationship !== undefined && { relationship: data.relationship }),
    ...(data.endedAt !== undefined && { endedAt: new Date(data.endedAt) }),
  });
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

  return toResponse(updated);
}

export async function listStandOccupants(
  ctx: TenantContext,
  standId: string,
): Promise<OccupancyResponse[]> {
  const stand = await standRepo.findStandById(ctx, standId);
  if (!stand) throw new OccupancyError("Stand not found", 404);

  const occupancies = await repo.listOccupanciesByStand(ctx, standId);
  return occupancies.map(toResponse);
}

export async function listResidentStands(
  ctx: TenantContext,
  residentId: string,
): Promise<OccupancyWithStandResponse[]> {
  const resident = await residentRepo.findResidentById(ctx, residentId);
  if (!resident) throw new OccupancyError("Resident not found", 404);

  const occupancies = await repo.listOccupanciesByResident(ctx, residentId);
  return occupancies.map(toResponseWithStand);
}
