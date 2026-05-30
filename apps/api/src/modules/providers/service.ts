import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { recordPlatformAuditEvent } from "../../shared/audit/platform.js";
import * as repo from "./repository.js";
import type { ServiceProvider } from "./repository.js";
import * as identityRepo from "../../shared/identity/repository.js";
import { hashPassword, issueRefreshToken } from "../../shared/identity/service.js";
import type {
  RegisterProviderRequest,
  UpdateVerificationRequest,
  ListProvidersQuery,
  UpdateProviderProfileRequest,
  ProviderSelfRegisterRequest,
} from "./schemas.js";
import type { ProviderResponse, ProviderListResponse } from "./types.js";

const ENTITY = "service_provider";

export class ProvidersError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ProvidersError";
  }
}

function encryptBankDetails(details: object): object {
  const key = Buffer.from(process.env["BANK_DETAILS_ENCRYPTION_KEY"] ?? "0".repeat(64), "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    data: encrypted.toString("hex"),
    tag: authTag.toString("hex"),
  };
}

function toResponse(p: ServiceProvider): ProviderResponse {
  return {
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    businessName: p.businessName,
    cipcNumber: p.cipcNumber,
    vatNumber: p.vatNumber,
    primaryContactUserId: p.primaryContactUserId,
    categories: p.categories as ProviderResponse["categories"],
    geographicCoverage: p.geographicCoverage,
    verificationStatus: p.verificationStatus as ProviderResponse["verificationStatus"],
    createdByUserId: p.createdByUserId,
  };
}

export async function registerProvider(
  data: RegisterProviderRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ProviderResponse> {
  const bankDetailsEncrypted = data.bankDetails ? encryptBankDetails(data.bankDetails) : undefined;

  const provider = await repo.createProvider({
    businessName: data.businessName,
    ...(data.cipcNumber !== undefined && { cipcNumber: data.cipcNumber }),
    ...(data.vatNumber !== undefined && { vatNumber: data.vatNumber }),
    primaryContactUserId: actor.userId,
    categories: data.categories,
    geographicCoverage: data.geographicCoverage,
    ...(bankDetailsEncrypted !== undefined && { bankDetailsEncrypted }),
    createdByUserId: actor.userId,
  });

  void recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "providers.registered",
    entityType: ENTITY,
    entityId: provider.id,
    payloadJson: { businessName: data.businessName, categories: data.categories },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(provider);
}

export async function updateVerification(
  id: string,
  data: UpdateVerificationRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ProviderResponse> {
  const updated = await repo.updateProvider(id, { verificationStatus: data.status });
  if (!updated) throw new ProvidersError("Provider not found", 404);

  void recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "providers.verification_updated",
    entityType: ENTITY,
    entityId: id,
    payloadJson: { status: data.status },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function getProvider(id: string): Promise<ProviderResponse | null> {
  const p = await repo.findProvider(id);
  return p ? toResponse(p) : null;
}

export async function getMyProvider(userId: string): Promise<ProviderResponse | null> {
  const p = await repo.findProviderByContactUserId(userId);
  return p ? toResponse(p) : null;
}

export async function listProviders(query: ListProvidersQuery): Promise<ProviderListResponse> {
  const { providers, total } = await repo.listProviders(query);
  return { providers: providers.map(toResponse), total, page: query.page, pageSize: query.pageSize };
}

export async function updateProviderProfile(
  id: string,
  data: UpdateProviderProfileRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ProviderResponse> {
  const existing = await repo.findProvider(id);
  if (!existing) throw new ProvidersError("Provider not found", 404);

  // Providers can only update their own profile; founders can update any
  if (actor.role === "provider" && existing.primaryContactUserId !== actor.userId) {
    throw new ProvidersError("Forbidden", 403);
  }

  const updated = await repo.updateProvider(id, {
    ...(data.businessName       !== undefined && { businessName: data.businessName }),
    ...(data.cipcNumber         !== undefined && { cipcNumber: data.cipcNumber }),
    ...(data.vatNumber          !== undefined && { vatNumber: data.vatNumber }),
    ...(data.categories         !== undefined && { categories: data.categories }),
    ...(data.geographicCoverage !== undefined && { geographicCoverage: data.geographicCoverage }),
  });
  if (!updated) throw new ProvidersError("Provider not found", 404);

  void recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "providers.profile_updated",
    entityType: ENTITY,
    entityId: id,
    payloadJson: data,
    ...(actor.ip       !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function selfRegisterProvider(
  data: ProviderSelfRegisterRequest,
): Promise<{ accessToken: string; providerId: string; userId: string; tenantSlug: string }> {
  const existing = await identityRepo.findUserByEmail(data.email);
  if (existing) throw new ProvidersError("An account with this email already exists", 409);

  const passwordHash = await hashPassword(data.password);
  const user = await identityRepo.createUser({ email: data.email, passwordHash });
  await identityRepo.createMembership({ userId: user.id, tenantSlug: data.tenantSlug, role: "provider" });

  const provider = await repo.createProvider({
    businessName:        data.businessName,
    ...(data.cipcNumber !== undefined && { cipcNumber: data.cipcNumber }),
    ...(data.vatNumber  !== undefined && { vatNumber: data.vatNumber }),
    primaryContactUserId: user.id,
    categories:          data.categories,
    geographicCoverage:  data.geographicCoverage,
    createdByUserId:     user.id,
  });

  return { accessToken: user.id, providerId: provider.id, userId: user.id, tenantSlug: data.tenantSlug };
}
