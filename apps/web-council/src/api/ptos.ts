export type PTOStatus = "active" | "superseded";

export interface PTOSummary {
  id: string;
  createdAt: string;
  supersededAt: string | null;
  supersededByPtoId: string | null;
  applicationId: string;
  residentId: string;
  residentName: string;
  standId: string;
  standAddress: string;
  standRef: string | null;
  standVillage: string;
  issuedByUserId: string;
  signedPayloadJson: Record<string, unknown>;
  signatureBase64: string;
  pdfDocumentId: string | null;
  verificationUrl: string;
  status: PTOStatus;
}

export interface PTOHistoryEntry extends PTOSummary {
  transferType: "initial" | "transfer" | "revocation";
}

export interface PTOListResponse {
  ptos: PTOSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListPTOsParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: "active" | "superseded" | "all" | undefined;
  residentId?: string | undefined;
  standId?: string | undefined;
  village?: string | undefined;
}

type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listPTOs(apiFetch: ApiFetch, params: ListPTOsParams = {}): Promise<PTOListResponse> {
  const qs = new URLSearchParams();
  if (params.page)       qs.set("page", String(params.page));
  if (params.pageSize)   qs.set("pageSize", String(params.pageSize));
  if (params.search)     qs.set("search", params.search);
  if (params.status)     qs.set("status", params.status);
  if (params.residentId) qs.set("residentId", params.residentId);
  if (params.standId)    qs.set("standId", params.standId);
  if (params.village)    qs.set("village", params.village);
  return json(await apiFetch(`/api/v1/ptos?${qs.toString()}`));
}

export async function getPTO(apiFetch: ApiFetch, id: string): Promise<PTOSummary> {
  return json(await apiFetch(`/api/v1/ptos/${id}`));
}

export async function getPTOHistory(apiFetch: ApiFetch, id: string): Promise<PTOHistoryEntry[]> {
  return json(await apiFetch(`/api/v1/ptos/${id}/history`));
}

export async function revokePTO(apiFetch: ApiFetch, id: string, reason: string): Promise<PTOSummary> {
  return json(await apiFetch(`/api/v1/ptos/${id}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  }));
}

export async function openPTOPDF(apiFetch: ApiFetch, id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/ptos/${id}/pdf`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `PDF unavailable: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
