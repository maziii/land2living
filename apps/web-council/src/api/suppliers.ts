export interface BasketItem {
  description: string;
  quantity: number;
  unit?: string;
  specNotes?: string;
}

export interface QuoteRequestSummary {
  id: string;
  createdAt: string;
  tenantSlug: string;
  requestedByUserId: string;
  basket: BasketItem[];
  dispatchedToSupplierIds: string[];
  status: string;
  responseCount: number;
}

export interface QuoteResponseItem {
  id: string;
  createdAt: string;
  requestId: string;
  supplierId: string;
  supplierName: string;
  receivedVia: string;
  quoteAmountZar: number | null;
  availability: string | null;
  leadTimeDays: number | null;
  rawResponseText: string | null;
}

export interface QuoteResponseListResponse {
  requestId: string;
  status: string;
  responses: QuoteResponseItem[];
}

export interface QuoteRequestListResponse {
  requests: QuoteRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaleSummary {
  id: string;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  quoteRequestId: string | null;
  tenantSlug: string;
  fulfilledAmountZar: number;
  commissionAmountZar: number;
  commissionRateBasisPoints: number;
  status: string;
  invoicedAt: string | null;
  paidAt: string | null;
}

export interface SaleListResponse {
  sales: SaleSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalCommissionOwed: number;
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function fetchQuoteRequests(
  apiFetch: ApiFetch,
  params: { page?: number; status?: string },
): Promise<QuoteRequestListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.status) qs.set("status", params.status);
  const res = await apiFetch(`/api/v1/suppliers/quote-requests?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<QuoteRequestListResponse>;
}

export async function fetchQuoteResponses(
  apiFetch: ApiFetch,
  requestId: string,
): Promise<QuoteResponseListResponse> {
  const res = await apiFetch(`/api/v1/suppliers/quote-requests/${requestId}/responses`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<QuoteResponseListResponse>;
}

export async function createQuoteRequest(
  apiFetch: ApiFetch,
  payload: { supplierIds: string[]; basket: BasketItem[]; responseDeadlineDays?: number },
): Promise<QuoteRequestSummary> {
  const res = await apiFetch("/api/v1/suppliers/quote-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<QuoteRequestSummary>;
}

export async function submitManualResponse(
  apiFetch: ApiFetch,
  requestId: string,
  payload: {
    supplierId: string;
    quoteAmountZar?: number;
    availability?: string;
    leadTimeDays?: number;
    notes?: string;
  },
): Promise<QuoteResponseItem> {
  const res = await apiFetch(`/api/v1/suppliers/quote-requests/${requestId}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<QuoteResponseItem>;
}

export async function selectSupplier(
  apiFetch: ApiFetch,
  requestId: string,
  payload: { supplierId: string; responseId: string },
): Promise<QuoteResponseListResponse> {
  const res = await apiFetch(`/api/v1/suppliers/quote-requests/${requestId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<QuoteResponseListResponse>;
}

export async function fetchSales(
  apiFetch: ApiFetch,
  params: { page?: number; status?: string; supplierId?: string },
): Promise<SaleListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.status) qs.set("status", params.status);
  if (params.supplierId) qs.set("supplierId", params.supplierId);
  const res = await apiFetch(`/api/v1/suppliers/sales?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SaleListResponse>;
}

export async function generateInvoice(apiFetch: ApiFetch, saleId: string): Promise<SaleSummary> {
  const res = await apiFetch(`/api/v1/suppliers/sales/${saleId}/invoice`, { method: "POST" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<SaleSummary>;
}

export async function recordPayment(apiFetch: ApiFetch, saleId: string): Promise<SaleSummary> {
  const res = await apiFetch(`/api/v1/suppliers/sales/${saleId}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<SaleSummary>;
}
