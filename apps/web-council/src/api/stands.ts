export const STAND_TYPES = ["residential", "business", "farming", "community"] as const;
export type StandType = (typeof STAND_TYPES)[number];

export const STAND_TYPE_LABEL: Record<StandType, string> = {
  residential: "Residential",
  business:    "Business",
  farming:     "Farming",
  community:   "Community",
};

export interface StandSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  localReference: string | null;
  gpsLatitude: number;
  gpsLongitude: number;
  addressDescription: string;
  villageOrSection: string;
  areaSquareMetres: number | null;
  standType: string | null;
  photoS3Keys: string[];
  photoUrls: string[];
  priceZar: number | null;
  notes: string | null;
}

export interface OccupantSummary {
  occupancyId: string;
  residentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  startedAt: string;
  endedAt: string | null;
  ptoId: string | null;
}

export interface StandDetail extends StandSummary {
  boundaryGeojson: unknown | null;
  occupants: OccupantSummary[];
}

export interface StandListResponse {
  stands: StandSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchStandVillages(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<string[]> {
  const res = await apiFetch("/api/v1/stands/villages");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { villages: string[] };
  return data.villages;
}

export async function fetchStands(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  params: { page?: number; pageSize?: number; villageOrSection?: string; search?: string; availableOnly?: boolean },
): Promise<StandListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.villageOrSection) qs.set("villageOrSection", params.villageOrSection);
  if (params.search) qs.set("search", params.search);
  if (params.availableOnly) qs.set("availableOnly", "true");

  const res = await apiFetch(`/api/v1/stands?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<StandListResponse>;
}

export async function fetchStand(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  id: string,
): Promise<StandDetail> {
  const res = await apiFetch(`/api/v1/stands/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<StandDetail>;
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function createStand(
  apiFetch: ApiFetch,
  data: {
    addressDescription: string;
    villageOrSection: string;
    gpsLatitude: number;
    gpsLongitude: number;
    standType?: string;
    areaSquareMetres?: number;
    localReference?: string;
    photoS3Keys?: string[];
    priceZar?: number;
    notes?: string;
  },
): Promise<StandSummary> {
  const res = await apiFetch("/api/v1/stands", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<StandSummary>;
}

export async function updateStand(
  apiFetch: ApiFetch,
  id: string,
  data: Partial<StandSummary>,
): Promise<StandSummary> {
  const res = await apiFetch(`/api/v1/stands/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<StandSummary>;
}

export async function uploadStandPhoto(apiFetch: ApiFetch, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", "stand_photo");
  const res = await apiFetch("/api/v1/documents", { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Upload failed: HTTP ${res.status}`);
  }
  const doc = (await res.json()) as { s3Key: string };
  return doc.s3Key;
}
