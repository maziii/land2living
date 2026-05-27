import { getPublicPrismaClient } from "../../shared/database/index.js";

export async function listProvinces() {
  return getPublicPrismaClient().province.findMany({ orderBy: { name: "asc" } });
}

export async function listAuthorities(filter: { provinceId?: string; type?: string }) {
  return getPublicPrismaClient().landAuthority.findMany({
    where: {
      isActive: true,
      ...(filter.provinceId !== undefined && { provinceId: filter.provinceId }),
      ...(filter.type !== undefined && { authorityType: filter.type }),
    },
    orderBy: { name: "asc" },
  });
}

export async function listVillages(authorityId: string) {
  return getPublicPrismaClient().authorityVillage.findMany({
    where: { landAuthorityId: authorityId, isActive: true },
    orderBy: { name: "asc" },
  });
}
