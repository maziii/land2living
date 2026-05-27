export interface QuoteRequestResponse {
  id: string;
  createdAt: string;
  tenantSlug: string;
  requestedByUserId: string;
  basket: Array<{ description: string; quantity: number; unit?: string; specNotes?: string }>;
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

export interface QuoteRequestListResponse {
  requests: QuoteRequestResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QuoteResponseListResponse {
  requestId: string;
  status: string;
  responses: QuoteResponseItem[];
}
