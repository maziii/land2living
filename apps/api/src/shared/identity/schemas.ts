import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Tenant the user is logging in to — determines which role JWT carries.
  tenantSlug: z.string().regex(/^[a-z][a-z0-9_]*$/, "Invalid tenant slug"),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const mfaChallengeSchema = z
  .object({
    challengeToken: z.string().min(1),
    code: z.string().length(6).regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().min(1).optional(),
  })
  .refine((d) => d.code !== undefined || d.recoveryCode !== undefined, {
    message: "Either code or recoveryCode is required",
  });

export const mfaVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, "TOTP code must be exactly 6 digits"),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/, "TOTP code must be exactly 6 digits"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().regex(/^[a-z][a-z0-9_]*$/, "Invalid tenant slug"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const selfRegisterSchema = z.object({
  email:              z.string().email(),
  password:           z.string().min(8, "Password must be at least 8 characters"),
  tenantSlug:         z.string().regex(/^[a-z][a-z0-9_]*$/, "Invalid tenant slug"),
  firstName:          z.string().min(1).max(100),
  lastName:           z.string().min(1).max(100),
  phoneNumber:        z.string().min(7).max(20),
  languagePreference: z.string().min(1).max(50),
  idNumber:           z.string().min(1).max(20).optional(),
  consentPopia:       z.literal(true, { errorMap: () => ({ message: "POPIA consent is required" }) }),
  consentTerms:       z.literal(true, { errorMap: () => ({ message: "Terms consent is required" }) }),
});

export type SelfRegisterRequest = z.infer<typeof selfRegisterSchema>;

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type MfaChallengeRequest = z.infer<typeof mfaChallengeSchema>;
export type MfaVerifyRequest = z.infer<typeof mfaVerifySchema>;
export type MfaDisableRequest = z.infer<typeof mfaDisableSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
