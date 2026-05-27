import { z } from "zod";

export const AUTHORITY_TYPES = [
  "traditional_council",
  "municipality",
  "cpa",
  "private_development",
] as const;

export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

export const AUTHORITY_TYPE_LABELS: Record<AuthorityType, string> = {
  traditional_council: "Traditional Council",
  municipality:        "Municipality",
  cpa:                 "Communal Property Association (CPA)",
  private_development: "Private Development",
};

export const authorityQuerySchema = z.object({
  provinceId: z.string().optional(),
  type:       z.enum(AUTHORITY_TYPES).optional(),
});

export const villageQuerySchema = z.object({
  authorityId: z.string().min(1),
});

export type AuthorityQuery = z.infer<typeof authorityQuerySchema>;
export type VillageQuery   = z.infer<typeof villageQuerySchema>;
