import { createHash, randomBytes } from "crypto";
import argon2 from "argon2";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import type { JwtPayload } from "./types.js";
import * as repo from "./repository.js";
import { encryptIdNumber } from "../crypto/id-encryption.js";
import { createResident, findResidentByUserId } from "../../modules/register/residents/repository.js";
import type { Resident } from "../../modules/register/residents/repository.js";
import type { TenantContext } from "../database/tenant-context.js";
import { sendPasswordResetEmail } from "../notifications/email.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function hashRecoveryCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

const REFRESH_TOKEN_TTL_DAYS = 30;
const MFA_RECOVERY_CODE_COUNT = 8;
const APP_NAME = "L2L";

// ── Credential validation ─────────────────────────────────────────────────────

export async function validateCredentials(
  email: string,
  password: string,
  tenantSlug: string,
): Promise<JwtPayload & { mfaEnabled: boolean }> {
  const GENERIC_ERROR = new AuthError("Invalid credentials");

  const user = await repo.findUserByEmail(email);
  if (!user) {
    await argon2.hash("dummy-prevent-timing-attack");
    throw GENERIC_ERROR;
  }

  const passwordValid = await argon2.verify(user.passwordHash, password);
  if (!passwordValid) throw GENERIC_ERROR;

  const membership = await repo.findMembership(user.id, tenantSlug);
  if (!membership) throw GENERIC_ERROR;

  return { userId: user.id, tenantSlug, role: membership.role, mfaEnabled: user.mfaEnabled };
}

// ── Refresh token lifecycle ───────────────────────────────────────────────────

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateRawToken();
  const hash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await repo.storeRefreshToken(hash, userId, expiresAt);
  return raw;
}

export async function rotateRefreshTokenForTenant(
  rawToken: string,
  tenantSlug: string,
): Promise<{ payload: JwtPayload; newRefreshToken: string }> {
  const hash = hashRefreshToken(rawToken);
  const record = await repo.findRefreshToken(hash);

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AuthError("Invalid or expired refresh token");
  }

  await repo.revokeRefreshToken(record.id);

  const membership = await repo.findMembership(record.userId, tenantSlug);
  if (!membership) throw new AuthError("Invalid or expired refresh token");

  const payload: JwtPayload = { userId: record.userId, tenantSlug, role: membership.role };
  const newRefreshToken = await issueRefreshToken(record.userId);
  return { payload, newRefreshToken };
}

export async function revokeToken(rawToken: string): Promise<void> {
  const hash = hashRefreshToken(rawToken);
  const record = await repo.findRefreshToken(hash);
  if (record && !record.revokedAt) {
    await repo.revokeRefreshToken(record.id);
  }
}

// ── MFA setup ─────────────────────────────────────────────────────────────────

export async function setupMfa(userId: string): Promise<{
  totpUri: string;
  qrCodeDataUri: string;
  recoveryCodes: string[];
}> {
  const user = await repo.findUserById(userId);
  if (!user) throw new AuthError("User not found");

  const generated = speakeasy.generateSecret({ name: user.email, issuer: APP_NAME, length: 20 });
  const secret = generated.base32;
  const totpUri = generated.otpauth_url ?? `otpauth://totp/${APP_NAME}:${user.email}?secret=${secret}&issuer=${APP_NAME}`;
  const qrCodeDataUri = await QRCode.toDataURL(totpUri);

  const rawCodes = Array.from({ length: MFA_RECOVERY_CODE_COUNT }, () =>
    randomBytes(16).toString("hex"),
  );
  const codeHashes = rawCodes.map(hashRecoveryCode);

  await repo.updateUserMfa(userId, { mfaSecret: secret, mfaEnabled: false });
  await repo.deleteRecoveryCodes(userId);
  await repo.createRecoveryCodes(userId, codeHashes);

  return { totpUri, qrCodeDataUri, recoveryCodes: rawCodes };
}

// ── MFA verify (confirm setup) ────────────────────────────────────────────────

export async function verifyMfaSetup(userId: string, code: string): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user?.mfaSecret) throw new AuthError("MFA setup has not been initiated");

  const valid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: "base32", token: code });
  if (!valid) throw new AuthError("Invalid TOTP code");

  await repo.updateUserMfa(userId, { mfaEnabled: true });
}

// ── MFA challenge (complete login) ────────────────────────────────────────────

export async function completeMfaChallenge(
  userId: string,
  code: string | null,
  recoveryCode: string | null,
): Promise<boolean> {
  const user = await repo.findUserById(userId);
  if (!user?.mfaEnabled || !user.mfaSecret) throw new AuthError("MFA is not enabled");

  if (code !== null) {
    return speakeasy.totp.verify({ secret: user.mfaSecret, encoding: "base32", token: code });
  }

  if (recoveryCode !== null) {
    const hash = hashRecoveryCode(recoveryCode);
    const record = await repo.findUnusedRecoveryCode(userId, hash);
    if (!record) return false;
    await repo.markRecoveryCodeUsed(record.id);
    return true;
  }

  return false;
}

// ── MFA disable ───────────────────────────────────────────────────────────────

export async function disableMfa(
  userId: string,
  password: string,
  code: string,
): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user) throw new AuthError("User not found");
  if (!user.mfaEnabled || !user.mfaSecret) throw new AuthError("MFA is not enabled");

  const passwordValid = await argon2.verify(user.passwordHash, password);
  if (!passwordValid) throw new AuthError("Invalid credentials");

  const totpValid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: "base32", token: code });
  if (!totpValid) throw new AuthError("Invalid TOTP code");

  await repo.updateUserMfa(userId, { mfaEnabled: false, mfaSecret: null });
  await repo.deleteRecoveryCodes(userId);
}

// ── Self-service resident registration ───────────────────────────────────────

export interface SelfRegisterResult {
  userId: string;
  residentId: string;
  tenantSlug: string;
}

export async function selfRegister(
  ctx: TenantContext,
  data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    languagePreference: string;
    idNumber?: string;
  },
): Promise<SelfRegisterResult> {
  const existing = await repo.findUserByEmail(data.email);
  if (existing) throw new AuthError("An account with this email already exists", 403);

  const passwordHash = await hashPassword(data.password);
  const user = await repo.createUser({ email: data.email, passwordHash });

  await repo.createMembership({ userId: user.id, tenantSlug: ctx.slug, role: "resident" });

  let resident: Resident;
  try {
    resident = await createResident(ctx, {
      encryptedIdNumber: encryptIdNumber(data.idNumber ?? ""),
      firstName:         data.firstName,
      lastName:          data.lastName,
      phoneNumber:       data.phoneNumber,
      languagePreference: data.languagePreference,
      consentDataCapture: true,
      consentMarketing:   false,
      capturedByUserId:   user.id,
      userId:             user.id,
    });
  } catch (err) {
    // Clean up the user and membership if resident creation fails
    await repo.revokeAllUserRefreshTokens(user.id).catch(() => undefined);
    throw err;
  }

  return { userId: user.id, residentId: resident.id, tenantSlug: ctx.slug };
}

export async function getResidentForUser(
  ctx: TenantContext,
  userId: string,
): Promise<Resident | null> {
  return findResidentByUserId(ctx, userId);
}

// ── Password hashing ──────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

// ── Password reset ────────────────────────────────────────────────────────────

const PASSWORD_RESET_TTL_HOURS = 1;

export async function requestPasswordReset(
  email: string,
  tenantSlug: string,
): Promise<void> {
  const user = await repo.findUserByEmail(email);
  // Return silently regardless — never reveal if email exists (enumeration prevention).
  if (!user) return;

  const membership = await repo.findMembership(user.id, tenantSlug);
  if (!membership) return;

  const rawToken = generateRawToken();
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000);

  await repo.createPasswordResetToken(user.id, tokenHash, tenantSlug, expiresAt);

  const appUrl = process.env["APP_URL"] ?? "http://localhost:3001";
  const resetLink = `${appUrl}/reset-password?token=${rawToken}&tenant=${tenantSlug}`;
  await sendPasswordResetEmail(user.email, resetLink);
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const record = await repo.findPasswordResetToken(tokenHash);

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AuthError("Invalid or expired password reset token");
  }

  const newPasswordHash = await hashPassword(newPassword);
  await repo.updateUserPassword(record.userId, newPasswordHash);
  await repo.markPasswordResetTokenUsed(record.id);
  await repo.revokeAllUserRefreshTokens(record.userId);
}
