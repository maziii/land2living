import { PrismaClient, type ServiceProvider } from "@prisma/client";
import type { ListProvidersQuery } from "./schemas.js";

export type { ServiceProvider };

const prisma = new PrismaClient();

export async function createProvider(data: {
  businessName: string;
  cipcNumber?: string;
  vatNumber?: string;
  primaryContactUserId: string;
  categories: string[];
  geographicCoverage: string[];
  bankDetailsEncrypted?: object;
  createdByUserId: string;
}): Promise<ServiceProvider> {
  return prisma.serviceProvider.create({ data });
}

export async function findProvider(id: string): Promise<ServiceProvider | null> {
  return prisma.serviceProvider.findUnique({ where: { id } });
}

export async function updateProvider(
  id: string,
  data: Partial<{ verificationStatus: string; bankDetailsEncrypted: object }>,
): Promise<ServiceProvider | null> {
  const existing = await prisma.serviceProvider.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.serviceProvider.update({ where: { id }, data });
}

export async function listProviders(query: ListProvidersQuery): Promise<{ providers: ServiceProvider[]; total: number }> {
  const where: {
    verificationStatus?: string;
    categories?: { has: string };
    geographicCoverage?: { has: string };
  } = {};
  if (query.verificationStatus) where.verificationStatus = query.verificationStatus;
  if (query.category) where.categories = { has: query.category };
  if (query.tenantSlug) where.geographicCoverage = { has: query.tenantSlug };

  const [providers, total] = await prisma.$transaction([
    prisma.serviceProvider.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.serviceProvider.count({ where }),
  ]);
  return { providers, total };
}
