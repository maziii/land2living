import {
  encryptIdNumber,
  decryptIdNumber,
  maskIdNumber,
} from "../../../shared/crypto/id-encryption.js";
import { recordAuditEvent, recordPiiAccess } from "../../../shared/audit/service.js";
import { AuditEventType } from "../../../shared/audit/types.js";
import { parseCsv } from "../../../shared/csv/parse.js";
import type { TenantContext } from "../../../shared/database/tenant-context.js";
import * as repo from "./repository.js";
import type { Resident } from "./repository.js";
import {
  createResidentSchema,
  type CreateResidentRequest,
  type UpdateResidentRequest,
  type ListResidentQuery,
} from "./schemas.js";
import type { ResidentResponse, ResidentListResponse } from "./types.js";

const ENTITY_TYPE = "resident";

type MaskMode = "full" | "partial" | "none";

function toResponse(resident: Resident, maskMode: MaskMode): ResidentResponse {
  let idNumber: string;
  if (maskMode === "full") {
    idNumber = "*".repeat(13);
  } else {
    const plain = decryptIdNumber(resident.idNumber);
    idNumber = maskMode === "none" ? plain : maskIdNumber(plain);
  }

  return {
    id: resident.id,
    createdAt: resident.createdAt.toISOString(),
    updatedAt: resident.updatedAt.toISOString(),
    idNumber,
    firstName: resident.firstName,
    lastName: resident.lastName,
    otherNames: resident.otherNames,
    dateOfBirth: resident.dateOfBirth
      ? resident.dateOfBirth.toISOString().split("T")[0]!
      : null,
    gender: resident.gender,
    phoneNumber: resident.phoneNumber,
    whatsappNumber: resident.whatsappNumber,
    languagePreference: resident.languagePreference,
    consentDataCapture: resident.consentDataCapture,
    consentMarketing: resident.consentMarketing,
    notes: resident.notes,
    capturedByUserId: resident.capturedByUserId,
    verificationStatus: resident.verificationStatus,
  };
}

export async function createResident(
  ctx: TenantContext,
  data: CreateResidentRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ResidentResponse> {
  const encryptedIdNumber = encryptIdNumber(data.idNumber);
  const resident = await repo.createResident(ctx, {
    encryptedIdNumber,
    firstName: data.firstName,
    lastName: data.lastName,
    ...(data.otherNames !== undefined && { otherNames: data.otherNames }),
    ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth }),
    ...(data.gender !== undefined && { gender: data.gender }),
    phoneNumber: data.phoneNumber,
    ...(data.whatsappNumber !== undefined && { whatsappNumber: data.whatsappNumber }),
    languagePreference: data.languagePreference,
    consentDataCapture: data.consentDataCapture,
    consentMarketing: data.consentMarketing,
    ...(data.notes !== undefined && { notes: data.notes }),
    capturedByUserId: actor.userId,
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.RECORD_CREATED,
    entityType: ENTITY_TYPE,
    entityId: resident.id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(resident, "full");
}

export async function listResidents(
  ctx: TenantContext,
  query: ListResidentQuery,
  _actor: { userId: string; role: string },
): Promise<ResidentListResponse> {
  const { residents, total } = await repo.listResidents(ctx, {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search !== undefined && { search: query.search }),
    ...(query.verificationStatus !== undefined && { verificationStatus: query.verificationStatus }),
  });

  return {
    residents: residents.map((r) => toResponse(r, "full")),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getResident(
  ctx: TenantContext,
  id: string,
  unmaskId: boolean,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ResidentResponse | null> {
  const resident = await repo.findResidentById(ctx, id);
  if (!resident) return null;

  if (unmaskId) {
    await recordPiiAccess(ctx, actor, ENTITY_TYPE, id, {
      ...(actor.ip !== undefined && { ip: actor.ip }),
      ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
    });
  }

  return toResponse(resident, unmaskId ? "none" : "partial");
}

export async function updateResident(
  ctx: TenantContext,
  id: string,
  data: UpdateResidentRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ResidentResponse | null> {
  const updated = await repo.updateResident(ctx, id, data);
  if (!updated) return null;

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.RECORD_UPDATED,
    entityType: ENTITY_TYPE,
    entityId: id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated, "full");
}

export async function deleteResident(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<boolean> {
  const deleted = await repo.softDeleteResident(ctx, id);
  if (!deleted) return false;

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.RECORD_SOFT_DELETED,
    entityType: ENTITY_TYPE,
    entityId: id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return true;
}

// ── Bulk import ───────────────────────────────────────────────────────────────

export interface BulkImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface BulkImportResult {
  importedCount: number;
  errors: BulkImportRowError[];
}

const CSV_REQUIRED = ["id_number", "first_name", "last_name", "phone_number", "language_preference", "village"];

export async function bulkImportResidents(
  ctx: TenantContext,
  csvText: string,
  actor: { userId: string; role: string },
): Promise<BulkImportResult> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { importedCount: 0, errors: [{ row: 0, field: "file", message: "CSV is empty or has no data rows" }] };
  }

  // Pre-flight validation — collect all errors before inserting anything
  const errors: BulkImportRowError[] = [];
  const parsed: (CreateResidentRequest & { villageOrSection: string })[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2; // 1-indexed + header row

    for (const col of CSV_REQUIRED) {
      if (!row[col]) {
        errors.push({ row: rowNum, field: col, message: `Required field "${col}" is missing or empty` });
      }
    }

    const candidate = {
      idNumber: row["id_number"] ?? "",
      firstName: row["first_name"] ?? "",
      lastName: row["last_name"] ?? "",
      phoneNumber: row["phone_number"] ?? "",
      languagePreference: row["language_preference"] ?? "",
      consentDataCapture: true,
      consentMarketing: false,
      ...(row["other_names"] ? { otherNames: row["other_names"] } : {}),
      ...(row["date_of_birth"] ? { dateOfBirth: row["date_of_birth"] } : {}),
      ...(row["gender"] ? { gender: row["gender"] } : {}),
      ...(row["whatsapp_number"] ? { whatsappNumber: row["whatsapp_number"] } : {}),
      ...(row["notes"] ? { notes: row["notes"] } : {}),
    };

    const result = createResidentSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.errors) {
        errors.push({ row: rowNum, field: issue.path.join("."), message: issue.message });
      }
    } else {
      parsed.push({ ...result.data, villageOrSection: row["village"] ?? "" });
    }
  }

  if (errors.length > 0) {
    return { importedCount: 0, errors };
  }

  // All rows valid — insert in single transaction
  const db = (await import("../../../shared/database/index.js")).getPrismaClient(ctx);
  let importedCount = 0;

  await db.$transaction(async (tx) => {
    for (const data of parsed) {
      const encryptedIdNumber = encryptIdNumber(data.idNumber);
      await tx.resident.create({
        data: {
          idNumber: encryptedIdNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          otherNames: data.otherNames ?? null,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          gender: data.gender ?? null,
          phoneNumber: data.phoneNumber,
          whatsappNumber: data.whatsappNumber ?? null,
          languagePreference: data.languagePreference,
          consentDataCapture: true,
          consentMarketing: false,
          notes: data.notes ?? null,
          capturedByUserId: actor.userId,
          verificationStatus: "unverified",
        },
      });
      importedCount++;
    }
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.BULK_IMPORT,
    entityType: ENTITY_TYPE,
    payloadJson: { rowCount: importedCount },
  });

  return { importedCount, errors: [] };
}

export async function getResidentForUser(
  ctx: TenantContext,
  userId: string,
): Promise<ResidentResponse | null> {
  const resident = await repo.findResidentByUserId(ctx, userId);
  if (!resident) return null;
  return toResponse(resident, "partial");
}
