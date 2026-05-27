export const DocumentType = {
  PTO: "pto",
  APPLICATION: "application",
  RESALE_LISTING: "resale_listing",
  ID_DOC: "id_doc",
  OTHER: "other",
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];
