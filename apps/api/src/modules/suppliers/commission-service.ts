import { PrismaClient } from "@prisma/client";
import type { SupplierSale, Prisma } from "@prisma/client";
import { recordPlatformAuditEvent } from "../../shared/audit/platform.js";
import type { RecordSaleInput, RecordPaymentInput, ListSalesQuery } from "./commission-schemas.js";
import { SuppliersError } from "./service.js";

const prisma = new PrismaClient();

export interface SaleResponse {
  id: string;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  quoteRequestId: string | null;
  tenantSlug: string;
  customerResidentId: string | null;
  fulfilledAmountZar: number;
  commissionAmountZar: number;
  commissionRateBasisPoints: number;
  status: string;
  invoicedAt: string | null;
  paidAt: string | null;
}

export interface SaleListResponse {
  sales: SaleResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalCommissionOwed: number;
}

type SaleWithSupplier = SupplierSale & {
  supplier: { businessName: string; commissionRateBasisPoints: number };
};

function toResponse(s: SaleWithSupplier): SaleResponse {
  return {
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    supplierId: s.supplierId,
    supplierName: s.supplier.businessName,
    quoteRequestId: s.quoteRequestId ?? null,
    tenantSlug: s.tenantSlug,
    customerResidentId: s.customerResidentId ?? null,
    fulfilledAmountZar: s.fulfilledAmountZar,
    commissionAmountZar: s.commissionAmountZar,
    commissionRateBasisPoints: s.supplier.commissionRateBasisPoints,
    status: s.status,
    invoicedAt: s.invoicedAt?.toISOString() ?? null,
    paidAt: s.paidAt?.toISOString() ?? null,
  };
}

export async function recordSale(
  input: RecordSaleInput,
  actor: { userId: string; role: string },
): Promise<SaleResponse> {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new SuppliersError("Supplier not found", 404);

  const commissionAmountZar = Math.floor(
    (input.fulfilledAmountZar * supplier.commissionRateBasisPoints) / 10_000,
  );

  const sale = await prisma.supplierSale.create({
    data: {
      supplierId: input.supplierId,
      ...(input.quoteRequestId !== undefined ? { quoteRequestId: input.quoteRequestId } : {}),
      tenantSlug: input.tenantSlug,
      ...(input.customerResidentId !== undefined ? { customerResidentId: input.customerResidentId } : {}),
      fulfilledAmountZar: input.fulfilledAmountZar,
      commissionAmountZar,
      status: "pending_invoice",
    },
    include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
  });

  void recordPlatformAuditEvent({
    eventType: "supplier.sale.recorded",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "SupplierSale",
    entityId: sale.id,
    tenantSlug: input.tenantSlug,
    payloadJson: { supplierId: input.supplierId, fulfilledAmountZar: input.fulfilledAmountZar, commissionAmountZar },
  });

  return toResponse(sale);
}

export async function generateInvoice(
  saleId: string,
  actor: { userId: string; role: string },
): Promise<SaleResponse> {
  const sale = await prisma.supplierSale.findUnique({
    where: { id: saleId },
    include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
  });
  if (!sale) throw new SuppliersError("Sale not found", 404);
  if (sale.status !== "pending_invoice") {
    throw new SuppliersError(`Cannot invoice a sale with status '${sale.status}'`, 409);
  }

  const updated = await prisma.supplierSale.update({
    where: { id: saleId },
    data: { status: "invoiced", invoicedAt: new Date() },
    include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
  });

  void recordPlatformAuditEvent({
    eventType: "supplier.sale.invoiced",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "SupplierSale",
    entityId: saleId,
    payloadJson: { commissionAmountZar: sale.commissionAmountZar },
  });

  return toResponse(updated);
}

export async function recordPayment(
  saleId: string,
  input: RecordPaymentInput,
  actor: { userId: string; role: string },
): Promise<SaleResponse> {
  const sale = await prisma.supplierSale.findUnique({
    where: { id: saleId },
    include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
  });
  if (!sale) throw new SuppliersError("Sale not found", 404);
  if (sale.status !== "invoiced") {
    throw new SuppliersError(`Cannot mark payment on a sale with status '${sale.status}'`, 409);
  }

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  const updated = await prisma.supplierSale.update({
    where: { id: saleId },
    data: { status: "paid", paidAt },
    include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
  });

  void recordPlatformAuditEvent({
    eventType: "supplier.sale.paid",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "SupplierSale",
    entityId: saleId,
    payloadJson: { commissionAmountZar: sale.commissionAmountZar, paidAt: paidAt.toISOString() },
  });

  return toResponse(updated);
}

export async function listSales(query: ListSalesQuery): Promise<SaleListResponse> {
  const where: Prisma.SupplierSaleWhereInput = {
    ...(query.supplierId !== undefined ? { supplierId: query.supplierId } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.tenantSlug !== undefined ? { tenantSlug: query.tenantSlug } : {}),
  };

  const [sales, total, owed] = await prisma.$transaction([
    prisma.supplierSale.findMany({
      where,
      include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.supplierSale.count({ where }),
    prisma.supplierSale.aggregate({
      where: { ...where, status: { not: "paid" } },
      _sum: { commissionAmountZar: true },
    }),
  ]);

  return {
    sales: (sales as SaleWithSupplier[]).map(toResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalCommissionOwed: owed._sum.commissionAmountZar ?? 0,
  };
}

export async function getSale(id: string): Promise<SaleResponse | null> {
  const sale = await prisma.supplierSale.findUnique({
    where: { id },
    include: { supplier: { select: { businessName: true, commissionRateBasisPoints: true } } },
  });
  if (!sale) return null;
  return toResponse(sale as SaleWithSupplier);
}
