import type { ApplicationStatus, LandPurpose } from "./schemas.js";

export interface ApplicationDocumentResponse {
  id: string;
  createdAt: string;
  applicationId: string;
  s3Key: string;
  documentType: string;
}

export interface ApplicationResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  applicantResidentId: string;
  status: ApplicationStatus;
  isDraft: boolean;
  wizardStep: number | null;

  // Legacy field-portal fields
  applicationType: string | null;
  requestedLocationDescription: string | null;
  requestedSizeSquareMetres: number | null;
  reason: string | null;

  // Jurisdiction
  provinceId: string | null;
  authorityId: string | null;
  authorityType: string | null;
  villageId: string | null;
  villageName: string | null;

  // Applicant info
  applicantFirstName: string | null;
  applicantLastName: string | null;
  applicantPhone: string | null;

  // Household + land request
  householdSize: number;
  landPurpose: LandPurpose | null;

  // Existing tenure
  hasExistingLand: boolean | null;
  existingLandDescription: string | null;

  // Previous applications
  hasPreviousApplication: boolean | null;
  previousApplicationRef: string | null;

  // Disputes
  hasDispute: boolean | null;
  disputeDescription: string | null;

  // GPS
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  siteDescription: string | null;

  // Consent
  consentTerms: boolean | null;
  consentPopia: boolean | null;

  // Review
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  decidedByUserId: string | null;
  allocatedStandId: string | null;
  ptoId: string | null;
  potentialDuplicateOf: string | null;

  documents: ApplicationDocumentResponse[];
}

export interface ApplicationListResponse {
  applications: ApplicationResponse[];
  total: number;
  page: number;
  pageSize: number;
}
