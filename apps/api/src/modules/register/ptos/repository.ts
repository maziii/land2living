import type { PTO, Prisma } from "../../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../../shared/database/index.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";

export type { PTO };

export interface CreatePTOData {
  applicationId: string;
  residentId: string;
  standId: string;
  issuedByUserId: string;
  signedPayloadJson: Record<string, unknown>;
  signatureBase64: string;
  pdfDocumentId?: string;
}

export async function createPTO(ctx: TenantContext, data: CreatePTOData): Promise<PTO> {
  return getPrismaClient(ctx).pTO.create({
    data: {
      applicationId: data.applicationId,
      residentId: data.residentId,
      standId: data.standId,
      issuedByUserId: data.issuedByUserId,
      signedPayloadJson: data.signedPayloadJson as Prisma.InputJsonValue,
      signatureBase64: data.signatureBase64,
      ...(data.pdfDocumentId !== undefined && { pdfDocumentId: data.pdfDocumentId }),
    },
  });
}

export async function findPTO(ctx: TenantContext, id: string): Promise<PTO | null> {
  return getPrismaClient(ctx).pTO.findUnique({ where: { id } });
}
