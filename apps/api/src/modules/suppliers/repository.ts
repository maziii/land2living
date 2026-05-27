import { PrismaClient } from "@prisma/client";
import type { SupplierQuoteRequest, SupplierQuoteResponse, Supplier, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export type { SupplierQuoteRequest, SupplierQuoteResponse, Supplier };

export type QuoteRequestWithCount = SupplierQuoteRequest & { _count: { responses: number } };
export type QuoteResponseWithSupplier = SupplierQuoteResponse & { supplier: { businessName: string } };

export async function createQuoteRequest(data: {
  tenantSlug: string;
  requestedByUserId: string;
  basketJson: Prisma.InputJsonValue;
  supplierIds: string[];
  responseDeadlineDays: number;
}): Promise<SupplierQuoteRequest> {
  return prisma.supplierQuoteRequest.create({
    data: {
      tenantSlug: data.tenantSlug,
      requestedByUserId: data.requestedByUserId,
      basketJson: data.basketJson,
      dispatchedToSupplierIds: data.supplierIds,
      status: "pending",
      dispatchedSuppliers: { connect: data.supplierIds.map((id) => ({ id })) },
    },
  });
}

export async function getQuoteRequest(id: string): Promise<QuoteRequestWithCount | null> {
  return prisma.supplierQuoteRequest.findUnique({
    where: { id },
    include: { _count: { select: { responses: true } } },
  });
}

export async function listQuoteRequests(query: {
  tenantSlug?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<{ requests: QuoteRequestWithCount[]; total: number }> {
  const where: Prisma.SupplierQuoteRequestWhereInput = {
    ...(query.tenantSlug ? { tenantSlug: query.tenantSlug } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [requests, total] = await prisma.$transaction([
    prisma.supplierQuoteRequest.findMany({
      where,
      include: { _count: { select: { responses: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.supplierQuoteRequest.count({ where }),
  ]);

  return { requests, total };
}

export async function updateQuoteRequestStatus(id: string, status: string): Promise<SupplierQuoteRequest> {
  return prisma.supplierQuoteRequest.update({ where: { id }, data: { status } });
}

export async function createQuoteResponse(data: {
  requestId: string;
  supplierId: string;
  receivedVia: string;
  quoteAmountZar?: number;
  availability?: string;
  leadTimeDays?: number;
  rawResponseText?: string;
  parsedResponseJson?: Prisma.InputJsonValue;
}): Promise<SupplierQuoteResponse> {
  return prisma.supplierQuoteResponse.create({
    data: {
      requestId: data.requestId,
      supplierId: data.supplierId,
      receivedVia: data.receivedVia,
      quoteAmountZar: data.quoteAmountZar ?? null,
      availability: data.availability ?? null,
      leadTimeDays: data.leadTimeDays ?? null,
      rawResponseText: data.rawResponseText ?? null,
      ...(data.parsedResponseJson !== undefined ? { parsedResponseJson: data.parsedResponseJson } : {}),
    },
  });
}

export async function listQuoteResponses(requestId: string): Promise<QuoteResponseWithSupplier[]> {
  return prisma.supplierQuoteResponse.findMany({
    where: { requestId },
    include: { supplier: { select: { businessName: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSuppliersByIds(ids: string[]): Promise<Supplier[]> {
  return prisma.supplier.findMany({ where: { id: { in: ids } } });
}

export async function getResponseById(id: string): Promise<QuoteResponseWithSupplier | null> {
  return prisma.supplierQuoteResponse.findUnique({
    where: { id },
    include: { supplier: { select: { businessName: true } } },
  });
}
