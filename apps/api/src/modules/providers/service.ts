import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { recordPlatformAuditEvent } from "../../shared/audit/platform.js";
import * as repo from "./repository.js";
import type { ServiceProvider } from "./repository.js";
import type { RegisterProviderRequest, UpdateVerificationRequest, ListProvidersQuery } from "./schemas.js";
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

export async function listProviders(query: ListProvidersQuery): Promise<ProviderListResponse> {
  const { providers, total } = await repo.listProviders(query);
  return { providers: providers.map(toResponse), total, page: query.page, pageSize: query.pageSize };
}
