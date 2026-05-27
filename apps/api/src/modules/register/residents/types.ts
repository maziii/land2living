export interface ResidentResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  idNumber: string; // masked (*******XXXXXX), partially masked, or plaintext depending on call site
  firstName: string;
  lastName: string;
  otherNames: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  phoneNumber: string;
  whatsappNumber: string | null;
  languagePreference: string;
  consentDataCapture: boolean;
  consentMarketing: boolean;
  notes: string | null;
  capturedByUserId: string;
  verificationStatus: string;
}

export interface ResidentListResponse {
  residents: ResidentResponse[];
  total: number;
  page: number;
  pageSize: number;
}
