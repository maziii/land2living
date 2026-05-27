import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { createSupplierAdapter } from "../../adapters/supplier-adapter/index.js";
import { recordPlatformAuditEvent } from "../../shared/audit/platform.js";
import * as repo from "./repository.js";
import type {
  CreateQuoteRequestInput,
  SubmitManualResponseInput,
  SelectSupplierInput,
  ListQuoteRequestsQuery,
} from "./schemas.js";
import type {
  QuoteRequestResponse,
  QuoteResponseItem,
  QuoteRequestListResponse,
  QuoteResponseListResponse,
} from "./types.js";
import type { BasketItem } from "../../adapters/supplier-adapter/index.js";
import type { Supplier } from "@prisma/client";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const QUEUE_NAME = "supplier-dispatch";

let _dispatchQueue: Queue | null = null;

function getDispatchQueue(): Queue {
  if (!_dispatchQueue) {
    _dispatchQueue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } });
  }
  return _dispatchQueue;
}

interface DispatchJobData {
  requestId: string;
  supplierId: string;
  tenantSlug: string;
  requestedByUserId: string;
  basket: BasketItem[];
  responseDeadline: string;
}

export class SuppliersError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "SuppliersError";
  }
}

function toRequestResponse(
  req: Awaited<ReturnType<typeof repo.getQuoteRequest>>,
): QuoteRequestResponse {
  if (!req) throw new SuppliersError("Not found", 404);
  const basket = req.basketJson as unknown as BasketItem[];
  return {
    id: req.id,
    createdAt: req.createdAt.toISOString(),
    tenantSlug: req.tenantSlug,
    requestedByUserId: req.requestedByUserId,
    basket,
    dispatchedToSupplierIds: req.dispatchedToSupplierIds,
    status: req.status,
    responseCount: req._count.responses,
  };
}

function toResponseItem(r: Awaited<ReturnType<typeof repo.listQuoteResponses>>[number]): QuoteResponseItem {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    requestId: r.requestId,
    supplierId: r.supplierId,
    supplierName: r.supplier.businessName,
    receivedVia: r.receivedVia,
    quoteAmountZar: r.quoteAmountZar ?? null,
    availability: r.availability ?? null,
    leadTimeDays: r.leadTimeDays ?? null,
    rawResponseText: r.rawResponseText ?? null,
  };
}

export async function createAndDispatchQuoteRequest(
  tenantSlug: string,
  requestedByUserId: string,
  input: CreateQuoteRequestInput,
  actor: { userId: string; role: string },
): Promise<QuoteRequestResponse> {
  const suppliers = await repo.getSuppliersByIds(input.supplierIds);
  if (suppliers.length !== input.supplierIds.length) {
    const foundIds = new Set(suppliers.map((s) => s.id));
    const missing = input.supplierIds.filter((id) => !foundIds.has(id));
    throw new SuppliersError(`Supplier(s) not found: ${missing.join(", ")}`, 404);
  }

  const responseDeadline = new Date();
  responseDeadline.setDate(responseDeadline.getDate() + input.responseDeadlineDays);

  const request = await repo.createQuoteRequest({
    tenantSlug,
    requestedByUserId,
    basketJson: input.basket as unknown as import("@prisma/client").Prisma.InputJsonValue,
    supplierIds: input.supplierIds,
    responseDeadlineDays: input.responseDeadlineDays,
  });

  void recordPlatformAuditEvent({
    eventType: "supplier.quote_request.created",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "SupplierQuoteRequest",
    entityId: request.id,
    tenantSlug,
    payloadJson: { supplierCount: suppliers.length, basketSize: input.basket.length },
  });

  // Enqueue one dispatch job per supplier (non-blocking)
  const queue = getDispatchQueue();
  for (const supplier of suppliers) {
    void queue.add(
      "dispatch",
      {
        requestId: request.id,
        supplierId: supplier.id,
        tenantSlug,
        requestedByUserId,
        basket: input.basket.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          ...(item.unit !== undefined ? { unit: item.unit } : {}),
          ...(item.specNotes !== undefined ? { specNotes: item.specNotes } : {}),
        })),
        responseDeadline: responseDeadline.toISOString(),
      } satisfies DispatchJobData,
      { attempts: 3, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 1000 },
    );
  }

  return {
    id: request.id,
    createdAt: request.createdAt.toISOString(),
    tenantSlug: request.tenantSlug,
    requestedByUserId: request.requestedByUserId,
    basket: input.basket.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      ...(item.unit !== undefined ? { unit: item.unit } : {}),
      ...(item.specNotes !== undefined ? { specNotes: item.specNotes } : {}),
    })),
    dispatchedToSupplierIds: input.supplierIds,
    status: request.status,
    responseCount: 0,
  };
}

export async function getQuoteRequest(id: string): Promise<QuoteRequestResponse | null> {
  const req = await repo.getQuoteRequest(id);
  if (!req) return null;
  return toRequestResponse(req);
}

export async function listQuoteRequests(query: ListQuoteRequestsQuery): Promise<QuoteRequestListResponse> {
  const { requests, total } = await repo.listQuoteRequests({
    page: query.page,
    pageSize: query.pageSize,
    ...(query.tenantSlug !== undefined ? { tenantSlug: query.tenantSlug } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
  });
  return {
    requests: requests.map((r) => toRequestResponse(r)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function recordIncomingResponse(
  supplierId: string,
  requestId: string,
  receivedVia: string,
  payload: unknown,
): Promise<void> {
  const request = await repo.getQuoteRequest(requestId);
  if (!request) {
    void recordPlatformAuditEvent({
      eventType: "supplier.quote_response.rejected",
      entityType: "SupplierQuoteRequest",
      entityId: requestId,
      payloadJson: { reason: "unknown request", supplierId },
    });
    return;
  }

  const suppliers = await repo.getSuppliersByIds([supplierId]);
  const supplier = suppliers[0];
  if (!supplier) return;

  const adapter = createSupplierAdapter(receivedVia);
  const parsed = adapter.parseIncomingResponse(supplier, payload);

  await repo.createQuoteResponse({
    requestId,
    supplierId,
    receivedVia,
    ...(parsed.quoteAmountZar !== undefined ? { quoteAmountZar: parsed.quoteAmountZar } : {}),
    ...(parsed.availability !== undefined ? { availability: parsed.availability } : {}),
    ...(parsed.leadTimeDays !== undefined ? { leadTimeDays: parsed.leadTimeDays } : {}),
    rawResponseText: parsed.rawResponseText,
    parsedResponseJson: parsed.parsedResponseJson as import("@prisma/client").Prisma.InputJsonValue,
  });

  // Move request to "receiving" once first response arrives
  if (request.status === "pending") {
    await repo.updateQuoteRequestStatus(requestId, "receiving");
  }

  void recordPlatformAuditEvent({
    eventType: "supplier.quote_response.received",
    entityType: "SupplierQuoteRequest",
    entityId: requestId,
    payloadJson: { supplierId, receivedVia, quoteAmountZar: parsed.quoteAmountZar },
  });
}

export async function submitManualResponse(
  requestId: string,
  input: SubmitManualResponseInput,
  actor: { userId: string; role: string },
): Promise<QuoteResponseItem> {
  const request = await repo.getQuoteRequest(requestId);
  if (!request) throw new SuppliersError("Quote request not found", 404);

  if (!request.dispatchedToSupplierIds.includes(input.supplierId)) {
    throw new SuppliersError("Supplier was not dispatched on this request", 400);
  }

  const response = await repo.createQuoteResponse({
    requestId,
    supplierId: input.supplierId,
    receivedVia: "manual",
    ...(input.quoteAmountZar !== undefined ? { quoteAmountZar: input.quoteAmountZar } : {}),
    ...(input.availability !== undefined ? { availability: input.availability } : {}),
    ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
    ...(input.notes !== undefined ? { rawResponseText: input.notes } : {}),
    parsedResponseJson: { source: "manual_entry", ...input } as import("@prisma/client").Prisma.InputJsonValue,
  });

  if (request.status === "pending") {
    await repo.updateQuoteRequestStatus(requestId, "receiving");
  }

  void recordPlatformAuditEvent({
    eventType: "supplier.quote_response.manual_entry",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "SupplierQuoteRequest",
    entityId: requestId,
    payloadJson: { supplierId: input.supplierId, quoteAmountZar: input.quoteAmountZar },
  });

  const full = await repo.getResponseById(response.id);
  if (!full) throw new SuppliersError("Response not found after creation", 404);
  return toResponseItem(full);
}

export async function listResponses(requestId: string): Promise<QuoteResponseListResponse> {
  const request = await repo.getQuoteRequest(requestId);
  if (!request) throw new SuppliersError("Quote request not found", 404);

  const responses = await repo.listQuoteResponses(requestId);
  return {
    requestId,
    status: request.status,
    responses: responses.map(toResponseItem),
  };
}

export async function selectSupplier(
  requestId: string,
  input: SelectSupplierInput,
  actor: { userId: string; role: string },
): Promise<QuoteResponseListResponse> {
  const request = await repo.getQuoteRequest(requestId);
  if (!request) throw new SuppliersError("Quote request not found", 404);

  if (request.status === "selected") {
    throw new SuppliersError("A supplier has already been selected for this request", 409);
  }

  const response = await repo.getResponseById(input.responseId);
  if (!response || response.requestId !== requestId) {
    throw new SuppliersError("Response not found on this request", 404);
  }
  if (response.supplierId !== input.supplierId) {
    throw new SuppliersError("Response does not belong to the specified supplier", 400);
  }

  await repo.updateQuoteRequestStatus(requestId, "selected");

  void recordPlatformAuditEvent({
    eventType: "supplier.quote_request.supplier_selected",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "SupplierQuoteRequest",
    entityId: requestId,
    payloadJson: { supplierId: input.supplierId, responseId: input.responseId, quoteAmountZar: response.quoteAmountZar },
  });

  const updated = await repo.getQuoteRequest(requestId);
  const responses = await repo.listQuoteResponses(requestId);
  return {
    requestId,
    status: updated?.status ?? "selected",
    responses: responses.map(toResponseItem),
  };
}

// ── Background worker ─────────────────────────────────────────────────────────

export function startSupplierDispatchWorker(): Worker {
  const worker = new Worker<DispatchJobData>(
    QUEUE_NAME,
    async (job: Job<DispatchJobData>) => {
      const { requestId, supplierId, tenantSlug, requestedByUserId, basket, responseDeadline } = job.data;

      const suppliers = await repo.getSuppliersByIds([supplierId]);
      const supplier = suppliers[0] as Supplier | undefined;
      if (!supplier) {
        throw new Error(`Supplier ${supplierId} not found`);
      }

      const adapter = createSupplierAdapter(supplier.integrationMechanism);
      await adapter.dispatchQuoteRequest(supplier, {
        requestId,
        tenantSlug,
        requestedByUserId,
        basket,
        responseDeadline: new Date(responseDeadline),
      });
    },
    { connection: { url: REDIS_URL }, concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    if (job) {
      console.error(`Supplier dispatch job ${job.id} failed for supplier ${job.data.supplierId}:`, err.message);
    }
  });

  return worker;
}
