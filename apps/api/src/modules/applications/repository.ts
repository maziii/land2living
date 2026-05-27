import type { LandApplication, ApplicationDocument, Prisma } from "../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../shared/database/index.js";
import type { TenantContext } from "../../shared/database/tenant-context.js";
import type { UpdateApplicationWizardRequest } from "./schemas.js";

export type { LandApplication, ApplicationDocument };

export interface LandApplicationWithDocs extends LandApplication {
  documents: ApplicationDocument[];
}

// ── Legacy field-portal ────────────────────────────────────────────────────────

export interface CreateApplicationData {
  applicantResidentId: string;
  applicationType: string;
  requestedLocationDescription: string;
  requestedSizeSquareMetres?: number;
  householdSize: number;
  reason: string;
}

export async function createApplication(
  ctx: TenantContext,
  data: CreateApplicationData,
): Promise<LandApplicationWithDocs> {
  return getPrismaClient(ctx).landApplication.create({
    data: {
      applicantResidentId:          data.applicantResidentId,
      applicationType:              data.applicationType,
      requestedLocationDescription: data.requestedLocationDescription,
      ...(data.requestedSizeSquareMetres !== undefined && {
        requestedSizeSquareMetres: data.requestedSizeSquareMetres,
      }),
      householdSize: data.householdSize,
      reason:        data.reason,
      status:        "submitted",
      isDraft:       false,
      submittedAt:   new Date(),
    },
    include: { documents: true },
  });
}

// ── Wizard-first ───────────────────────────────────────────────────────────────

export async function createDraft(
  ctx: TenantContext,
  applicantResidentId: string,
): Promise<LandApplicationWithDocs> {
  return getPrismaClient(ctx).landApplication.create({
    data: {
      applicantResidentId,
      status:     "draft",
      isDraft:    true,
      wizardStep: 0,
    },
    include: { documents: true },
  });
}

export async function updateWizardStep(
  ctx: TenantContext,
  id: string,
  data: UpdateApplicationWizardRequest,
): Promise<LandApplicationWithDocs | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.landApplication.findUnique({ where: { id } });
  if (!existing) return null;

  // Never allow ID number to persist in payload_json audit log — handled in service.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { applicantIdNumber: _id, ...safeData } = data;

  return prisma.landApplication.update({
    where: { id },
    data: {
      wizardStep: data.wizardStep,
      ...(safeData.provinceId !== undefined    && { provinceId:    safeData.provinceId }),
      ...(safeData.authorityId !== undefined   && { authorityId:   safeData.authorityId }),
      ...(safeData.authorityType !== undefined && { authorityType: safeData.authorityType }),
      ...(safeData.villageId !== undefined     && { villageId:     safeData.villageId }),
      ...(safeData.villageName !== undefined   && { villageName:   safeData.villageName }),
      ...(safeData.applicantFirstName !== undefined && { applicantFirstName: safeData.applicantFirstName }),
      ...(safeData.applicantLastName !== undefined  && { applicantLastName:  safeData.applicantLastName }),
      ...(safeData.applicantPhone !== undefined     && { applicantPhone:     safeData.applicantPhone }),
      ...(data.applicantIdNumber !== undefined      && { applicantIdNumber:  data.applicantIdNumber }),
      ...(safeData.householdSize !== undefined && { householdSize: safeData.householdSize }),
      ...(safeData.landPurpose !== undefined   && { landPurpose:   safeData.landPurpose }),
      ...(safeData.siteDescription !== undefined        && { siteDescription:        safeData.siteDescription }),
      ...(safeData.hasExistingLand !== undefined         && { hasExistingLand:         safeData.hasExistingLand }),
      ...(safeData.existingLandDescription !== undefined && { existingLandDescription: safeData.existingLandDescription }),
      ...(safeData.hasPreviousApplication !== undefined  && { hasPreviousApplication:  safeData.hasPreviousApplication }),
      ...(safeData.previousApplicationRef !== undefined  && { previousApplicationRef:  safeData.previousApplicationRef }),
      ...(safeData.hasDispute !== undefined         && { hasDispute:         safeData.hasDispute }),
      ...(safeData.disputeDescription !== undefined && { disputeDescription: safeData.disputeDescription }),
      ...(safeData.gpsLatitude !== undefined  && { gpsLatitude:  safeData.gpsLatitude }),
      ...(safeData.gpsLongitude !== undefined && { gpsLongitude: safeData.gpsLongitude }),
      ...(safeData.consentTerms !== undefined && { consentTerms: safeData.consentTerms }),
      ...(safeData.consentPopia !== undefined && { consentPopia: safeData.consentPopia }),
    },
    include: { documents: true },
  });
}

export async function submitDraft(
  ctx: TenantContext,
  id: string,
): Promise<LandApplicationWithDocs | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.landApplication.findUnique({ where: { id } });
  if (!existing || existing.status !== "draft") return null;

  return prisma.landApplication.update({
    where: { id },
    data: { status: "submitted", isDraft: false, submittedAt: new Date() },
    include: { documents: true },
  });
}

export async function findDuplicateCandidates(
  ctx: TenantContext,
  applicantResidentId: string,
  authorityId: string,
): Promise<LandApplicationWithDocs[]> {
  return getPrismaClient(ctx).landApplication.findMany({
    where: {
      applicantResidentId,
      authorityId,
      status: { notIn: ["withdrawn", "rejected", "draft"] },
    },
    include: { documents: true },
  });
}

export async function setDuplicateFlag(
  ctx: TenantContext,
  id: string,
  potentialDuplicateOf: string,
): Promise<LandApplicationWithDocs | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.landApplication.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.landApplication.update({
    where: { id },
    data: { potentialDuplicateOf },
    include: { documents: true },
  });
}

// ── List / find ────────────────────────────────────────────────────────────────

export interface ListApplicationsFilter {
  page: number;
  pageSize: number;
  status?: string;
  statuses?: string[];
  villageName?: string;
  villageNames?: string[];
  landPurpose?: string;
  landPurposes?: string[];
  applicantResidentId?: string;
  isDraft?: boolean;
}

export async function listApplications(
  ctx: TenantContext,
  filter: ListApplicationsFilter,
): Promise<{ applications: LandApplicationWithDocs[]; total: number }> {
  const prisma = getPrismaClient(ctx);

  // Resolve multi-value params: the array version takes precedence over single.
  const effectiveStatuses = filter.statuses?.length
    ? filter.statuses
    : filter.status ? [filter.status] : undefined;

  const effectiveVillages = filter.villageNames?.length
    ? filter.villageNames
    : filter.villageName ? [filter.villageName] : undefined;

  const effectivePurposes = filter.landPurposes?.length
    ? filter.landPurposes
    : filter.landPurpose ? [filter.landPurpose] : undefined;

  const where: Prisma.LandApplicationWhereInput = {};

  if (effectiveStatuses?.length === 1)      where.status      = effectiveStatuses[0]!;
  else if (effectiveStatuses?.length)       where.status      = { in: effectiveStatuses };

  if (effectiveVillages?.length === 1)      where.villageName = { equals: effectiveVillages[0]!, mode: "insensitive" };
  else if (effectiveVillages?.length)       where.villageName = { in: effectiveVillages };

  if (effectivePurposes?.length === 1)      where.landPurpose = effectivePurposes[0]!;
  else if (effectivePurposes?.length)       where.landPurpose = { in: effectivePurposes };

  if (filter.applicantResidentId !== undefined) where.applicantResidentId = filter.applicantResidentId;
  if (filter.isDraft !== undefined)             where.isDraft             = filter.isDraft;
  const [applications, total] = await prisma.$transaction([
    prisma.landApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (filter.page - 1) * filter.pageSize,
      take:    filter.pageSize,
      include: { documents: true },
    }),
    prisma.landApplication.count({ where }),
  ]);
  return { applications, total };
}

export async function findApplication(
  ctx: TenantContext,
  id: string,
): Promise<LandApplicationWithDocs | null> {
  return getPrismaClient(ctx).landApplication.findUnique({
    where: { id },
    include: { documents: true },
  });
}

export async function updateApplication(
  ctx: TenantContext,
  id: string,
  data: {
    status: string;
    reviewedAt?: Date;
    decidedAt?: Date;
    decisionNotes?: string;
    decidedByUserId?: string;
    allocatedStandId?: string;
    ptoId?: string;
  },
): Promise<LandApplicationWithDocs | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.landApplication.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.landApplication.update({
    where: { id },
    data: {
      status: data.status,
      ...(data.reviewedAt !== undefined       && { reviewedAt:       data.reviewedAt }),
      ...(data.decidedAt !== undefined        && { decidedAt:        data.decidedAt }),
      ...(data.decisionNotes !== undefined    && { decisionNotes:    data.decisionNotes }),
      ...(data.decidedByUserId !== undefined  && { decidedByUserId:  data.decidedByUserId }),
      ...(data.allocatedStandId !== undefined && { allocatedStandId: data.allocatedStandId }),
      ...(data.ptoId !== undefined            && { ptoId:            data.ptoId }),
    },
    include: { documents: true },
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function createApplicationDocument(
  ctx: TenantContext,
  data: { applicationId: string; s3Key: string; documentType: string },
): Promise<ApplicationDocument> {
  return getPrismaClient(ctx).applicationDocument.create({ data });
}
