import { apiFetch } from "./client.js";

// ── Master data types ────────────────────────────────────────────────────────

export type AuthorityType = "traditional_council" | "municipality" | "cpa" | "private_development";
export type LandPurpose   = "residential" | "business" | "farming" | "community";
export type DocType       = "id_document" | "proof_of_residence" | "affidavit" | "photo" | "stand_photo" | "other";
export type ApplicationStatus =
  | "draft" | "submitted" | "under_review"
  | "approved"
  | "stand_offered" | "viewing_requested" | "offer_rejected" | "offer_accepted"
  | "active" | "rejected" | "deferred" | "withdrawn";

export interface Province        { id: string; name: string; code: string; }
export interface LandAuthority   { id: string; name: string; authorityType: AuthorityType; provinceId: string; }
export interface AuthorityVillage { id: string; name: string; landAuthorityId: string; }
export interface AuthorityTypeOption { value: AuthorityType; label: string; }

export interface ApplicationDoc {
  id: string; createdAt: string; applicationId: string; s3Key: string; documentType: string;
}

export interface ApplicationDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  applicantResidentId: string;
  status: ApplicationStatus;
  isDraft: boolean;
  wizardStep: number | null;

  // Jurisdiction
  provinceId: string | null;
  authorityId: string | null;
  authorityType: string | null;
  villageId: string | null;
  villageName: string | null;

  // Applicant
  applicantFirstName: string | null;
  applicantLastName: string | null;
  applicantPhone: string | null;

  // Household + land
  householdSize: number;
  landPurpose: LandPurpose | null;

  // Tenure / history
  hasExistingLand: boolean | null;
  existingLandDescription: string | null;
  hasPreviousApplication: boolean | null;
  previousApplicationRef: string | null;

  // Disputes
  hasDispute: boolean | null;
  disputeDescription: string | null;

  // GPS
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  siteDescription: string | null;

  // Consent + review
  consentTerms: boolean | null;
  consentPopia: boolean | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  allocatedStandId: string | null;
  ptoId: string | null;
  potentialDuplicateOf: string | null;
  documents: ApplicationDoc[];
}

export interface WizardStepData {
  wizardStep: number;
  provinceId?: string;
  authorityId?: string;
  authorityType?: string;
  villageId?: string;
  villageName?: string;
  applicantFirstName?: string;
  applicantLastName?: string;
  applicantPhone?: string;
  applicantIdNumber?: string;
  householdSize?: number;
  landPurpose?: LandPurpose;
  siteDescription?: string;
  hasExistingLand?: boolean;
  existingLandDescription?: string;
  hasPreviousApplication?: boolean;
  previousApplicationRef?: string;
  hasDispute?: boolean;
  disputeDescription?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  consentTerms?: boolean;
  consentPopia?: boolean;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

export async function fetchProvinces(): Promise<Province[]> {
  const r = await apiFetch<{ provinces: Province[] }>("/lookup/provinces");
  return r.provinces;
}

export async function fetchAuthorityTypes(): Promise<AuthorityTypeOption[]> {
  const r = await apiFetch<{ types: AuthorityTypeOption[] }>("/lookup/authority-types");
  return r.types;
}

export async function fetchAuthorities(
  provinceId: string,
  type?: AuthorityType,
): Promise<LandAuthority[]> {
  const qs = new URLSearchParams({ provinceId });
  if (type) qs.set("type", type);
  const r = await apiFetch<{ authorities: LandAuthority[] }>(`/lookup/authorities?${qs.toString()}`);
  return r.authorities;
}

export async function fetchVillages(authorityId: string): Promise<AuthorityVillage[]> {
  const r = await apiFetch<{ villages: AuthorityVillage[] }>(
    `/lookup/villages?authorityId=${encodeURIComponent(authorityId)}`,
  );
  return r.villages;
}

// ── Draft operations ──────────────────────────────────────────────────────────

export async function createDraft(): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>("/applications/draft", { method: "POST", body: "{}" });
}

export async function saveDraftStep(id: string, data: WizardStepData): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}/wizard`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function submitDraft(id: string): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}/submit`, { method: "POST", body: "{}" });
}

export async function fetchApplication(id: string): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}`);
}

export async function fetchMyApplications(
  applicantResidentId: string,
): Promise<{ applications: ApplicationDraft[]; total: number }> {
  return apiFetch<{ applications: ApplicationDraft[]; total: number }>(
    `/applications?applicantResidentId=${encodeURIComponent(applicantResidentId)}&pageSize=50`,
  );
}

// ── Resident stand-offer actions ──────────────────────────────────────────────

export async function acceptStandOffer(id: string): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}/accept-offer`, { method: "POST", body: "{}" });
}

export async function requestStandViewing(id: string): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}/request-viewing`, { method: "POST", body: "{}" });
}

export async function rejectStandOffer(id: string): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}/reject-offer`, { method: "POST", body: "{}" });
}

export async function withdrawApplication(id: string): Promise<ApplicationDraft> {
  return apiFetch<ApplicationDraft>(`/applications/${id}/withdraw`, { method: "POST", body: "{}" });
}

export async function linkDocument(
  applicationId: string,
  s3Key: string,
  documentType: DocType,
): Promise<ApplicationDoc> {
  return apiFetch<ApplicationDoc>(`/applications/${applicationId}/documents`, {
    method: "POST",
    body: JSON.stringify({ s3Key, documentType }),
  });
}
