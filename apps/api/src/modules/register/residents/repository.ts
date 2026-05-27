import type { Resident, Prisma } from "../../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../../shared/database/index.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";
import type { UpdateResidentRequest } from "./schemas.js";

export type { Resident };

function db(ctx: TenantContext) {
  return getPrismaClient(ctx);
}

export interface CreateResidentData {
  encryptedIdNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber: string;
  whatsappNumber?: string;
  languagePreference: string;
  consentDataCapture: boolean;
  consentMarketing: boolean;
  notes?: string;
  capturedByUserId: string;
  userId?: string;
}

export async function createResident(
  ctx: TenantContext,
  data: CreateResidentData,
): Promise<Resident> {
  return db(ctx).resident.create({
    data: {
      idNumber: data.encryptedIdNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      otherNames: data.otherNames ?? null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender ?? null,
      phoneNumber: data.phoneNumber,
      whatsappNumber: data.whatsappNumber ?? null,
      languagePreference: data.languagePreference,
      consentDataCapture: data.consentDataCapture,
      consentMarketing: data.consentMarketing,
      notes: data.notes ?? null,
      capturedByUserId: data.capturedByUserId,
      ...(data.userId !== undefined && { userId: data.userId }),
    },
  });
}

export async function findResidentByUserId(
  ctx: TenantContext,
  userId: string,
): Promise<Resident | null> {
  return db(ctx).resident.findUnique({ where: { userId } });
}

export async function findResidentById(
  ctx: TenantContext,
  id: string,
): Promise<Resident | null> {
  return db(ctx).resident.findFirst({ where: { id, deletedAt: null } });
}

export interface ListResidentsFilter {
  page: number;
  pageSize: number;
  search?: string;
  verificationStatus?: string;
}

export async function listResidents(
  ctx: TenantContext,
  filters: ListResidentsFilter,
): Promise<{ residents: Resident[]; total: number }> {
  const where: Prisma.ResidentWhereInput = { deletedAt: null };

  if (filters.verificationStatus) {
    where.verificationStatus = filters.verificationStatus;
  }

  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { phoneNumber: { contains: filters.search } },
    ];
  }

  const skip = (filters.page - 1) * filters.pageSize;
  const [residents, total] = await Promise.all([
    db(ctx).resident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    db(ctx).resident.count({ where }),
  ]);

  return { residents, total };
}

export async function updateResident(
  ctx: TenantContext,
  id: string,
  data: UpdateResidentRequest,
): Promise<Resident | null> {
  const existing = await findResidentById(ctx, id);
  if (!existing) return null;

  const updateData: Prisma.ResidentUpdateInput = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.otherNames !== undefined) updateData.otherNames = data.otherNames;
  if (data.dateOfBirth !== undefined)
    updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;
  if (data.whatsappNumber !== undefined) updateData.whatsappNumber = data.whatsappNumber;
  if (data.languagePreference !== undefined)
    updateData.languagePreference = data.languagePreference;
  if (data.consentDataCapture !== undefined)
    updateData.consentDataCapture = data.consentDataCapture;
  if (data.consentMarketing !== undefined) updateData.consentMarketing = data.consentMarketing;
  if (data.notes !== undefined) updateData.notes = data.notes;

  return db(ctx).resident.update({ where: { id }, data: updateData });
}

export async function softDeleteResident(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const existing = await findResidentById(ctx, id);
  if (!existing) return false;
  await db(ctx).resident.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}
