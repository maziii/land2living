import type { PTO, Prisma } from "../../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../../shared/database/index.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";

export type { PTO };

export interface PTOWithDetails extends PTO {
  resident: { id: string; firstName: string; lastName: string };
  stand: { id: string; addressDescription: string; localReference: string | null; villageOrSection: string };
}

export interface CreatePTOData {
  applicationId: string;
  residentId: string;
  standId: string;
  issuedByUserId: string;
  signedPayloadJson: Record<string, unknown>;
  signatureBase64: string;
  pdfDocumentId?: string;
}

export interface ListPTOsOptions {
  page: number;
  pageSize: number;
  search?: string | undefined;
  status?: "active" | "superseded" | "all" | undefined;
  residentId?: string | undefined;
  standId?: string | undefined;
  village?: string | undefined;
}

const DETAILS_INCLUDE = {
  resident: { select: { id: true, firstName: true, lastName: true } },
  stand:    { select: { id: true, addressDescription: true, localReference: true, villageOrSection: true } },
} as const;

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

export async function findPTOWithDetails(ctx: TenantContext, id: string): Promise<PTOWithDetails | null> {
  return getPrismaClient(ctx).pTO.findUnique({
    where: { id },
    include: DETAILS_INCLUDE,
  }) as Promise<PTOWithDetails | null>;
}

export async function findPTOChain(ctx: TenantContext, id: string): Promise<PTOWithDetails[]> {
  const prisma = getPrismaClient(ctx);
  const results: PTOWithDetails[] = [];
  let currentId: string | null = id;

  while (currentId) {
    const pto = await prisma.pTO.findUnique({
      where: { id: currentId },
      include: DETAILS_INCLUDE,
    }) as PTOWithDetails | null;
    if (!pto) break;
    results.push(pto);
    currentId = pto.supersededByPtoId;
  }
  return results;
}

export async function listPTOs(
  ctx: TenantContext,
  opts: ListPTOsOptions,
): Promise<{ ptos: PTOWithDetails[]; total: number }> {
  const prisma = getPrismaClient(ctx);

  const where: Prisma.PTOWhereInput = {};

  if (opts.status === "active")     where.supersededAt = null;
  if (opts.status === "superseded") where.supersededAt = { not: null };
  if (opts.residentId)              where.residentId = opts.residentId;
  if (opts.standId)                 where.standId = opts.standId;

  if (opts.village) {
    where.stand = { villageOrSection: { contains: opts.village, mode: "insensitive" } };
  }

  if (opts.search) {
    const term = opts.search;
    where.OR = [
      { id: { contains: term, mode: "insensitive" } },
      { resident: { firstName: { contains: term, mode: "insensitive" } } },
      { resident: { lastName:  { contains: term, mode: "insensitive" } } },
      { stand: { localReference:     { contains: term, mode: "insensitive" } } },
      { stand: { addressDescription: { contains: term, mode: "insensitive" } } },
      { stand: { villageOrSection:   { contains: term, mode: "insensitive" } } },
    ];
  }

  const [ptos, total] = await prisma.$transaction([
    prisma.pTO.findMany({
      where,
      include: DETAILS_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.pTO.count({ where }),
  ]);

  return { ptos: ptos as PTOWithDetails[], total };
}

export async function updatePTO(
  ctx: TenantContext,
  id: string,
  data: Partial<{ supersededAt: Date; supersededByPtoId: string }>,
): Promise<PTO> {
  return getPrismaClient(ctx).pTO.update({ where: { id }, data });
}
