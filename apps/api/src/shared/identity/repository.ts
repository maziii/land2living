import type {
  MfaRecoveryCode,
  PasswordResetToken,
  RefreshToken,
  Role,
  TenantMembership,
  User,
} from "@prisma/client";
import { getPublicPrismaClient } from "../database/index.js";

function db() {
  return getPublicPrismaClient();
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return db().user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<User | null> {
  return db().user.findUnique({ where: { id } });
}

export async function findMembership(
  userId: string,
  tenantSlug: string,
): Promise<TenantMembership | null> {
  return db().tenantMembership.findUnique({
    where: { userId_tenantSlug: { userId, tenantSlug } },
  });
}

export async function storeRefreshToken(
  tokenHash: string,
  userId: string,
  expiresAt: Date,
): Promise<void> {
  await db().refreshToken.create({ data: { tokenHash, userId, expiresAt } });
}

export async function findRefreshToken(
  tokenHash: string,
): Promise<RefreshToken | null> {
  return db().refreshToken.findUnique({ where: { tokenHash } });
}

export async function revokeRefreshToken(id: string): Promise<void> {
  await db().refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await db().refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function updateUserMfa(
  userId: string,
  data: { mfaSecret?: string | null; mfaEnabled?: boolean },
): Promise<void> {
  await db().user.update({ where: { id: userId }, data });
}

export async function deleteRecoveryCodes(userId: string): Promise<void> {
  await db().mfaRecoveryCode.deleteMany({ where: { userId } });
}

export async function createRecoveryCodes(
  userId: string,
  codeHashes: string[],
): Promise<void> {
  await db().mfaRecoveryCode.createMany({
    data: codeHashes.map((codeHash) => ({ userId, codeHash })),
  });
}

export async function findUnusedRecoveryCode(
  userId: string,
  codeHash: string,
): Promise<MfaRecoveryCode | null> {
  return db().mfaRecoveryCode.findFirst({
    where: { userId, codeHash, usedAt: null },
  });
}

export async function markRecoveryCodeUsed(id: string): Promise<void> {
  await db().mfaRecoveryCode.update({ where: { id }, data: { usedAt: new Date() } });
}

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  tenantSlug: string,
  expiresAt: Date,
): Promise<void> {
  await db().passwordResetToken.create({ data: { userId, tokenHash, tenantSlug, expiresAt } });
}

export async function findPasswordResetToken(
  tokenHash: string,
): Promise<PasswordResetToken | null> {
  return db().passwordResetToken.findUnique({ where: { tokenHash } });
}

export async function markPasswordResetTokenUsed(id: string): Promise<void> {
  await db().passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await db().user.update({ where: { id: userId }, data: { passwordHash } });
}

// Used in tests and seeding only — never exposed via API.
export async function createUser(data: {
  email: string;
  passwordHash: string;
}): Promise<User> {
  return db().user.create({ data });
}

export async function createMembership(data: {
  userId: string;
  tenantSlug: string;
  role: Role;
}): Promise<TenantMembership> {
  return db().tenantMembership.create({ data });
}
