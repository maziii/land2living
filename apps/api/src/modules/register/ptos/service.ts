import type { Prisma } from "../../../generated/tenant-client/index.js";
import { recordAuditEvent } from "../../../shared/audit/service.js";
import { signDocument, verifySignature, getTenantPublicKey } from "../../../shared/documents/signing.js";
import { getPrismaClient } from "../../../shared/database/index.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";
import * as repo from "./repository.js";
import type { PTO } from "./repository.js";
import { generatePTOPDF } from "./pdf.js";
import type { PTOResponse, PTOVerifyResult } from "./types.js";

const PTO_VERIFY_BASE = process.env["PUBLIC_BASE_URL"] ?? "https://l2l.app";

export class PTOError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "PTOError";
  }
}

function toResponse(pto: PTO): PTOResponse {
  return {
    id: pto.id,
    createdAt: pto.createdAt.toISOString(),
    supersededAt: pto.supersededAt ? pto.supersededAt.toISOString() : null,
    supersededByPtoId: pto.supersededByPtoId,
    applicationId: pto.applicationId,
    residentId: pto.residentId,
    standId: pto.standId,
    issuedByUserId: pto.issuedByUserId,
    signedPayloadJson: pto.signedPayloadJson as Record<string, unknown>,
    signatureBase64: pto.signatureBase64,
    pdfDocumentId: pto.pdfDocumentId,
    verificationUrl: `${PTO_VERIFY_BASE}/verify/${pto.id}`,
  };
}

export async function issuePTO(
  ctx: TenantContext,
  applicationId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<PTOResponse> {
  const prisma = getPrismaClient(ctx);

  const application = await prisma.landApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new PTOError("Application not found", 404);
  if (application.status !== "approved") {
    throw new PTOError(`Application must be in 'approved' status to issue a PTO (current: ${application.status})`, 409);
  }
  if (!application.allocatedStandId) {
    throw new PTOError("Application does not have an allocated stand", 400);
  }
  if (application.ptoId) {
    throw new PTOError("A PTO has already been issued for this application", 409);
  }

  const resident = await prisma.resident.findUnique({
    where: { id: application.applicantResidentId },
    select: { id: true, firstName: true, lastName: true, idNumber: true },
  });
  if (!resident) throw new PTOError("Applicant resident not found", 404);

  const stand = await prisma.stand.findUnique({
    where: { id: application.allocatedStandId },
    select: { id: true, addressDescription: true, localReference: true },
  });
  if (!stand) throw new PTOError("Allocated stand not found", 404);

  const allocationDate = new Date().toISOString().slice(0, 10);
  const payload: Record<string, unknown> = {
    ptoVersion: "1",
    tenantSlug: ctx.slug,
    applicationId,
    residentId: resident.id,
    residentName: `${resident.firstName} ${resident.lastName}`,
    standId: stand.id,
    standAddress: stand.addressDescription,
    ...(stand.localReference !== null && { standLocalRef: stand.localReference }),
    allocationDate,
    issuedByUserId: actor.userId,
  };

  const signature = signDocument(ctx.slug, payload);

  const pto = await prisma.$transaction(async (tx) => {
    const newPTO = await tx.pTO.create({
      data: {
        applicationId,
        residentId: resident.id,
        standId: application.allocatedStandId as string,
        issuedByUserId: actor.userId,
        signedPayloadJson: payload as Prisma.InputJsonValue,
        signatureBase64: signature,
      },
    });

    // Update application with pto_id
    await tx.landApplication.update({
      where: { id: applicationId },
      data: { ptoId: newPTO.id },
    });

    // Update the active stand occupancy with pto_id
    const activeOccupancy = await tx.standOccupancy.findFirst({
      where: {
        standId: application.allocatedStandId as string,
        residentId: application.applicantResidentId,
        endedAt: null,
      },
    });
    if (activeOccupancy) {
      await tx.standOccupancy.update({
        where: { id: activeOccupancy.id },
        data: { ptoId: newPTO.id },
      });
    }

    return newPTO;
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "pto.issued",
    entityType: "pto",
    entityId: pto.id,
    payloadJson: { applicationId, residentId: resident.id, standId: stand.id },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(pto);
}

export async function getPTO(ctx: TenantContext, id: string): Promise<PTOResponse | null> {
  const pto = await repo.findPTO(ctx, id);
  if (!pto) return null;
  return toResponse(pto);
}

export function verifyPTO(
  ctx: TenantContext,
  signedPayloadJson: Record<string, unknown>,
  signatureBase64: string,
): PTOVerifyResult {
  try {
    const valid = verifySignature(ctx.slug, signedPayloadJson, signatureBase64);
    if (!valid) return { valid: false, reason: "Signature verification failed" };

    const ptoId = signedPayloadJson["applicationId"];
    const residentId = signedPayloadJson["residentId"];
    const standId = signedPayloadJson["standId"];
    const issuedAt = signedPayloadJson["allocationDate"];
    return {
      valid: true,
      ...(typeof ptoId === "string" && { ptoId }),
      ...(typeof residentId === "string" && { residentId }),
      ...(typeof standId === "string" && { standId }),
      ...(typeof issuedAt === "string" && { issuedAt }),
    };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "Verification error" };
  }
}

export function getTenantPublicKeyForTenant(tenantSlug: string): string {
  return getTenantPublicKey(tenantSlug);
}

export async function getPTOPDF(ctx: TenantContext, id: string): Promise<Buffer | null> {
  const pto = await repo.findPTO(ctx, id);
  if (!pto) return null;

  const payload = pto.signedPayloadJson as Record<string, unknown>;
  return generatePTOPDF({
    ptoId: pto.id,
    councilName: ctx.slug,
    residentName: String(payload["residentName"] ?? ""),
    residentId: pto.residentId,
    standAddress: String(payload["standAddress"] ?? ""),
    standRef: String(payload["standLocalRef"] ?? pto.standId),
    allocationDate: String(payload["allocationDate"] ?? pto.createdAt.toISOString().slice(0, 10)),
    verificationUrl: `${PTO_VERIFY_BASE}/verify/${pto.id}`,
  });
}

export async function transferPTO(
  ctx: TenantContext,
  listingId: string,
  offer: { buyerResidentId: string; offerAmountZar: number },
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<void> {
  const prisma = getPrismaClient(ctx);

  // Find the listing to get the current stand + PTO
  const listing = await prisma.resaleListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new PTOError("Resale listing not found", 404);

  const oldPto = await prisma.pTO.findUnique({ where: { id: listing.ptoId } });
  if (!oldPto) throw new PTOError("Existing PTO not found", 404);

  const buyer = await prisma.resident.findUnique({
    where: { id: offer.buyerResidentId },
    select: { id: true, firstName: true, lastName: true, idNumber: true },
  });
  if (!buyer) throw new PTOError("Buyer resident not found", 404);

  const stand = await prisma.stand.findUnique({
    where: { id: listing.standId },
    select: { id: true, addressDescription: true, localReference: true },
  });
  if (!stand) throw new PTOError("Stand not found", 404);

  const transferDate = new Date().toISOString().slice(0, 10);
  const payload: Record<string, unknown> = {
    ptoVersion: "1",
    tenantSlug: ctx.slug,
    residentId: buyer.id,
    residentName: `${buyer.firstName} ${buyer.lastName}`,
    standId: stand.id,
    standAddress: stand.addressDescription,
    ...(stand.localReference !== null && { standLocalRef: stand.localReference }),
    allocationDate: transferDate,
    issuedByUserId: actor.userId,
    supersededPtoId: oldPto.id,
    resaleListingId: listingId,
    applicationId: oldPto.applicationId,
  };

  const signature = signDocument(ctx.slug, payload);

  await prisma.$transaction(async (tx) => {
    // Issue new PTO to buyer
    const newPto = await tx.pTO.create({
      data: {
        applicationId: oldPto.applicationId,
        residentId: buyer.id,
        standId: stand.id,
        issuedByUserId: actor.userId,
        signedPayloadJson: payload as Prisma.InputJsonValue,
        signatureBase64: signature,
        supersededByPtoId: oldPto.id,
      },
    });

    // Supersede old PTO (record the new PTO as its successor)
    await tx.pTO.update({
      where: { id: oldPto.id },
      data: { supersededAt: new Date() },
    });

    // End old occupancy
    await tx.standOccupancy.updateMany({
      where: { standId: stand.id, residentId: oldPto.residentId, endedAt: null },
      data: { endedAt: new Date() },
    });

    // Start new occupancy for buyer (createdAt serves as start date)
    await tx.standOccupancy.create({
      data: {
        standId: stand.id,
        residentId: buyer.id,
        relationship: "primary_occupant",
        ptoId: newPto.id,
      },
    });

    await recordAuditEvent(ctx, {
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventType: "pto.transferred",
      entityType: "pto",
      entityId: newPto.id,
      payloadJson: {
        oldPtoId: oldPto.id,
        newPtoId: newPto.id,
        resaleListingId: listingId,
        sellerResidentId: oldPto.residentId,
        buyerResidentId: buyer.id,
        standId: stand.id,
      },
      ...(actor.ip !== undefined && { ipAddress: actor.ip }),
      ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
    });
  });
}


