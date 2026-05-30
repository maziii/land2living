export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "stand_offered"
  | "viewing_requested"
  | "offer_rejected"
  | "offer_accepted"
  | "active"
  | "rejected"
  | "deferred"
  | "withdrawn";

export interface ApplicationDocument {
  id: string;
  createdAt: string;
  applicationId: string;
  s3Key: string;
  documentType: string;
}

export interface ApplicationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  applicantResidentId: string;
  status: ApplicationStatus;
  isDraft: boolean;
  wizardStep: number | null;

  // Legacy (may be null for wizard-first applications)
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

  // Applicant
  applicantFirstName: string | null;
  applicantLastName: string | null;
  applicantPhone: string | null;

  // Household + land
  householdSize: number;
  landPurpose: string | null;

  // Tenure history
  hasExistingLand: boolean | null;
  existingLandDescription: string | null;
  hasPreviousApplication: boolean | null;
  previousApplicationRef: string | null;
  hasDispute: boolean | null;
  disputeDescription: string | null;

  // GPS
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  siteDescription: string | null;

  // Review
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  decidedByUserId: string | null;
  allocatedStandId: string | null;
  ptoId: string | null;
  potentialDuplicateOf: string | null;

  documents: ApplicationDocument[];
}

export interface ApplicationListResponse {
  applications: ApplicationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { "Content-Type": "application/json" };

async function apiPatch(apiFetch: ApiFetch, url: string, body: unknown): Promise<ApplicationSummary> {
  const res = await apiFetch(url, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ApplicationSummary>;
}

async function apiPost(apiFetch: ApiFetch, url: string, body?: unknown): Promise<ApplicationSummary> {
  const res = await apiFetch(url, { method: "POST", headers: JSON_HEADERS, body: body !== undefined ? JSON.stringify(body) : "{}" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ApplicationSummary>;
}

export type WizardStepData = {
  wizardStep: number;
  applicantFirstName?: string;
  applicantLastName?: string;
  applicantPhone?: string;
  villageName?: string;
  siteDescription?: string;
  landPurpose?: "residential" | "business" | "farming" | "community";
  householdSize?: number;
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
};

export async function createDraft(apiFetch: ApiFetch): Promise<ApplicationSummary> {
  return apiPost(apiFetch, "/api/v1/applications/draft");
}

export async function updateWizardStep(
  apiFetch: ApiFetch,
  id: string,
  data: WizardStepData,
): Promise<ApplicationSummary> {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/wizard`, data);
}

export async function submitDraftApplication(apiFetch: ApiFetch, id: string): Promise<ApplicationSummary> {
  return apiPost(apiFetch, `/api/v1/applications/${id}/submit`);
}

export async function acceptOffer(apiFetch: ApiFetch, id: string): Promise<ApplicationSummary> {
  return apiPost(apiFetch, `/api/v1/applications/${id}/accept-offer`);
}

export async function requestViewing(apiFetch: ApiFetch, id: string): Promise<ApplicationSummary> {
  return apiPost(apiFetch, `/api/v1/applications/${id}/request-viewing`);
}

export async function rejectOffer(apiFetch: ApiFetch, id: string): Promise<ApplicationSummary> {
  return apiPost(apiFetch, `/api/v1/applications/${id}/reject-offer`);
}

export async function fetchApplications(
  apiFetch: ApiFetch,
  params: {
    page?: number;
    pageSize?: number;
    statuses?: ApplicationStatus[];
    search?: string;
    villageNames?: string[];
    landPurposes?: string[];
  },
): Promise<ApplicationListResponse> {
  const qs = new URLSearchParams();
  if (params.page)     qs.set("page",     String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.search)   qs.set("search",   params.search);
  for (const s of params.statuses     ?? []) qs.append("statuses",     s);
  for (const v of params.villageNames ?? []) qs.append("villageNames", v);
  for (const p of params.landPurposes ?? []) qs.append("landPurposes", p);
  const res = await apiFetch(`/api/v1/applications?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ApplicationListResponse>;
}

export async function fetchApplication(apiFetch: ApiFetch, id: string): Promise<ApplicationSummary> {
  const res = await apiFetch(`/api/v1/applications/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ApplicationSummary>;
}

// ── Council status transitions ────────────────────────────────────────────────

export function startReview(apiFetch: ApiFetch, id: string) {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/status`, { status: "under_review" });
}

export function approveApplication(apiFetch: ApiFetch, id: string, decisionNotes?: string) {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/status`, {
    status: "approved",
    ...(decisionNotes && { decisionNotes }),
  });
}

export function rejectApplication(apiFetch: ApiFetch, id: string, decisionNotes?: string) {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/status`, {
    status: "rejected",
    ...(decisionNotes && { decisionNotes }),
  });
}

export function deferApplication(apiFetch: ApiFetch, id: string, decisionNotes?: string) {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/status`, {
    status: "deferred",
    ...(decisionNotes && { decisionNotes }),
  });
}

export function offerStand(
  apiFetch: ApiFetch,
  id: string,
  data: { allocatedStandId: string; offerNote?: string },
) {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/status`, {
    status:           "stand_offered",
    allocatedStandId: data.allocatedStandId,
    ...(data.offerNote && { decisionNotes: data.offerNote }),
  });
}

export function markActive(apiFetch: ApiFetch, id: string) {
  return apiPatch(apiFetch, `/api/v1/applications/${id}/status`, { status: "active" });
}

export function withdrawApplication(apiFetch: ApiFetch, id: string) {
  return apiPost(apiFetch, `/api/v1/applications/${id}/withdraw`);
}

export interface IssuePTOResult { id: string; }

export async function issuePTO(apiFetch: ApiFetch, id: string): Promise<IssuePTOResult> {
  const res = await apiFetch(`/api/v1/applications/${id}/issue-pto`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<IssuePTOResult>;
}

export type UploadDocumentType = "id_document" | "proof_of_residence" | "affidavit" | "photo" | "stand_photo" | "other";

export async function uploadApplicationDocument(
  apiFetch: ApiFetch,
  appId: string,
  file: File,
  documentType: UploadDocumentType,
): Promise<ApplicationDocument> {
  const form = new FormData();
  form.append("file", file);
  const uploadRes = await apiFetch("/api/v1/documents", { method: "POST", body: form });
  if (!uploadRes.ok) {
    const data = (await uploadRes.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `Upload failed: HTTP ${uploadRes.status}`);
  }
  const { s3Key } = (await uploadRes.json()) as { s3Key: string };
  const linkRes = await apiFetch(`/api/v1/applications/${appId}/documents`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ s3Key, documentType }),
  });
  if (!linkRes.ok) {
    const data = (await linkRes.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `Failed to link document: HTTP ${linkRes.status}`);
  }
  return linkRes.json() as Promise<ApplicationDocument>;
}

export async function uploadStandPhoto(apiFetch: ApiFetch, appId: string, file: File): Promise<void> {
  await uploadApplicationDocument(apiFetch, appId, file, "stand_photo");
}
