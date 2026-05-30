export interface PTOResponse {
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
  status: "active" | "superseded";
}

export interface PTOListResponse {
  ptos: PTOResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PTOVerifyResult {
  valid: boolean;
  ptoId?: string;
  residentId?: string;
  standId?: string;
  issuedAt?: string;
  reason?: string;
}

export interface PTOHistoryEntry extends PTOResponse {
  transferType: "initial" | "transfer" | "revocation";
}
