import { z } from "zod";

export const APPLICATION_TYPES = ["new_stand", "additional_stand", "regularisation"] as const;
export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "stand_offered",
  "viewing_requested",
  "offer_rejected",
  "offer_accepted",
  "active",
  "rejected",
  "deferred",
  "withdrawn",
] as const;
export const LAND_PURPOSES   = ["residential", "business", "farming", "community"] as const;
export const DOCUMENT_TYPES  = ["id_document", "proof_of_residence", "affidavit", "photo", "stand_photo", "other"] as const;

export type ApplicationType   = (typeof APPLICATION_TYPES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type LandPurpose       = (typeof LAND_PURPOSES)[number];
export type DocumentType      = (typeof DOCUMENT_TYPES)[number];

export const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft:             ["submitted", "withdrawn"],
  submitted:         ["under_review", "withdrawn"],
  under_review:      ["approved", "rejected", "deferred", "withdrawn"],
  // Council offers a stand after approval; rejected → re-offer loops back
  approved:          ["stand_offered", "withdrawn"],
  stand_offered:     ["viewing_requested", "offer_accepted", "offer_rejected", "withdrawn"],
  viewing_requested: ["offer_accepted", "offer_rejected", "withdrawn"],
  offer_rejected:    ["stand_offered", "withdrawn"],
  offer_accepted:    ["active"],
  active:            [],
  rejected:          [],
  deferred:          ["under_review", "withdrawn"],
  withdrawn:         [],
};

// ── Legacy field-portal schema ────────────────────────────────────────────────
export const createApplicationSchema = z.object({
  applicantResidentId:          z.string().uuid(),
  applicationType:              z.enum(APPLICATION_TYPES),
  requestedLocationDescription: z.string().min(1).max(500),
  requestedSizeSquareMetres:    z.number().positive().optional(),
  householdSize:                z.number().int().min(1),
  reason:                       z.string().min(1).max(2000),
});

// ── Wizard-first schemas ──────────────────────────────────────────────────────

export const updateWizardSchema = z.object({
  wizardStep: z.number().int().min(0).max(14),

  // Steps 1-3: jurisdiction
  provinceId:    z.string().optional(),
  authorityId:   z.string().min(1).optional(),
  authorityType: z.string().optional(),
  villageId:     z.string().uuid().optional(),
  villageName:   z.string().max(200).optional(),

  // Steps 4-6: applicant identity
  applicantFirstName: z.string().max(100).optional(),
  applicantLastName:  z.string().max(100).optional(),
  applicantPhone:     z.string().max(20).optional(),
  applicantIdNumber:  z.string().max(20).optional(),

  // Step 7: household
  householdSize: z.number().int().min(1).max(50).optional(),

  // Step 8: land purpose
  landPurpose: z.enum(LAND_PURPOSES).optional(),

  // Step 9: preferred area
  siteDescription: z.string().max(500).optional(),

  // Step 10: existing land
  hasExistingLand:         z.boolean().optional(),
  existingLandDescription: z.string().max(1000).optional(),

  // Step 11: previous applications
  hasPreviousApplication: z.boolean().optional(),
  previousApplicationRef: z.string().max(200).optional(),

  // Step 12: disputes
  hasDispute:         z.boolean().optional(),
  disputeDescription: z.string().max(1000).optional(),

  // Step 14: GPS
  gpsLatitude:  z.number().min(-90).max(90).optional(),
  gpsLongitude: z.number().min(-180).max(180).optional(),

  // Step 15: consent
  consentTerms: z.boolean().optional(),
  consentPopia: z.boolean().optional(),
});

export const updateApplicationStatusSchema = z.object({
  status:           z.enum(["under_review", "approved", "stand_offered", "offer_accepted", "active", "rejected", "deferred"]),
  decisionNotes:    z.string().min(1).max(2000).optional(),
  allocatedStandId: z.string().uuid().optional(),
});

export const addDocumentSchema = z.object({
  s3Key:        z.string().min(1),
  documentType: z.enum(DOCUMENT_TYPES),
});

export const flagDuplicateSchema = z.object({
  duplicateOfId: z.string().uuid(),
});

// Coerce a single string or array of strings into an array (handles repeated QS params).
function toStringArray(v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v : [v];
}

export const listApplicationQuerySchema = z.object({
  page:                z.coerce.number().int().min(1).default(1),
  pageSize:            z.coerce.number().int().min(1).max(100).default(20),
  // Single status kept for backwards compat; statuses[] takes precedence.
  status:              z.enum(APPLICATION_STATUSES).optional(),
  statuses:            z.preprocess(toStringArray, z.array(z.enum(APPLICATION_STATUSES)).optional()),
  villageName:         z.string().optional(),
  villageNames:        z.preprocess(toStringArray, z.array(z.string().min(1)).optional()),
  landPurpose:         z.enum(LAND_PURPOSES).optional(),
  landPurposes:        z.preprocess(toStringArray, z.array(z.enum(LAND_PURPOSES)).optional()),
  applicantResidentId: z.string().uuid().optional(),
  isDraft:             z.enum(["true", "false"]).optional(),
});

export type CreateApplicationRequest       = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationWizardRequest = z.infer<typeof updateWizardSchema>;
export type UpdateApplicationStatusRequest = z.infer<typeof updateApplicationStatusSchema>;
export type AddDocumentRequest             = z.infer<typeof addDocumentSchema>;
export type FlagDuplicateRequest           = z.infer<typeof flagDuplicateSchema>;
export type ListApplicationQuery           = z.infer<typeof listApplicationQuerySchema>;
