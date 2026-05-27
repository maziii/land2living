import { apiFetch } from "./client.js";

export type ApplicationType = "new_stand" | "additional_stand" | "regularisation";
export type ApplicationStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "deferred"
  | "withdrawn";

export interface Application {
  id: string;
  createdAt: string;
  updatedAt: string;
  applicantResidentId: string;
  applicationType: ApplicationType;
  requestedLocationDescription: string;
  requestedSizeSquareMetres: number | null;
  householdSize: number;
  reason: string;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  allocatedStandId: string | null;
  ptoId: string | null;
}

export interface ApplicationListResponse {
  applications: Application[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchMyApplications(applicantResidentId: string): Promise<ApplicationListResponse> {
  return apiFetch<ApplicationListResponse>(
    `/applications?applicantResidentId=${encodeURIComponent(applicantResidentId)}&pageSize=50`,
  );
}

export async function submitApplication(data: {
  applicantResidentId: string;
  applicationType: ApplicationType;
  requestedLocationDescription: string;
  requestedSizeSquareMetres?: number;
  householdSize: number;
  reason: string;
}): Promise<Application> {
  return apiFetch<Application>("/applications", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
