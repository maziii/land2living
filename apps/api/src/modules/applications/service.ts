import { recordAuditEvent } from "../../shared/audit/service.js";
import { enqueueNotification } from "../../shared/notifications/queue.js";
import { getPrismaClient } from "../../shared/database/index.js";
import type { TenantContext } from "../../shared/database/tenant-context.js";
import * as repo from "./repository.js";
import type { LandApplicationWithDocs } from "./repository.js";
import type {
  CreateApplicationRequest,
  UpdateApplicationWizardRequest,
  UpdateApplicationStatusRequest,
  ListApplicationQuery,
} from "./schemas.js";
import { VALID_TRANSITIONS, type ApplicationStatus } from "./schemas.js";
import type { ApplicationResponse, ApplicationListResponse } from "./types.js";

const ENTITY_TYPE = "land_application";

export class ApplicationError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ApplicationError";
  }
}

function toResponse(app: LandApplicationWithDocs): ApplicationResponse {
  return {
    id:                  app.id,
    createdAt:           app.createdAt.toISOString(),
    updatedAt:           app.updatedAt.toISOString(),
    applicantResidentId: app.applicantResidentId,
    status:              app.status as ApplicationResponse["status"],
    isDraft:             app.isDraft,
    wizardStep:          app.wizardStep,

    // Legacy
    applicationType:              app.applicationType,
    requestedLocationDescription: app.requestedLocationDescription,
    requestedSizeSquareMetres:    app.requestedSizeSquareMetres !== null ? Number(app.requestedSizeSquareMetres) : null,
    reason:                       app.reason,

    // Jurisdiction
    provinceId:    app.provinceId,
    authorityId:   app.authorityId,
    authorityType: app.authorityType,
    villageId:     app.villageId,
    villageName:   app.villageName,

    // Applicant
    applicantFirstName: app.applicantFirstName,
    applicantLastName:  app.applicantLastName,
    applicantPhone:     app.applicantPhone,

    // Household + land
    householdSize: app.householdSize,
    landPurpose:   app.landPurpose as ApplicationResponse["landPurpose"],

    // Existing tenure
    hasExistingLand:         app.hasExistingLand,
    existingLandDescription: app.existingLandDescription,

    // Previous applications
    hasPreviousApplication: app.hasPreviousApplication,
    previousApplicationRef: app.previousApplicationRef,

    // Disputes
    hasDispute:         app.hasDispute,
    disputeDescription: app.disputeDescription,

    // GPS
    gpsLatitude:     app.gpsLatitude !== null ? Number(app.gpsLatitude) : null,
    gpsLongitude:    app.gpsLongitude !== null ? Number(app.gpsLongitude) : null,
    siteDescription: app.siteDescription,

    // Consent
    consentTerms: app.consentTerms,
    consentPopia: app.consentPopia,

    // Review
    submittedAt:         app.submittedAt ? app.submittedAt.toISOString() : null,
    reviewedAt:          app.reviewedAt ? app.reviewedAt.toISOString() : null,
    decidedAt:           app.decidedAt ? app.decidedAt.toISOString() : null,
    decisionNotes:       app.decisionNotes,
    decidedByUserId:     app.decidedByUserId,
    allocatedStandId:    app.allocatedStandId,
    ptoId:               app.ptoId,
    potentialDuplicateOf: app.potentialDuplicateOf,

    documents: app.documents.map(d => ({
      id:            d.id,
      createdAt:     d.createdAt.toISOString(),
      applicationId: d.applicationId,
      s3Key:         d.s3Key,
      documentType:  d.documentType,
    })),
  };
}

// ── Legacy field-portal submit (backward compat) ──────────────────────────────

export async function submitApplication(
  ctx: TenantContext,
  data: CreateApplicationRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const app = await repo.createApplication(ctx, {
    applicantResidentId:          data.applicantResidentId,
    applicationType:              data.applicationType,
    requestedLocationDescription: data.requestedLocationDescription,
    ...(data.requestedSizeSquareMetres !== undefined && {
      requestedSizeSquareMetres: data.requestedSizeSquareMetres,
    }),
    householdSize: data.householdSize,
    reason:        data.reason,
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.submitted",
    entityType:  ENTITY_TYPE,
    entityId:    app.id,
    payloadJson: { applicantResidentId: data.applicantResidentId },
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  void dispatchApplicationNotification(ctx, app.id, app.applicantResidentId, "application.submitted", {});
  return toResponse(app);
}

// ── Wizard-first flow ─────────────────────────────────────────────────────────

export async function createDraft(
  ctx: TenantContext,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const app = await repo.createDraft(ctx, actor.userId);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.draft_created",
    entityType:  ENTITY_TYPE,
    entityId:    app.id,
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(app);
}

export async function updateWizardStep(
  ctx: TenantContext,
  id: string,
  data: UpdateApplicationWizardRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);
  if (!existing.isDraft) throw new ApplicationError("Application is no longer a draft", 409);

  const updated = await repo.updateWizardStep(ctx, id, data);
  if (!updated) throw new ApplicationError("Application not found", 404);

  // Audit — deliberately exclude applicantIdNumber (PII)
  const { applicantIdNumber: _redacted, ...safePayload } = data;
  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.wizard_step_saved",
    entityType:  ENTITY_TYPE,
    entityId:    id,
    payloadJson: { step: data.wizardStep, ...safePayload },
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function submitDraftApplication(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);
  if (existing.status !== "draft") throw new ApplicationError("Application is not a draft", 409);

  // Duplicate detection — warn but don't block
  if (existing.authorityId) {
    const candidates = await repo.findDuplicateCandidates(
      ctx,
      existing.applicantResidentId,
      existing.authorityId,
    );
    if (candidates.length > 0 && candidates[0]) {
      await repo.setDuplicateFlag(ctx, id, candidates[0].id);
    }
  }

  const submitted = await repo.submitDraft(ctx, id);
  if (!submitted) throw new ApplicationError("Failed to submit application", 400);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.submitted",
    entityType:  ENTITY_TYPE,
    entityId:    id,
    payloadJson: {
      authorityId:   existing.authorityId,
      landPurpose:   existing.landPurpose,
      householdSize: existing.householdSize,
    },
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  void dispatchApplicationNotification(ctx, id, existing.applicantResidentId, "application.submitted", {});
  return toResponse(submitted);
}

export async function flagDuplicate(
  ctx: TenantContext,
  id: string,
  duplicateOfId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const updated = await repo.setDuplicateFlag(ctx, id, duplicateOfId);
  if (!updated) throw new ApplicationError("Application not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.duplicate_flagged",
    entityType:  ENTITY_TYPE,
    entityId:    id,
    payloadJson: { duplicateOfId },
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

// ── Standard read / status ops ────────────────────────────────────────────────

export async function listApplications(
  ctx: TenantContext,
  query: ListApplicationQuery,
): Promise<ApplicationListResponse> {
  const { applications, total } = await repo.listApplications(ctx, {
    page:     query.page,
    pageSize: query.pageSize,
    ...(query.status        !== undefined && { status:        query.status }),
    ...(query.statuses      !== undefined && { statuses:      query.statuses }),
    ...(query.villageName   !== undefined && { villageName:   query.villageName }),
    ...(query.villageNames  !== undefined && { villageNames:  query.villageNames }),
    ...(query.landPurpose   !== undefined && { landPurpose:   query.landPurpose }),
    ...(query.landPurposes  !== undefined && { landPurposes:  query.landPurposes }),
    ...(query.applicantResidentId !== undefined && { applicantResidentId: query.applicantResidentId }),
    ...(query.isDraft !== undefined             && { isDraft: query.isDraft === "true" }),
  });

  return {
    applications: applications.map(toResponse),
    total,
    page:     query.page,
    pageSize: query.pageSize,
  };
}

export async function getApplication(
  ctx: TenantContext,
  id: string,
): Promise<ApplicationResponse | null> {
  const app = await repo.findApplication(ctx, id);
  if (!app) return null;
  return toResponse(app);
}

export async function updateApplicationStatus(
  ctx: TenantContext,
  id: string,
  data: UpdateApplicationStatusRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);

  const currentStatus = existing.status as ApplicationStatus;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(data.status)) {
    throw new ApplicationError(`Cannot transition from '${currentStatus}' to '${data.status}'`, 409);
  }

  if (data.status === "stand_offered" && !data.allocatedStandId) {
    throw new ApplicationError("allocatedStandId is required when offering a stand", 400);
  }

  const now = new Date();
  const isDecision = data.status === "approved" || data.status === "rejected" || data.status === "deferred";

  const updated = await repo.updateApplication(ctx, id, {
    status: data.status,
    ...(data.status === "under_review" && { reviewedAt: now }),
    ...(isDecision                     && { decidedAt: now, decidedByUserId: actor.userId }),
    // active = PTO physically signed + payment collected at council office
    ...(data.status === "active"       && { decidedAt: now, decidedByUserId: actor.userId }),
    ...(data.decisionNotes !== undefined    && { decisionNotes:    data.decisionNotes }),
    ...(data.allocatedStandId !== undefined && { allocatedStandId: data.allocatedStandId }),
  });

  if (!updated) throw new ApplicationError("Application not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.status_changed",
    entityType:  ENTITY_TYPE,
    entityId:    id,
    payloadJson: { from: currentStatus, to: data.status, ...(data.decisionNotes && { notes: data.decisionNotes }) },
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  void dispatchApplicationNotification(ctx, id, updated.applicantResidentId, `application.${data.status}`, {
    ...(data.decisionNotes !== undefined && { notes: data.decisionNotes }),
  });

  return toResponse(updated);
}

// ── Resident stand-offer actions ──────────────────────────────────────────────

export async function acceptStandOffer(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);
  if (existing.applicantResidentId !== actor.userId) throw new ApplicationError("Forbidden", 403);

  const allowed: ApplicationStatus[] = ["stand_offered", "viewing_requested"];
  if (!allowed.includes(existing.status as ApplicationStatus)) {
    throw new ApplicationError(`Cannot accept offer from '${existing.status}' status`, 409);
  }

  const updated = await repo.updateApplication(ctx, id, { status: "offer_accepted" });
  if (!updated) throw new ApplicationError("Application not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId, actorRole: actor.role,
    eventType: "application.offer_accepted", entityType: ENTITY_TYPE, entityId: id,
    payloadJson: { from: existing.status },
    ...(actor.ip !== undefined        && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined  && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function requestStandViewing(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);
  if (existing.applicantResidentId !== actor.userId) throw new ApplicationError("Forbidden", 403);

  if (existing.status !== "stand_offered") {
    throw new ApplicationError(`Cannot request viewing from '${existing.status}' status`, 409);
  }

  const updated = await repo.updateApplication(ctx, id, { status: "viewing_requested" });
  if (!updated) throw new ApplicationError("Application not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId, actorRole: actor.role,
    eventType: "application.viewing_requested", entityType: ENTITY_TYPE, entityId: id,
    ...(actor.ip !== undefined        && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined  && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function rejectStandOffer(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);
  if (existing.applicantResidentId !== actor.userId) throw new ApplicationError("Forbidden", 403);

  const allowed: ApplicationStatus[] = ["stand_offered", "viewing_requested"];
  if (!allowed.includes(existing.status as ApplicationStatus)) {
    throw new ApplicationError(`Cannot reject offer from '${existing.status}' status`, 409);
  }

  const updated = await repo.updateApplication(ctx, id, { status: "offer_rejected" });
  if (!updated) throw new ApplicationError("Application not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId, actorRole: actor.role,
    eventType: "application.offer_rejected", entityType: ENTITY_TYPE, entityId: id,
    payloadJson: { from: existing.status },
    ...(actor.ip !== undefined        && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined  && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function withdrawApplication(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ApplicationResponse> {
  const existing = await repo.findApplication(ctx, id);
  if (!existing) throw new ApplicationError("Application not found", 404);

  const currentStatus = existing.status as ApplicationStatus;
  if (!VALID_TRANSITIONS[currentStatus]?.includes("withdrawn")) {
    throw new ApplicationError(`Cannot withdraw an application in '${currentStatus}' status`, 409);
  }

  const updated = await repo.updateApplication(ctx, id, { status: "withdrawn" });
  if (!updated) throw new ApplicationError("Application not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole:   actor.role,
    eventType:   "application.withdrawn",
    entityType:  ENTITY_TYPE,
    entityId:    id,
    ...(actor.ip !== undefined       && { ipAddress:  actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

// ── Internal helper ───────────────────────────────────────────────────────────

async function dispatchApplicationNotification(
  ctx: TenantContext,
  applicationId: string,
  residentId: string,
  templateKey: string,
  extraVars: Record<string, string>,
): Promise<void> {
  try {
    const resident = await getPrismaClient(ctx).resident.findUnique({
      where:  { id: residentId },
      select: { phoneNumber: true, languagePreference: true },
    });
    if (!resident) return;

    await enqueueNotification({
      tenantSlug:     ctx.slug,
      recipientPhone: resident.phoneNumber,
      language:       resident.languagePreference,
      templateKey,
      vars: { ref: applicationId.slice(0, 8), council: ctx.slug, ...extraVars },
    });
  } catch (err) {
    console.error(`Failed to enqueue notification for application ${applicationId}:`, err);
  }
}
