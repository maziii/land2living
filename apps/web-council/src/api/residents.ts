import { useAuth } from "../context/auth.js";

export interface ResidentSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  languagePreference: string;
  verificationStatus: string;
  capturedByUserId: string;
}

export interface ResidentDetail extends ResidentSummary {
  otherNames: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  whatsappNumber: string | null;
  consentDataCapture: boolean;
  consentMarketing: boolean;
  notes: string | null;
}

export interface ResidentListResponse {
  residents: ResidentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OccupancyWithStand {
  id: string;
  standId: string;
  relationship: string;
  endedAt: string | null;
  stand: {
    id: string;
    addressDescription: string;
    villageOrSection: string;
    localReference: string | null;
  };
}

export async function fetchResidents(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  params: { page?: number; pageSize?: number; search?: string; verificationStatus?: string },
): Promise<ResidentListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.search) qs.set("search", params.search);
  if (params.verificationStatus) qs.set("verificationStatus", params.verificationStatus);

  const res = await apiFetch(`/api/v1/residents?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ResidentListResponse>;
}

export async function fetchResident(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  id: string,
  unmaskId = false,
): Promise<ResidentDetail> {
  const res = await apiFetch(`/api/v1/residents/${id}${unmaskId ? "?unmask_id=true" : ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ResidentDetail>;
}

export async function fetchResidentStands(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  residentId: string,
): Promise<{ stands: OccupancyWithStand[] }> {
  const res = await apiFetch(`/api/v1/residents/${residentId}/stands`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ stands: OccupancyWithStand[] }>;
}

export async function fetchResidentMe(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<ResidentDetail> {
  const res = await apiFetch("/api/v1/residents/me");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ResidentDetail>;
}

export async function updateResident(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  id: string,
  data: Partial<ResidentDetail>,
): Promise<ResidentDetail> {
  const res = await apiFetch(`/api/v1/residents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ResidentDetail>;
}
