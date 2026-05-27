import { z } from "zod";

function validateSaIdLuhn(id: string): boolean {
  let sum = 0;
  let isEven = false;
  for (let i = id.length - 1; i >= 0; i--) {
    let digit = parseInt(id[i]!, 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

const saIdSchema = z
  .string()
  .regex(/^\d{13}$/, "SA ID number must be exactly 13 digits")
  .refine(validateSaIdLuhn, "SA ID number fails Luhn check");

const e164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g. +27821234567)");

const LANGUAGE_CODES = [
  "nde", "nso", "ts", "tn", "ss", "af", "en", "zu", "xh", "ve", "nr",
] as const;

export const createResidentSchema = z.object({
  idNumber: saIdSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  otherNames: z.string().max(100).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["M", "F", "X"]).optional(),
  phoneNumber: e164PhoneSchema,
  whatsappNumber: e164PhoneSchema.optional(),
  languagePreference: z.enum(LANGUAGE_CODES),
  consentDataCapture: z.boolean(),
  consentMarketing: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});
export type CreateResidentRequest = z.infer<typeof createResidentSchema>;

// ID number is immutable after capture — not included in updates.
export const updateResidentSchema = createResidentSchema.omit({ idNumber: true }).partial();
export type UpdateResidentRequest = z.infer<typeof updateResidentSchema>;

export const listResidentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  verificationStatus: z
    .enum(["unverified", "identity_verified", "council_verified"])
    .optional(),
});
export type ListResidentQuery = z.infer<typeof listResidentQuerySchema>;
