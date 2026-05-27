export interface PTOResponse {
  id: string;
  createdAt: string;
  supersededAt: string | null;
  supersededByPtoId: string | null;
  applicationId: string;
  residentId: string;
  standId: string;
  issuedByUserId: string;
  signedPayloadJson: Record<string, unknown>;
  signatureBase64: string;
  pdfDocumentId: string | null;
  verificationUrl: string;
}

export interface PTOVerifyResult {
  valid: boolean;
  ptoId?: string;
  residentId?: string;
  standId?: string;
  issuedAt?: string;
  reason?: string;
}
